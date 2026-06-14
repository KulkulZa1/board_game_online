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
  const version = await checkUrl('/api/version');
  assertNoStoreHeader(version, '/api/version');

  const sw = await checkUrl('/sw.js');
  assertNoStoreHeader(sw, '/sw.js');
  if (sw.body.includes('stale-while-revalidate') || !sw.body.includes('networkFirst(request)')) {
    throw new Error('Service worker should use network-first JS/CSS so deployed game logic appears immediately');
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
    'public/arcade/tower-defense/index.html',
  ];
  const offenders = arcadePages.filter((file) =>
    fs.readFileSync(path.join(root, file), 'utf8').includes('/sandbox/')
  );
  if (offenders.length) {
    throw new Error(`Public arcade pages must not request /sandbox/ assets: ${offenders.join(', ')}`);
  }

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
  const style = fs.readFileSync(path.join(root, 'public/arcade/factory/style.css'), 'utf8');
  const lobby = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

  if (!lobby.includes('/arcade/factory/')) {
    throw new Error('Lobby should expose the Factory arcade route');
  }
  if (!page.includes('/js/sw-update.js') || !page.includes('game.js')) {
    throw new Error('Factory page should load the runtime and service-worker update helper');
  }
  if (!game.includes('placementIssue') || !game.includes('광맥 위에만 배치')) {
    throw new Error('Factory game should prevent dead miner placements with user feedback');
  }
  if (!game.includes('function deliver') || !game.includes('다음 시대로 진화')) {
    throw new Error('Factory delivery loop should provide milestone feedback');
  }
  if (!style.includes('@media (max-width: 520px)') || !style.includes('#palette')) {
    throw new Error('Factory CSS should include mobile-specific palette/tool layout rules');
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
      '/arcade/factory/',
      '/arcade/factory/game.js',
      '/arcade/factory/style.css',
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
    await runVampireCoopSocketSmokeCheck();
    checkChatBubbleUi();
    await checkDeploymentCachePolicy();
    checkServiceWorkerUpdateCoverage();
    checkVersionBadgeCoverage();
    checkProductionArcadeAssetPolicy();
    checkFactoryArcadeCoverage();
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
