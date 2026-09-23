#!/usr/bin/env node
// Verifies production-visible deploy identity and cache-sensitive static files.
// Usage:
//   npm run verify:production
//   VERIFY_BASE_URL=http://127.0.0.1:3000 npm run verify:production
const http = require('http');
const https = require('https');

const DEFAULT_BASE_URL = 'https://board-game-online.onrender.com';

function request(baseUrl, pathname) {
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

// 배포 확인. 버전 '값'을 박지 않고 '불변식'을 본다 — 예전엔 sw.js 의 boardgame-v11,
// bang-client.js?v=1.1, mahjong-client.js?v=1.3 을 그대로 요구해서, 그 뒤로 캐시 버전이나
// 클라이언트 버전을 한 번이라도 올린 모든 배포에서 이 검사가 실패했다 (npm run check 가
// 이 스크립트를 돌리지 않아 아무도 몰랐다). 지금은 smoke-check 가 로컬 서버로 매번 돌린다.
async function verifyDeployment(baseUrlInput, { expectedCommit = '' } = {}) {
  const baseUrl = String(baseUrlInput || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const get = (pathname) => request(baseUrl, pathname);
  const version = await get('/api/version');
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

  const home = await get('/');
  assertOk(home, '/');
  assertNoStore(home, '/');
  if (!home.body.includes('/js/version-badge.js')) {
    throw new Error('Lobby HTML does not load /js/version-badge.js');
  }

  const admin = await get('/admin.html');
  assertOk(admin, '/admin.html');
  assertNoStore(admin, '/admin.html');
  if (!admin.body.includes('/js/version-badge.js')) {
    throw new Error('Admin HTML does not load /js/version-badge.js');
  }

  const badge = await get('/js/version-badge.js');
  assertOk(badge, '/js/version-badge.js');
  assertNoStore(badge, '/js/version-badge.js');
  if (!badge.body.includes('/api/version') || !badge.body.includes('textContent')) {
    throw new Error('/js/version-badge.js is missing the version fetch or safe text rendering path');
  }

  const serviceWorker = await get('/sw.js');
  assertOk(serviceWorker, '/sw.js');
  assertNoStore(serviceWorker, '/sw.js');
  // 캐시 이름은 배포마다 오른다 — 값이 아니라 '네트워크 우선 + v11 이상'을 본다
  const cacheVersion = Number((serviceWorker.body.match(/CACHE_NAME\s*=\s*'boardgame-v(\d+)'/) || [])[1]);
  if (
    !serviceWorker.body.includes('networkFirst(request)') ||
    !(cacheVersion >= 11) ||
    !serviceWorker.body.includes("fetch(request, { cache: 'no-store' })")
  ) {
    throw new Error(`/sw.js is missing the network-first HTTP-cache bypass (cache version ${cacheVersion || 'none'}, need v11+)`);
  }

  // 멀티플레이 페이지가 가리키는 클라이언트 스크립트를 페이지에서 읽어, 그 파일이 실제로
  // no-store 로 서빙되는지 본다. 버전 쿼리를 박아 두면 클라이언트를 고칠 때마다 이 검사가 깨진다.
  for (const [pathname, clientName] of [['/bang.html', 'bang-client'], ['/mahjong.html', 'mahjong-client']]) {
    const page = await get(pathname);
    assertOk(page, pathname);
    assertNoStore(page, pathname);
    const ref = (page.body.match(new RegExp(`/js/${clientName}\\.js(?:\\?v=[\\w.-]+)?`)) || [])[0];
    if (!ref || !page.body.includes('/js/sw-update.js')) {
      throw new Error(`${pathname} is missing its client script or the service-worker update helper`);
    }
    const asset = await get(ref);
    assertOk(asset, ref);
    assertNoStore(asset, ref);
  }

  return { baseUrl, ...parsedVersion };
}

module.exports = { verifyDeployment };

if (require.main === module) {
  verifyDeployment(process.env.VERIFY_BASE_URL, { expectedCommit: (process.env.EXPECTED_COMMIT || '').trim() })
    .then((v) => {
      console.log('Production/version verification passed');
      console.log(`Base URL: ${v.baseUrl}`);
      console.log(`Branch: ${v.branch}`);
      console.log(`Commit: ${v.commit}`);
      console.log(`Start time: ${v.startTime}`);
    })
    .catch((error) => {
      console.error(`Production/version verification failed: ${error.message}`);
      process.exit(1);
    });
}
