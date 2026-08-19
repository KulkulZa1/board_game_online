#!/usr/bin/env node
// Starts the local server and verifies routes, static assets, handlers, and JS syntax.
const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { checkJavaScriptSyntax } = require('./check-js');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.SMOKE_PORT || process.env.PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;

function request(pathname) {
  return httpRequest('GET', pathname);
}

function httpRequest(method, pathname, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: { ...headers },
    };
    if (body !== null) {
      options.headers['Content-Type'] = 'text/plain;charset=UTF-8';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = http.request(`${baseUrl}${pathname}`, options, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout requesting ${pathname}`));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const res = await request('/api/status');
      if (res.statusCode === 200) return res;
    } catch (_) {
      // Retry until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
}

async function checkUrl(pathname) {
  const res = await request(pathname);
  if (res.statusCode !== 200) {
    throw new Error(`${pathname} returned HTTP ${res.statusCode}`);
  }
  return res;
}

function checkHandlers() {
  const handlers = require('../server/handlers');
  const expected = [
    'chess', 'omok', 'connect4', 'othello', 'checkers', 'indianpoker',
    'applegame', 'battleship', 'backgammon', 'texasholdem', 'dotsboxes', 'mancala',
  ];
  const missing = expected.filter((game) => !handlers.has(game));
  if (missing.length) {
    throw new Error(`Missing handlers: ${missing.join(', ')}`);
  }
}

function checkSecurityHelpers() {
  const { isLocalRequest, isLoopbackAddress } = require('../server/security');
  const localAddresses = ['127.0.0.1', '127.12.34.56', '::1', '::ffff:127.0.0.1', 'localhost'];
  const remoteAddresses = ['192.168.0.10', '10.0.0.5', '172.16.0.4', '203.0.113.9', 'example.com', ''];

  const missed = localAddresses.filter((address) => !isLoopbackAddress(address));
  if (missed.length) {
    throw new Error(`Loopback detection missed: ${missed.join(', ')}`);
  }

  const falsePositive = remoteAddresses.filter((address) => isLoopbackAddress(address));
  if (falsePositive.length) {
    throw new Error(`Loopback detection false positive: ${falsePositive.join(', ')}`);
  }

  const proxiedLoopback = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '203.0.113.25' },
  };
  if (isLocalRequest(proxiedLoopback)) {
    throw new Error('Proxied loopback request should not be treated as local admin traffic');
  }

  const serverIndex = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  if (!serverIndex.includes('isAllowedSocketOrigin') || serverIndex.includes(": '*'")) {
    throw new Error('Socket.io CORS should use an origin allow-list instead of defaulting to wildcard access');
  }
}

function checkMultiplayerNicknameSafety() {
  const { sanitizeNickname } = require('../server/utils');
  const sanitized = sanitizeNickname('  <b>홍길동</b>\n<script>  ');
  if (/[<>&"'\x60\r\n]/.test(sanitized) || Array.from(sanitized).length > 12) {
    throw new Error(`sanitizeNickname left unsafe or oversized content: "${sanitized}"`);
  }
  if (sanitizeNickname('', '손님') !== '손님') {
    throw new Error('sanitizeNickname should use its fallback for empty input');
  }

  const requiredEscapes = {
    'public/js/bang-client.js': ['escapeHtml(s.name)', 'escapeHtml(p.name)', 'escapeHtml(l)'],
    'public/js/mahjong-client.js': ['escapeHtml(s.name)', 'escapeHtml(st.names[seat])', 'escapeHtml(r.name)'],
  };
  for (const [file, fragments] of Object.entries(requiredEscapes)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const missing = fragments.filter((fragment) => !source.includes(fragment));
    if (missing.length) {
      throw new Error(`${file} should escape server-provided names before innerHTML rendering: ${missing.join(', ')}`);
    }
  }

  const mahjongPage = fs.readFileSync(path.join(root, 'public/mahjong.html'), 'utf8');
  const mahjongStyle = fs.readFileSync(path.join(root, 'public/css/games/mahjong.css'), 'utf8');
  if (!mahjongPage.includes('mahjong.css?v=1.4') || !mahjongStyle.includes('justify-content: flex-start')) {
    throw new Error('Mahjong mobile hand should expose every tile through a left-aligned scroll area');
  }
}

function checkMultiplayerResumeAndOverlaySafety() {
  const cases = [
    {
      page: 'public/bang.html',
      client: 'public/js/bang-client.js',
      style: 'public/css/games/bang.css',
      versions: ['bang.css?v=1.1', 'bang-client.js?v=1.2'],
    },
    {
      page: 'public/mahjong.html',
      client: 'public/js/mahjong-client.js',
      style: 'public/css/games/mahjong.css',
      versions: ['mahjong.css?v=1.4', 'mahjong-client.js?v=1.4'],
    },
  ];
  const clientMarkers = [
    'let reconnectPending = false;',
    'const resumeFailed = fatal && reconnectPending;',
    'const token = store.token;',
    'reconnectPending = true;',
    'setLobbyVisible(false);',
    'overlay.inert = !visible;',
  ];

  for (const item of cases) {
    const page = fs.readFileSync(path.join(root, item.page), 'utf8');
    const client = fs.readFileSync(path.join(root, item.client), 'utf8');
    const style = fs.readFileSync(path.join(root, item.style), 'utf8');
    const missing = clientMarkers.filter((marker) => !client.includes(marker));
    if (missing.length) {
      throw new Error(`${item.client} should silently retire stale reconnect tokens and hide inactive lobby controls: ${missing.join(', ')}`);
    }
    if (!page.includes('id="lobbyOverlay" class="overlay visible" aria-hidden="false"')
        || item.versions.some((version) => !page.includes(version))) {
      throw new Error(`${item.page} should expose an accessible initial lobby and version the updated assets`);
    }
    if (!style.includes('visibility: hidden; pointer-events: none;')
        || !style.includes('visibility: visible; pointer-events: all;')) {
      throw new Error(`${item.style} should remove inactive overlays from keyboard navigation`);
    }
  }

}

function checkConnectionBannerBehavior() {
  const classes = new Set();
  const rootElement = {
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
    },
  };
  const banner = { style: { display: 'none' } };
  const message = { textContent: '' };
  const context = { window: {}, document: { body: rootElement } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/js/connection-banner.js'), 'utf8'), context);

  const ui = context.window.ConnectionBanner.create({ banner, message, root: rootElement });
  ui.showPeerOffline();
  if (banner.style.display !== 'flex'
      || message.textContent !== '상대방 연결이 끊겼습니다. 재접속 대기 중...'
      || !classes.has('has-disconnect-banner')) {
    throw new Error('Offline peer should show the reconnect banner and reserve layout space');
  }

  ui.hide();
  if (banner.style.display !== 'none' || classes.has('has-disconnect-banner')) {
    throw new Error('Peer reconnect should hide the banner and release layout space');
  }

  ui.show('서버 연결 중...');
  if (message.textContent !== '서버 연결 중...') {
    throw new Error('Connection banner should replace stale status text');
  }

  const style = fs.readFileSync(path.join(root, 'public/css/game.css'), 'utf8');
  if (!style.includes('body.has-disconnect-banner #game-layout')
      || !style.includes('env(safe-area-inset-top)')) {
    throw new Error('Mobile reconnect banner should reserve safe-area-aware layout space');
  }
}

function checkPausedTimerInterpolation() {
  const elements = new Map(['my-timer', 'opponent-timer', 'my-bar', 'opponent-bar'].map((id) => [id, {
    textContent: '',
    classList: { toggle: () => {} },
  }]));
  let now = 0;
  let frame = null;
  const context = {
    window: {},
    document: { getElementById: (id) => elements.get(id) || null },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => { frame = callback; return 1; },
    cancelAnimationFrame: () => {},
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'public/js/timer.js'), 'utf8'), context);

  context.window.Timer.update({ white: 600000, black: 600000, activeColor: 'white', paused: true }, 'white', false);
  context.window.Timer.startLoop();
  now = 2000;
  frame();
  if (elements.get('my-timer').textContent !== '10:00') {
    throw new Error('Paused reconnect timer should not interpolate on the client');
  }

  context.window.Timer.update({ white: 600000, black: 600000, activeColor: 'white', paused: false }, 'white', false);
  now = 4000;
  frame();
  if (elements.get('my-timer').textContent !== '9:58') {
    throw new Error('Reconnected timer should resume client interpolation');
  }
  context.window.Timer.stopLoop();
}

function checkLobbyMobileLayoutCoverage() {
  const page = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'public/css/lobby.css'), 'utf8');
  const required = [
    'grid-template-columns: auto minmax(0, 1fr)',
    'grid-column: 1 / -1',
    'grid-template-columns: repeat(3, minmax(0, 1fr))',
    'min-height: 42px',
  ];
  const missing = required.filter((fragment) => !style.includes(fragment));
  if (missing.length || !page.includes('css/lobby.css?v=1.5')) {
    throw new Error(`Mobile lobby cards should keep actions inside the viewport: ${missing.join(', ') || 'asset version'}`);
  }
}

function runSyntaxCheck() {
  if (!checkJavaScriptSyntax()) {
    throw new Error('JS syntax check failed');
  }
}

function createDomStub() {
  class Element {
    constructor(id = null, tagName = 'div') {
      this.id = id;
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.dataset = {};
      this.eventListeners = {};
      this.style = {};
      this.value = '';
      this.scrollTop = 0;
      this.scrollHeight = 0;
      this._textContent = '';
    }

    addEventListener(type, handler) {
      this.eventListeners[type] = handler;
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      this.scrollHeight = this.children.length;
      return child;
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }

    querySelector(selector) {
      if (!selector.startsWith('.')) return null;
      const className = selector.slice(1);
      return this.children.find((child) =>
        String(child.className).split(/\s+/).includes(className)
      ) || null;
    }

    set textContent(value) {
      this._textContent = String(value);
    }

    get textContent() {
      return [
        this._textContent,
        ...this.children.map((child) => child.textContent),
      ].join('');
    }

    set innerHTML(value) {
      this.children = [];
      this._textContent = String(value);
    }
  }

  const elements = new Map([
    ['chat-messages', new Element('chat-messages')],
    ['chat-input', new Element('chat-input', 'input')],
    ['chat-send-btn', new Element('chat-send-btn', 'button')],
    ['chat-panel', new Element('chat-panel')],
    ['chat-toggle-btn', new Element('chat-toggle-btn', 'button')],
    ['chat-close-btn', new Element('chat-close-btn', 'button')],
    ['my-bar', new Element('my-bar')],
    ['opponent-bar', new Element('opponent-bar')],
  ]);

  return {
    elements,
    document: {
      getElementById(id) { return elements.get(id) || null; },
      createElement(tagName) { return new Element(null, tagName); },
      querySelectorAll(selector) {
        if (selector === '.emote-btn') return [];
        return [];
      },
    },
  };
}

function loadChatModuleForTest() {
  const { elements, document } = createDomStub();
  const timers = [];
  const context = {
    window: {},
    document,
    Sound: { play() {} },
    setTimeout(fn, delay) {
      timers.push({ fn, delay });
      return timers.length;
    },
    clearTimeout(id) {
      if (timers[id - 1]) timers[id - 1].cleared = true;
    },
  };
  context.window.Sound = context.Sound;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'public/js/chat.js'), 'utf8'),
    context,
    { filename: 'public/js/chat.js' }
  );
  return { Chat: context.window.Chat, elements, timers };
}

function checkChatBubbleUi() {
  const chatScript = fs.readFileSync(path.join(root, 'public/js/chat.js'), 'utf8');
  if (!chatScript.includes('chat-bubble')) {
    throw new Error('Chat speech bubble implementation is missing from public/js/chat.js');
  }

  const { Chat, elements, timers } = loadChatModuleForTest();
  const emitted = [];
  Chat.init({ role: 'host', socket: { emit: (...args) => emitted.push(args) } });

  Chat.loadHistory([{ role: 'guest', text: 'history message' }]);
  if (elements.get('opponent-bar').querySelector('.chat-bubble')) {
    throw new Error('Chat history should not replay speech bubbles');
  }

  const longText = '<img src=x onerror=alert(1)> ' + 'a'.repeat(90);
  Chat.addMessage({ role: 'host', text: longText });
  const myBubble = elements.get('my-bar').querySelector('.chat-bubble');
  if (!myBubble) {
    throw new Error('Live host chat did not create a speech bubble above my player bar');
  }
  if (myBubble.children.length) {
    throw new Error('Speech bubble should store chat text as textContent, not child HTML');
  }
  if (myBubble.textContent.length > 65 || !myBubble.textContent.endsWith('...')) {
    throw new Error('Speech bubble should truncate long messages with an ellipsis');
  }

  Chat.addMessage({ role: 'guest', text: 'guest hello' });
  const opponentBubble = elements.get('opponent-bar').querySelector('.chat-bubble');
  if (!opponentBubble || opponentBubble.textContent !== 'guest hello') {
    throw new Error('Guest chat should create a bubble above the opponent player bar');
  }

  const visibleTimers = timers.filter((timer) => !timer.cleared);
  if (!visibleTimers.some((timer) => timer.delay >= 3000 && timer.delay <= 5000)) {
    throw new Error('Speech bubbles should auto-hide after a short delay');
  }
}

function assertNoStoreHeader(res, pathname) {
  const cacheControl = String(res.headers['cache-control'] || '');
  if (!cacheControl.includes('no-store')) {
    throw new Error(`${pathname} should send Cache-Control: no-store, got "${cacheControl}"`);
  }
}

async function checkDeploymentCachePolicy() {
  const renderBlueprint = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
  if (!renderBlueprint.includes('branch: main') || !renderBlueprint.includes('autoDeployTrigger: commit')) {
    throw new Error('Render Blueprint should deploy every commit from main');
  }

  const version = await checkUrl('/api/version');
  assertNoStoreHeader(version, '/api/version');

  const sw = await checkUrl('/sw.js');
  assertNoStoreHeader(sw, '/sw.js');
  if (sw.body.includes('stale-while-revalidate') || !sw.body.includes('networkFirst(request)')) {
    throw new Error('Service worker should use network-first JS/CSS so deployed game logic appears immediately');
  }
  // 캐시 네임스페이스는 "진행도 이전 아케이드 자산을 무효화할 만큼 새로울 것"만 보장하면 된다.
  // 예전에는 특정 버전 문자열을 그대로 요구해서, 정당한 캐시 버전업마다 이 검사가 깨졌다.
  const cacheName = (sw.body.match(/CACHE_NAME\s*=\s*'boardgame-v(\d+)'/) || [])[1];
  if (!cacheName || Number(cacheName) < 11) {
    throw new Error(
      `Service worker cache namespace should invalidate pre-progression arcade assets ` +
      `(expected boardgame-v11 or newer, found ${cacheName ? 'v' + cacheName : 'none'})`
    );
  }
  if (!sw.body.includes("fetch(request, { cache: 'no-store' })")) {
    throw new Error('Service worker network-first fetches should bypass the browser HTTP cache');
  }

  const chat = await checkUrl('/js/chat.js');
  assertNoStoreHeader(chat, '/js/chat.js');

  const badge = await checkUrl('/js/version-badge.js');
  assertNoStoreHeader(badge, '/js/version-badge.js');

  const updater = await checkUrl('/js/sw-update.js');
  assertNoStoreHeader(updater, '/js/sw-update.js');
  if (
    !updater.body.includes('controllerchange') ||
    !updater.body.includes('registration.update') ||
    !updater.body.includes('/sw.js?v=')
  ) {
    throw new Error('Service worker update helper should reload controlled pages after a new SW takes control');
  }
}

function listHtmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
}

function checkServiceWorkerUpdateCoverage() {
  const roots = ['public'].map((dir) => path.join(root, dir));
  const missing = roots
    .flatMap(listHtmlFiles)
    .filter((file) => !fs.readFileSync(file, 'utf8').includes('/js/sw-update.js'));
  if (missing.length) {
    throw new Error(`HTML pages missing sw-update.js: ${missing.map((file) => path.relative(root, file)).join(', ')}`);
  }
}

function checkVersionBadgeCoverage() {
  const badgeScript = fs.readFileSync(path.join(root, 'public/js/version-badge.js'), 'utf8');
  if (!badgeScript.includes('/api/version')) {
    throw new Error('version-badge.js should read the deployment identity from /api/version');
  }
  if (!badgeScript.includes('textContent')) {
    throw new Error('version-badge.js should render API values with textContent');
  }
  if (badgeScript.includes('innerHTML')) {
    throw new Error('version-badge.js should not use innerHTML for deployment metadata');
  }

  const pages = ['public/index.html', 'public/admin.html'];
  const missing = pages
    .filter((file) => !fs.readFileSync(path.join(root, file), 'utf8').includes('/js/version-badge.js'));
  if (missing.length) {
    throw new Error(`Pages missing version-badge.js: ${missing.join(', ')}`);
  }
}

function checkProductionArcadeAssetPolicy() {
  const arcadePages = [
    'public/arcade/vampire/index.html',
    'public/arcade/plant/index.html',
    'public/arcade/factory/index.html',
    'public/arcade/bootstrap/index.html',
    'public/arcade/tower-defense/index.html',
    'public/arcade/neon-cascade/index.html',
  ];
  const offenders = arcadePages.filter((file) =>
    fs.readFileSync(path.join(root, file), 'utf8').includes('/sandbox/')
  );
  if (offenders.length) {
    throw new Error(`Public arcade pages must not request /sandbox/ assets: ${offenders.join(', ')}`);
  }

  const versionedAssets = {
    'public/arcade/factory/index.html': ['style.css?v=3.1', 'state.js?v=3.0', 'evolution.js?v=3.0', 'game.js?v=3.0'],
    'public/arcade/bootstrap/index.html': ['style.css?v=4.1', 'sim.js?v=4.0', 'game.js?v=4.0'],
    'public/arcade/snake/index.html': ['style.css?v=2.0', 'game.js?v=2.0'],
    'public/arcade/breakout/index.html': ['style.css?v=2.0', 'game.js?v=2.0'],
    'public/arcade/neon-cascade/index.html': ['style.css?v=1.1', 'sim.js?v=1.0', 'game.js?v=1.0'],
  };
  // 여기 적힌 버전은 "이 아래로는 내려가면 안 되는 하한선"이다.
  // 예전에는 문자열이 정확히 일치해야 해서, 자산을 고치고 버전을 올리는 정상적인 행동이
  // 오히려 검사를 깨뜨렸다. 이제는 캐시버스팅이 유지되고 버전이 후퇴하지 않는지만 본다.
  const verNum = (v) => v.split('.').reduce((acc, part) => acc * 1000 + (parseInt(part, 10) || 0), 0);
  Object.entries(versionedAssets).forEach(([file, assets]) => {
    const page = fs.readFileSync(path.join(root, file), 'utf8');
    assets.forEach((asset) => {
      const [name, minVer] = asset.split('?v=');
      const found = page.match(new RegExp(`${name.replace('.', '\\.')}\\?v=([0-9.]+)`));
      if (!found) {
        throw new Error(`${file} should cache-bust arcade asset ${name} with a ?v= query`);
      }
      if (verNum(found[1]) < verNum(minVer)) {
        throw new Error(
          `${file} cache-bust version for ${name} went backwards ` +
          `(found v${found[1]}, must be v${minVer} or newer)`
        );
      }
    });
  });

  const towerPage = fs.readFileSync(path.join(root, 'public/arcade/tower-defense/index.html'), 'utf8');
  if (!towerPage.includes('/arcade/tower-defense/runtime/config.js') || !towerPage.includes('/arcade/tower-defense/runtime/game.js')) {
    throw new Error('Tower Defense arcade page should load runtime assets from /arcade/tower-defense/runtime/');
  }

  const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  if (!server.includes("'/arcade/tower-defense/runtime'") || server.includes("app.use('/sandbox'")) {
    throw new Error('Server should expose Tower Defense runtime under arcade path while keeping /sandbox/ unserved');
  }
}

function checkFactoryArcadeCoverage() {
  const page = fs.readFileSync(path.join(root, 'public/arcade/factory/index.html'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'public/arcade/factory/game.js'), 'utf8');
  const evolution = fs.readFileSync(path.join(root, 'public/arcade/factory/evolution.js'), 'utf8');
  const stateHelpers = fs.readFileSync(path.join(root, 'public/arcade/factory/state.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'public/arcade/factory/style.css'), 'utf8');
  const lobby = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

  if (!lobby.includes('/arcade/factory/')) {
    throw new Error('Lobby should expose the Factory arcade route');
  }
  if (!page.includes('/js/sw-update.js') || !page.includes('game.js') || !page.includes('evolution.js') || !page.includes('state.js')) {
    throw new Error('Factory page should load the runtime and service-worker update helper');
  }
  if (!game.includes('placementIssue') || !game.includes('광맥 위에만 배치')) {
    throw new Error('Factory game should prevent dead miner placements with user feedback');
  }
  if (!game.includes('SAVE_KEY') || !game.includes('serializeBuilding') || !game.includes('restoreRun')) {
    throw new Error('Factory game should persist and restore in-progress factory layouts');
  }
  if (!game.includes('inferDirForPlacement') || !game.includes('autoOrientNeighbors')) {
    throw new Error('Factory placement should auto-connect nearby buildings without blocking manual rotation');
  }
  if (!game.includes('drawPlacementHints') || !game.includes('selectionHint')) {
    throw new Error('Factory palette selections should show placement hints and resource visibility cues');
  }
  if (!game.includes('tutGuaranteeOre();') || !game.includes("selected = 'miner';") || !game.includes("selectionHint('miner')")) {
    throw new Error('Factory new runs should start with visible starter ore and miner placement guidance');
  }
  if (!page.includes('saveSummary') || !page.includes('newRunBtn') || !page.includes('discardSaveBtn')) {
    throw new Error('Factory page should expose continue/new/discard save controls');
  }
  if (!game.includes('function deliver') || !game.includes('다음 시대로 진화')) {
    throw new Error('Factory delivery loop should provide milestone feedback');
  }
  if (!page.includes('stabilityWrap') || !game.includes('eraGateStatus') || !game.includes('updateEraGate') || !style.includes('phase-chip')) {
    throw new Error('Factory game should gate industrial revolutions through visible stability conditions');
  }
  if (!page.includes('breakthroughMini') || !game.includes('currentBreakthroughStatus') || !game.includes('addChronicle')) {
    throw new Error('Factory game should expose bottleneck-driven breakthroughs and an industrial chronicle');
  }
  if (!game.includes('FactoryState.SAVE_VERSION') || !game.includes('data.rp') || !game.includes('data.tier')) {
    throw new Error('Factory save should preserve research points, building tiers, and the versioned state format');
  }
  if (!style.includes('@media (max-width: 520px)') || !style.includes('#palette')) {
    throw new Error('Factory CSS should include mobile-specific palette/tool layout rules');
  }
  if (!style.includes('min-height: 42px') || !style.includes('word-break: keep-all')) {
    throw new Error('Factory save actions and Korean overlay guidance should remain touchable and readable');
  }

  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(evolution, context, { filename: 'public/arcade/factory/evolution.js' });
  vm.runInContext(stateHelpers, context, { filename: 'public/arcade/factory/state.js' });
  const evolutionApi = context.window.FactoryEvolution;
  const stateApi = context.window.FactoryState;
  const status = evolutionApi.evaluate(evolutionApi.forEra(1), { research: 20, throughput: 3, upgraded: 1 });
  if (!status.ready || evolutionApi.modifiers(['standardization']).beltSpeed !== 1.2) {
    throw new Error('Factory standardization breakthrough should unlock and improve belt speed');
  }
  const matureFactory = { research: 100, throughput: 100, upgraded: 10, powerRatio: 1, generatorCount: 2 };
  if (!evolutionApi.BREAKTHROUGHS.every((definition) => evolutionApi.evaluate(definition, matureFactory).ready)) {
    throw new Error('Every Factory breakthrough definition should have a reachable complete state');
  }
  const legacyDeposit = stateApi.restoreDeposit('iron_ore', () => true, 600);
  const savedDeposit = stateApi.restoreDeposit({ resource: 'copper_ore', amount: 321, max: 900 }, () => true, 600);
  if (!legacyDeposit || legacyDeposit.amount !== 600 || !savedDeposit || savedDeposit.amount !== 321) {
    throw new Error('Factory save migration should restore legacy and quantity-aware deposits');
  }
}

function checkTexasHoldemReconnectUi() {
  const calls = [];
  const board = {
    init(options) { calls.push({ type: 'init', options }); },
    update(state) { calls.push({ type: 'update', state }); },
    showDeal(data) { calls.push({ type: 'deal', data }); },
  };
  const context = {
    window: { GameHandlers: {} },
    TexasHoldemBoard: board,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'public/js/game-texasholdem.js'), 'utf8'),
    context,
    { filename: 'public/js/game-texasholdem.js' }
  );

  const state = {
    phase: 'preflop',
    community: [],
    pot: 30,
    chips: { host: 990, guest: 980 },
    bets: { host: 10, guest: 20 },
    roundBet: 20,
    betTurn: 'host',
    raiseCount: 0,
    hand: [{ rank: 14, suit: 's' }, { rank: 13, suit: 's' }],
    roundNum: 2,
  };
  context.window.GameHandlers.texasholdem.initBoard(state, 'white', () => {}, 'host');
  if (!calls.some((call) => call.type === 'update' && call.state === state)) {
    throw new Error('Texas Holdem reconnect should restore public table state');
  }
  const deal = calls.find((call) => call.type === 'deal');
  if (!deal || deal.data.hand !== state.hand || deal.data.roundNum !== 2) {
    throw new Error('Texas Holdem reconnect should restore the requesting player private hand');
  }
}

function checkPlantArcadeCoverage() {
  const page = fs.readFileSync(path.join(root, 'public/arcade/plant/index.html'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'public/arcade/plant/game.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'public/arcade/plant/style.css'), 'utf8');

  if (!page.includes('burstBtn') || !page.includes('loopPanel')) {
    throw new Error('Plant clicker should expose growth burst and loop progression UI');
  }
  if (!game.includes('BREAKTHROUGHS') || !game.includes('checkBreakthroughs') || !game.includes('renderLoopPanel')) {
    throw new Error('Plant clicker should have data-driven idle breakthrough progression');
  }
  if (!game.includes('burstCost') || !game.includes('onGrowthBurst')) {
    throw new Error('Plant clicker should support a resource-spending growth burst action');
  }
  if (!style.includes('breakthrough-row') || !style.includes('loop-stat') || !style.includes('burst-btn')) {
    throw new Error('Plant clicker should style idle-loop and breakthrough UI for mobile play');
  }
}

function checkQuickArcadeRewardCoverage() {
  const snakePage = fs.readFileSync(path.join(root, 'public/arcade/snake/index.html'), 'utf8');
  const snakeGame = fs.readFileSync(path.join(root, 'public/arcade/snake/game.js'), 'utf8');
  const snakeStyle = fs.readFileSync(path.join(root, 'public/arcade/snake/style.css'), 'utf8');
  const breakoutPage = fs.readFileSync(path.join(root, 'public/arcade/breakout/index.html'), 'utf8');
  const breakoutGame = fs.readFileSync(path.join(root, 'public/arcade/breakout/game.js'), 'utf8');
  const breakoutStyle = fs.readFileSync(path.join(root, 'public/arcade/breakout/style.css'), 'utf8');

  if (!snakePage.includes('comboDisplay') || !snakePage.includes('rushBar') ||
      !snakeGame.includes('COMBO_WINDOW_MS') || !snakeGame.includes('RUSH_DURATION_MS') ||
      !snakeStyle.includes('.rush')) {
    throw new Error('Snake should retain combo, golden-food, and RUSH reward feedback');
  }
  if (!breakoutPage.includes('comboDisplay') || !breakoutPage.includes('feverInfo') ||
      !breakoutGame.includes('FEVER_TARGET') || !breakoutGame.includes('activateFever') ||
      !breakoutStyle.includes('.fever')) {
    throw new Error('Breakout should retain destruction combo and FEVER reward feedback');
  }
}

function checkNeonCascadeCoverage() {
  const page = fs.readFileSync(path.join(root, 'public/arcade/neon-cascade/index.html'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'public/arcade/neon-cascade/game.js'), 'utf8');
  const sim = fs.readFileSync(path.join(root, 'public/arcade/neon-cascade/sim.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'public/arcade/neon-cascade/style.css'), 'utf8');
  const lobby = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

  if (!lobby.includes('/arcade/neon-cascade/')) {
    throw new Error('Lobby should expose the Neon Cascade arcade route');
  }
  if (!page.includes('sim.js') || !page.includes('game.js') || !page.includes('/js/sw-update.js')) {
    throw new Error('Neon Cascade page should load simulation, runtime, and update helper');
  }
  if (!game.includes('bestPulseTarget') || !game.includes('OVERDRIVE') || !game.includes('smartPulseBtn')) {
    throw new Error('Neon Cascade runtime should expose direct and assisted chain-reaction play');
  }
  if (!style.includes('@media (max-width: 420px)') || !style.includes('prefers-reduced-motion')) {
    throw new Error('Neon Cascade should include mobile and reduced-motion presentation rules');
  }
  if (!style.includes('--accent: #35f2ff') || style.includes('--cyan:') || style.includes('--gold:')) {
    throw new Error('Neon Cascade should map its palette to the shared interface token names');
  }
  if (!style.includes('width: 42px') || !style.includes('height: 42px')) {
    throw new Error('Neon Cascade header controls should meet the mobile touch target minimum');
  }

  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(sim, context, { filename: 'public/arcade/neon-cascade/sim.js' });
  const api = context.window.NeonCascade;
  const state = api.createState(42);
  const target = api.bestPulseTarget(state);
  if (!api.pulse(state, target.x, target.y)) {
    throw new Error('Neon Cascade deterministic pulse should start successfully');
  }
  for (let i = 0; i < 400; i++) api.step(state, 0.05);
  if (state.score <= 0 || state.bestChain <= 0 || state.charges > api.MAX_CHARGES) {
    throw new Error('Neon Cascade deterministic run should score a chain within charge limits');
  }
}

function checkBootstrapArcadeCoverage() {
  const page = fs.readFileSync(path.join(root, 'public/arcade/bootstrap/index.html'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'public/arcade/bootstrap/game.js'), 'utf8');
  const sim = fs.readFileSync(path.join(root, 'public/arcade/bootstrap/sim.js'), 'utf8');
  const style = fs.readFileSync(path.join(root, 'public/arcade/bootstrap/style.css'), 'utf8');
  const lobby = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

  if (!lobby.includes('/arcade/bootstrap/')) {
    throw new Error('Lobby should expose the Bootstrap civilization loop route');
  }
  if (!page.includes('/js/sw-update.js') || !page.includes('sim.js') || !page.includes('game.js')) {
    throw new Error('Bootstrap page should load the simulation core, runtime, and service-worker update helper');
  }
  [
    'window.Bootstrap',
    'class Sim',
    'gate',
    'sustain',
    'min()',
    'breakthrough',
  ].forEach((marker) => {
    if (!sim.includes(marker)) {
      throw new Error(`Bootstrap simulation core is missing expected loop marker: ${marker}`);
    }
  });
  [
    'Bottleneck',
    'buildStatus',
    'renderGate',
    'renderBottlenecks',
    'showOverlay',
    'startBtn',
    'usefulCap',
  ].forEach((marker) => {
    if (!game.includes(marker)) {
      throw new Error(`Bootstrap browser runtime is missing expected UI marker: ${marker}`);
    }
  });
  if (!game.includes('plus.disabled') || !game.includes('현재 규모로 충분')) {
    throw new Error('Bootstrap build UI should disable wasteful construction to prevent dead-end overbuilding');
  }
  if (!game.includes('textContent')) {
    throw new Error('Bootstrap browser runtime should use textContent for direct state rendering');
  }
  if (!style.includes('@media (max-width: 760px)') || !style.includes('#board')) {
    throw new Error('Bootstrap CSS should include mobile board layout rules');
  }
  if (!page.includes('activeActionBtn') || !page.includes('goldenAgeFill') || !game.includes('runActiveAction')) {
    throw new Error('Civilization grower should expose a direct action and Golden Age loop');
  }
  if (!sim.includes('performActiveAction') || !sim.includes('applyRestBonus') || !sim.includes('activeBoostTicks')) {
    throw new Error('Civilization simulation should support clicker actions, idle rest, and production boosts');
  }
  if (!style.includes('#idleActionPanel') || !style.includes('touch-action: manipulation') ||
      !style.includes('prefers-reduced-motion') || !style.includes('flex: none')) {
    throw new Error('Civilization clicker controls should include mobile touch and reduced-motion rules');
  }
  if (!style.includes('#tutBox { order: 1') || !style.includes('order: 2;') || !style.includes('order: 3;')) {
    throw new Error('Civilization mobile layout should keep tutorial and controls before the long dashboard');
  }
  if (!style.includes('.bld-btn { width: 42px; height: 42px; }') || !style.includes('word-break: keep-all')) {
    throw new Error('Civilization mobile controls and Korean guidance should remain touchable and readable');
  }

  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(sim, context, { filename: 'public/arcade/bootstrap/sim.js' });
  const api = context.window.Bootstrap;
  if (Object.keys(api.ACTIVE_ACTIONS).length !== api.ERA_LETTERS.length) {
    throw new Error('Every civilization era should define a direct clicker action');
  }
  const simulation = new api.Sim(api.RES, api.BLD, api.clone(api.SCENARIO));
  const foodBefore = simulation.stock.food;
  let result;
  for (let i = 1; i <= 12; i++) result = simulation.performActiveAction(i);
  while (!result.boostTriggered) result = simulation.performActiveAction(10);
  if (simulation.stock.food <= foodBefore || simulation.activeBoostTicks <= 0 || simulation.outputMult(api.BLD.forager_camp) < 1.7) {
    throw new Error('Civilization active actions should grant resources and trigger boosted passive production');
  }
  if (simulation.applyRestBonus(3600).charge <= 0) {
    throw new Error('Civilization idle loop should grant a bounded rest bonus');
  }
}

function checkSandboxConfigBridgeRead() {
  const bridge = fs.readFileSync(path.join(root, 'public/js/sandbox-config.js'), 'utf8');
  const store = {
    sandbox_vs_config: JSON.stringify({ STAGES: [{ name: 'Local Draft' }] }),
  };
  const context = {
    console,
    window: {
      localStorage: {
        getItem: (key) => store[key] || null,
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(bridge, context, { filename: 'public/js/sandbox-config.js' });
  const saved = context.window.SandboxConfigBridge.read('sandbox_vs_config');
  if (!saved || !saved.__loadedFromSandbox || !Array.isArray(saved.STAGES) || saved.STAGES[0].name !== 'Local Draft') {
    throw new Error('SandboxConfigBridge.read should return saved localStorage config without a sandbox script tag');
  }
  const target = { STAGES: [] };
  const loaded = context.window.SandboxConfigBridge.load('sandbox_vs_config', target);
  if (!loaded || !target.__loadedFromSandbox || target.STAGES[0].name !== 'Local Draft') {
    throw new Error('SandboxConfigBridge.load should still merge saved config into an existing target');
  }
}

function checkTowerDefenseSandboxCoverage() {
  const config = fs.readFileSync(path.join(root, 'sandbox/tower-defense/config.js'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'sandbox/tower-defense/game.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'sandbox/tower-defense/ui.js'), 'utf8');

  if (!config.includes('amplifier') || !config.includes("attack: 'support'")) {
    throw new Error('Tower Defense sandbox should define the amplifier support tower');
  }
  if (!config.includes('METEOR') || !config.includes('cooldownSec') || !config.includes('STARTING_GOLD: 160')) {
    throw new Error('Tower Defense config should expose the Meteor active ability and early combo economy');
  }
  if (!config.includes('barrage') || !config.includes('supercharge')) {
    throw new Error('Tower Defense sandbox should include the new barrage and supercharge synergies');
  }
  if (!game.includes("mode === 'support'") || !game.includes('auraBonus')) {
    throw new Error('Tower Defense runtime should apply amplifier auras and skip support attacks');
  }
  ['castMeteor', 'findMeteorTarget', 'spendGold', 'waveLeaks', 'Perfect wave!', 'touchstart'].forEach((marker) => {
    if (!game.includes(marker)) {
      throw new Error(`Tower Defense runtime missing gameplay marker: ${marker}`);
    }
  });
  if (!ui.includes("label: 'Synergies'") || !ui.includes("type: 'amplifier'")) {
    throw new Error('Tower Defense editor should expose synergies and amplifier placement');
  }
  if (!ui.includes("case 'play-stage'") || !ui.includes("case 'meteor'") || !ui.includes('TDGame.spendGold(rerollCost)')) {
    throw new Error('Tower Defense UI should expose game-first start, Meteor, and paid rerolls');
  }
  if (!ui.includes('td_published_config') || !ui.includes('validateConfig') || !ui.includes('publishJSON')) {
    throw new Error('Tower Defense editor should validate and publish configs for arcade import');
  }
  const sandboxPage = fs.readFileSync(path.join(root, 'sandbox/tower-defense/index.html'), 'utf8');
  const arcadePage = fs.readFileSync(path.join(root, 'public/arcade/tower-defense/index.html'), 'utf8');
  if (!sandboxPage.includes('data-action="publish"') || !arcadePage.includes('data-action="publish"')) {
    throw new Error('Tower Defense sandbox and arcade route should expose publish controls');
  }
  if (!arcadePage.includes('td_published_config') || !arcadePage.includes('Published config loaded')) {
    throw new Error('Tower Defense arcade route should prefer published config and show load status');
  }
  if (!arcadePage.includes('data-action="play-stage"') || !arcadePage.includes('data-action="meteor"') || !arcadePage.includes('data-place-type="amplifier"')) {
    throw new Error('Tower Defense arcade page should expose game-first controls and quick tower placement');
  }
}

function checkVampireDirectorLoopCoverage() {
  const game = fs.readFileSync(path.join(root, 'public/arcade/vampire/game.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public/arcade/vampire/style.css'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'public/arcade/vampire/index.html'), 'utf8');
  const serverEvents = fs.readFileSync(path.join(root, 'server/events.js'), 'utf8');
  const serverState = fs.readFileSync(path.join(root, 'server/state.js'), 'utf8');
  const admob = fs.readFileSync(path.join(root, 'public/js/admob.js'), 'utf8');

  const requiredGameMarkers = [
    'CHARACTER_DEFS',
    'DIFFICULTY_DEFS',
    'META_UPGRADE_DEFS',
    'MAP_DEFS',
    'START_BOOST_COST',
    'HYBRID_TOWER_TYPES',
    'MAX_HYBRID_TOWERS',
    'ACHIEVEMENT_REWARDS',
    'META_KEY',
    'RUN_SNAPSHOT_KEY',
    'RUN_SNAPSHOT_INTERVAL',
    'selectedCharacterId',
    'selectedDifficultyId',
    'selectedMapId',
    'dailyChallengeEnabled',
    'dailyChallenge',
    'upgradeCost',
    'function setPaused',
    'saveRunSnapshot',
    'restoreRunSnapshot',
    'clearRunSnapshot',
    'resumePanel',
    'beforeunload',
    'coopPanel',
    'hostCoopRoom',
    'joinCoopRoom',
    'allyPlayer',
    'sendGuestInput',
    'sendHostCoopState',
    'renderCoopGuestMirror',
    "state === 'coop-guest'",
    "state = 'paused'",
    'visibilitychange',
    'elapsed >= getSurviveGoal()',
    'awardRunRewards',
    'reviveRun',
    'showRewardedRevive',
    'character.startWeapons.forEach',
    'runDifficulty.enemyHpMult',
    'spawnMult',
    'showRewardedStartBoost',
    'adsRemoved',
    'premiumCharacters',
    'purchasePremiumCharacter',
    'monetizationPanel',
    'evolutionPlanPanel',
    'renderEvolutionPlan',
    'evolutionProgress',
    'showEvolutionCelebration',
    'playEvolutionChime',
    'evolutionBanner',
    'appendChoiceButton',
    'choiceWeight',
    'takeWeightedChoices',
    'Combo passive',
    'SLASH_SUPPORT_DEFS',
    'applySlashSupport',
    'slashStats',
    'performDashSlash',
    'queueSlashEchoes',
    'updateRuptures',
    'slash-support',
    'hasSlashSupport',
    'Rupture Mark',
    'Echo Step',
    'LOW_HP_THRESHOLD',
    'CRITICAL_HP',
    'renderLowHpWarning',
    'lowHpAlertCooldown',
    'placeHybridTower',
    'updateHybridTowers',
    'fireHybridTower',
    'towerCharges',
    'missedEvolutionHints',
    'evolvedWeaponCount',
    'nearMissClear',
    'towerBuilder',
  ];
  const missingGameMarkers = requiredGameMarkers.filter((marker) => !game.includes(marker));
  if (missingGameMarkers.length) {
    throw new Error(`Vampire Survivors loop coverage missing: ${missingGameMarkers.join(', ')}`);
  }

  const requiredCssMarkers = ['.meta-panel', '.start-card', '.pause-overlay', '.end-actions', '.daily-panel', '.upgrade-grid', '.run-report', '.monetization-panel', '.resume-panel', '.coop-panel', '.evolution-plan', '.level-evolution-plan', '.evolution-plan-row.ready', '.evolution-banner', '.evolution-banner.visible', '.choice-tag', '.choice-tag.weapon-lv', '.choice-tag.slash-support', '.weapon-slot.slash-support-slot', '#hpBar.critical'];
  const missingCssMarkers = requiredCssMarkers.filter((marker) => !css.includes(marker));
  if (missingCssMarkers.length) {
    throw new Error(`Vampire Survivors UI CSS missing: ${missingCssMarkers.join(', ')}`);
  }

  if (game.includes('btn.innerHTML = `<div class="upgrade-name"')) {
    throw new Error('Vampire Survivors level-up choice text should be rendered with DOM text nodes, not innerHTML');
  }

  if (!page.includes('/socket.io/socket.io.js')) {
    throw new Error('Vampire Survivors page should load Socket.io for co-op relay');
  }

  const requiredCoopServerMarkers = ['arcadeVampireRooms', 'vps:room:create', 'vps:room:join', 'vps:guest:input', 'vps:host:state', 'vps:state'];
  const missingCoopServer = requiredCoopServerMarkers.filter(marker => !serverEvents.includes(marker) && !serverState.includes(marker));
  if (missingCoopServer.length) {
    throw new Error(`Vampire Survivors co-op relay missing: ${missingCoopServer.join(', ')}`);
  }

  if (
    !admob.includes('REWARDED_ID') ||
    !admob.includes('showRewardedRevive') ||
    !admob.includes('showRewardedStartBoost') ||
    !admob.includes('purchaseAdRemoval') ||
    !admob.includes('restorePurchases') ||
    !admob.includes('purchasePremiumCharacter')
  ) {
    throw new Error('AdMob helper should expose rewarded, ad removal, restore, and premium character hooks');
  }
}

function checkVampireSandboxEvolutionCoverage() {
  const config = fs.readFileSync(path.join(root, 'sandbox/vampire-survivors/config.js'), 'utf8');
  const game = fs.readFileSync(path.join(root, 'sandbox/vampire-survivors/game.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'sandbox/vampire-survivors/ui.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'sandbox/vampire-survivors/index.html'), 'utf8');

  const configMarkers = ['maxSkillLevel', 'EVOLUTIONS', 'blackhole', 'stormbow', 'supernova', 'deathray', 'aegis', 'evolved: true'];
  const missingConfig = configMarkers.filter((marker) => !config.includes(marker));
  if (missingConfig.length) {
    throw new Error(`Vampire sandbox evolution config missing: ${missingConfig.join(', ')}`);
  }

  const gameMarkers = [
    'skillLevels',
    'ownedPassives',
    'availableEvolutions',
    'evolveSkill',
    'applyPassive',
    'configuredMaxSkillLevel',
    'blackhole',
    'stormbow',
    'supernova',
    'deathray',
    'aegis',
  ];
  const missingGame = gameMarkers.filter((marker) => !game.includes(marker));
  if (missingGame.length) {
    throw new Error(`Vampire sandbox evolution runtime missing: ${missingGame.join(', ')}`);
  }

  const uiMarkers = ['renderEvolutionEditor', 'evolution-base', 'evolution-result', 'syncLegacyEvolutionLinks', 'mergeMissingDefaultRows'];
  const missingUi = uiMarkers.filter((marker) => !ui.includes(marker));
  if (missingUi.length) {
    throw new Error(`Vampire sandbox evolution editor missing: ${missingUi.join(', ')}`);
  }

  if (!page.includes('.levelup-choice.evolution') || !page.includes('.evolution-editor')) {
    throw new Error('Vampire sandbox should style golden evolution cards and the evolution editor');
  }

  checkVampireSandboxEvolutionRuntime(config, game);
}

function checkVampireSandboxEvolutionRuntime(configScript, gameScript) {
  let rafCallback = null;
  let capturedChoices = null;
  let capturedSelect = null;

  const canvasContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arc() {},
    save() {},
    restore() {},
    fillText() {},
    translate() {},
    rotate() {},
  };

  const context = {
    console,
    Math,
    Date,
    JSON,
    Set,
    Object,
    Array,
    Number,
    String,
    parseInt,
    parseFloat,
    isFinite,
    requestAnimationFrame(cb) {
      rafCallback = cb;
      return 1;
    },
    cancelAnimationFrame() {},
    addEventListener() {},
    tokenColor() { return '#ffffff'; },
    tokenEmoji(key) { return key; },
  };
  context.window = context;
  context.VSUI = {
    showLevelUpModal(choices, onSelect) {
      capturedChoices = choices;
      capturedSelect = onSelect;
    },
    onGameEnd() {},
  };
  vm.createContext(context);

  vm.runInContext(configScript, context, { filename: 'sandbox/vampire-survivors/config.js' });
  vm.runInContext(gameScript, context, { filename: 'sandbox/vampire-survivors/game.js' });

  const canvas = {
    width: 800,
    height: 600,
    style: {},
    parentElement: { clientWidth: 800, clientHeight: 600 },
    getContext() { return canvasContext; },
  };
  context.VSGame.init(canvas);
  context.VSGame.startStage(0);
  const player = context.VSGame.getPlayer();
  player.skillLevels.orb = 5;
  player.appliedSkills.orb = 5;
  player.ownedPassives.push('spinach');
  player.xp = 9999;
  if (typeof rafCallback !== 'function') {
    throw new Error('Vampire sandbox runtime did not schedule a frame');
  }
  rafCallback(16);

  const evolution = capturedChoices && capturedChoices.find((choice) => choice.kind === 'evolve' && choice.id === 'blackhole');
  if (!evolution) {
    throw new Error('Vampire sandbox runtime did not offer blackhole as a golden evolution choice');
  }
  capturedSelect('blackhole');
  if (!player.weapons.includes('blackhole') || player.weapons.includes('orb')) {
    throw new Error('Vampire sandbox evolution choice should swap orb into blackhole');
  }
}

async function checkVersionBadgeUi() {
  const elements = new Map();

  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.attributes = {};
      this.dataset = {};
      this.id = '';
      this.title = '';
      this.type = '';
      this._textContent = '';
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) elements.set(child.id, child);
      return child;
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    querySelector(selector) {
      return this.children.find((child) => child.tagName === selector) || null;
    }

    set textContent(value) {
      this._textContent = String(value);
    }

    get textContent() {
      return [
        this._textContent,
        ...this.children.map((child) => child.textContent),
      ].join('');
    }
  }

  const document = {
    readyState: 'complete',
    head: new Element('head'),
    body: new Element('body'),
    getElementById(id) {
      return elements.get(id) || null;
    },
    createElement(tagName) {
      return new Element(tagName);
    },
    addEventListener() {},
  };

  const fetchCalls = [];
  const context = {
    document,
    navigator: {},
    window: {
      setTimeout() {},
    },
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          branch: 'audit/version-diagnostics-focused',
          commit: 'abcdef1234567890',
          startTime: 1779200000000,
        }),
      };
    },
  };

  vm.runInNewContext(
    fs.readFileSync(path.join(root, 'public/js/version-badge.js'), 'utf8'),
    context,
    { filename: 'public/js/version-badge.js' }
  );

  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const badge = document.getElementById('build-version-badge');
  if (!badge) {
    throw new Error('version-badge.js did not render a build diagnostics badge');
  }
  if (!fetchCalls.some((call) => call.url === '/api/version' && call.options && call.options.cache === 'no-store')) {
    throw new Error('version-badge.js should fetch /api/version with cache: no-store');
  }
  if (!badge.textContent.includes('audit/version-diagnostics-foc... abcdef1')) {
    throw new Error(`version-badge.js rendered unexpected badge text: "${badge.textContent}"`);
  }
}

function socketPath(socket) {
  return `/socket.io/?EIO=4&transport=polling&sid=${encodeURIComponent(socket.sid)}`;
}

function parsePollingPayload(body) {
  return body.split('\x1e').filter(Boolean);
}

function parseSocketEvent(packet) {
  if (!packet.startsWith('42')) return null;
  return JSON.parse(packet.slice(2));
}

async function openPollingSocket() {
  const t = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const handshake = await request(`/socket.io/?EIO=4&transport=polling&t=${t}`);
  if (handshake.statusCode !== 200 || !handshake.body.startsWith('0')) {
    throw new Error(`Socket.io handshake failed: HTTP ${handshake.statusCode}`);
  }
  const socket = {
    sid: JSON.parse(handshake.body.slice(1)).sid,
    buffer: [],
  };
  await httpRequest('POST', socketPath(socket), '40');

  const ack = await pollPackets(socket, 3000);
  if (!ack.some((packet) => packet.startsWith('40'))) {
    throw new Error('Socket.io namespace open acknowledgement was not received');
  }
  return socket;
}

async function pollPackets(socket, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await httpRequest('GET', socketPath(socket));
    if (res.statusCode !== 200) {
      throw new Error(`Socket.io poll failed: HTTP ${res.statusCode}`);
    }
    const packets = parsePollingPayload(res.body);
    if (packets.length) return packets;
  }
  throw new Error('Socket.io poll timed out');
}

async function emitSocketEvent(socket, eventName, payload) {
  const packet = `42${JSON.stringify([eventName, payload])}`;
  const res = await httpRequest('POST', socketPath(socket), packet);
  if (res.statusCode !== 200) {
    throw new Error(`Socket.io emit ${eventName} failed: HTTP ${res.statusCode}`);
  }
}

async function closePollingSocket(socket) {
  const res = await httpRequest('POST', socketPath(socket), '41');
  if (res.statusCode !== 200) {
    throw new Error(`Socket.io disconnect failed: HTTP ${res.statusCode}`);
  }
}

async function waitForSocketEvent(socket, eventName, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    while (socket.buffer.length) {
      const event = parseSocketEvent(socket.buffer.shift());
      if (event && event[0] === eventName) return event[1];
    }
    socket.buffer.push(...await pollPackets(socket, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Socket.io event not received: ${eventName}`);
}

async function runSocketSmokeCheck() {
  const host = await openPollingSocket();
  const guest = await openPollingSocket();

  await emitSocketEvent(host, 'room:create', {
    hostColor: 'white',
    timeControl: { type: 'unlimited', minutes: null },
    gameType: 'connect4',
    boardSize: { rows: 6, cols: 7 },
  });
  const created = await waitForSocketEvent(host, 'room:created');

  await emitSocketEvent(guest, 'room:join', { roomId: created.roomId });
  const joined = await waitForSocketEvent(guest, 'room:joined');
  const hostStart = await waitForSocketEvent(host, 'game:start');
  const guestStart = await waitForSocketEvent(guest, 'game:start');

  if (joined.roomId !== created.roomId) {
    throw new Error('Guest joined a different room than the host created');
  }
  if (hostStart.gameType !== 'connect4' || guestStart.gameType !== 'connect4') {
    throw new Error('Connect4 game:start was not delivered to both players');
  }
}

async function runMalformedSocketPayloadSmokeCheck() {
  const socket = await openPollingSocket();
  const guardedEvents = [
    'room:create', 'room:join', 'room:reconnect',
    'game:draw:respond', 'game:rematch:respond',
    'spectator:join', 'spectator:approve', 'spectator:deny', 'spectator:hint',
    'chat:send', 'vps:room:join', 'vps:guest:input', 'vps:host:state',
    'bang:join', 'bang:reconnect', 'bang:action',
    'mahjong:join', 'mahjong:reconnect', 'mahjong:action',
  ];

  for (const eventName of guardedEvents) {
    await emitSocketEvent(socket, eventName, null);
  }

  const status = await request('/api/status');
  if (status.statusCode !== 200) {
    throw new Error('Server stopped responding after malformed Socket.io payloads');
  }

  await emitSocketEvent(socket, 'room:create', {
    hostColor: 'white',
    timeControl: { type: 'unlimited', minutes: null },
    gameType: 'connect4',
    boardSize: { rows: 6, cols: 7 },
  });
  const created = await waitForSocketEvent(socket, 'room:created');
  if (!created.roomId) {
    throw new Error('Socket did not recover after malformed payloads');
  }
  await closePollingSocket(socket);
}

async function runTexasSpectatorPrivacySmokeCheck() {
  const host = await openPollingSocket();
  const guest = await openPollingSocket();
  const spectator = await openPollingSocket();
  let replacementHost = null;
  let replacementGuest = null;

  try {
    await emitSocketEvent(host, 'room:create', {
      hostColor: 'white',
      timeControl: { type: 'timed', minutes: 1 },
      gameType: 'texasholdem',
      boardSize: null,
    });
    const created = await waitForSocketEvent(host, 'room:created');
    await emitSocketEvent(guest, 'room:join', { roomId: created.roomId });
    const joined = await waitForSocketEvent(guest, 'room:joined');
    await waitForSocketEvent(host, 'game:start');
    await waitForSocketEvent(guest, 'game:start');
    await waitForSocketEvent(host, 'texasholdem:dealt');
    await waitForSocketEvent(guest, 'texasholdem:dealt');

    await emitSocketEvent(spectator, 'spectator:join', {
      roomId: created.roomId,
      nickname: 'Privacy QA',
    });
    const requestPayload = await waitForSocketEvent(host, 'spectator:request');
    await waitForSocketEvent(spectator, 'spectator:pending');
    await emitSocketEvent(host, 'spectator:approve', { socketId: requestPayload.socketId });
    const approval = await waitForSocketEvent(spectator, 'spectator:approved');
    if (approval.hands !== null) {
      throw new Error('Active Texas Holdem spectator received private hands');
    }

    await emitSocketEvent(host, 'game:move', { action: 'fold' });
    const hostShowdown = await waitForSocketEvent(host, 'texasholdem:showdown');
    const spectatorShowdown = await waitForSocketEvent(spectator, 'texasholdem:showdown');
    for (const result of [hostShowdown, spectatorShowdown]) {
      if (!result.timers || result.timers.activeColor !== null || result.timers.paused !== true) {
        throw new Error('Texas Holdem result did not broadcast a stopped clock');
      }
    }

    await Promise.all([
      closePollingSocket(host),
      closePollingSocket(guest),
      closePollingSocket(spectator),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 3700));

    replacementHost = await openPollingSocket();
    await emitSocketEvent(replacementHost, 'room:reconnect', { playerToken: created.playerToken });
    const hostState = await waitForSocketEvent(replacementHost, 'game:state');
    if (!Array.isArray(hostState.hand) || hostState.hand.length !== 2 || !hostState.timers.paused) {
      throw new Error('Lone Texas Holdem reconnect should restore its hand with the clock paused');
    }

    replacementGuest = await openPollingSocket();
    await emitSocketEvent(replacementGuest, 'room:reconnect', { playerToken: joined.playerToken });
    const guestState = await waitForSocketEvent(replacementGuest, 'game:state');
    if (!Array.isArray(guestState.hand) || guestState.hand.length !== 2 || guestState.timers.paused) {
      throw new Error('Second Texas Holdem reconnect should restore its hand and resume the clock');
    }
  } finally {
    await Promise.allSettled([
      closePollingSocket(host),
      closePollingSocket(guest),
      closePollingSocket(spectator),
      replacementHost ? closePollingSocket(replacementHost) : Promise.resolve(),
      replacementGuest ? closePollingSocket(replacementGuest) : Promise.resolve(),
    ]);
  }
}

async function runCommonReconnectTimerSmokeCheck() {
  const state = require(path.join(root, 'server', 'state.js'));
  const host = await openPollingSocket();
  const guest = await openPollingSocket();
  const replacementHost = await openPollingSocket();
  const replacementGuest = await openPollingSocket();

  await emitSocketEvent(host, 'room:create', {
    hostColor: 'white',
    timeControl: { type: 'timed', minutes: 1 },
    gameType: 'connect4',
    boardSize: { rows: 6, cols: 7 },
  });
  const created = await waitForSocketEvent(host, 'room:created');
  await emitSocketEvent(guest, 'room:join', { roomId: created.roomId });
  const joined = await waitForSocketEvent(guest, 'room:joined');
  await waitForSocketEvent(host, 'game:start');

  const room = state.rooms.get(created.roomId);
  if (!room || room.status !== 'active' || !room.timers.activeColor) {
    throw new Error('Timed reconnect test room did not start with an active clock');
  }

  await closePollingSocket(host);
  await closePollingSocket(guest);
  const pausedValue = room.timers[room.timers.activeColor];
  const emptyRoomCleanup = room.cleanupTimer;
  if (room.timers.lastTickAt !== null) {
    throw new Error('Timed room should pause after both players disconnect');
  }

  await emitSocketEvent(replacementHost, 'room:reconnect', { playerToken: created.playerToken });
  const hostReconnectState = await waitForSocketEvent(replacementHost, 'game:state');
  if (!hostReconnectState.timers.paused || hostReconnectState.peerConnected !== false) {
    throw new Error('Single-player reconnect should report a paused timer and offline peer');
  }
  await new Promise((resolve) => setTimeout(resolve, 650));

  if (room.timers.lastTickAt !== null || room.timers[room.timers.activeColor] !== pausedValue) {
    throw new Error('Timed room clock resumed before both players reconnected');
  }
  if (!room.cleanupTimer || room.cleanupTimer === emptyRoomCleanup) {
    throw new Error('Single-player reconnect should replace empty-room cleanup with peer reconnect grace');
  }

  await emitSocketEvent(replacementGuest, 'room:reconnect', { playerToken: joined.playerToken });
  const guestReconnectState = await waitForSocketEvent(replacementGuest, 'game:state');
  if (guestReconnectState.timers.paused || guestReconnectState.peerConnected !== true) {
    throw new Error('Two-player reconnect should report a resumed timer and connected peer');
  }
  if (room.timers.lastTickAt === null || room.cleanupTimer !== null) {
    throw new Error('Timed room should resume and cancel cleanup after both players reconnect');
  }

  await closePollingSocket(replacementHost);
  await closePollingSocket(replacementGuest);
}

async function runVampireCoopSocketSmokeCheck() {
  const host = await openPollingSocket();
  const guest = await openPollingSocket();

  await emitSocketEvent(host, 'vps:room:create', {});
  const created = await waitForSocketEvent(host, 'vps:room:created');
  if (!created.roomId) {
    throw new Error('Vampire co-op room did not return a roomId');
  }

  await emitSocketEvent(guest, 'vps:room:join', { roomId: created.roomId });
  const joined = await waitForSocketEvent(guest, 'vps:room:joined');
  const hostNotice = await waitForSocketEvent(host, 'vps:guest:joined');
  if (joined.roomId !== created.roomId || hostNotice.roomId !== created.roomId) {
    throw new Error('Vampire co-op join did not connect host and guest to the same room');
  }

  await emitSocketEvent(guest, 'vps:guest:input', {
    roomId: created.roomId,
    input: { dx: 0.7, dy: -0.2, dash: true, tower: false },
  });
  const input = await waitForSocketEvent(host, 'vps:guest:input');
  if (!input.input || input.input.dx <= 0 || !input.input.dash) {
    throw new Error('Vampire co-op guest input was not relayed to host');
  }

  await emitSocketEvent(host, 'vps:host:state', {
    roomId: created.roomId,
    snapshot: {
      state: 'playing',
      elapsed: 12,
      kills: 3,
      hp: 90,
      maxHp: 100,
      level: 2,
      host: { x: 1, y: 2 },
      guest: { x: 3, y: 4 },
      enemies: [{ x: 5, y: 6, size: 10, hpPct: 0.5, color: '#e74c3c' }],
    },
  });
  const stateEvent = await waitForSocketEvent(guest, 'vps:state');
  if (!stateEvent.snapshot || stateEvent.snapshot.kills !== 3 || !stateEvent.snapshot.guest) {
    throw new Error('Vampire co-op host state was not relayed to guest');
  }
}

async function runReconnectCleanupSmokeCheck(gameName, createPayload) {
  const gameModule = require(path.join(root, 'server', `${gameName}.js`));
  const event = (suffix) => `${gameName}:${suffix}`;
  const originalCleanupMs = gameModule.CFG.disconnectCleanupMs;
  const cleanupMs = 1000;
  gameModule.CFG.disconnectCleanupMs = cleanupMs;

  try {
    const host = await openPollingSocket();
    const replacement = await openPollingSocket();
    await emitSocketEvent(host, event('create'), createPayload);
    const created = await waitForSocketEvent(host, event('created'));
    await emitSocketEvent(host, event('start'), {});
    await waitForSocketEvent(host, event('begin'));

    const room = gameModule.rooms.get(created.code);
    if (!room || room.status !== 'active') {
      throw new Error(`${gameName} room should be active before reconnect cleanup test`);
    }

    await closePollingSocket(host);
    if (!room.cleanupTimer) {
      throw new Error(`${gameName} should schedule cleanup after its final human disconnects`);
    }

    await emitSocketEvent(replacement, event('reconnect'), { token: created.token });
    const reconnected = await waitForSocketEvent(replacement, event('reconnected'));
    if (reconnected.code !== created.code || reconnected.status !== 'active') {
      throw new Error(`${gameName} reconnect returned the wrong active room`);
    }
    if (room.cleanupTimer !== null) {
      throw new Error(`${gameName} reconnect should cancel the pending room cleanup timer`);
    }

    await new Promise((resolve) => setTimeout(resolve, cleanupMs + 100));
    if (!gameModule.rooms.has(created.code)) {
      throw new Error(`${gameName} room was destroyed after a successful reconnect`);
    }

    await closePollingSocket(replacement);
    await new Promise((resolve) => setTimeout(resolve, cleanupMs + 100));
    if (gameModule.rooms.has(created.code)) {
      throw new Error(`${gameName} room should still clean up after everyone disconnects again`);
    }
  } finally {
    gameModule.CFG.disconnectCleanupMs = originalCleanupMs;
  }
}

async function main() {
  process.env.PORT = String(port);
  require(path.join(root, 'server.js'));

  try {
    const status = await waitForServer();
    const parsed = JSON.parse(status.body);
    if (!parsed.rooms || !parsed.players) {
      throw new Error('/api/status did not return expected health payload');
    }
    const forwardedStatus = await httpRequest('GET', '/api/status', null, { 'X-Forwarded-For': '203.0.113.25' });
    const forwardedParsed = JSON.parse(forwardedStatus.body);
    if (forwardedParsed.shutdownKey) {
      throw new Error('/api/status exposed shutdownKey to forwarded/proxied traffic');
    }
    if (forwardedParsed.roomList || forwardedParsed.tunnelUrl) {
      throw new Error('/api/status exposed room details or tunnel URL to forwarded/proxied traffic');
    }

    checkHandlers();
    checkSecurityHelpers();
    checkMultiplayerNicknameSafety();
    checkMultiplayerResumeAndOverlaySafety();
    checkConnectionBannerBehavior();
    checkPausedTimerInterpolation();
    checkLobbyMobileLayoutCoverage();

    const gameIds = [
      'chess', 'omok', 'connect4', 'othello', 'checkers', 'indianpoker',
      'applegame', 'battleship', 'backgammon', 'texasholdem', 'dotsboxes', 'mancala',
    ];
    const paths = [
      '/',
      '/game.html',
      '/admin.html',
      '/privacy.html',
      '/manifest.json',
      '/icons/icon.svg',
      '/js/game-registry.js',
      '/js/sw-update.js',
      '/js/version-badge.js',
      '/js/game.js',
      '/js/admob.js',
      '/js/sandbox-config.js',
      '/bang.html',
      '/js/bang-client.js',
      '/css/games/bang.css',
      '/mahjong.html',
      '/js/mahjong-client.js',
      '/css/games/mahjong.css',
      '/arcade/snake/',
      '/arcade/snake/game.js',
      '/arcade/breakout/',
      '/arcade/breakout/game.js',
      '/arcade/vampire/',
      '/arcade/vampire/game.js',
      '/arcade/plant/',
      '/arcade/plant/game.js',
      '/arcade/factory/',
      '/arcade/factory/state.js',
      '/arcade/factory/evolution.js',
      '/arcade/factory/game.js',
      '/arcade/factory/style.css',
      '/arcade/bootstrap/',
      '/arcade/bootstrap/sim.js',
      '/arcade/bootstrap/game.js',
      '/arcade/bootstrap/style.css',
      '/arcade/neon-cascade/',
      '/arcade/neon-cascade/sim.js',
      '/arcade/neon-cascade/game.js',
      '/arcade/neon-cascade/style.css',
      '/arcade/tower-defense/',
      '/arcade/tower-defense/runtime/config.js',
      '/arcade/tower-defense/runtime/game.js',
      '/arcade/tower-defense/runtime/ui.js',
      '/arcade/tower-defense/runtime/graphics/sprites.css',
      '/games3d/chess3d/',
      '/games3d/chess3d/scene.js',
    ];
    for (const game of gameIds) {
      paths.push(`/js/game-${game}.js`);
      paths.push(`/css/games/${game}.css`);
    }

    for (const pathname of paths) {
      await checkUrl(pathname);
    }

    await runSocketSmokeCheck();
    await runMalformedSocketPayloadSmokeCheck();
    await runTexasSpectatorPrivacySmokeCheck();
    await runCommonReconnectTimerSmokeCheck();
    await runVampireCoopSocketSmokeCheck();
    await runReconnectCleanupSmokeCheck('bang', { nickname: 'QA', size: 4 });
    await runReconnectCleanupSmokeCheck('mahjong', { nickname: 'QA' });
    checkChatBubbleUi();
    checkTexasHoldemReconnectUi();
    await checkDeploymentCachePolicy();
    checkServiceWorkerUpdateCoverage();
    checkVersionBadgeCoverage();
    checkProductionArcadeAssetPolicy();
    checkFactoryArcadeCoverage();
    checkPlantArcadeCoverage();
    checkQuickArcadeRewardCoverage();
    checkNeonCascadeCoverage();
    checkBootstrapArcadeCoverage();
    checkSandboxConfigBridgeRead();
    checkTowerDefenseSandboxCoverage();
    checkVampireDirectorLoopCoverage();
    checkVampireSandboxEvolutionCoverage();
    await checkVersionBadgeUi();
    runSyntaxCheck();
    console.log(`Smoke check passed: ${baseUrl}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(path.join(root, '.shutdown-key')); } catch (_) {}
    process.exit(process.exitCode || 0);
  }
}

main();
