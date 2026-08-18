// 코어 보드게임 규칙 검증 — omok / connect4 / othello / checkers / mancala /
// applegame / battleship / chess / indianpoker
// 이 9종은 오랫동안 규칙 테스트가 없었다. 실행: node prototypes/core-games-handler-test.js
'use strict';

const state = require('../server/state');
const { createRoomState } = require('../server/rooms');

const omok        = require('../server/handlers/omok');
const connect4    = require('../server/handlers/connect4');
const othello     = require('../server/handlers/othello');
const checkers    = require('../server/handlers/checkers');
const mancala     = require('../server/handlers/mancala');
const applegame   = require('../server/handlers/applegame');
const battleship  = require('../server/handlers/battleship');
const chess       = require('../server/handlers/chess');
const indianpoker = require('../server/handlers/indianpoker');

let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else      { failed++; console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}

// state.io 를 가로채 endGame/게임 이벤트를 관찰한다
function installIo() {
  const events = [];
  state.io = { to: () => ({ emit: (event, payload) => events.push({ event, payload }) }) };
  return events;
}
function sock() {
  const events = [];
  return { events, socket: { emit: (event, payload) => events.push({ event, payload }) } };
}
function room(gameType, boardSize = null, opts = null) {
  const r = createRoomState('white', { type: 'timed', minutes: 10 }, `${gameType}-tok`, gameType, boardSize, opts);
  r.id = `${gameType}-room`;
  r.status = 'active';
  r.players.host  = { socketId: 'h', connected: true };
  r.players.guest = { socketId: 'g', connected: true };
  r.timers.activeColor = 'white';
  r.timers.lastTickAt = Date.now();
  return r;
}
const over = (events) => events.filter((e) => e.event === 'game:over').pop();
const invalid = (s) => s.events.filter((e) => e.event === 'game:move:invalid').pop();

console.log('\n[오목]');
{
  // 정확히 5목 승리
  let ev = installIo();
  let r = room('omok', { size: 15 });
  for (let i = 0; i < 4; i++) {
    omok.handleMove(sock().socket, r, 'guest', { row: 7, col: i });      // black
    omok.handleMove(sock().socket, r, 'host',  { row: 0, col: i });      // white
  }
  omok.handleMove(sock().socket, r, 'guest', { row: 7, col: 4 });        // black 5목
  const won = over(ev);
  ok(won && won.payload.winner === 'black' && won.payload.reason === 'five-in-a-row', '5목 승리 판정');
  ok(won && Array.isArray(won.payload.winCells) && won.payload.winCells.length === 5, '승리 라인 5칸 보고');

  // 착수 규칙
  ev = installIo(); r = room('omok', { size: 15 });
  let s = sock();
  omok.handleMove(s.socket, r, 'guest', { row: 5, col: 5 });
  omok.handleMove(s.socket, r, 'host',  { row: 5, col: 5 });
  ok(invalid(s), '이미 돌이 있는 칸 거부');
  const before = r.moves.length;
  omok.handleMove(sock().socket, r, 'guest', { row: 6, col: 6 });        // 흑 차례 아님
  ok(r.moves.length === before, '자기 차례가 아니면 착수 무시');

  // 보드 크기별 무승부 임계값 (회귀: 예전엔 225 고정이라 13목은 영영 안 끝나고 19목은 조기 종료)
  ev = installIo(); r = room('omok', { size: 13 });
  for (let i = 0; i < 168; i++) r.moves.push({ filler: true });
  omok.handleMove(sock().socket, r, 'guest', { row: 0, col: 0 });        // 169수째
  const d13 = over(ev);
  ok(d13 && d13.payload.winner === 'draw' && d13.payload.reason === 'board-full',
     '13×13은 169수에서 무승부', d13 ? String(d13.payload.winner) : 'no game:over');

  ev = installIo(); r = room('omok', { size: 19 });
  for (let i = 0; i < 224; i++) r.moves.push({ filler: true });
  omok.handleMove(sock().socket, r, 'guest', { row: 0, col: 0 });        // 225수째
  ok(!over(ev), '19×19는 225수에서 끝나지 않음');
}

console.log('\n[커넥트4]');
{
  let ev = installIo();
  let r = room('connect4', { rows: 6, cols: 7 });
  connect4.handleMove(sock().socket, r, 'host', { col: 3 });
  ok(r.board[5][3] === 'white' && r.colHeights[3] === 1, '중력 — 맨 아래 칸에 안착');

  // 가로 4목
  ev = installIo(); r = room('connect4', { rows: 6, cols: 7 });
  for (let c = 0; c < 3; c++) {
    connect4.handleMove(sock().socket, r, 'host',  { col: c });
    connect4.handleMove(sock().socket, r, 'guest', { col: c });
  }
  connect4.handleMove(sock().socket, r, 'host', { col: 3 });
  const won = over(ev);
  ok(won && won.payload.winner === 'white' && won.payload.reason === 'four-in-a-row', '가로 4목 승리');

  // 꽉 찬 열 거부
  ev = installIo(); r = room('connect4', { rows: 6, cols: 7 });
  r.colHeights[0] = 6;
  const s = sock();
  connect4.handleMove(s.socket, r, 'host', { col: 0 });
  ok(invalid(s), '꽉 찬 열 거부');

  // 무승부는 보드 크기를 따른다 (작은 보드로 확인)
  ev = installIo(); r = room('connect4', { rows: 4, cols: 4 });
  r.colHeights = [4, 4, 4, 3];
  r.board = Array(4).fill(null).map(() => Array(4).fill('white'));
  r.board[0][3] = null;
  r.currentTurn = 'white';
  connect4.handleMove(sock().socket, r, 'host', { col: 3 });
  const dr = over(ev);
  ok(dr && (dr.payload.winner === 'draw' || dr.payload.winner === 'white'), '보드가 차면 종료 처리');
}

console.log('\n[오델로]');
{
  let ev = installIo();
  let r = room('othello');
  ok(r.board[3][3] === 'white' && r.board[3][4] === 'black' && r.currentTurn === 'black', '초기 배치 + 흑 선공');

  othello.handleMove(sock().socket, r, 'guest', { row: 2, col: 3 });     // black
  ok(r.board[2][3] === 'black' && r.board[3][3] === 'black', '가운데 돌 뒤집기');

  const s = sock();
  othello.handleMove(s.socket, r, 'host', { row: 0, col: 0 });           // 뒤집을 게 없음
  ok(invalid(s), '뒤집을 돌이 없는 수 거부');

  // 상대가 둘 곳이 없으면 패스하고 턴이 돌아온다.
  // 흑이 (0,0)을 두면 백 돌은 (2,1) 하나만 남는데, (2,1)로 향하는 모든 직선이
  // 막혀 백은 둘 곳이 없다. 반면 흑은 (2,0)에 둘 수 있다.
  ev = installIo(); r = room('othello');
  r.board = Array(8).fill(null).map(() => Array(8).fill(null));
  r.board[0][1] = 'white'; r.board[0][2] = 'black';
  r.board[2][1] = 'white';
  for (let c = 2; c <= 7; c++) r.board[2][c] = 'black';
  r.currentTurn = 'black';
  othello.handleMove(sock().socket, r, 'guest', { row: 0, col: 0 });
  const made = ev.filter((e) => e.event === 'game:move:made').pop();
  ok(made && made.payload.pass === true && made.payload.turn === 'black',
     '상대가 둘 수 없으면 패스하고 턴 유지',
     made ? `pass=${made.payload.pass} turn=${made.payload.turn}` : 'no move:made');
}

console.log('\n[체커]');
{
  // 점프가 가능하면 일반 이동은 금지된다
  let ev = installIo();
  let r = room('checkers');
  r.board = Array(8).fill(null).map(() => Array(8).fill(null));
  r.board[5][2] = { color: 'white', king: false };
  r.board[4][3] = { color: 'black', king: false };
  r.board[5][6] = { color: 'white', king: false };
  r.currentTurn = 'white';
  let s = sock();
  checkers.handleMove(s.socket, r, 'host', { from: { row: 5, col: 6 }, to: { row: 4, col: 5 } });
  ok(invalid(s), '점프가 있으면 일반 이동 거부 (강제 점프)');

  checkers.handleMove(sock().socket, r, 'host', { from: { row: 5, col: 2 }, to: { row: 3, col: 4 } });
  ok(r.board[3][4] && !r.board[4][3], '점프로 상대 말 제거');

  // 연속 점프는 턴을 유지한다
  ev = installIo(); r = room('checkers');
  r.board = Array(8).fill(null).map(() => Array(8).fill(null));
  r.board[5][0] = { color: 'white', king: false };
  r.board[4][1] = { color: 'black', king: false };
  r.board[2][3] = { color: 'black', king: false };
  r.currentTurn = 'white';
  checkers.handleMove(sock().socket, r, 'host', { from: { row: 5, col: 0 }, to: { row: 3, col: 2 } });
  ok(r.mustJump && r.mustJump.row === 3 && r.mustJump.col === 2, '연속 점프 대기 상태');
  ok(r.currentTurn === 'white', '연속 점프 중 턴 유지');

  // 킹 승격 시 그 턴은 끝난다 (아메리칸 체커 규칙)
  ev = installIo(); r = room('checkers');
  r.board = Array(8).fill(null).map(() => Array(8).fill(null));
  r.board[2][1] = { color: 'white', king: false };
  r.board[1][2] = { color: 'black', king: false };
  r.board[1][6] = { color: 'black', king: false };
  r.currentTurn = 'white';
  checkers.handleMove(sock().socket, r, 'host', { from: { row: 2, col: 1 }, to: { row: 0, col: 3 } });
  ok(r.board[0][3] && r.board[0][3].king === true, '마지막 줄 도달 시 킹 승격');
  ok(r.mustJump === null && r.currentTurn === 'black', '승격하면 연속 점프 없이 턴 종료');

  // 상대 말이 전멸하면 승리
  ev = installIo(); r = room('checkers');
  r.board = Array(8).fill(null).map(() => Array(8).fill(null));
  r.board[5][2] = { color: 'white', king: false };
  r.board[4][3] = { color: 'black', king: false };
  r.currentTurn = 'white';
  checkers.handleMove(sock().socket, r, 'host', { from: { row: 5, col: 2 }, to: { row: 3, col: 4 } });
  const won = over(ev);
  ok(won && won.payload.winner === 'white', '상대 말 전멸 시 승리');
}

console.log('\n[만칼라]');
{
  // 상대 창고는 건너뛴다
  let ev = installIo();
  let r = room('mancala');
  r.pits = new Array(14).fill(0);
  r.pits[5] = 3;                 // 5 → 6(내 창고) → 7 → 8
  r.pits[0] = 1;                 // 양쪽에 씨앗을 남겨 이 수로 게임이 끝나지 않게 한다
  r.pits[12] = 1;
  r.currentTurn = 'white';
  mancala.handleMove(sock().socket, r, 'host', { pit: 5 });
  ok(r.pits[6] === 1 && r.pits[7] === 1 && r.pits[8] === 1 && r.pits[13] === 0,
     '반시계 배분 + 상대 창고 통과 없음',
     `pits=${r.pits.join(',')}`);

  // 마지막 씨앗이 내 창고 → 보너스 턴
  ev = installIo(); r = room('mancala');
  r.pits = new Array(14).fill(0);
  r.pits[5] = 1; r.pits[0] = 1;
  r.currentTurn = 'white';
  mancala.handleMove(sock().socket, r, 'host', { pit: 5 });
  ok(r.currentTurn === 'white', '내 창고에서 끝나면 보너스 턴');

  // 캡처: 내 빈 칸에 마지막 씨앗 → 맞은편까지 획득
  ev = installIo(); r = room('mancala');
  r.pits = new Array(14).fill(0);
  r.pits[0] = 1;      // 0 → 1 (빈 칸)
  r.pits[11] = 5;     // 1의 맞은편(12-1=11)
  r.pits[7] = 1;      // black 쪽에 씨앗을 남겨 게임이 끝나지 않게
  r.currentTurn = 'white';
  mancala.handleMove(sock().socket, r, 'host', { pit: 0 });
  ok(r.pits[6] === 6 && r.pits[1] === 0 && r.pits[11] === 0, '빈 칸 안착 시 맞은편 씨앗 캡처', `store=${r.pits[6]}`);

  // 동점 종료는 'draw' — null 이면 클라이언트가 양쪽에 패배를 띄운다 (회귀)
  ev = installIo(); r = room('mancala');
  r.pits = new Array(14).fill(0);
  r.pits[5] = 1; r.pits[6] = 10; r.pits[13] = 11;
  r.currentTurn = 'white';
  mancala.handleMove(sock().socket, r, 'host', { pit: 5 });
  const drew = over(ev);
  ok(drew && drew.payload.winner === 'draw', '만칼라 동점은 draw 로 보고', drew ? String(drew.payload.winner) : 'none');
}

console.log('\n[사과 게임]');
{
  // 생성된 보드의 총합은 10의 배수 (전부 지울 수 있어야 한다)
  let allTen = true;
  for (let i = 0; i < 20; i++) {
    const b = applegame.generateAppleBoard();
    const sum = b.flat().reduce((a, v) => a + v, 0);
    if (sum % 10 !== 0) { allTen = false; break; }
  }
  ok(allTen, '생성 보드 총합은 항상 10의 배수');

  let ev = installIo();
  let r = room('applegame');
  r.board = Array(10).fill(null).map(() => Array(17).fill(null));
  r.board[0][0] = 4; r.board[0][1] = 6; r.board[5][5] = 3;
  r.currentTurn = 'white';
  applegame.handleMove(sock().socket, r, 'host', { row1: 0, col1: 0, row2: 0, col2: 1 });
  ok(r.board[0][0] === null && r.board[0][1] === null && r.scores.white === 2, '합 10 사각형 제거 + 점수');

  const s = sock();
  applegame.handleMove(s.socket, r, 'guest', { row1: 5, col1: 5, row2: 5, col2: 5 });
  ok(invalid(s), '합이 10이 아니면 거부');

  // 동점 종료는 'draw' (회귀)
  ev = installIo(); r = room('applegame');
  r.board = Array(10).fill(null).map(() => Array(17).fill(null));
  r.board[0][0] = 10;
  r.scores = { white: 5, black: 6 };
  r.currentTurn = 'white';
  applegame.handleMove(sock().socket, r, 'host', { row1: 0, col1: 0, row2: 0, col2: 0 });
  const drew = over(ev);
  ok(drew && drew.payload.winner === 'draw', '사과 게임 동점은 draw 로 보고', drew ? String(drew.payload.winner) : 'none');
}

console.log('\n[배틀십]');
{
  const fleet = (offset = 0) => ([
    { name: 'carrier',    cells: [0,1,2,3,4].map((c) => ({ r: 0 + offset, c })) },
    { name: 'battleship', cells: [0,1,2,3].map((c) => ({ r: 2 + offset, c })) },
    { name: 'cruiser',    cells: [0,1,2].map((c) => ({ r: 4 + offset, c })) },
    { name: 'submarine',  cells: [0,1,2].map((c) => ({ r: 6 + offset, c })) },
    { name: 'destroyer',  cells: [0,1].map((c) => ({ r: 8 + offset, c })) },
  ]);

  let ev = installIo();
  let r = room('battleship');
  let s = sock();
  battleship.handleMove(s.socket, r, 'host', { action: 'place', ships: fleet() });
  ok(s.events.some((e) => e.event === 'battleship:placed'), '정상 배치 수락');

  // 겹치는 배치 거부
  r = room('battleship'); s = sock();
  const overlap = fleet();
  overlap[1].cells = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }, { r: 0, c: 3 }];
  battleship.handleMove(s.socket, r, 'host', { action: 'place', ships: overlap });
  ok(invalid(s), '겹치는 함선 배치 거부');

  // 끊긴 배치 거부
  r = room('battleship'); s = sock();
  const gap = fleet();
  gap[4].cells = [{ r: 8, c: 0 }, { r: 8, c: 2 }];
  battleship.handleMove(s.socket, r, 'host', { action: 'place', ships: gap });
  ok(invalid(s), '연속되지 않은 함선 배치 거부');

  // 대각선 배치 거부
  r = room('battleship'); s = sock();
  const diag = fleet();
  diag[4].cells = [{ r: 8, c: 0 }, { r: 9, c: 1 }];
  battleship.handleMove(s.socket, r, 'host', { action: 'place', ships: diag });
  ok(invalid(s), '대각선 함선 배치 거부');

  // 같은 칸 두 번 공격 거부
  ev = installIo(); r = room('battleship');
  battleship.handleMove(sock().socket, r, 'host',  { action: 'place', ships: fleet() });
  battleship.handleMove(sock().socket, r, 'guest', { action: 'place', ships: fleet() });
  r.currentTurn = 'white';
  battleship.handleMove(sock().socket, r, 'host', { row: 0, col: 0 });
  s = sock();
  r.currentTurn = 'white';
  battleship.handleMove(s.socket, r, 'host', { row: 0, col: 0 });
  ok(invalid(s), '이미 공격한 칸 거부');
}

console.log('\n[체스]');
{
  let ev = installIo();
  let r = room('chess');
  chess.handleMove(sock().socket, r, 'host', { from: 'e2', to: 'e4' });
  ok(r.moves.length === 1 && r.moves[0].san === 'e4', '정상 수 반영');

  const s = sock();
  chess.handleMove(s.socket, r, 'guest', { from: 'e7', to: 'e5' });
  chess.handleMove(s.socket, r, 'host', { from: 'e4', to: 'e6' });   // 불법
  ok(invalid(s), '불법 수 거부');

  // 바보 체크메이트 (f3 e5 g4 Qh4#)
  ev = installIo(); r = room('chess');
  chess.handleMove(sock().socket, r, 'host',  { from: 'f2', to: 'f3' });
  chess.handleMove(sock().socket, r, 'guest', { from: 'e7', to: 'e5' });
  chess.handleMove(sock().socket, r, 'host',  { from: 'g2', to: 'g4' });
  chess.handleMove(sock().socket, r, 'guest', { from: 'd8', to: 'h4' });
  const won = over(ev);
  ok(won && won.payload.winner === 'black' && won.payload.reason === 'checkmate', '체크메이트 감지');
}

console.log('\n[인디언 포커]');
{
  // A(1)는 10만 이긴다
  const r = room('indianpoker', null, { numDecks: 2, winCondition: 2 });
  ok(r.chips.host === 100 && r.chips.guest === 100, '초기 칩 100/100');

  // 덱 소진 동점 → 'draw' (회귀)
  const ev = installIo();
  const r2 = room('indianpoker', null, { numDecks: 1, winCondition: 2 });
  r2.deck = [{ rank: 5, suit: '♠' }];   // 2장 미만 → 소진
  r2.chips = { host: 50, guest: 50 };
  indianpoker.startIndianPokerRound(r2);
  const drew = over(ev);
  ok(drew && drew.payload.winner === 'draw' && drew.payload.reason === 'deck-exhausted',
     '덱 소진 동점은 draw 로 보고', drew ? String(drew.payload.winner) : 'none');

  // 양측 앤티 부족 + 동점 → 'draw'
  const ev2 = installIo();
  const r3 = room('indianpoker', null, { numDecks: 2, winCondition: 2 });
  r3.chips = { host: 1, guest: 1 };
  indianpoker.startIndianPokerRound(r3);
  const drew2 = over(ev2);
  ok(drew2 && drew2.payload.winner === 'draw' && drew2.payload.reason === 'chips-depleted',
     '앤티 부족 동점은 draw 로 보고', drew2 ? String(drew2.payload.winner) : 'none');
}

console.log(`\n결과: ${passed}/${passed + failed} 통과`);
process.exit(failed ? 1 : 0);
