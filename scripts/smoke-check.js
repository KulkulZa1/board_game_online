#!/usr/bin/env node
// Starts the local server and verifies routes, static assets, handlers, and JS syntax.
const http = require('http');
const path = require('path');
const fs = require('fs');
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
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
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

function runSyntaxCheck() {
  if (!checkJavaScriptSyntax()) {
    throw new Error('JS syntax check failed');
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
