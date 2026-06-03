#!/usr/bin/env node
// Verifies production-visible deploy identity and cache-sensitive static files.
// Usage:
//   npm run verify:production
//   VERIFY_BASE_URL=http://127.0.0.1:3000 npm run verify:production
const http = require('http');
const https = require('https');

const baseUrl = (process.env.VERIFY_BASE_URL || 'https://board-game-online.onrender.com').replace(/\/+$/, '');
const expectedCommit = (process.env.EXPECTED_COMMIT || '').trim();

function request(pathname) {
  const url = new URL(pathname, baseUrl);
  const client = url.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ url: url.toString(), statusCode: res.statusCode, headers: res.headers, body }));
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error(`Timeout requesting ${url}`));
    });
    req.on('error', reject);
    req.end();
  });
}

function assertOk(res, label) {
  if (res.statusCode !== 200) {
    throw new Error(`${label} returned HTTP ${res.statusCode}: ${res.url}`);
  }
}

function assertNoStore(res, label) {
  const cacheControl = String(res.headers['cache-control'] || '');
  if (!cacheControl.includes('no-store')) {
    throw new Error(`${label} should send Cache-Control: no-store, got "${cacheControl || '(missing)'}"`);
  }
}

async function main() {
  const version = await request('/api/version');
  assertOk(version, '/api/version');
  assertNoStore(version, '/api/version');

  let parsedVersion;
  try {
    parsedVersion = JSON.parse(version.body);
  } catch (error) {
    throw new Error(`/api/version did not return JSON: ${error.message}`);
  }

  for (const key of ['commit', 'branch', 'startTime']) {
    if (!(key in parsedVersion)) {
      throw new Error(`/api/version missing "${key}"`);
    }
  }

  if (expectedCommit && parsedVersion.commit !== expectedCommit) {
    throw new Error(`Expected commit ${expectedCommit}, but production reports ${parsedVersion.commit}`);
  }

  const home = await request('/');
  assertOk(home, '/');
  assertNoStore(home, '/');
  if (!home.body.includes('/js/version-badge.js')) {
    throw new Error('Lobby HTML does not load /js/version-badge.js');
  }

  const admin = await request('/admin.html');
  assertOk(admin, '/admin.html');
  assertNoStore(admin, '/admin.html');
  if (!admin.body.includes('/js/version-badge.js')) {
    throw new Error('Admin HTML does not load /js/version-badge.js');
  }

  const badge = await request('/js/version-badge.js');
  assertOk(badge, '/js/version-badge.js');
  assertNoStore(badge, '/js/version-badge.js');
  if (!badge.body.includes('/api/version') || !badge.body.includes('textContent')) {
    throw new Error('/js/version-badge.js is missing the version fetch or safe text rendering path');
  }

  const serviceWorker = await request('/sw.js');
  assertOk(serviceWorker, '/sw.js');
  assertNoStore(serviceWorker, '/sw.js');
  if (!serviceWorker.body.includes('networkFirst(request)')) {
    throw new Error('/sw.js should use network-first handling for deploy-sensitive assets');
  }

  console.log('Production/version verification passed');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Branch: ${parsedVersion.branch}`);
  console.log(`Commit: ${parsedVersion.commit}`);
  console.log(`Start time: ${parsedVersion.startTime}`);
}

main().catch((error) => {
  console.error(`Production/version verification failed: ${error.message}`);
  process.exit(1);
});
