// 혼자하기 AI 엔진 검사 — 실행: node prototypes/ai-engines-test.js
// public/js/ai-*.js 를 브라우저 없이 읽어서(vm) 두 가지를 본다:
//   ① 규칙이 서버와 같은가 — 혼자하기는 AI 파일의 규칙으로 돌아가므로, 다르면 연습한 규칙과 실전 규칙이 갈린다
//      (체커는 실제로 달랐다: 좌표 모양이 달라 한 수도 못 뒀고, 연속 점프가 없었다)
//   ② 뻔한 수를 두는가 — 이길 수를 두고, 질 수를 막고, 공짜로 기물을 내주지 않는다
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Chess } = require('chess.js');
const state = require('../server/state');
const { createRoomState } = require('../server/rooms');
const serverCheckers = require('../server/handlers/checkers');
const serverMancala = require('../server/handlers/mancala');

let passed = 0, failed = 0;
function ok(cond, label, detail = '') {
  if (cond) { passed++; console.log(`  PASS ${label}`); }
  else      { failed++; console.log(`  FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}
// 시드 고정 난수 — 무작위 대국이 매번 같게
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
// 엔진 안의 Math.random(동점 무작위)도 시드로 고정한다
function load(name, global, seed = 1) {
  const win = {};
  const SeededMath = Object.create(Math); SeededMath.random = rng(seed);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', name), 'utf8'), { window: win, Math: SeededMath, Date });
  return win[global];
}
state.io = { to: () => ({ emit() {} }), sockets: { sockets: new Map() } };

console.log('\n[체커 — 규칙이 서버와 같다]');
{
  const AI = load('ai-checkers.js', 'AICheckers');
  const key = (m) => `${m.from.row},${m.from.col}>${m.to.row},${m.to.col}`;
  const rand = rng(7);
  let positions = 0, mismatch = null, multi = 0;
  for (let g = 0; g < 60 && !mismatch; g++) {
    let board = serverCheckers.initCheckersBoard(), turn = 'white', from = null;
    for (let ply = 0; ply < 250; ply++) {
      const sv = from
        ? serverCheckers.getValidCheckersMovesForPiece(board, from.row, from.col, board[from.row][from.col], true).map((m) => ({ from, ...m }))
        : serverCheckers.getAllCheckersValidMoves(board, turn);
      const cv = AI.getValidMoves(board, turn, from).moves;
      positions++;
      const a = sv.map(key).sort().join(' '), b = cv.map(key).sort().join(' ');
      if (a !== b) { mismatch = `서버 [${a}] / AI [${b}]`; break; }
      if (!cv.length) break;
      const r = AI.applyStep(board, cv[Math.floor(rand() * cv.length)]);
      board = r.board;
      if (r.continueFrom) { from = r.continueFrom; multi++; continue; }
      from = null; turn = turn === 'white' ? 'black' : 'white';
    }
  }
  ok(!mismatch, `무작위 60판 ${positions}개 포지션에서 합법 수가 서버와 같다 (연속 점프 ${multi}회 포함)`, mismatch || '');
  ok(AI.getValidMoves(serverCheckers.initCheckersBoard(), 'white').moves.every((m) => Number.isInteger(m.from.row) && Number.isInteger(m.to.col)),
    '수는 보드 렌더러·서버와 같은 { row, col } 모양이다 (예전 { r, c } 는 혼자하기에서 갈 곳이 하나도 안 보였다)');

  const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));
  // 흑 말 하나가 백 둘을 연달아 잡을 수 있다
  let b = empty();
  b[2][1] = { color: 'black', king: false };
  b[3][2] = { color: 'white', king: false };
  b[5][4] = { color: 'white', king: false };
  b[7][0] = { color: 'white', king: false };
  const turn = AI.getBestTurn(b, 'black');
  ok(turn && turn.length === 2 && turn.every((s) => s.isJump), 'AI 는 연속 점프를 한 턴에 끝까지 한다', JSON.stringify(turn));

  // 승격하면 그 턴은 끝난다 (더 잡을 수 있어도)
  b = empty();
  b[5][2] = { color: 'black', king: false };
  b[6][3] = { color: 'white', king: false };
  b[6][5] = { color: 'white', king: false };
  const step = AI.getValidMoves(b, 'black').moves.find((m) => m.to.row === 7);
  const res = AI.applyStep(b, step);
  ok(res.promoted && res.continueFrom === null, '승격한 점프 뒤에는 연속 점프가 없다 (서버와 같음)');

  // 잡을 수 있으면 반드시 잡는다
  b = empty();
  b[2][1] = { color: 'black', king: false };
  b[3][2] = { color: 'white', king: false };
  b[1][6] = { color: 'black', king: false };
  ok(AI.getValidMoves(b, 'black').moves.every((m) => m.isJump), '잡을 수 있으면 잡는 수만 합법이다');

  // 수읽기: 공짜로 말을 내주지 않는다 — 백 말 앞에 들어가면 바로 잡힌다
  b = empty();
  b[2][3] = { color: 'black', king: false };
  b[5][2] = { color: 'white', king: false };
  b[5][6] = { color: 'white', king: false };
  b[0][7] = { color: 'black', king: true };
  let hung = 0;
  for (let i = 0; i < 10; i++) {
    const t = AI.getBestTurn(b, 'black');
    const nb = t.reduce((bd, s) => AI.applyStep(bd, s).board, b);
    if (AI.getValidMoves(nb, 'white').mustJump) hung++;
  }
  ok(hung === 0, '바로 잡히는 칸으로 들어가지 않는다 (예전 AI 는 한 수만 봤다)', `${hung}/10`);
}

console.log('\n[오목 — 수 고르기]');
{
  const AI = load('ai-omok.js', 'AIOmok');
  const N = 15;
  const empty = () => Array.from({ length: N }, () => Array(N).fill(null));
  const put = (b, list, color) => { for (const [r, c] of list) b[r][c] = color; return b; };
  const cases = [
    ['열린 4 를 5목으로 완성한다', () => put(empty(), [[7,3],[7,4],[7,5],[7,6]], 'white'), (m) => m.row === 7 && [2,7].includes(m.col)],
    ['상대의 막힌 4 를 막는다', () => put(put(empty(), [[5,5],[6,6],[7,7],[8,8]], 'black'), [[4,4],[1,1]], 'white'), (m) => m.row === 9 && m.col === 9],
    ['띈 4(●●_●●) 를 막는다', () => put(empty(), [[3,3],[3,4],[3,6],[3,7]], 'black'), (m) => m.row === 3 && m.col === 5],
    ['상대 열린 3 을 막는다 (막지 않으면 열린 4)', () => put(put(empty(), [[7,6],[7,7],[7,8]], 'black'), [[2,2]], 'white'), (m) => m.row === 7 && [4,5,9,10].includes(m.col)],
    ['6목(장목)은 승리가 아니다 — 그 칸 대신 상대 4 를 막는다',
      () => { const b = put(empty(), [[0,0],[0,1],[0,2],[0,3],[0,5],[10,2]], 'white'); return put(b, [[10,3],[10,4],[10,5],[10,6]], 'black'); },
      (m) => m.row === 10 && m.col === 7],
    ['내 5목이 상대 4 막기보다 먼저다', () => put(put(empty(), [[7,3],[7,4],[7,5],[7,6]], 'white'), [[9,3],[9,4],[9,5],[9,6]], 'black'), (m) => m.row === 7 && [2,7].includes(m.col)],
  ];
  for (const [label, mk, good] of cases) {
    let hits = 0;
    for (let i = 0; i < 5; i++) if (good(AI.getBestMove(mk(), 'white', N))) hits++;
    ok(hits === 5, label, `${hits}/5`);
  }
}

console.log('\n[체스 — 수 생성(perft)과 수 고르기]');
{
  const AI = load('ai-chess.js', 'AIChess');
  // 널리 쓰이는 perft 기준값 — 캐슬링·앙파상·승격·핀·체크 회피가 모두 들어 있다
  const perft = [
    ['시작 포지션', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 8902],
    ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 2, 2039],
    ['포지션 3 (앙파상·핀)', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['포지션 4 (승격·캐슬링)', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
    ['포지션 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 2, 1486],
  ];
  for (const [label, fen, d, want] of perft) {
    const got = AI.perft(fen, d);
    ok(got === want, `perft ${label} 깊이 ${d} = ${want}`, `got ${got}`);
  }
  const pick = (fen, n = 3) => { const out = []; for (let i = 0; i < n; i++) { const c = new Chess(fen); out.push(AI.getBestMove(c, c.turn() === 'w' ? 'white' : 'black').san); } return out; };
  ok(pick('6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1').every((s) => s === 'Qd8#'), '백: 1수 메이트를 둔다');
  ok(pick('3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1').every((s) => s === 'Rd1#'), '흑: 1수 메이트를 둔다');
  ok(pick('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1').every((s) => s === 'Rxd5'), '공짜 퀸을 잡는다');
  ok(pick('4k3/2p5/3p4/8/8/8/8/3QK3 w - - 0 1').every((s) => s !== 'Qxd6'), '지켜진 폰을 퀸으로 잡지 않는다 (Qxd6?? cxd6)');
  // 반환값은 chess.js 의 verbose 수 — 호출자가 그대로 _chess.move() 한다
  const c = new Chess();
  const m = AI.getBestMove(c, 'white');
  ok(m && m.from && m.to && m.san && c.move(m), '반환한 수는 chess.js 가 그대로 받아들인다');
  // 속도 — 예전엔 중반 한 수에 1.5~3.7초 (메인 스레드가 멈췄다)
  const t0 = Date.now();
  AI.getBestMove(new Chess('r2q1rk1/ppp2ppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP2PPP/R2Q1RK1 w - - 0 8'), 'white');
  const ms = Date.now() - t0;
  ok(ms < 1500, '중반 포지션 한 수가 1.5초 안에 끝난다', `${ms}ms`);
}

console.log('\n[만칼라 — 규칙이 서버와 같다 · 수 고르기]');
{
  const AI = load('ai-mancala.js', 'AIMancala');
  const rand = rng(11);
  let mismatch = null, moves = 0;
  const log = console.log; console.log = () => {};   // 서버의 '게임 종료' 로그 40줄은 가린다
  for (let g = 0; g < 40 && !mismatch; g++) {
    const r = createRoomState('white', { type: 'timed', minutes: 10 }, 'm-tok', 'mancala', null, null);
    r.id = 'm'; r.status = 'active';
    r.players.host = { socketId: 'h', connected: true }; r.players.guest = { socketId: 'g', connected: true };
    r.timers.activeColor = 'white'; r.timers.lastTickAt = Date.now();
    while (r.status === 'active') {
      const color = r.currentTurn;
      const mine = (color === 'white' ? [0,1,2,3,4,5] : [7,8,9,10,11,12]).filter((i) => r.pits[i] > 0);
      if (!mine.length) break;
      const pit = mine[Math.floor(rand() * mine.length)];
      const expect = AI.applyMove(r.pits, color, pit);
      serverMancala.handleMove({ emit() {} }, r, color === 'white' ? 'host' : 'guest', { pit });
      moves++;
      if (r.status !== 'active') break;   // 끝난 판은 서버가 남은 씨앗을 쓸어 담는다
      if (JSON.stringify(expect.pits) !== JSON.stringify(r.pits)) { mismatch = `pit ${pit}: AI ${expect.pits} / 서버 ${r.pits}`; break; }
      const sameTurn = r.currentTurn === color;
      if (sameTurn !== expect.bonusTurn) { mismatch = `보너스 턴 판정이 다르다 (pit ${pit})`; break; }
    }
  }
  console.log = log;
  ok(!mismatch, `무작위 40판 ${moves}수에서 씨앗 배분·캡처·보너스 턴이 서버와 같다`, mismatch || '');

  // 캡처: 백 pit 1 의 씨앗 1개 → 빈 pit 2 에 떨어져 맞은편(10) 9개를 가져온다
  //         (다른 수 pit 3 은 씨앗 4개를 상대 쪽으로 흘린다 — 캡처와 비길 수 없다)
  const p = [0,1,0,4,0,0, 0, 0,0,0,9,1,1, 0];
  ok(AI.getBestPit(p, 'white') === 1, '큰 캡처를 놓치지 않는다');

  // 실력 하한: '이번 수로 창고에 가장 많이 넣는' 탐욕 상대에게 대부분 이긴다 (예전 한 수 휴리스틱 수준)
  const greedy = (pits, color) => {
    const store = color === 'white' ? 6 : 13;
    let best = null, bv = -1;
    for (const i of (color === 'white' ? [0,1,2,3,4,5] : [7,8,9,10,11,12])) {
      if (!pits[i]) continue;
      const r = AI.applyMove(pits, color, i);
      const v = r.pits[store] - pits[store] + (r.bonusTurn ? 0.5 : 0);
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  };
  let wins = 0; const G = 20;
  for (let g = 0; g < G; g++) {
    let pits = [4,4,4,4,4,4,0,4,4,4,4,4,4,0], turn = 'white';
    const aiC = g % 2 ? 'black' : 'white';
    for (;;) {
      const pit = turn === aiC ? AI.getBestPit(pits, turn) : greedy(pits, turn);
      const r = AI.applyMove(pits, turn, pit); pits = r.pits;
      const wE = [0,1,2,3,4,5].every((i) => !pits[i]), bE = [7,8,9,10,11,12].every((i) => !pits[i]);
      if (wE || bE) {
        for (let i = 0; i <= 5; i++) { pits[6] += pits[i]; pits[i] = 0; }
        for (let i = 7; i <= 12; i++) { pits[13] += pits[i]; pits[i] = 0; }
        if ((aiC === 'white' ? pits[6] - pits[13] : pits[13] - pits[6]) > 0) wins++;
        break;
      }
      if (!r.bonusTurn) turn = turn === 'white' ? 'black' : 'white';
    }
  }
  ok(wins >= 17, `탐욕 상대에게 ${G}판 중 17판 이상 이긴다 (수읽기 8수)`, `${wins}/${G}`);
}

console.log('\n[오델로 — 수 고르기]');
{
  const AI = load('ai-othello.js', 'AIOthello');
  const b = Array.from({ length: 8 }, () => Array(8).fill(null));
  b[0][1] = 'black'; b[0][2] = 'white';   // (0,0) 에 백이 두면 모서리
  b[3][3] = 'white'; b[3][4] = 'black'; b[4][3] = 'black'; b[4][4] = 'white';
  let corner = 0;
  for (let i = 0; i < 3; i++) { const m = AI.getBestMove(b, 'white'); if (m && m.row === 0 && m.col === 0) corner++; }
  ok(corner === 3, '모서리를 잡을 수 있으면 잡는다', `${corner}/3`);
  // X 칸(모서리 대각 옆)은 모서리를 내준다 — 다른 수가 있으면 두지 않는다
  const s = Array.from({ length: 8 }, () => Array(8).fill(null));
  s[3][3] = 'white'; s[3][4] = 'black'; s[4][3] = 'black'; s[4][4] = 'white';
  s[2][2] = 'black'; s[5][5] = 'black';
  const valid = AI.validMoves(s, 'white');
  const hasX = valid.some((m) => m.row === 1 && m.col === 1);
  const mv = AI.getBestMove(s, 'white');
  ok(!hasX || valid.length === 1 || !(mv.row === 1 && mv.col === 1), '다른 수가 있으면 X 칸(1,1)에 두지 않는다');

  // 실력 하한: 같은 깊이로 읽는 '모서리 +25 · 돌 수' 평가(예전 AI 의 평가)에게 대부분 이긴다
  const rand = rng(3);
  const oldEval = (bd, color) => {
    let v = 0;
    for (const [r, c] of [[0,0],[0,7],[7,0],[7,7]]) v += bd[r][c] === color ? 25 : bd[r][c] ? -25 : 0;
    for (const row of bd) for (const x of row) v += x === color ? 1 : x ? -1 : 0;
    return v;
  };
  const oldSearch = (bd, depth, alpha, beta, me, cur) => {
    const ms = AI.validMoves(bd, cur), nx = cur === 'white' ? 'black' : 'white';
    if (depth === 0 || !ms.length) return oldEval(bd, me);
    let best = cur === me ? -Infinity : Infinity;
    for (const m of ms) {
      const v = oldSearch(AI.applyMove(bd, m.row, m.col, cur), depth - 1, alpha, beta, me, nx);
      if (cur === me) { best = Math.max(best, v); alpha = Math.max(alpha, best); } else { best = Math.min(best, v); beta = Math.min(beta, best); }
      if (beta <= alpha) break;
    }
    return best;
  };
  const oldBest = (bd, color) => {
    const nx = color === 'white' ? 'black' : 'white';
    let best = null, bv = -Infinity;
    for (const m of AI.validMoves(bd, color)) { const v = oldSearch(AI.applyMove(bd, m.row, m.col, color), 3, -Infinity, Infinity, color, nx); if (v > bv) { bv = v; best = m; } }
    return best;
  };
  let wins = 0; const G = 10;
  for (let g = 0; g < G; g++) {
    let bd = Array.from({ length: 8 }, () => Array(8).fill(null));
    bd[3][3] = 'white'; bd[4][4] = 'white'; bd[3][4] = 'black'; bd[4][3] = 'black';
    const aiC = g % 2 ? 'white' : 'black';
    let turn = 'black', passes = 0, ply = 0;
    while (passes < 2) {
      const ms = AI.validMoves(bd, turn);
      if (!ms.length) { passes++; turn = turn === 'white' ? 'black' : 'white'; continue; }
      passes = 0;
      let m;
      if (ply < 2) m = ms[Math.floor(rand() * ms.length)];   // 첫 두 수는 시드 무작위로 판을 다르게
      else m = turn === aiC ? AI.getBestMove(bd, turn) : oldBest(bd, turn);
      bd = AI.applyMove(bd, m.row, m.col, turn); ply++;
      turn = turn === 'white' ? 'black' : 'white';
    }
    const mine = bd.flat().filter((v) => v === aiC).length, theirs = bd.flat().filter((v) => v && v !== aiC).length;
    if (mine > theirs) wins++;
  }
  ok(wins >= 8, `예전 평가(모서리·돌 수)에게 ${G}판 중 8판 이상 이긴다 (칸 가치표·이동력 평가)`, `${wins}/${G}`);
}

console.log('\n[백개먼 — 수 고르기]');
{
  const AI = load('ai-backgammon.js', 'AIBackgammon');
  const serverBg = require('../server/handlers/backgammon');
  const init = () => { const r = {}; serverBg.initRoom(r, {}); return r.bgBoard || r.board; };
  const rand = rng(5);
  let illegal = null, finished = 0;
  for (let g = 0; g < 20 && !illegal; g++) {
    let bg = init(), turn = 'white';
    for (let t = 0; t < 3000; t++) {
      const d1 = 1 + Math.floor(rand() * 6), d2 = 1 + Math.floor(rand() * 6);
      const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
      for (;;) {
        const m = AI.getBestMove(bg, turn, dice);
        if (!m) break;
        const legal = AI.getValidMoves(bg, turn, dice).some((x) => x.from === m.from && x.to === m.to && x.dieUsed === m.dieUsed);
        if (!legal) { illegal = JSON.stringify(m); break; }
        bg = AI.applyMove(bg, turn, m); dice.splice(dice.indexOf(m.dieUsed), 1);
        if (!dice.length || bg.borneOff[turn] >= 15) break;
      }
      if (illegal) break;
      if (bg.borneOff[turn] >= 15) { finished++; break; }
      turn = turn === 'white' ? 'black' : 'white';
    }
  }
  ok(!illegal && finished === 20, `AI 끼리 20판 — 모든 수가 합법이고 모든 판이 끝난다 (${finished}/20)`, illegal || '');
}

console.log(`\n결과: ${passed}/${passed + failed} 통과`);
process.exit(failed ? 1 : 0);
