/**
 * smoke-test.js — 빠른 서버 시작 + 핵심 경로 검증
 *
 * 실행: node scripts/smoke-test.js
 * 성공 시 exit 0, 실패 시 exit 1
 */
'use strict';

const http = require('http');

let pass = 0;
let fail = 0;
let server;

function check(label, cond) {
  if (cond) {
    console.log('  ✓ ' + label);
    pass++;
  } else {
    console.error('  ✗ FAIL: ' + label);
    fail++;
  }
}

// ── 1. 모듈 로드 검증 ─────────────────────────────────────────────
console.log('\n[1] 서버 모듈 로드');
try {
  const handlers = require('../server/handlers');
  check('handlers Map 로드', handlers instanceof Map);
  const REQUIRED_GAMES = [
    'chess','omok','connect4','othello','checkers','indianpoker',
    'applegame','battleship','backgammon','texasholdem','dotsboxes','mancala'
  ];
  REQUIRED_GAMES.forEach(g => {
    const h = handlers.get(g);
    check(g + ' 핸들러 존재', !!h);
    check(g + '.initRoom 함수', typeof h.initRoom === 'function');
    check(g + '.handleMove 함수', typeof h.handleMove === 'function');
    check(g + '.resetRoom 함수', typeof h.resetRoom === 'function');
  });
} catch (e) {
  console.error('  ✗ handlers 로드 실패:', e.message);
  fail++;
}

// ── 2. 방 상태 생성 검증 ──────────────────────────────────────────
console.log('\n[2] 방 상태 생성');
try {
  const { createRoomState } = require('../server/rooms');
  const state = require('../server/state');
  // state.io mock
  state.io = { to: () => ({ emit: () => {} }) };

  const baseRoom = createRoomState(
    'white',
    { minutes: null },
    'test-host-token',
    'chess',
    null
  );
  check('방 생성 성공', !!baseRoom);
  check('hostToken 설정', baseRoom.hostToken === 'test-host-token');
  check('gameType 설정', baseRoom.gameType === 'chess');
  check('status = waiting', baseRoom.status === 'waiting');
  check('chess handler: fen 초기화', typeof baseRoom.fen === 'string');

  const connect4Room = createRoomState(
    'white', { minutes: 10 }, 'tok2', 'connect4',
    { rows: 6, cols: 7 }
  );
  check('connect4 방 생성', !!connect4Room);
  check('connect4 board 초기화', Array.isArray(connect4Room.board));
} catch (e) {
  console.error('  ✗ rooms 검증 실패:', e.message);
  fail++;
}

// ── 3. HTTP 서버 시작 + 핵심 경로 검증 ───────────────────────────
console.log('\n[3] HTTP 서버 시작');

// 실제 서버 시작 여부 확인 (포트 충돌 피해 동적 포트 사용)
const TEST_PORT = 13001;
process.env.PORT = TEST_PORT;

// state.rooms 초기화 (이전 테스트 잔재 없애기)
const state2 = require('../server/state');
state2.rooms = new Map();
state2.tokenMap = new Map();
state2.rateLimits = new Map();

try {
  require('../server/index.js');
} catch (e) {
  console.error('  ✗ server/index.js 로드 실패:', e.message);
  process.exit(1);
}

function get(path, cb) {
  http.get(`http://localhost:${TEST_PORT}${path}`, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => cb(null, res.statusCode, body));
  }).on('error', (e) => cb(e));
}

setTimeout(() => {
  const ROUTES = [
    { path: '/api/status',     label: '/api/status → 200',                  expect: 200 },
    { path: '/',               label: '/ → 200 (로비)',                      expect: 200 },
    { path: '/game.html',      label: '/game.html → 200 (게임 페이지)',       expect: 200 },
    { path: '/sandbox/',       label: '/sandbox/ → 404 (개발자 도구 비노출)', expect: 404 },
    { path: '/arcade/snake/',    label: '/arcade/snake/ → 200',    expect: 200 },
    { path: '/arcade/breakout/', label: '/arcade/breakout/ → 200', expect: 200 },
    { path: '/arcade/vampire/',  label: '/arcade/vampire/ → 200',  expect: 200 },
    { path: '/arcade/vampire/vps-equipment.js', label: '/arcade/vampire/vps-equipment.js → 200', expect: 200 },
    { path: '/arcade/plant/',    label: '/arcade/plant/ → 200',    expect: 200 },
    { path: '/arcade/tower-defense/', label: '/arcade/tower-defense/ → 200', expect: 200 },
    { path: '/arcade/tower-defense/runtime/game.js', label: '/arcade/tower-defense/runtime/game.js → 200', expect: 200 },
    { path: '/arcade/factory/',  label: '/arcade/factory/ → 200',  expect: 200 },
    { path: '/arcade/factory/game.js', label: '/arcade/factory/game.js → 200', expect: 200 },
    { path: '/arcade/bootstrap/', label: '/arcade/bootstrap/ → 200', expect: 200 },
    { path: '/arcade/bootstrap/sim.js', label: '/arcade/bootstrap/sim.js → 200', expect: 200 },
    { path: '/arcade/jackpot/', label: '/arcade/jackpot/ → 200', expect: 200 },
    { path: '/mahjong.html', label: '/mahjong.html → 200', expect: 200 },
    { path: '/js/mahjong-client.js', label: '/js/mahjong-client.js → 200', expect: 200 },
    { path: '/arcade/jackpot/sim.js', label: '/arcade/jackpot/sim.js → 200', expect: 200 },
    { path: '/bang.html', label: '/bang.html → 200', expect: 200 },
    { path: '/js/bang-client.js', label: '/js/bang-client.js → 200', expect: 200 },
  ];

  let pending = ROUTES.length + 1; // +1 for JSON structure check
  function done() {
    pending--;
    if (pending > 0) return;
    finish();
  }

  // /api/status needs body parsing — handle separately
  get('/api/status', (err, code, body) => {
    check('/api/status → 200', !err && code === 200);
    try {
      const json = JSON.parse(body);
      check('/api/status JSON 구조 유효', typeof json.uptime === 'number' && typeof json.rooms === 'object');
    } catch(e) { check('/api/status JSON 파싱', false); }
    done(); // counts for JSON check
    done(); // counts for route check
  });

  ROUTES.slice(1).forEach(({ path, label, expect }) => {
    get(path, (err, code) => {
      check(label, !err && code === expect);
      done();
    });
  });

}, 800);

function finish() {
  console.log('\n결과: ' + pass + '/' + (pass + fail) + ' 통과' + (fail > 0 ? ' (' + fail + '개 실패)' : ''));

  // 프로세스 종료 (서버 포함)
  setTimeout(() => process.exit(fail > 0 ? 1 : 0), 100);
}
