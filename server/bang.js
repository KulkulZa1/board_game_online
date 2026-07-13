// BANG! — 자립형 멀티플레이 모듈 (전용 페이지 /bang.html, 이벤트 bang:*)
// 마작 모듈과 동일한 설계: 방 코드 초대(4~7인), 빈 자리 AI 충원, 좌석별 개인 상태 emit,
// 체스식 시간 은행(턴), 고정 시간 리액션 창.
//   구현 범위: 기본판 80장 전체, 역할 4종, 자동/패시브 캐릭터 10인,
//   리액션(BANG!/개틀링/인디언/결투/치명상 맥주/잡화점 픽/핸드 정리),
//   Draw!(술통·감옥·다이너마이트), 거리/사거리, 처치 보상·페널티.
//   단순화(v1): 패닉!·캣 발루는 무작위 카드 대상(손패 우선), 장착 카드 중복 불가.
'use strict';

const { v4: uuidv4 } = require('uuid');
const state = require('./state');
const { log, rateCheck, sanitizeNickname } = require('./utils');
const E = require('./handlers/bang-engine');

const rooms = new Map();
const tokenMap = new Map();

const CFG = {
  graceMs: 5000,       // 턴당 무료 고민 시간
  bankMs: 60000,       // 시간 은행 (대국 전체)
  reactMs: 10000,      // 리액션 창 (고정)
  discAutoMs: 4000,    // 접속 끊긴 좌석 자동 진행
  disconnectCleanupMs: 2 * 60 * 1000,
  aiDelay: () => 500 + Math.random() * 600,
  aiReactDelay: () => 350 + Math.random() * 400,
};

const AI_NAMES = ['AI 장고', 'AI 클레멘타인', 'AI 콜트', 'AI 로데오', 'AI 새디', 'AI 웨스'];
const now = () => Date.now();
const code6 = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
};

// ── 방 수명 ───────────────────────────────────────────────────────
function createRoom(nickname, size) {
  let code = code6();
  while (rooms.has(code)) code = code6();
  const n = Math.max(4, Math.min(7, size | 0 || 5));
  const room = {
    code, size: n,
    status: 'waiting',
    seats: new Array(n).fill(null),
    hostSeat: 0,
    game: null,
    actionTimer: null, aiTimer: null, cleanupTimer: null,
  };
  rooms.set(code, room);
  seatHuman(room, 0, nickname);
  scheduleCleanup(room, 30 * 60 * 1000);
  return room;
}
function seatHuman(room, seat, nickname) {
  const token = uuidv4();
  room.seats[seat] = { type: 'human', name: sanitizeNickname(nickname), socketId: null, token, connected: false };
  tokenMap.set(token, { code: room.code, seat });
  return room.seats[seat];
}
function cancelCleanup(room) {
  clearTimeout(room.cleanupTimer);
  room.cleanupTimer = null;
}
function scheduleCleanup(room, ms) {
  cancelCleanup(room);
  room.cleanupTimer = setTimeout(() => destroyRoom(room), ms);
}
function destroyRoom(room) {
  cancelCleanup(room); clearTimeout(room.actionTimer); clearTimeout(room.aiTimer);
  for (const s of room.seats) if (s && s.token) tokenMap.delete(s.token);
  rooms.delete(room.code);
  log(`[뱅] 방 정리 — ${room.code}`);
}

// ── emit 헬퍼 ─────────────────────────────────────────────────────
function emitSeat(room, seat, event, payload) {
  const s = room.seats[seat];
  if (s && s.type === 'human' && s.socketId && s.connected) state.io.to(s.socketId).emit(event, payload);
}
function emitAll(room, event, payloadFor) {
  for (let i = 0; i < room.seats.length; i++) {
    emitSeat(room, i, event, typeof payloadFor === 'function' ? payloadFor(i) : payloadFor);
  }
}
function lobbyState(room) {
  return {
    code: room.code, status: room.status, hostSeat: room.hostSeat, size: room.size,
    seats: room.seats.map((s) => s ? { type: s.type, name: s.name, connected: s.type === 'ai' ? true : s.connected } : null),
  };
}

function addLog(room, text) {
  const g = room.game;
  g.log.push(text);
  if (g.log.length > 60) g.log.shift();
}

// ── 개인화 상태 ───────────────────────────────────────────────────
function gameStateFor(room, seat) {
  const g = room.game;
  if (!g) return null;
  const me = g.players[seat];
  const pend = g.queue[0] || null;
  const iAmActor = pend && pend.actor === seat;
  return {
    seat,
    players: g.players.map((p, i) => ({
      name: p.name, ai: room.seats[i] && room.seats[i].type === 'ai',
      hp: p.hp, maxHp: p.maxHp, alive: p.hp > 0,
      character: p.character, characterName: p.characterName, characterDesc: p.characterDesc,
      handCount: p.hand.length,
      equip: p.equip, jail: p.jail, dynamite: p.dynamite,
      // 역할: 본인 / 사망자 / 보안관만 공개
      role: (i === seat || p.hp <= 0 || p.role === 'sheriff') ? p.role : null,
      dist: p.hp > 0 && me.hp > 0 && i !== seat ? E.distance(g.players, seat, i) : null,
      connected: room.seats[i] ? (room.seats[i].type === 'ai' ? true : room.seats[i].connected) : false,
    })),
    myHand: me.hand,
    myRange: E.weaponRange(me),
    turn: g.turn, phase: g.phase,
    deckCount: g.deck.length, discardTop: g.discard[g.discard.length - 1] || null,
    bangsPlayed: g.bangsPlayed,
    pending: iAmActor ? publicPending(g) : (pend ? { type: pend.type, actor: pend.actor, waiting: true } : null),
    log: g.log.slice(-10),
    timeBanks: g.timeBank, graceMs: CFG.graceMs, turnStartedAt: g.turnStartedAt, serverNow: now(),
    winners: g.winners,
  };
}
function publicPending(g) {
  const p = g.queue[0];
  const o = { type: p.type, actor: p.actor, from: p.from };
  if (p.type === 'bang' || p.type === 'gatling') o.needMissed = p.needMissed;
  if (p.type === 'store') o.cards = p.cards;
  if (p.type === 'lethal') o.beersNeeded = 1 - g.players[p.actor].hp;
  if (p.type === 'discard') o.mustDiscard = g.players[p.actor].hand.length - Math.max(0, g.players[p.actor].hp);
  return o;
}
function pushState(room) {
  emitAll(room, 'bang:state', (i) => gameStateFor(room, i));
}

// ── 대국 시작 ─────────────────────────────────────────────────────
function startMatch(room) {
  let ai = 0;
  for (let i = 0; i < room.seats.length; i++) {
    if (!room.seats[i]) room.seats[i] = { type: 'ai', name: AI_NAMES[ai++] || 'AI', socketId: null, token: null, connected: true };
  }
  room.status = 'active';
  cancelCleanup(room);
  const n = room.seats.length;
  const rng = Math.random;
  const roles = E.shuffled(E.rolesFor(n), rng);
  const chars = E.shuffled(E.CHARACTERS, rng).slice(0, n);
  const g = {
    rng,
    deck: E.shuffled(E.buildDeckExact(), rng),
    discard: [],
    players: room.seats.map((s, i) => {
      const c = chars[i];
      const hp = c.hp + (roles[i] === 'sheriff' ? 1 : 0);
      return {
        seat: i, name: s.name, role: roles[i],
        character: c.id, characterName: c.name, characterDesc: c.desc,
        hp, maxHp: hp, hand: [], equip: [], jail: null, dynamite: null,
      };
    }),
    turn: roles.indexOf('sheriff'),
    phase: 'turn',
    bangsPlayed: 0,
    queue: [],           // 리액션 큐 [{type, actor, ...}]
    log: [],
    timeBank: new Array(n).fill(CFG.bankMs),
    turnStartedAt: null,
    winners: null,
    aggroVsSheriff: new Array(n).fill(0),
    pendingTurnResume: null,
  };
  room.game = g;
  // 배패: 체력만큼
  for (const p of g.players) for (let k = 0; k < p.hp; k++) p.hand.push(draw(g));
  addLog(room, `🤠 대결 시작! 보안관은 ${g.players[g.turn].name}`);
  emitAll(room, 'bang:begin', lobbyState(room));
  beginTurn(room, g.turn);
  log(`[뱅] 대국 시작 — ${room.code} (${n}인)`);
}

function draw(g) {
  if (!g.deck.length) E.reshuffle(g);
  return g.deck.shift();
}
function discardCard(g, card) { if (card) g.discard.push(card); }
function alivePlayers(g) { return g.players.filter((p) => p.hp > 0); }
function nextAlive(g, from) {
  const n = g.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (g.players[i].hp > 0) return i;
  }
  return from;
}

// ── 턴 흐름 ───────────────────────────────────────────────────────
function beginTurn(room, seat) {
  const g = room.game;
  if (g.winners) return;
  const p = g.players[seat];
  if (p.hp <= 0) { beginTurn(room, nextAlive(g, seat)); return; }
  g.turn = seat;
  g.phase = 'turn';
  g.bangsPlayed = 0;

  // 1) 다이너마이트 판정
  if (p.dynamite) {
    const r = E.drawCheck(g, seat, (c) => !(c.suit === 's' && c.v >= 2 && c.v <= 9));
    if (!r.ok) {
      addLog(room, `🧨 ${p.name} 앞에서 다이너마이트 폭발! (피해 3)`);
      discardCard(g, p.dynamite); p.dynamite = null;
      applyDamage(room, seat, 3, null);
      if (g.winners) return;
      if (p.hp <= 0) {
        const lethal = g.queue[0];
        if (lethal && lethal.type === 'lethal' && lethal.actor === seat) {
          g.pendingTurnResume = seat;
          processQueue(room);
        } else {
          beginTurn(room, nextAlive(g, seat));
        }
        return;
      }
    } else {
      addLog(room, `🧨 다이너마이트가 ${p.name}을(를) 지나쳐 왼쪽으로`);
      const nx = nextAlive(g, seat);
      g.players[nx].dynamite = p.dynamite;
      p.dynamite = null;
    }
  }
  // 2) 감옥 판정
  if (p.jail) {
    const r = E.drawCheck(g, seat, (c) => c.suit === 'h');
    discardCard(g, p.jail); p.jail = null;
    if (!r.ok) {
      addLog(room, `⛓️ ${p.name} 감옥 탈출 실패 — 턴을 건너뛴다`);
      pushState(room);
      setTimeout(() => { if (rooms.has(room.code) && room.status === 'active') beginTurn(room, nextAlive(g, seat)); }, 900);
      return;
    }
    addLog(room, `⛓️ ${p.name} 감옥 탈출!`);
  }
  // 3) 드로우 2장 (블랙 잭: 2번째 공개, 빨강이면 +1)
  const c1 = draw(g), c2 = draw(g);
  p.hand.push(c1, c2);
  if (p.character === 'blackjack') {
    if (c2.suit === 'h' || c2.suit === 'd') {
      p.hand.push(draw(g));
      addLog(room, `🃏 블랙 잭 — 빨간 카드 공개, 1장 추가 드로우`);
    }
  }
  armTurnTimer(room, seat);
  pushState(room);
  maybeAiTurn(room, seat);
}

function endTurnCore(room) {
  const g = room.game;
  const p = g.players[g.turn];
  // 핸드 정리 필요?
  if (p.hp > 0 && p.hand.length > p.hp) {
    enqueue(room, { type: 'discard', actor: g.turn });
    return;
  }
  finishTurn(room);
}
function finishTurn(room) {
  const g = room.game;
  clearTimeout(room.actionTimer);
  if (g.winners) return;
  beginTurn(room, nextAlive(g, g.turn));
}

// ── 타이머 ────────────────────────────────────────────────────────
function armTurnTimer(room, seat) {
  clearTimeout(room.actionTimer);
  const s = room.seats[seat];
  const g = room.game;
  g.turnStartedAt = now();
  if (s.type === 'ai') return;
  const auto = () => {
    if (!rooms.has(room.code) || !room.game || room.game.winners) return;
    if (g.phase !== 'turn' || g.turn !== seat || g.queue.length) return;
    if (g.timeBank) g.timeBank[seat] = 0;
    endTurnCore(room);   // 시간 만료 → 자동 턴 종료(필요 시 자동 버리기 큐)
  };
  if (!s.connected) { room.actionTimer = setTimeout(auto, CFG.discAutoMs); return; }
  room.actionTimer = setTimeout(auto, CFG.graceMs + (g.timeBank ? g.timeBank[seat] : 0));
}
function chargeTime(room, seat) {
  const g = room.game;
  const s = room.seats[seat];
  if (!g || !g.timeBank || !s || s.type !== 'human' || !g.turnStartedAt) return;
  const over = Math.max(0, (now() - g.turnStartedAt) - CFG.graceMs);
  g.timeBank[seat] = Math.max(0, g.timeBank[seat] - over);
  g.turnStartedAt = now();   // 턴 내 다중 행동 — 기준점 갱신
}

// ── 리액션 큐 ─────────────────────────────────────────────────────
function enqueue(room, item) {
  room.game.queue.push(item);
  if (room.game.queue.length === 1) processQueue(room);
}
function processQueue(room) {
  const g = room.game;
  if (g.winners) { g.queue = []; return; }
  const item = g.queue[0];
  if (!item) { // 큐 소진 — 턴 주인에게 제어 반환
    g.phase = 'turn';
    if (g.pendingTurnResume !== null) {
      const resumeSeat = g.pendingTurnResume;
      g.pendingTurnResume = null;
      const nextSeat = g.players[resumeSeat].hp > 0 ? resumeSeat : nextAlive(g, resumeSeat);
      beginTurn(room, nextSeat);
      return;
    }
    if (g.pendingEndTurn) { g.pendingEndTurn = false; endTurnCore(room); return; }
    armTurnTimer(room, g.turn);
    pushState(room);
    maybeAiTurn(room, g.turn);
    return;
  }
  const p = g.players[item.actor];
  // 죽었거나 무의미해진 항목은 건너뛴다
  if (p.hp <= 0 && item.type !== 'lethal') { g.queue.shift(); processQueue(room); return; }

  // BANG!류: 술통 자동 판정 먼저
  if ((item.type === 'bang' || item.type === 'gatling') && !item.barrelChecked) {
    item.barrelChecked = true;
    if (p.equip.some((c) => c.id === 'barrel')) {
      const r = E.drawCheck(g, item.actor, (c) => c.suit === 'h');
      if (r.ok) {
        item.needMissed -= 1;
        addLog(room, `🛢️ ${p.name} 술통 판정 성공 — 자동 회피!`);
        if (item.needMissed <= 0) { g.queue.shift(); processQueue(room); return; }
      } else {
        addLog(room, `🛢️ ${p.name} 술통 판정 실패`);
      }
    }
  }

  g.phase = 'react';
  pushState(room);
  armReactTimer(room, item);
  maybeAiReact(room, item);
}
function armReactTimer(room, item) {
  clearTimeout(room.actionTimer);
  const s = room.seats[item.actor];
  if (s.type === 'ai') return;
  const ms = s.connected ? CFG.reactMs : CFG.discAutoMs;
  room.actionTimer = setTimeout(() => resolveReact(room, item.actor, { pass: true }), ms);
}

// 리액션 해소 — use: {cards:[handIdx...]} 또는 {pass:true} 또는 {pick:idx}
function resolveReact(room, seat, use) {
  const g = room.game;
  const item = g.queue[0];
  if (!item || item.actor !== seat || g.winners) return;
  const p = g.players[seat];
  clearTimeout(room.actionTimer);

  if (item.type === 'bang' || item.type === 'gatling') {
    const played = playReactionCards(g, p, use, 'missed');
    if (played >= item.needMissed) {
      addLog(room, `💨 ${p.name} 회피!`);
    } else {
      // 부족분 반환 후 피해
      addLog(room, `💥 ${p.name} 명중 (피해 1)`);
      g.queue.shift();
      applyDamage(room, seat, 1, item.from);
      processQueue(room);
      return;
    }
  } else if (item.type === 'indians') {
    const played = playReactionCards(g, p, use, 'bang');
    if (played >= 1) addLog(room, `🏹 ${p.name} BANG!을 버려 인디언을 물리침`);
    else {
      addLog(room, `🏹 ${p.name} 인디언에게 피해 1`);
      g.queue.shift();
      applyDamage(room, seat, 1, item.from);
      processQueue(room);
      return;
    }
  } else if (item.type === 'duel') {
    const played = playReactionCards(g, p, use, 'bang');
    if (played >= 1) {
      addLog(room, `⚔️ ${p.name} 응사! 결투 계속`);
      g.queue.shift();
      enqueue(room, { type: 'duel', actor: item.other, other: seat, from: item.from });
      return;
    }
    addLog(room, `⚔️ ${p.name} 결투 패배 (피해 1)`);
    g.queue.shift();
    applyDamage(room, seat, 1, item.other);
    processQueue(room);
    return;
  } else if (item.type === 'lethal') {
    const beers = playReactionCards(g, p, use, 'beer');
    if (beers > 0 && alivePlayers(g).length > 2) {
      p.hp = Math.min(p.maxHp, p.hp + beers);
      addLog(room, `🍺 ${p.name} 맥주로 기사회생! (HP ${p.hp})`);
    }
    if (p.hp <= 0) {
      g.queue.shift();
      handleDeath(room, seat, item.killer);
      processQueue(room);
      return;
    }
  } else if (item.type === 'store') {
    let pick = typeof use.pick === 'number' ? use.pick : 0;
    if (pick < 0 || pick >= item.cards.length) pick = 0;
    const card = item.cards.splice(pick, 1)[0];
    p.hand.push(card);
    addLog(room, `🏪 ${p.name} → ${E.CARD_DEFS[card.id].name}`);
    g.queue.shift();
    if (item.cards.length && item.order.length) {
      enqueue(room, { type: 'store', actor: item.order[0], cards: item.cards, order: item.order.slice(1) });
    } else {
      for (const c of item.cards) discardCard(g, c);
      processQueue(room);
    }
    return;
  } else if (item.type === 'discard') {
    // 핸드 정리 — use.cards 인덱스 버리기 (부족하면 자동으로 앞에서)
    const need = p.hand.length - Math.max(0, p.hp);
    const idxs = (use.cards || []).slice(0, need).sort((a, b) => b - a);
    for (const ix of idxs) if (p.hand[ix]) discardCard(g, p.hand.splice(ix, 1)[0]);
    while (p.hand.length > Math.max(0, p.hp)) discardCard(g, p.hand.splice(0, 1)[0]);
    g.queue.shift();
    finishTurn(room);
    return;
  }

  g.queue.shift();
  processQueue(room);
}

// 응답 카드 지출 — kind: 'missed'|'bang'|'beer'. 캘러미티는 bang↔missed 호환.
function playReactionCards(g, p, use, kind) {
  if (!use || use.pass) return 0;
  const idxs = (use.cards || []).slice().sort((a, b) => b - a);
  let n = 0;
  for (const ix of idxs) {
    const c = p.hand[ix];
    if (!c) continue;
    const ok = c.id === kind ||
      (p.character === 'calamity' && ((kind === 'missed' && c.id === 'bang') || (kind === 'bang' && c.id === 'missed')));
    if (!ok) continue;
    discardCard(g, p.hand.splice(ix, 1)[0]);
    n++;
    checkSuzy(g, p);
  }
  return n;
}
function checkSuzy(g, p) {
  if (p.character === 'suzy' && p.hp > 0 && p.hand.length === 0) p.hand.push(draw(g));
}

// ── 피해/사망 ─────────────────────────────────────────────────────
function applyDamage(room, seat, amount, srcSeat) {
  const g = room.game;
  const p = g.players[seat];
  p.hp -= amount;
  // 캐릭터 트리거
  if (p.character === 'bart' && p.hp > 0) for (let k = 0; k < amount; k++) p.hand.push(draw(g));
  if (p.character === 'gringo' && srcSeat != null && p.hp > 0) {
    const src = g.players[srcSeat];
    for (let k = 0; k < amount && src.hand.length; k++) {
      const ix = Math.floor(g.rng() * src.hand.length);
      p.hand.push(src.hand.splice(ix, 1)[0]);
      checkSuzy(g, src);
    }
  }
  if (p.hp <= 0) {
    // 치명상 — 맥주로 회생 기회 (생존 2인 초과 + 맥주 보유)
    const hasBeer = p.hand.some((c) => c.id === 'beer');
    if (hasBeer && alivePlayers(g).length > 2) {
      g.queue.unshift({ type: 'lethal', actor: seat, killer: srcSeat });
      return;
    }
    handleDeath(room, seat, srcSeat);
  }
}

function handleDeath(room, seat, killerSeat) {
  const g = room.game;
  const p = g.players[seat];
  p.hp = 0;
  addLog(room, `☠️ ${p.name} 사망 — 정체는 ${E.ROLE_KO[p.role]}!`);
  // 카드 전부 버림
  for (const c of p.hand) discardCard(g, c);
  for (const c of p.equip) discardCard(g, c);
  discardCard(g, p.jail); discardCard(g, p.dynamite);
  p.hand = []; p.equip = []; p.jail = null; p.dynamite = null;
  // 남은 리액션 중 이 좌석 것 제거
  g.queue = g.queue.filter((q) => q.actor !== seat || q.type === 'lethal');

  const killer = killerSeat != null ? g.players[killerSeat] : null;
  if (killer && killer.hp > 0) {
    if (p.role === 'outlaw') {
      for (let k = 0; k < 3; k++) killer.hand.push(draw(g));
      addLog(room, `💰 ${killer.name}, 무법자 처치 보상으로 3장 드로우`);
    }
    if (p.role === 'deputy' && killer.role === 'sheriff') {
      for (const c of killer.hand) discardCard(g, c);
      for (const c of killer.equip) discardCard(g, c);
      killer.hand = []; killer.equip = [];
      addLog(room, `⚖️ 보안관이 부관을 죽였다! 모든 카드를 버린다`);
      checkSuzy(g, killer);
    }
  }
  checkWin(room);
}

function checkWin(room) {
  const g = room.game;
  const alive = alivePlayers(g);
  const sheriffAlive = g.players.some((p) => p.role === 'sheriff' && p.hp > 0);
  const outlawsAlive = g.players.some((p) => p.role === 'outlaw' && p.hp > 0);
  const renegadeAlive = g.players.some((p) => p.role === 'renegade' && p.hp > 0);
  let winners = null;
  if (!sheriffAlive) {
    winners = (alive.length === 1 && alive[0].role === 'renegade') ? 'renegade' : 'outlaw';
  } else if (!outlawsAlive && !renegadeAlive) {
    winners = 'sheriff';
  }
  if (winners) {
    g.winners = winners;
    endMatch(room, winners);
  }
}

function endMatch(room, winners) {
  if (room.status !== 'active') return;
  room.status = 'finished';
  clearTimeout(room.actionTimer); clearTimeout(room.aiTimer);
  const g = room.game;
  const label = { sheriff: '보안관 진영 (보안관·부관)', outlaw: '무법자', renegade: '배신자' }[winners];
  addLog(room, `🏆 ${label} 승리!`);
  emitAll(room, 'bang:over', {
    winners,
    label,
    players: g.players.map((p, i) => ({
      name: p.name, role: p.role, roleKo: E.ROLE_KO[p.role],
      alive: p.hp > 0, ai: room.seats[i].type === 'ai',
      won: (winners === 'sheriff' && (p.role === 'sheriff' || p.role === 'deputy')) ||
           (winners === 'outlaw' && p.role === 'outlaw') ||
           (winners === 'renegade' && p.role === 'renegade'),
    })),
  });
  scheduleCleanup(room, 10 * 60 * 1000);
  log(`[뱅] 대국 종료 — ${room.code} 승자 ${winners}`);
}

// ── 카드 사용 ─────────────────────────────────────────────────────
function playCard(room, seat, handIdx, targetSeat) {
  const g = room.game;
  if (g.winners || g.phase !== 'turn' || g.turn !== seat || g.queue.length) return false;
  const p = g.players[seat];
  const card = p.hand[handIdx];
  if (!card) return false;
  const def = E.CARD_DEFS[card.id];
  const target = targetSeat != null ? g.players[targetSeat] : null;
  const aliveN = alivePlayers(g).length;
  const isBangCard = card.id === 'bang' || (card.id === 'missed' && p.character === 'calamity');

  // 발포 계열 (BANG! / 캘러미티의 빗나감!)
  if (isBangCard) {
    if (!target || target.hp <= 0 || targetSeat === seat) return false;
    const unlimited = p.character === 'willy' || p.equip.some((c) => c.id === 'volcanic');
    if (g.bangsPlayed >= 1 && !unlimited) return fail(room, seat, 'BANG!은 턴당 1장입니다');
    if (E.distance(g.players, seat, targetSeat) > E.weaponRange(p)) return fail(room, seat, '사거리가 닿지 않습니다');
    chargeTime(room, seat);
    spend(g, p, handIdx);
    g.bangsPlayed++;
    if (p.role !== 'sheriff' && target.role === 'sheriff') g.aggroVsSheriff[seat]++;
    addLog(room, `💥 ${p.name} → ${target.name} BANG!`);
    enqueue(room, { type: 'bang', actor: targetSeat, from: seat, needMissed: p.character === 'slab' ? 2 : 1 });
    return true;
  }

  switch (card.id) {
    case 'missed': return fail(room, seat, '빗나감!은 응답 전용입니다');
    case 'beer': {
      if (aliveN <= 2) return fail(room, seat, '생존자 2인 — 맥주 효과 없음');
      if (p.hp >= p.maxHp) return fail(room, seat, '이미 최대 체력입니다');
      chargeTime(room, seat);
      spend(g, p, handIdx);
      p.hp++;
      addLog(room, `🍺 ${p.name} 맥주 (HP ${p.hp})`);
      break;
    }
    case 'saloon': {
      chargeTime(room, seat);
      spend(g, p, handIdx);
      for (const q of alivePlayers(g)) q.hp = Math.min(q.maxHp, q.hp + 1);
      addLog(room, `🥃 살룬! 전원 회복`);
      break;
    }
    case 'stagecoach': {
      chargeTime(room, seat);
      spend(g, p, handIdx);
      p.hand.push(draw(g), draw(g));
      addLog(room, `🚃 ${p.name} 역마차 (+2)`);
      break;
    }
    case 'wellsfargo': {
      chargeTime(room, seat);
      spend(g, p, handIdx);
      p.hand.push(draw(g), draw(g), draw(g));
      addLog(room, `💰 ${p.name} 웰스파고 (+3)`);
      break;
    }
    case 'panic': {
      if (!target || target.hp <= 0 || targetSeat === seat) return false;
      if (E.distance(g.players, seat, targetSeat) > 1) return fail(room, seat, '패닉!은 거리 1만 가능합니다');
      if (!target.hand.length && !target.equip.length) return fail(room, seat, '가져올 카드가 없습니다');
      chargeTime(room, seat);
      spend(g, p, handIdx);
      stealCard(g, p, target, false);
      addLog(room, `😱 ${p.name} → ${target.name} 패닉!`);
      break;
    }
    case 'catbalou': {
      if (!target || target.hp <= 0 || targetSeat === seat) return false;
      if (!target.hand.length && !target.equip.length) return fail(room, seat, '버릴 카드가 없습니다');
      chargeTime(room, seat);
      spend(g, p, handIdx);
      stealCard(g, p, target, true);
      addLog(room, `🐈 ${p.name} → ${target.name} 캣 발루`);
      break;
    }
    case 'duel': {
      if (!target || target.hp <= 0 || targetSeat === seat) return false;
      chargeTime(room, seat);
      spend(g, p, handIdx);
      if (p.role !== 'sheriff' && target.role === 'sheriff') g.aggroVsSheriff[seat]++;
      addLog(room, `⚔️ ${p.name} → ${target.name} 결투!`);
      enqueue(room, { type: 'duel', actor: targetSeat, other: seat, from: seat });
      return true;
    }
    case 'indians': {
      chargeTime(room, seat);
      spend(g, p, handIdx);
      addLog(room, `🏹 ${p.name} 인디언 습격!`);
      let s2 = nextAlive(g, seat);
      while (s2 !== seat) {
        enqueue(room, { type: 'indians', actor: s2, from: seat });
        s2 = nextAlive(g, s2);
      }
      return true;
    }
    case 'gatling': {
      chargeTime(room, seat);
      spend(g, p, handIdx);
      addLog(room, `🔫 ${p.name} 개틀링 난사!`);
      let s3 = nextAlive(g, seat);
      while (s3 !== seat) {
        enqueue(room, { type: 'gatling', actor: s3, from: seat, needMissed: 1 });
        s3 = nextAlive(g, s3);
      }
      return true;
    }
    case 'store': {
      chargeTime(room, seat);
      spend(g, p, handIdx);
      const cards = [];
      for (let k = 0; k < aliveN; k++) cards.push(draw(g));
      addLog(room, `🏪 잡화점 개장 — ${cards.map((c) => E.CARD_DEFS[c.id].name).join(', ')}`);
      const order = [];
      let s4 = nextAlive(g, seat);
      while (s4 !== seat) { order.push(s4); s4 = nextAlive(g, s4); }
      enqueue(room, { type: 'store', actor: seat, cards, order });
      return true;
    }
    case 'jail': {
      if (!target || target.hp <= 0 || target.role === 'sheriff' || target.jail) return fail(room, seat, '감옥 대상이 아닙니다');
      chargeTime(room, seat);
      spend(g, p, handIdx, true);
      target.jail = card;
      addLog(room, `⛓️ ${p.name} → ${target.name} 감옥!`);
      break;
    }
    case 'dynamite': {
      if (p.dynamite) return fail(room, seat, '이미 다이너마이트가 있습니다');
      chargeTime(room, seat);
      spend(g, p, handIdx, true);
      p.dynamite = card;
      addLog(room, `🧨 ${p.name} 다이너마이트 점화`);
      break;
    }
    default: {
      // 장비 (술통/무스탕/조준경/무기)
      if (def.kind === 'weapon') {
        const old = p.equip.findIndex((c) => E.CARD_DEFS[c.id].kind === 'weapon');
        chargeTime(room, seat);
        if (old >= 0) discardCard(g, p.equip.splice(old, 1)[0]);
        spend(g, p, handIdx, true);
        p.equip.push(card);
        addLog(room, `${def.icon} ${p.name} ${def.name} 장착 (사거리 ${def.range})`);
      } else if (def.kind === 'blue') {
        if (p.equip.some((c) => c.id === card.id)) return fail(room, seat, '이미 장착된 카드입니다');
        chargeTime(room, seat);
        spend(g, p, handIdx, true);
        p.equip.push(card);
        addLog(room, `${def.icon} ${p.name} ${def.name} 장착`);
      } else return false;
    }
  }
  armTurnTimer(room, seat);
  pushState(room);
  maybeAiTurn(room, seat);
  return true;
}
function spend(g, p, idx, keep) {
  const c = p.hand.splice(idx, 1)[0];
  if (!keep) discardCard(g, c);
  checkSuzy(g, p);
  return c;
}
function stealCard(g, taker, victim, toDiscard) {
  let card = null;
  if (victim.hand.length) {
    card = victim.hand.splice(Math.floor(g.rng() * victim.hand.length), 1)[0];
  } else if (victim.equip.length) {
    card = victim.equip.splice(Math.floor(g.rng() * victim.equip.length), 1)[0];
  }
  if (!card) return;
  if (toDiscard) discardCard(g, card);
  else taker.hand.push(card);
  checkSuzy(g, victim);
}
function fail(room, seat, msg) {
  emitSeat(room, seat, 'bang:error', { message: msg });
  return false;
}

function endTurnAction(room, seat) {
  const g = room.game;
  if (g.winners || g.phase !== 'turn' || g.turn !== seat || g.queue.length) return;
  chargeTime(room, seat);
  endTurnCore(room);
}

// ── AI ────────────────────────────────────────────────────────────
function aiEnemies(g, seat) {
  const me = g.players[seat];
  const alive = alivePlayers(g).filter((p) => p.seat !== seat);
  const sheriff = alive.find((p) => p.role === 'sheriff');
  if (me.role === 'outlaw') return sheriff ? [sheriff, ...alive.filter((p) => p !== sheriff)] : alive;
  if (me.role === 'sheriff' || me.role === 'deputy') {
    // 보안관을 공격한 순으로 (부관은 보안관 제외)
    return alive
      .filter((p) => p.role !== 'sheriff' && !(me.role === 'sheriff' && false))
      .filter((p) => !(me.role === 'deputy' && p.role === 'sheriff'))
      .sort((a, b) => g.aggroVsSheriff[b.seat] - g.aggroVsSheriff[a.seat]);
  }
  // 배신자: 마지막 2인 전까지는 비보안관 우선
  if (alive.length > 1) return alive.sort((a, b) => (a.role === 'sheriff' ? 1 : 0) - (b.role === 'sheriff' ? 1 : 0));
  return alive;
}
function maybeAiTurn(room, seat) {
  const g = room.game;
  if (g.winners || room.seats[seat].type !== 'ai') return;
  clearTimeout(room.aiTimer);
  room.aiTimer = setTimeout(() => {
    if (!rooms.has(room.code) || room.status !== 'active' || g.winners) return;
    if (g.phase !== 'turn' || g.turn !== seat || g.queue.length) return;
    aiPlayStep(room, seat);
  }, CFG.aiDelay());
}
function aiPlayStep(room, seat) {
  const g = room.game;
  const p = g.players[seat];
  const idxOf = (id) => p.hand.findIndex((c) => c.id === id);
  const enemies = aiEnemies(g, seat);
  const inRange = enemies.filter((e) => E.distance(g.players, seat, e.seat) <= E.weaponRange(p));

  // 1) 맥주 (아프면)
  if (p.hp < p.maxHp && p.hp <= 2 && alivePlayers(g).length > 2 && idxOf('beer') >= 0) {
    if (playCard(room, seat, idxOf('beer'))) return;
  }
  // 2) 장비/무기
  for (const id of ['winchester', 'carabine', 'remington', 'volcanic', 'schofield', 'barrel', 'mustang', 'scope']) {
    const ix = idxOf(id);
    if (ix < 0) continue;
    const def = E.CARD_DEFS[id];
    if (def.kind === 'weapon' && E.weaponRange(p) >= def.range) continue;
    if (def.kind === 'blue' && p.equip.some((c) => c.id === id)) continue;
    if (playCard(room, seat, ix)) return;
  }
  // 3) 드로우 엔진
  for (const id of ['wellsfargo', 'stagecoach']) {
    const ix = idxOf(id);
    if (ix >= 0 && playCard(room, seat, ix)) return;
  }
  // 4) 감옥 — 최우선 적에게
  if (idxOf('jail') >= 0 && enemies.length) {
    const t = enemies.find((e) => e.role !== 'sheriff' && !e.jail);
    if (t && playCard(room, seat, idxOf('jail'), t.seat)) return;
  }
  // 5) 공격
  const unlimited = p.character === 'willy' || p.equip.some((c) => c.id === 'volcanic');
  if ((g.bangsPlayed < 1 || unlimited) && inRange.length) {
    const bIx = idxOf('bang') >= 0 ? idxOf('bang') : (p.character === 'calamity' ? idxOf('missed') : -1);
    if (bIx >= 0 && playCard(room, seat, bIx, inRange[0].seat)) return;
  }
  if (idxOf('duel') >= 0 && enemies.length && p.hand.filter((c) => c.id === 'bang').length >= 2) {
    if (playCard(room, seat, idxOf('duel'), enemies[0].seat)) return;
  }
  for (const id of ['gatling', 'indians']) {
    const ix = idxOf(id);
    if (ix >= 0 && enemies.length >= Math.max(2, alivePlayers(g).length - 2) && playCard(room, seat, ix)) return;
  }
  // 6) 훼방
  for (const id of ['panic', 'catbalou']) {
    const ix = idxOf(id);
    if (ix < 0) continue;
    const ts = enemies.filter((e) => (e.hand.length || e.equip.length) &&
      (id === 'catbalou' || E.distance(g.players, seat, e.seat) <= 1));
    if (ts.length && playCard(room, seat, ix, ts[0].seat)) return;
  }
  // 7) 잡화점/살룬
  if (idxOf('store') >= 0 && playCard(room, seat, idxOf('store'))) return;
  if (idxOf('saloon') >= 0 && p.hp < p.maxHp && playCard(room, seat, idxOf('saloon'))) return;
  if (idxOf('dynamite') >= 0 && playCard(room, seat, idxOf('dynamite'))) return;
  // 끝
  endTurnAction(room, seat);
}
function maybeAiReact(room, item) {
  const g = room.game;
  if (room.seats[item.actor].type !== 'ai') return;
  clearTimeout(room.aiTimer);
  room.aiTimer = setTimeout(() => {
    if (!rooms.has(room.code) || g.winners || g.queue[0] !== item) return;
    const p = g.players[item.actor];
    const find = (id, skip) => {
      const out = [];
      for (let i = 0; i < p.hand.length; i++) {
        const c = p.hand[i];
        if (c.id === id || (p.character === 'calamity' && ((id === 'missed' && c.id === 'bang') || (id === 'bang' && c.id === 'missed')))) out.push(i);
      }
      return out;
    };
    if (item.type === 'bang' || item.type === 'gatling') {
      const ms = find('missed');
      if (ms.length >= item.needMissed) return resolveReact(room, item.actor, { cards: ms.slice(0, item.needMissed) });
      return resolveReact(room, item.actor, { pass: true });
    }
    if (item.type === 'indians' || item.type === 'duel') {
      const bs = find('bang');
      if (bs.length) return resolveReact(room, item.actor, { cards: [bs[0]] });
      return resolveReact(room, item.actor, { pass: true });
    }
    if (item.type === 'lethal') {
      const beers = p.hand.map((c, i) => c.id === 'beer' ? i : -1).filter((i) => i >= 0);
      const need = 1 - p.hp;
      if (beers.length >= need && alivePlayers(g).length > 2) return resolveReact(room, item.actor, { cards: beers.slice(0, need) });
      return resolveReact(room, item.actor, { pass: true });
    }
    if (item.type === 'store') {
      // 선호: bang > beer > missed > 첫 장
      const pref = ['bang', 'beer', 'missed'];
      let pick = 0;
      for (const id of pref) { const ix = item.cards.findIndex((c) => c.id === id); if (ix >= 0) { pick = ix; break; } }
      return resolveReact(room, item.actor, { pick });
    }
    if (item.type === 'discard') {
      // 가치 낮은 순으로 버림
      const value = { bang: 5, missed: 4, beer: 4 };
      const order = p.hand.map((c, i) => ({ i, v: value[c.id] || 1 })).sort((a, b) => a.v - b.v);
      const need = p.hand.length - Math.max(0, p.hp);
      return resolveReact(room, item.actor, { cards: order.slice(0, need).map((x) => x.i) });
    }
    resolveReact(room, item.actor, { pass: true });
  }, CFG.aiReactDelay());
}

// ── 소켓 등록 ─────────────────────────────────────────────────────
function register(io, socket) {
  socket.on('bang:create', ({ nickname, size } = {}) => {
    if (!rateCheck(socket.id, 'bg-create', 5, 60 * 1000)) return;
    const room = createRoom(nickname, size);
    const seat = room.seats[0];
    seat.socketId = socket.id;
    seat.connected = true;
    socket.join('bg:' + room.code);
    socket.emit('bang:created', { code: room.code, token: seat.token, seat: 0, size: room.size });
    socket.emit('bang:room', lobbyState(room));
    log(`[뱅] 방 생성 — ${room.code} (${room.size}인)`);
  });

  socket.on('bang:join', ({ code, nickname } = {}) => {
    if (!rateCheck(socket.id, 'bg-join', 10, 60 * 1000)) return;
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return socket.emit('bang:error', { message: '방을 찾을 수 없습니다' });
    if (room.status !== 'waiting') return socket.emit('bang:error', { message: '이미 시작된 방입니다' });
    const seatIdx = room.seats.findIndex((s) => s === null);
    if (seatIdx < 0) return socket.emit('bang:error', { message: '자리가 없습니다' });
    const seat = seatHuman(room, seatIdx, nickname);
    seat.socketId = socket.id;
    seat.connected = true;
    socket.join('bg:' + room.code);
    socket.emit('bang:joined', { code: room.code, token: seat.token, seat: seatIdx });
    emitAll(room, 'bang:room', lobbyState(room));
  });

  socket.on('bang:start', () => {
    const found = findBySocket(socket.id);
    if (!found) return;
    if (found.room.status !== 'waiting' || found.seat !== found.room.hostSeat) return;
    startMatch(found.room);
  });

  socket.on('bang:reconnect', ({ token } = {}) => {
    if (!rateCheck(socket.id, 'bg-rec', 8, 60 * 1000)) return;
    const ref = tokenMap.get(token);
    if (!ref) return socket.emit('bang:error', { message: '만료된 세션입니다', fatal: true });
    const room = rooms.get(ref.code);
    if (!room) return socket.emit('bang:error', { message: '방이 사라졌습니다', fatal: true });
    if (room.status === 'active') cancelCleanup(room);
    const s = room.seats[ref.seat];
    s.socketId = socket.id;
    s.connected = true;
    socket.join('bg:' + room.code);
    socket.emit('bang:reconnected', { code: room.code, seat: ref.seat, status: room.status });
    socket.emit('bang:room', lobbyState(room));
    if (room.status === 'active') emitSeat(room, ref.seat, 'bang:state', gameStateFor(room, ref.seat));
  });

  socket.on('bang:action', (data = {}) => {
    if (!rateCheck(socket.id, 'bg-act', 40, 10 * 1000)) return;
    const found = findBySocket(socket.id);
    if (!found || found.room.status !== 'active') return;
    const { room, seat } = found;
    const g = room.game;
    if (!g || g.winners) return;
    const a = data.a;
    const item = g.queue[0];
    if (item && item.actor === seat) {
      if (a === 'react') resolveReact(room, seat, { cards: Array.isArray(data.cards) ? data.cards.map((x) => x | 0) : null, pass: !!data.pass, pick: data.pick });
      return;
    }
    if (g.phase === 'turn' && g.turn === seat && !g.queue.length) {
      if (a === 'play') { if (playCard(room, seat, data.idx | 0, data.target != null ? data.target | 0 : null)) { /* state는 내부에서 push */ } else pushState(room); }
      else if (a === 'end') endTurnAction(room, seat);
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
      if (seat === room.hostSeat) {
        emitAll(room, 'bang:error', { message: '방장이 나갔습니다', fatal: true });
        destroyRoom(room);
      } else {
        tokenMap.delete(s.token);
        room.seats[seat] = null;
        emitAll(room, 'bang:room', lobbyState(room));
      }
      return;
    }
    if (room.status === 'active') {
      emitAll(room, 'bang:room', lobbyState(room));
      const g = room.game;
      if (g && !g.winners) {
        const item = g.queue[0];
        if (item && item.actor === seat) armReactTimer(room, item);
        else if (g.phase === 'turn' && g.turn === seat) armTurnTimer(room, seat);
      }
      if (!room.seats.some((x) => x && x.type === 'human' && x.connected)) scheduleCleanup(room, CFG.disconnectCleanupMs);
    }
  });
}

function findBySocket(socketId) {
  for (const room of rooms.values()) {
    for (let i = 0; i < room.seats.length; i++) {
      const s = room.seats[i];
      if (s && s.type === 'human' && s.socketId === socketId) return { room, seat: i };
    }
  }
  return null;
}

module.exports = {
  register, rooms, createRoom, seatHuman, startMatch, CFG,
  _internal: { playCard, resolveReact, endTurnAction, applyDamage, beginTurn, gameStateFor, alivePlayers, checkWin },
};
