// 4인 리치 마작 — 자립형 멀티플레이 모듈 (전용 페이지 /mahjong.html)
// 기존 2인 방 시스템(host/guest)을 건드리지 않는 독립 좌석·이벤트 체계.
//   - 방 코드로 초대(최대 4인), 빈 자리는 시작 시 AI가 채운다
//   - 손패는 좌석별 개인 emit(숨김 정보), 나머지는 방 브로드캐스트
//   - 동풍전(동1~동4), 리치/도라/뒷도라/일발/후리텐(자기 강 기준)/안깡 지원
//   - 단순화: 밍깡·가깡·창깡·일시 후리텐·유국만관 미지원 (v1)
'use strict';

const { v4: uuidv4 } = require('uuid');
const state = require('./state');
const { log, rateCheck, sanitizeNickname } = require('./utils');
const E = require('./handlers/mahjong-engine');

const rooms = new Map();      // code → room
const tokenMap = new Map();   // token → { code, seat }

// 타이밍 설정 — 테스트에서 축소 가능하도록 노출
const CFG = {
  graceMs: 5000,        // 턴당 무료 고민 시간 (은행 소모 없음)
  bankMs: 90000,        // 플레이어별 총 시간 은행 (대국 전체, 체스식 — 트롤링 방지)
  callMs: 8000,         // 콜 응답 제한 (초과 시 패스, 은행 미적용)
  riichiAutoMs: 900,    // 리치 중 쯔모/깡 불가 시 자동 쯔모기리 딜레이
  discAutoMs: 4000,     // 접속 끊긴 좌석 자동 진행
  aiDelay: () => 550 + Math.random() * 650,
  handGapMs: 6500,      // 국 결과 표시 후 다음 국까지
};
const START_SCORE = 25000;
const AI_NAMES = ['AI 츠루코', 'AI 준코', 'AI 타카시'];

const now = () => Date.now();
const code4 = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// ── 방 수명 ───────────────────────────────────────────────────────
function createRoom(nickname) {
  let code = code4();
  while (rooms.has(code)) code = code4();
  const room = {
    code,
    status: 'waiting',          // waiting | active | finished
    seats: [null, null, null, null],   // {type:'human'|'ai', name, socketId, token, connected}
    hostSeat: 0,
    game: null,
    actionTimer: null,          // 사람 입력 제한 타이머
    aiTimer: null,
    cleanupTimer: null,
    createdAt: now(),
  };
  rooms.set(code, room);
  seatHuman(room, 0, nickname);
  scheduleCleanup(room, 30 * 60 * 1000);
  return room;
}

function seatHuman(room, seat, nickname) {
  const token = uuidv4();
  room.seats[seat] = {
    type: 'human',
    name: sanitizeNickname(nickname),
    socketId: null, token, connected: false,
  };
  tokenMap.set(token, { code: room.code, seat });
  return room.seats[seat];
}

function scheduleCleanup(room, ms) {
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => destroyRoom(room), ms);
}

function destroyRoom(room) {
  clearTimeout(room.cleanupTimer);
  clearTimeout(room.actionTimer);
  clearTimeout(room.aiTimer);
  for (const s of room.seats) if (s && s.token) tokenMap.delete(s.token);
  rooms.delete(room.code);
  log(`[마작] 방 정리 — ${room.code}`);
}

// ── 브로드캐스트 ──────────────────────────────────────────────────
function emitSeat(room, seat, event, payload) {
  const s = room.seats[seat];
  if (s && s.type === 'human' && s.socketId && s.connected) {
    state.io.to(s.socketId).emit(event, payload);
  }
}
function emitAll(room, event, payloadFor) {
  for (let i = 0; i < 4; i++) {
    emitSeat(room, i, event, typeof payloadFor === 'function' ? payloadFor(i) : payloadFor);
  }
}

function lobbyState(room) {
  return {
    code: room.code,
    status: room.status,
    hostSeat: room.hostSeat,
    seats: room.seats.map((s) => s ? { type: s.type, name: s.name, connected: s.type === 'ai' ? true : s.connected } : null),
  };
}

// 좌석별 개인화 게임 상태 — 자기 손패만 노출
function gameStateFor(room, seat) {
  const g = room.game;
  if (!g) return null;
  return {
    seat,
    round: g.round, dealer: g.dealer, honba: g.honba, riichiSticks: g.riichiSticks,
    scores: g.scores,
    wallCount: g.wall.length - g.deadCount,
    doraIndicators: g.doraIndicators.slice(0, g.doraRevealed),
    hand: g.hands[seat].slice().sort((a, b) => a - b),
    drawnTile: g.turn === seat && g.phase === 'turn' ? g.drawnTile : null,
    handCounts: g.hands.map((h) => h.length),
    melds: g.melds,
    rivers: g.rivers,
    riichi: g.riichiDeclared,
    turn: g.turn,
    phase: g.phase,
    names: room.seats.map((s) => s ? s.name : '—'),
    seatWinds: [0, 1, 2, 3].map((i) => (i - g.dealer + 4) % 4),   // 0=동 1=남 2=서 3=북
    // 체스식 시간 은행 — 클라이언트가 로컬로 카운트다운
    timeBanks: g.timeBank,
    graceMs: CFG.graceMs,
    turnStartedAt: g.turnStartedAt,
    serverNow: now(),
    offers: g.phase === 'calls' && g.pending && g.pending.offers[seat] ? g.pending.offers[seat] : null,
    canActions: g.phase === 'turn' && g.turn === seat ? turnActions(room, seat) : null,
    // 초심자 도우미 — 타패별 샹텐/수용/대기 (본인 턴에만, 사람에게만)
    hint: g.phase === 'turn' && g.turn === seat && room.seats[seat] && room.seats[seat].type === 'human'
      ? computeHint(g, seat) : null,
  };
}

// 타패 후보별 효율 분석 — 클라이언트 도우미(🧭)가 표시한다.
// 남은 장수는 내 손패+모든 강+공개 멜드+도라 표시패를 제외해 추정.
function computeHint(g, seat) {
  const hand = g.hands[seat];
  const meldCount = g.melds[seat].length;
  if (hand.length % 3 !== 2) return null;   // 타패 국면(14-3n장)이 아니면 없음
  const visible = E.toCounts(hand);
  for (const r of g.rivers) for (const d of r) visible[d.tile]++;
  for (const ms of g.melds) for (const m of ms) for (const t of m.tiles) visible[t]++;
  for (let i = 0; i < g.doraRevealed; i++) visible[g.doraIndicators[i]]++;

  const discards = [];
  const tried = new Set();
  let bestSh = 99, bestUke = -1;
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i];
    if (tried.has(t)) continue;
    tried.add(t);
    const rest = hand.slice(); rest.splice(i, 1);
    const counts = E.toCounts(rest);
    const sh = E.shanten(counts, meldCount);
    let uke = 0;
    for (let k = 0; k < E.KIND_COUNT; k++) {
      if (counts[k] >= 4) continue;
      counts[k]++;
      if (E.shanten(counts, meldCount) < sh) uke += Math.max(0, 4 - visible[k]);
      counts[k]--;
    }
    const waits = sh === 0
      ? E.waitingTiles(counts, meldCount).map((w) => ({ t: w, n: Math.max(0, 4 - visible[w]) }))
      : null;
    discards.push({ t, shanten: sh, ukeire: uke, waits });
    if (sh < bestSh || (sh === bestSh && uke > bestUke)) { bestSh = sh; bestUke = uke; }
  }
  for (const d of discards) d.best = d.shanten === bestSh && d.ukeire === bestUke;
  return { shanten: bestSh, discards };
}

function pushState(room) {
  emitAll(room, 'mahjong:state', (i) => gameStateFor(room, i));
}

// ── 대국 시작 ─────────────────────────────────────────────────────
function startMatch(room) {
  // 빈 자리 AI 충원
  let ai = 0;
  for (let i = 0; i < 4; i++) {
    if (!room.seats[i]) room.seats[i] = { type: 'ai', name: AI_NAMES[ai++] || 'AI', socketId: null, token: null, connected: true };
  }
  room.status = 'active';
  clearTimeout(room.cleanupTimer);
  room.game = {
    scores: [START_SCORE, START_SCORE, START_SCORE, START_SCORE],
    timeBank: [CFG.bankMs, CFG.bankMs, CFG.bankMs, CFG.bankMs],
    turnStartedAt: null,
    dealer: 0, round: 1,        // 동1국부터 (round=국 번호 1..4)
    honba: 0, riichiSticks: 0,
    // 아래는 startHand에서 채움
    wall: [], deadCount: 14, doraIndicators: [], uraIndicators: [], doraRevealed: 1,
    hands: [[], [], [], []], melds: [[], [], [], []], rivers: [[], [], [], []],
    riichiDeclared: [false, false, false, false],
    ippatsu: [false, false, false, false],
    turn: 0, phase: 'turn', drawnTile: null, pending: null,
    lastDiscard: null, rinshan: false,
  };
  emitAll(room, 'mahjong:begin', lobbyState(room));
  startHand(room);
  log(`[마작] 대국 시작 — ${room.code}`);
}

function startHand(room) {
  const g = room.game;
  g.wall = E.buildWall();
  g.deadCount = 14;
  // 왕패에서 도라/뒷도라 표시패 확보 (벽 끝 14장)
  const dead = g.wall.slice(g.wall.length - 14);
  g.doraIndicators = [dead[4], dead[5], dead[6], dead[7]];   // 깡으로 최대 4장 공개
  g.uraIndicators = [dead[8], dead[9], dead[10], dead[11]];
  g.doraRevealed = 1;
  g.hands = [[], [], [], []];
  g.melds = [[], [], [], []];
  g.rivers = [[], [], [], []];
  g.riichiDeclared = [false, false, false, false];
  g.ippatsu = [false, false, false, false];
  g.pending = null;
  g.rinshan = false;
  for (let i = 0; i < 13; i++) for (let s = 0; s < 4; s++) g.hands[(g.dealer + s) % 4].push(g.wall.shift());
  g.deadCount = 14;   // wall 배열 끝 14장은 산 패로 세지 않는다
  g.turn = g.dealer;
  g.phase = 'turn';
  drawTile(room, g.dealer, false);
}

function liveWall(g) { return g.wall.length - g.deadCount; }

function drawTile(room, seat, fromDead) {
  const g = room.game;
  if (!fromDead && liveWall(g) <= 0) { exhaustiveDraw(room); return; }
  const tile = fromDead ? g.wall.pop() : g.wall.shift();
  if (fromDead) g.deadCount -= 1;   // 영상패 사용
  g.hands[seat].push(tile);
  g.drawnTile = tile;
  g.rinshan = !!fromDead;
  g.turn = seat;
  g.phase = 'turn';
  armTurnTimer(room, seat);   // turnStartedAt 기록 후 상태 전송(클라 카운트다운 동기화)
  pushState(room);
  maybeAiTurn(room, seat);
}

// 현재 턴 플레이어가 할 수 있는 행동
function turnActions(room, seat) {
  const g = room.game;
  const acts = { discard: true };
  const hand = g.hands[seat];
  const counts = E.toCounts(hand);
  // 쯔모 화료?
  if (E.isWinningHand(counts, g.melds[seat].length)) {
    const r = evalFor(room, seat, g.drawnTile, true, null);
    if (r) acts.tsumo = true;
  }
  // 안깡 (리치 중엔 금지 — 단순화)
  if (!g.riichiDeclared[seat] && liveWall(g) > 0) {
    const kans = [];
    for (let t = 0; t < E.KIND_COUNT; t++) if (counts[t] === 4) kans.push(t);
    if (kans.length) acts.ankan = kans;
  }
  // 리치 (멘젠 + 텐파이 + 1000점 + 산패 4장 이상)
  if (!g.riichiDeclared[seat] && g.melds[seat].every((m) => m.type === 'ankan') &&
      g.scores[seat] >= 1000 && liveWall(g) >= 4) {
    const riichiTiles = [];
    for (let i = 0; i < hand.length; i++) {
      const rest = hand.slice(); rest.splice(i, 1);
      if (E.shanten(E.toCounts(rest), g.melds[seat].length) === 0) {
        if (!riichiTiles.includes(hand[i])) riichiTiles.push(hand[i]);
      }
    }
    if (riichiTiles.length) acts.riichi = riichiTiles;
  }
  // 리치 중엔 쯔모기리 강제 (쯔모/안깡 제외)
  if (g.riichiDeclared[seat]) acts.lockedDiscard = g.drawnTile;
  return acts;
}

function evalFor(room, seat, winTile, tsumo, loserSeat) {
  const g = room.game;
  const ctx = {
    melds: g.melds[seat],
    winTile, tsumo,
    riichi: g.riichiDeclared[seat],
    ippatsu: g.ippatsu[seat],
    rinshan: tsumo && g.rinshan,
    haitei: tsumo && liveWall(g) === 0,
    houtei: !tsumo && liveWall(g) === 0,
    seatWind: E.EAST + ((seat - g.dealer + 4) % 4),
    roundWind: E.EAST,   // 동풍전
    isDealer: seat === g.dealer,
    doraIndicators: g.doraIndicators.slice(0, g.doraRevealed),
    uraIndicators: g.riichiDeclared[seat] ? g.uraIndicators.slice(0, g.doraRevealed) : [],
  };
  return E.evaluateWin(g.hands[seat], ctx);
}

// ── 타이머 ────────────────────────────────────────────────────────
function armTurnTimer(room, seat) {
  clearTimeout(room.actionTimer);
  const s = room.seats[seat];
  if (s.type === 'ai') return;
  const g = room.game;
  g.turnStartedAt = now();
  const autoDiscard = () => {
    if (!rooms.has(room.code) || !room.game) return;
    if (g.phase !== 'turn' || g.turn !== seat) return;
    doDiscard(room, seat, g.drawnTile, false);   // 쯔모기리
  };
  if (!s.connected) { room.actionTimer = setTimeout(autoDiscard, CFG.discAutoMs); return; }
  // 리치 중 — 쯔모/깡이 없으면 짧은 딜레이 후 자동 쯔모기리 (작혼 스타일)
  if (g.riichiDeclared[seat]) {
    const acts = turnActions(room, seat);
    if (!acts.tsumo && !(acts.ankan && acts.ankan.length)) {
      room.actionTimer = setTimeout(autoDiscard, CFG.riichiAutoMs);
      return;
    }
  }
  // 체스식: 무료 유예 + 남은 은행. 소진 시 자동 쯔모기리.
  const limit = CFG.graceMs + (g.timeBank ? g.timeBank[seat] : 0);
  room.actionTimer = setTimeout(() => {
    if (g.timeBank) g.timeBank[seat] = 0;
    autoDiscard();
  }, limit);
}

// 턴 소비 행동 시 은행 차감 (유예 초과분만)
function chargeTime(room, seat) {
  const g = room.game;
  const s = room.seats[seat];
  if (!g || !g.timeBank || !s || s.type !== 'human' || !g.turnStartedAt) return;
  const over = Math.max(0, (now() - g.turnStartedAt) - CFG.graceMs);
  g.timeBank[seat] = Math.max(0, g.timeBank[seat] - over);
  g.turnStartedAt = null;
}

function armCallTimer(room) {
  clearTimeout(room.actionTimer);
  room.actionTimer = setTimeout(() => {
    const g = room.game;
    if (!g || g.phase !== 'calls' || !g.pending) return;
    for (let i = 0; i < 4; i++) {
      if (g.pending.offers[i] && g.pending.responses[i] == null) g.pending.responses[i] = { a: 'pass' };
    }
    resolveCalls(room);
  }, CFG.callMs);
}

// ── 행동 처리 ─────────────────────────────────────────────────────
function doDiscard(room, seat, tile, declareRiichi) {
  const g = room.game;
  if (g.phase !== 'turn' || g.turn !== seat) return false;
  const hand = g.hands[seat];
  const idx = hand.indexOf(tile);
  if (idx < 0) return false;
  // 리치 중엔 쯔모기리만
  if (g.riichiDeclared[seat] && tile !== g.drawnTile) return false;
  chargeTime(room, seat);
  if (declareRiichi) {
    // 리치 유효성: 멘젠 + 버린 후 텐파이
    const rest = hand.slice(); rest.splice(idx, 1);
    if (g.riichiDeclared[seat] || g.scores[seat] < 1000 || liveWall(g) < 4) return false;
    if (!g.melds[seat].every((m) => m.type === 'ankan')) return false;
    if (E.shanten(E.toCounts(rest), g.melds[seat].length) !== 0) return false;
    g.riichiDeclared[seat] = true;
    g.ippatsu[seat] = true;
    g.scores[seat] -= 1000;
    g.riichiSticks += 1;
  } else if (!declareRiichi && g.ippatsu[seat]) {
    g.ippatsu[seat] = false;   // 자기 차례가 돌아오면 일발 소멸 (버림으로)
  }
  clearTimeout(room.actionTimer);
  hand.splice(idx, 1);
  g.rivers[seat].push({ tile, riichi: !!declareRiichi, called: false });
  g.lastDiscard = { seat, tile };
  g.drawnTile = null;
  g.rinshan = false;

  // 콜 수집
  const offers = collectOffers(room, seat, tile);
  if (offers.some((o) => o)) {
    g.phase = 'calls';
    g.pending = { offers, responses: [null, null, null, null], from: seat, tile };
    pushState(room);
    armCallTimer(room);
    // AI 응답
    for (let i = 0; i < 4; i++) {
      if (offers[i] && room.seats[i].type === 'ai') {
        g.pending.responses[i] = aiRespondCall(room, i, offers[i]);
      }
    }
    checkCallsComplete(room);
  } else {
    advanceTurn(room);
  }
  return true;
}

function collectOffers(room, from, tile) {
  const g = room.game;
  const offers = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    if (i === from) continue;
    const o = {};
    const counts = E.toCounts(g.hands[i]);
    // 론 — 화료형 + 역 있음 + 후리텐 아님
    counts[tile]++;
    if (E.isWinningHand(counts, g.melds[i].length)) {
      counts[tile]--;
      const waits = E.waitingTiles(E.toCounts(g.hands[i]), g.melds[i].length);
      const furiten = waits.some((w) => g.rivers[i].some((r) => r.tile === w));
      if (!furiten) {
        // evalFor는 손에 winTile이 있어야 하므로 임시 추가 후 평가
        g.hands[i].push(tile);
        const r = evalFor(room, i, tile, false, from);
        g.hands[i].pop();
        if (r) o.ron = true;
      }
    } else {
      counts[tile]--;
    }
    // 리치 중엔 론만 가능
    if (!g.riichiDeclared[i]) {
      if (counts[tile] >= 2) o.pon = true;
      // 치 — 왼쪽 옆자리(상가)만
      if ((from + 1) % 4 === i && !E.isHonor(tile)) {
        const chis = [];
        const has = (t) => t >= 0 && t < 27 && E.suitOf(t) === E.suitOf(tile) && counts[t] > 0;
        const n = E.numOf(tile);
        if (n >= 3 && has(tile - 2) && has(tile - 1)) chis.push([tile - 2, tile - 1]);
        if (n >= 2 && n <= 8 && has(tile - 1) && has(tile + 1)) chis.push([tile - 1, tile + 1]);
        if (n <= 7 && has(tile + 1) && has(tile + 2)) chis.push([tile + 1, tile + 2]);
        if (chis.length) o.chi = chis;
      }
    }
    if (Object.keys(o).length) offers[i] = o;
  }
  return offers;
}

function checkCallsComplete(room) {
  const g = room.game;
  if (!g.pending) return;
  const { offers, responses } = g.pending;
  for (let i = 0; i < 4; i++) if (offers[i] && responses[i] == null) return;   // 대기 중
  resolveCalls(room);
}

function resolveCalls(room) {
  const g = room.game;
  const p = g.pending;
  if (!p) return;
  clearTimeout(room.actionTimer);
  g.pending = null;
  g.phase = 'turn';

  // 우선순위: 론(방류자에서 가까운 순) > 펑 > 치
  const order = [1, 2, 3].map((d) => (p.from + d) % 4);
  for (const i of order) {
    const r = p.responses[i];
    if (r && r.a === 'ron' && p.offers[i] && p.offers[i].ron) {
      // 일발/영상 등 상태 확정 후 화료
      g.hands[i].push(p.tile);
      return handWin(room, i, { tsumo: false, loser: p.from, winTile: p.tile });
    }
  }
  for (const i of order) {
    const r = p.responses[i];
    if (!r || !p.offers[i]) continue;
    if (r.a === 'pon' && p.offers[i].pon) return applyCall(room, i, p, 'pon');
    if (r.a === 'chi' && p.offers[i].chi) return applyCall(room, i, p, 'chi', r.tiles);
  }
  advanceTurn(room);
}

function applyCall(room, seat, p, kind, chiTiles) {
  const g = room.game;
  g.ippatsu = [false, false, false, false];   // 콜은 모든 일발을 깬다
  const hand = g.hands[seat];
  if (kind === 'pon') {
    for (let k = 0; k < 2; k++) hand.splice(hand.indexOf(p.tile), 1);
    g.melds[seat].push({ type: 'pon', tile: p.tile, tiles: [p.tile, p.tile, p.tile], from: p.from });
  } else {
    const pair = (chiTiles && chiTiles.length === 2 ? chiTiles : (p.offers[seat].chi[0]));
    for (const t of pair) {
      const ix = hand.indexOf(t);
      if (ix < 0) { advanceTurn(room); return; }
      hand.splice(ix, 1);
    }
    const tiles = [p.tile, ...pair].sort((a, b) => a - b);
    g.melds[seat].push({ type: 'chi', tile: tiles[0], tiles, from: p.from });
  }
  const riverLast = g.rivers[p.from][g.rivers[p.from].length - 1];
  if (riverLast) riverLast.called = true;
  g.turn = seat;
  g.phase = 'turn';
  g.drawnTile = null;   // 콜 후엔 뽑지 않고 버린다
  armTurnTimer(room, seat);
  pushState(room);
  maybeAiTurn(room, seat);
}

function advanceTurn(room) {
  const g = room.game;
  const next = (g.turn + 1) % 4;
  drawTile(room, next, false);
}

function doAnkan(room, seat, tile) {
  const g = room.game;
  if (g.phase !== 'turn' || g.turn !== seat) return false;
  const hand = g.hands[seat];
  if (E.toCounts(hand)[tile] === 4 && !g.riichiDeclared[seat]) chargeTime(room, seat);
  if (E.toCounts(hand)[tile] !== 4) return false;
  if (g.riichiDeclared[seat]) return false;   // 단순화: 리치 후 안깡 금지
  for (let k = 0; k < 4; k++) hand.splice(hand.indexOf(tile), 1);
  g.melds[seat].push({ type: 'ankan', tile, tiles: [tile, tile, tile, tile] });
  g.ippatsu = [false, false, false, false];
  if (g.doraRevealed < 4) g.doraRevealed += 1;   // 신도라 공개
  drawTile(room, seat, true);                    // 영상패 쯔모
  return true;
}

function doTsumo(room, seat) {
  const g = room.game;
  if (g.phase !== 'turn' || g.turn !== seat) return false;
  chargeTime(room, seat);
  const counts = E.toCounts(g.hands[seat]);
  if (!E.isWinningHand(counts, g.melds[seat].length)) return false;
  const r = evalFor(room, seat, g.drawnTile, true, null);
  if (!r) return false;
  handWin(room, seat, { tsumo: true, winTile: g.drawnTile });
  return true;
}

// ── 화료/유국 ─────────────────────────────────────────────────────
function handWin(room, seat, { tsumo, loser, winTile }) {
  const g = room.game;
  clearTimeout(room.actionTimer);
  clearTimeout(room.aiTimer);
  const result = evalFor(room, seat, winTile, tsumo, loser);
  if (!result) { advanceTurn(room); return; }
  const sc = result.score;
  const movements = [0, 0, 0, 0];
  if (tsumo) {
    if (seat === g.dealer) {
      for (let i = 0; i < 4; i++) if (i !== seat) movements[i] -= sc.each + g.honba * 100;
    } else {
      for (let i = 0; i < 4; i++) {
        if (i === seat) continue;
        movements[i] -= (i === g.dealer ? sc.dealerPays : sc.othersPay) + g.honba * 100;
      }
    }
    movements[seat] = -1 * (movements[0] + movements[1] + movements[2] + movements[3] - movements[seat]);
  } else {
    movements[loser] = -(sc.total + g.honba * 300);
    movements[seat] = sc.total + g.honba * 300;
  }
  movements[seat] += g.riichiSticks * 1000;
  for (let i = 0; i < 4; i++) g.scores[i] += movements[i];
  const sticksWon = g.riichiSticks;
  g.riichiSticks = 0;

  const summary = {
    type: tsumo ? 'tsumo' : 'ron',
    winner: seat, loser: loser != null ? loser : null,
    winTile,
    hand: g.hands[seat].slice().sort((a, b) => a - b),
    melds: g.melds[seat],
    yaku: result.yaku, han: result.han, fu: result.fu, yakuman: result.yakuman,
    movements, scores: g.scores.slice(),
    dora: g.doraIndicators.slice(0, g.doraRevealed),
    ura: g.riichiDeclared[seat] ? g.uraIndicators.slice(0, g.doraRevealed) : [],
    sticksWon,
    round: g.round, honba: g.honba,
    names: room.seats.map((s) => s.name),
  };
  emitAll(room, 'mahjong:hand-end', summary);
  afterHand(room, seat === g.dealer, false);
}

function exhaustiveDraw(room) {
  const g = room.game;
  clearTimeout(room.actionTimer);
  clearTimeout(room.aiTimer);
  const tenpai = [0, 1, 2, 3].map((i) => E.shanten(E.toCounts(g.hands[i]), g.melds[i].length) === 0);
  const tCount = tenpai.filter(Boolean).length;
  const movements = [0, 0, 0, 0];
  if (tCount > 0 && tCount < 4) {
    const gain = 3000 / tCount, pay = 3000 / (4 - tCount);
    for (let i = 0; i < 4; i++) movements[i] = tenpai[i] ? gain : -pay;
  }
  for (let i = 0; i < 4; i++) g.scores[i] += movements[i];
  emitAll(room, 'mahjong:hand-end', {
    type: 'draw', tenpai, movements, scores: g.scores.slice(),
    hands: g.hands.map((h, i) => tenpai[i] ? h.slice().sort((a, b) => a - b) : null),
    round: g.round, honba: g.honba,
    names: room.seats.map((s) => s.name),
  });
  afterHand(room, tenpai[g.dealer], true);
}

function afterHand(room, dealerKeeps, wasDraw) {
  const g = room.game;
  // 파산 즉시 종료
  if (g.scores.some((s) => s < 0)) return setTimeout(() => endMatch(room), CFG.handGapMs);
  if (dealerKeeps) {
    g.honba += 1;
  } else {
    g.honba = wasDraw ? g.honba + 1 : 0;
    g.dealer = (g.dealer + 1) % 4;
    g.round += 1;
    if (g.round > 4) return setTimeout(() => endMatch(room), CFG.handGapMs);   // 동풍전 종료
  }
  setTimeout(() => { if (rooms.has(room.code) && room.status === 'active') startHand(room); }, CFG.handGapMs);
}

function endMatch(room) {
  if (room.status !== 'active') return;
  room.status = 'finished';
  const g = room.game;
  g.scores = g.scores.map((s, i) => s + (i === g.dealer ? g.riichiSticks * 1000 : 0));   // 남은 공탁은 편의상 친에게
  g.riichiSticks = 0;   // 지급 완료 — 이중 계상 방지
  const ranking = [0, 1, 2, 3]
    .map((i) => ({ seat: i, name: room.seats[i].name, score: g.scores[i], ai: room.seats[i].type === 'ai' }))
    .sort((a, b) => b.score - a.score);
  emitAll(room, 'mahjong:over', { ranking, scores: g.scores });
  scheduleCleanup(room, 10 * 60 * 1000);
  log(`[마작] 대국 종료 — ${room.code} 1위 ${ranking[0].name}(${ranking[0].score})`);
}

// ── AI ────────────────────────────────────────────────────────────
function maybeAiTurn(room, seat) {
  const g = room.game;
  if (room.seats[seat].type !== 'ai') return;
  clearTimeout(room.aiTimer);
  room.aiTimer = setTimeout(() => {
    if (!rooms.has(room.code) || room.status !== 'active') return;
    if (g.phase !== 'turn' || g.turn !== seat) return;
    aiPlayTurn(room, seat);
  }, CFG.aiDelay());
}

function aiPlayTurn(room, seat) {
  const g = room.game;
  const acts = turnActions(room, seat);
  if (acts.tsumo) { doTsumo(room, seat); return; }
  if (acts.ankan && acts.ankan.length) {
    // 텐파이를 깨지 않을 때만
    const hand = g.hands[seat];
    const t = acts.ankan[0];
    const rest = hand.filter((x) => x !== t);
    const before = E.shanten(E.toCounts(hand.slice(0, -1)), g.melds[seat].length);
    const after = E.shanten(E.toCounts(rest), g.melds[seat].length + 1);
    if (after <= before) { doAnkan(room, seat, t); return; }
  }
  if (g.riichiDeclared[seat]) { doDiscard(room, seat, g.drawnTile, false); return; }
  const discard = aiChooseDiscard(g.hands[seat], g.melds[seat].length);
  const declRiichi = !!(acts.riichi && acts.riichi.includes(discard) && liveWall(g) >= 6);
  doDiscard(room, seat, discard, declRiichi);
}

// 샹텐 최소화 + 우케이레(수용 매수) 타이브레이크
function aiChooseDiscard(hand, meldCount) {
  let best = hand[hand.length - 1], bestSh = 99, bestUke = -1;
  const tried = new Set();
  for (let i = 0; i < hand.length; i++) {
    const t = hand[i];
    if (tried.has(t)) continue;
    tried.add(t);
    const rest = hand.slice(); rest.splice(i, 1);
    const counts = E.toCounts(rest);
    const sh = E.shanten(counts, meldCount);
    if (sh > bestSh) continue;
    // 우케이레: 샹텐을 낮추는 패 종류×남은 장수
    let uke = 0;
    for (let k = 0; k < E.KIND_COUNT; k++) {
      if (counts[k] >= 4) continue;
      counts[k]++;
      if (E.shanten(counts, meldCount) < sh) uke += 4 - (counts[k] - 1);
      counts[k]--;
    }
    if (sh < bestSh || uke > bestUke) { bestSh = sh; bestUke = uke; best = t; }
  }
  return best;
}

function aiRespondCall(room, seat, offer) {
  const g = room.game;
  if (offer.ron) return { a: 'ron' };
  if (offer.pon) {
    const t = g.pending.tile;
    const seatWind = E.EAST + ((seat - g.dealer + 4) % 4);
    if (t >= E.HAKU || t === seatWind || t === E.EAST) return { a: 'pon' };   // 역패만 펑
  }
  return { a: 'pass' };
}

// ── 소켓 등록 ─────────────────────────────────────────────────────
function register(io, socket) {
  socket.on('mahjong:create', ({ nickname } = {}) => {
    if (!rateCheck(socket.id, 'mj-create', 5, 60 * 1000)) return;
    const room = createRoom(nickname);
    const seat = room.seats[0];
    seat.socketId = socket.id;
    seat.connected = true;
    socket.join('mj:' + room.code);
    socket.emit('mahjong:created', { code: room.code, token: seat.token, seat: 0 });
    socket.emit('mahjong:room', lobbyState(room));
    log(`[마작] 방 생성 — ${room.code}`);
  });

  socket.on('mahjong:join', ({ code, nickname } = {}) => {
    if (!rateCheck(socket.id, 'mj-join', 10, 60 * 1000)) return;
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return socket.emit('mahjong:error', { message: '방을 찾을 수 없습니다' });
    if (room.status !== 'waiting') return socket.emit('mahjong:error', { message: '이미 시작된 방입니다' });
    const seatIdx = room.seats.findIndex((s) => s === null);
    if (seatIdx < 0) return socket.emit('mahjong:error', { message: '자리가 없습니다' });
    const seat = seatHuman(room, seatIdx, nickname);
    seat.socketId = socket.id;
    seat.connected = true;
    socket.join('mj:' + room.code);
    socket.emit('mahjong:joined', { code: room.code, token: seat.token, seat: seatIdx });
    emitAll(room, 'mahjong:room', lobbyState(room));
    log(`[마작] 참가 — ${room.code} 좌석${seatIdx}`);
  });

  socket.on('mahjong:start', () => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { room, seat } = found;
    if (room.status !== 'waiting' || seat !== room.hostSeat) return;
    startMatch(room);
  });

  socket.on('mahjong:reconnect', ({ token } = {}) => {
    if (!rateCheck(socket.id, 'mj-rec', 8, 60 * 1000)) return;
    const ref = tokenMap.get(token);
    if (!ref) return socket.emit('mahjong:error', { message: '만료된 세션입니다', fatal: true });
    const room = rooms.get(ref.code);
    if (!room) return socket.emit('mahjong:error', { message: '방이 사라졌습니다', fatal: true });
    const s = room.seats[ref.seat];
    s.socketId = socket.id;
    s.connected = true;
    socket.join('mj:' + room.code);
    socket.emit('mahjong:reconnected', { code: room.code, seat: ref.seat, status: room.status });
    socket.emit('mahjong:room', lobbyState(room));
    if (room.status === 'active') emitSeat(room, ref.seat, 'mahjong:state', gameStateFor(room, ref.seat));
  });

  socket.on('mahjong:action', (data = {}) => {
    if (!rateCheck(socket.id, 'mj-act', 40, 10 * 1000)) return;
    const found = findBySocket(socket.id);
    if (!found || found.room.status !== 'active') return;
    const { room, seat } = found;
    const g = room.game;
    const a = data.a;
    if (g.phase === 'turn' && g.turn === seat) {
      if (a === 'discard') doDiscard(room, seat, data.t | 0, false);
      else if (a === 'riichi') doDiscard(room, seat, data.t | 0, true);
      else if (a === 'tsumo') doTsumo(room, seat);
      else if (a === 'ankan') doAnkan(room, seat, data.t | 0);
    } else if (g.phase === 'calls' && g.pending && g.pending.offers[seat] && g.pending.responses[seat] == null) {
      const o = g.pending.offers[seat];
      if (a === 'ron' && o.ron) g.pending.responses[seat] = { a: 'ron' };
      else if (a === 'pon' && o.pon) g.pending.responses[seat] = { a: 'pon' };
      else if (a === 'chi' && o.chi) {
        const want = Array.isArray(data.tiles) ? data.tiles.map((x) => x | 0) : null;
        const match = want && o.chi.find((c) => c[0] === want[0] && c[1] === want[1]);
        g.pending.responses[seat] = { a: 'chi', tiles: match || o.chi[0] };
      } else g.pending.responses[seat] = { a: 'pass' };
      checkCallsComplete(room);
    }
  });

  socket.on('disconnect', () => {
    const found = findBySocket(socket.id);
    if (!found) return;
    const { room, seat } = found;
    const s = room.seats[seat];
    s.connected = false;
    s.socketId = null;
    if (room.status === 'waiting') {
      // 대기 방: 호스트가 나가면 방 해체, 게스트는 좌석 비움
      if (seat === room.hostSeat) {
        emitAll(room, 'mahjong:error', { message: '방장이 나갔습니다', fatal: true });
        destroyRoom(room);
      } else {
        tokenMap.delete(s.token);
        room.seats[seat] = null;
        emitAll(room, 'mahjong:room', lobbyState(room));
      }
      return;
    }
    if (room.status === 'active') {
      emitAll(room, 'mahjong:room', lobbyState(room));
      // 진행 중: 그 좌석 턴이면 빠른 자동 진행 예약
      const g = room.game;
      if (g && g.phase === 'turn' && g.turn === seat) armTurnTimer(room, seat);
      // 모든 인간이 떠나면 방 정리
      if (!room.seats.some((x) => x && x.type === 'human' && x.connected)) scheduleCleanup(room, 2 * 60 * 1000);
    }
  });
}

function findBySocket(socketId) {
  for (const room of rooms.values()) {
    for (let i = 0; i < 4; i++) {
      const s = room.seats[i];
      if (s && s.type === 'human' && s.socketId === socketId) return { room, seat: i };
    }
  }
  return null;
}

module.exports = { register, rooms, startMatch, createRoom, seatHuman, CFG, _internal: {
  startHand, doDiscard, doTsumo, doAnkan, resolveCalls, collectOffers, aiChooseDiscard,
  gameStateFor, exhaustiveDraw, liveWall, turnActions, armTurnTimer, chargeTime, drawTile,
} };
