// 서버 방어 회귀 검사 — 실행: node prototypes/server-hardening-test.js
// 전수 감사에서 실제로 재현된 결함들. 각 항목은 '고치기 전에 실패하던' 검사다.
// (소켓을 거치는 흐름 — 무승부 제안·관전 승인·대기방 독점 — 은 scripts/smoke-check.js 가 실서버로 검사한다)
'use strict';

const state = require('../server/state');
const { createRoomState, resetForRematch } = require('../server/rooms');
const { endGame } = require('../server/endgame');
const events = require('../server/events');
const omok = require('../server/handlers/omok');
const checkers = require('../server/handlers/checkers');
const othello = require('../server/handlers/othello');
const indianpoker = require('../server/handlers/indianpoker');
const bang = require('../server/bang');

let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else      { failed++; console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}
function installIo() {
  const log = [];
  state.io = { to: () => ({ emit: (event, payload) => log.push({ event, payload }) }), sockets: { sockets: new Map() } };
  return log;
}
const sock = { emit() {} };
const lastOver = (log) => log.filter((e) => e.event === 'game:over').pop();

console.log('\n[소켓 핸들러 예외 가드]');
{
  // 리스너 하나의 예외가 프로세스를 죽였다 (오목 훈수 {row:0.5}, 뱅 pick 0.5).
  const registered = {};
  const fake = { id: 'guard-test', on(event, fn) { registered[event] = fn; } };
  events._internal.guardSocketHandlers(fake);
  fake.on('boom', () => { throw new TypeError('boom'); });
  let threw = false;
  try { registered.boom({}); } catch (_) { threw = true; }
  ok(!threw, '리스너가 던진 예외가 밖으로 새지 않는다');
  fake.on('async-boom', async () => { throw new Error('async boom'); });
  let rejectedOutside = false;
  const onUnhandled = () => { rejectedOutside = true; };
  process.once('unhandledRejection', onUnhandled);
  registered['async-boom']({});
  setTimeout(() => {
    process.removeListener('unhandledRejection', onUnhandled);
    ok(!rejectedOutside, '비동기 리스너의 거부도 가드가 받는다');
    finish();
  }, 30);
}

console.log('\n[좌표 검사 — 정수만, 실제 판 크기로]');
{
  const { isCell } = events._internal;
  ok(!isCell(0.5, 0.5, 15, 15), '소수 좌표 거부 (board[0.5] 가 undefined 였다)');
  ok(!isCell(14, 0, 13, 13), '13×13 판의 14행 거부');
  ok(isCell(18, 18, 19, 19), '19×19 판의 18행은 허용 (예전 0~14 고정이 막았다)');
  ok(!isCell('3', 3, 15, 15), '문자열 좌표 거부');
}

console.log('\n[endGame 은 한 번만]');
{
  const log = installIo();
  const room = createRoomState('white', { minutes: null }, 't', 'connect4', null, null);
  room.id = 'end-once'; room.status = 'active';
  endGame(room, 'black', 'resign');
  endGame(room, 'white', 'chips-depleted');   // 지연 타이머가 뒤늦게 부른 상황
  const overs = log.filter((e) => e.event === 'game:over');
  ok(overs.length === 1, '이미 끝난 방을 다시 끝내지 않는다', `game:over ${overs.length}회`);
  ok(room.winner === 'black', '처음 결과가 덮어써지지 않는다', room.winner);
  clearTimeout(room.cleanupTimer);
}

console.log('\n[오목 — 장목 연장은 승리가 아니다]');
{
  const log = installIo();
  const room = createRoomState('black', { minutes: null }, 't', 'omok', { size: 15 }, null);
  room.id = 'omok-overline'; room.status = 'active';
  const play = (role, row, col) => { room.currentTurn = role === 'host' ? 'black' : 'white'; omok.handleMove(sock, room, role, { row, col }); };
  const whites = [[0, 0], [0, 4], [0, 8], [0, 12], [3, 0], [3, 4], [3, 8], [3, 12]];
  let wi = 0;
  for (const c of [1, 2, 3, 5, 6]) { play('host', 7, c); play('guest', ...whites[wi++]); }
  play('host', 7, 4);                 // 1~6 장목 — 승리 아님
  ok(!lastOver(log), '6목은 승리가 아니다');
  play('guest', ...whites[wi++]);
  play('host', 7, 0);                 // 0~6 칠목 — 예전엔 한쪽이 4에서 잘려 '5목'으로 읽혔다
  ok(!lastOver(log), '장목에 한 점 이은 7목도 승리가 아니다');
  ok(omok.checkOmokWin([[null, 'b', 'b', 'b', 'b', 'b', null]].concat(Array(6).fill(Array(7).fill(null))), 0, 3, 'b', 7), '정확히 5목은 승리');
}

console.log('\n[종료 사유가 결과와 맞는다]');
{
  // 오셀로 — 예전 사유 'board-full' 은 '무승부 (보드 꽉 참)'으로 그려져 '승리!' 아래에 '무승부'가 떴다
  const log = installIo();
  const room = createRoomState('black', { minutes: null }, 't', 'othello', null, null);
  room.id = 'othello-end'; room.status = 'active';
  room.board = Array(8).fill(null).map(() => Array(8).fill('black'));
  room.board[0][0] = null; room.board[0][1] = 'white';   // 흑이 (0,0)에 두면 판이 차고 끝난다
  room.currentTurn = 'black';
  othello.handleMove(sock, room, 'host', { row: 0, col: 0 });
  const over = lastOver(log);
  ok(over && over.payload.winner === 'black' && over.payload.reason === 'stone-count', '오셀로 종료 사유는 stone-count', over && JSON.stringify(over.payload.reason));

  // 체커 — 말이 남았는데 막힌 것과 전멸은 다른 결말
  const log2 = installIo();
  const c = createRoomState('white', { minutes: null }, 't', 'checkers', null, null);
  c.id = 'checkers-blocked'; c.status = 'active';
  c.board = Array(8).fill(null).map(() => Array(8).fill(null));
  c.board[0][1] = { color: 'black', king: false };      // 흑 말 하나: 아래로만 움직인다
  c.board[1][0] = { color: 'white', king: false };       // 흑의 왼쪽 아래를 막는다 (뛰어넘으면 판 밖)
  c.board[2][3] = { color: 'white', king: false };       // (1,2)를 뛰어넘을 착지점을 막아 둔다
  c.board[2][1] = { color: 'white', king: false };       // 이 말이 (1,2)로 올라가 마지막 길을 막는다
  c.currentTurn = 'white';
  checkers.handleMove(sock, c, 'host', { from: { row: 2, col: 1 }, to: { row: 1, col: 2 } });
  const over2 = lastOver(log2);
  ok(over2 && over2.payload.reason === 'no-moves', '말이 남은 채 막히면 no-moves (전멸 아님)', over2 && over2.payload.reason);
}

console.log('\n[선공은 백 — 재대국마다 선공 플레이어가 번갈아 간다]');
{
  installIo();
  // 안내문은 '백(빨강)이 먼저'인데 서버는 호스트 색을 선공으로 뒀다 — 호스트가 흑이면 흑이 먼저였다
  for (const game of ['checkers', 'mancala', 'dotsboxes']) {
    const room = createRoomState('black', { minutes: null }, 't', game, null, null);
    ok(room.currentTurn === 'white', `${game}: 호스트가 흑이어도 첫 수는 백`, room.currentTurn);
  }
  for (const game of ['checkers', 'mancala', 'dotsboxes', 'battleship']) {
    const room = createRoomState('white', { minutes: null }, 't', game, null, null);
    room.id = `${game}-rematch`;
    const firstRole = () => (room.currentTurn === room.hostColor ? 'host' : 'guest');
    const seq = [firstRole()];
    for (let i = 0; i < 3; i++) { room.status = 'finished'; resetForRematch(room); seq.push(firstRole()); }
    ok(seq.join(',') === 'host,guest,host,guest', `${game}: 호스트→게스트→호스트→게스트`, seq.join(','));
    clearTimeout(room.cleanupTimer);
  }
}

console.log('\n[인디언 포커 — 베팅과 동점]');
{
  const round = () => {
    const r = createRoomState('white', { minutes: 10 }, 't', 'indianpoker', null, { numDecks: 2, winCondition: 2 });
    r.id = 'ip'; r.status = 'active'; r.phase = 'bet'; r.betTurn = 'guest'; r.pot = 10;
    r.chips = { host: 95, guest: 95 }; r.hands = { host: { rank: 5 }, guest: { rank: 7 } };
    r.players.host = { socketId: 'h' }; r.players.guest = { socketId: 'g' };
    return r;
  };
  installIo();
  let r = round();
  indianpoker.handleIndianPokerAction(null, r, 'guest', { action: 'raise' });
  indianpoker.handleIndianPokerAction(null, r, 'host', { action: 'raise' });
  ok(r.bets.host === 10 && r.bets.guest === 5, '재레이즈는 차액을 맞추고 5를 더 건다 (예전엔 5만 — 이름만 레이즈인 콜)', JSON.stringify(r.bets));
  indianpoker.handleIndianPokerAction(null, r, 'guest', { action: 'call' });
  ok(r.phase === 'showdown', '걸린 베팅을 맞춘 게스트의 콜이면 베팅이 닫힌다 (예전엔 호스트가 한 번 더)', r.phase);
  ok(r.chips.host + r.chips.guest === 200, '칩이 보존된다', String(r.chips.host + r.chips.guest));

  r = round();
  indianpoker.handleIndianPokerAction(null, r, 'guest', { action: 'call' });
  ok(r.phase === 'bet' && r.betTurn === 'host', '첫 행동 체크는 호스트에게 차례를 넘긴다');

  const log = installIo();
  r = round(); r.betTurn = 'host'; r.pot = 15; r.chips = { host: 50, guest: 50 }; r.hands = { host: { rank: 6 }, guest: { rank: 6 } };
  indianpoker.handleIndianPokerAction(null, r, 'host', { action: 'call' });
  const sd = log.filter((e) => e.event === 'indianpoker:showdown').pop();
  ok(sd && sd.payload.winner === 'draw', '동점은 무승부로 팟을 나눈다 (예전엔 안내 없는 호스트 승)', sd && sd.payload.winner);
  ok(r.chips.host === 57 && r.chips.guest === 58, '홀수 칩은 먼저 행동한 게스트에게', JSON.stringify(r.chips));

  installIo();
  r = round(); r.hands = { host: { rank: 3 }, guest: { rank: 10 } }; r.chips = { host: 95, guest: 2 };
  indianpoker.handleIndianPokerAction(null, r, 'guest', { action: 'fold' });
  ok(r.timers.activeColor === null && r.timers.lastTickAt === null, '폴드하면 결과를 보여주는 동안 시계가 멈춘다');
  ok(r.chips.host + r.chips.guest === 107, '10 폴드 벌칙은 가진 만큼만 옮긴다 (칩이 생겨나지 않는다)', JSON.stringify(r.chips));
}

console.log('\n[BANG! — pick 은 정수만]');
{
  state.io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };
  const cases = [['jesse', [{ kind: 'player', seat: 1 }, { kind: 'deck' }]], ['pedro', [{ kind: 'discard' }, { kind: 'deck' }]]];
  for (const [type, options] of cases) {
    const room = bang.createRoom('host', 4);
    bang.startMatch(room);
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer);
    room.game.queue.length = 0;
    room.game.queue.push({ type, actor: 0, options });
    let threw = null;
    try { bang._internal.resolveReact(room, 0, { pick: 0.5 }); } catch (e) { threw = e.message; }
    ok(!threw, `${type}: pick 0.5 가 서버를 죽이지 않는다 (options[0.5] → .kind TypeError 였다)`, threw || '');
    clearTimeout(room.aiTimer); clearTimeout(room.actionTimer); clearTimeout(room.cleanupTimer);
  }
}

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  console.log(`\n결과: ${passed}/${passed + failed} 통과`);
  process.exit(failed ? 1 : 0);
}
