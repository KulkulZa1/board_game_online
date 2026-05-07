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
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}${pathname}`, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout requesting ${pathname}`));
    });
    req.on('error', reject);
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
      '/arcade/snake/',
      '/arcade/snake/game.js',
      '/arcade/breakout/',
      '/arcade/breakout/game.js',
      '/arcade/vampire/',
      '/arcade/vampire/game.js',
      '/arcade/plant/',
      '/arcade/plant/game.js',
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
