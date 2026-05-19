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

function httpRequest(method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {},
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
  const { isLoopbackAddress } = require('../server/security');
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
  const version = await checkUrl('/api/version');
  assertNoStoreHeader(version, '/api/version');

  const sw = await checkUrl('/sw.js');
  assertNoStoreHeader(sw, '/sw.js');
  if (sw.body.includes('stale-while-revalidate') || !sw.body.includes('networkFirst(request)')) {
    throw new Error('Service worker should use network-first JS/CSS so deployed game logic appears immediately');
  }

  const chat = await checkUrl('/js/chat.js');
  assertNoStoreHeader(chat, '/js/chat.js');

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
  const roots = ['public', 'sandbox'].map((dir) => path.join(root, dir));
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

async function checkVersionBadgeUi() {
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

  const elements = new Map();
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
          branch: 'audit/version-diagnostics',
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
  if (!badge.textContent.includes('audit/version-diagnostics abcdef1')) {
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

  const chatText = '  <b>hello</b> ' + 'x'.repeat(240);
  await emitSocketEvent(host, 'chat:send', { text: chatText });
  const guestChat = await waitForSocketEvent(guest, 'chat:message');
  if (guestChat.role !== 'host') {
    throw new Error(`Expected host chat role, received ${guestChat.role}`);
  }
  if (guestChat.text.length !== 200 || !guestChat.text.startsWith('<b>hello</b>')) {
    throw new Error('Chat payload was not trimmed and capped before broadcast');
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

    checkHandlers();
    checkSecurityHelpers();

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
      '/arcade/snake/',
      '/arcade/snake/game.js',
      '/arcade/breakout/',
      '/arcade/breakout/game.js',
      '/arcade/vampire/',
      '/arcade/vampire/game.js',
      '/arcade/plant/',
      '/arcade/plant/game.js',
      '/arcade/tower-defense/',
      '/games3d/chess3d/',
      '/games3d/chess3d/scene.js',
      '/sandbox/',
      '/sandbox/vampire-survivors/',
      '/sandbox/vampire-survivors/game.js',
      '/sandbox/plant-growing/',
      '/sandbox/plant-growing/game.js',
      '/sandbox/tower-defense/',
      '/sandbox/tower-defense/game.js',
    ];
    for (const game of gameIds) {
      paths.push(`/js/game-${game}.js`);
      paths.push(`/css/games/${game}.css`);
    }

    for (const pathname of paths) {
      await checkUrl(pathname);
    }

    await runSocketSmokeCheck();
    checkChatBubbleUi();
    await checkDeploymentCachePolicy();
    checkServiceWorkerUpdateCoverage();
    checkVersionBadgeCoverage();
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
