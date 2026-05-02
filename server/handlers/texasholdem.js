// server/handlers/texasholdem.js — 텍사스 홀덤 핸들러
const state = require('../state');
const { log } = require('../utils');

const SMALL_BLIND  = 10;
const BIG_BLIND    = 20;
const MAX_RAISES   = 4;
const START_CHIPS  = 1000;

// ── 덱 ────────────────────────────────────────────────────────────
const SUITS = ['♠', '♥', '♦', '♣'];

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) { // 14 = Ace
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── 방 초기화 ─────────────────────────────────────────────────────
function initRoom(base) {
  base.phase       = 'waiting';
  base.deck        = [];
  base.hands       = { host: [], guest: [] };
  base.community   = [];
  base.pot         = 0;
  base.chips       = { host: START_CHIPS, guest: START_CHIPS };
  base.bets        = { host: 0, guest: 0 };
  base.roundBet    = 0;   // 현재 라운드 최고 베팅액
  base.button      = 'host'; // 딜러/스몰블라인드
  base.betTurn     = null;
  base.raiseCount  = 0;
  base.roundNum    = 0;
  base.acted       = { host: false, guest: false };
}

function resetRoom(room) {
  room.phase       = 'waiting';
  room.deck        = [];
  room.hands       = { host: [], guest: [] };
  room.community   = [];
  room.pot         = 0;
  room.chips       = { host: START_CHIPS, guest: START_CHIPS };
  room.bets        = { host: 0, guest: 0 };
  room.roundBet    = 0;
  room.betTurn     = null;
  room.raiseCount  = 0;
  room.roundNum    = 0;
  room.acted       = { host: false, guest: false };
}

// ── 라운드 시작 ───────────────────────────────────────────────────
function startTHRound(room) {
  if (room.status !== 'active') return;

  const { endGame } = require('../endgame');

  // 칩 확인
  if (room.chips.host <= 0 || room.chips.guest <= 0) {
    const winner = room.chips.host > 0 ? 'white' : 'black';
    endGame(room, winner, 'chips-depleted');
    return;
  }

  room.roundNum++;
  room.deck        = makeDeck();
  room.community   = [];
  room.pot         = 0;
  room.bets        = { host: 0, guest: 0 };
  room.roundBet    = BIG_BLIND;
  room.raiseCount  = 0;
  room.acted       = { host: false, guest: false };

  // 홀 카드 딜
  room.hands.host  = [room.deck.pop(), room.deck.pop()];
  room.hands.guest = [room.deck.pop(), room.deck.pop()];

  // 블라인드 포스팅
  const sb = room.button;
  const bb = sb === 'host' ? 'guest' : 'host';
  const sbAmount = Math.min(SMALL_BLIND, room.chips[sb]);
  const bbAmount = Math.min(BIG_BLIND,   room.chips[bb]);
  room.chips[sb] -= sbAmount;
  room.chips[bb] -= bbAmount;
  room.bets[sb]   = sbAmount;
  room.bets[bb]   = bbAmount;
  room.pot        = sbAmount + bbAmount;

  // 프리플랍: 헤즈업에서 버튼(SB)이 먼저 행동
  room.betTurn = sb;
  room.phase   = 'preflop';

  // 타이머: 베팅 시 30초
  room.timers.activeColor = sb === 'host' ? 'white' : 'black';
  room.timers.white       = Math.max(room.timers.white, 30 * 1000);
  room.timers.black       = Math.max(room.timers.black, 30 * 1000);
  room.timers.lastTickAt  = Date.now();

  // 각 플레이어에게 본인 홀 카드만 전송
  const hostSockId  = room.players.host.socketId;
  const guestSockId = room.players.guest.socketId;
  if (hostSockId)  state.io.to(hostSockId).emit('texasholdem:dealt',  { hand: room.hands.host,  roundNum: room.roundNum });
  if (guestSockId) state.io.to(guestSockId).emit('texasholdem:dealt', { hand: room.hands.guest, roundNum: room.roundNum });

  // 공개 상태 브로드캐스트
  state.io.to(room.id).emit('game:move:made', _publicState(room, { type: 'deal', roundNum: room.roundNum }));
  log(`텍사스홀덤 라운드 ${room.roundNum} 시작 — 방 ${room.id.slice(0,8)}, pot=${room.pot}`);
}

// ── 베팅 액션 처리 ────────────────────────────────────────────────
function handleMove(socket, room, role, data) {
  if (room.phase === 'waiting' || room.phase === 'showdown') return;
  if (room.betTurn !== role) {
    socket.emit('game:move:invalid', { reason: '아직 당신의 차례가 아닙니다.' });
    return;
  }

  const { action } = data;
  if (!['fold', 'check', 'call', 'raise'].includes(action)) return;

  const opp = role === 'host' ? 'guest' : 'host';
  const toCall = room.roundBet - (room.bets[role] || 0);

  if (action === 'fold') {
    _doFold(room, role); return;
  }

  if (action === 'check') {
    if (toCall > 0) {
      socket.emit('game:move:invalid', { reason: '체크할 수 없습니다. 콜 또는 폴드하세요.' });
      return;
    }
    room.acted[role] = true;
    state.io.to(room.id).emit('game:move:made', _publicState(room, { type: 'check', role }));
    _maybeAdvanceStreet(room);
    return;
  }

  if (action === 'call') {
    const callAmt = Math.min(toCall, room.chips[role]);
    room.chips[role] -= callAmt;
    room.bets[role]  += callAmt;
    room.pot         += callAmt;
    room.acted[role]  = true;
    state.io.to(room.id).emit('game:move:made', _publicState(room, { type: 'call', role, amount: callAmt }));
    _maybeAdvanceStreet(room);
    return;
  }

  if (action === 'raise') {
    if (room.raiseCount >= MAX_RAISES) {
      socket.emit('game:move:invalid', { reason: '더 이상 레이즈할 수 없습니다.' });
      return;
    }
    const raiseBy  = BIG_BLIND;
    const newTotal = room.roundBet + raiseBy;
    const needed   = newTotal - (room.bets[role] || 0);
    if (room.chips[role] < needed) {
      socket.emit('game:move:invalid', { reason: '칩이 부족합니다.' });
      return;
    }
    room.chips[role]  -= needed;
    room.bets[role]   += needed;
    room.pot          += needed;
    room.roundBet      = newTotal;
    room.raiseCount++;
    room.acted[role]   = true;
    room.acted[opp]    = false; // 상대는 다시 행동해야 함
    room.betTurn       = opp;
    _setTimer(room, opp);
    state.io.to(room.id).emit('game:move:made', _publicState(room, { type: 'raise', role, amount: needed }));
    return;
  }
}

function _doFold(room, role) {
  const winner = role === 'host' ? 'black' : 'white';
  const winnerRole = role === 'host' ? 'guest' : 'host';
  room.chips[winnerRole] += room.pot;
  room.pot = 0;
  room.phase = 'showdown';
  state.io.to(room.id).emit('texasholdem:showdown', {
    hands:     room.hands,
    community: room.community,
    winner, reason: 'fold',
    chips:     room.chips,
    roundNum:  room.roundNum,
  });
  log(`텍사스홀덤 폴드 — ${role} 폴드, 방 ${room.id.slice(0,8)}`);
  const { endGame } = require('../endgame');
  if (room.chips.host <= 0 || room.chips.guest <= 0) {
    setTimeout(() => endGame(room, room.chips.host <= 0 ? 'black' : 'white', 'chips-depleted'), 3000);
  } else {
    setTimeout(() => _nextRound(room), 3500);
  }
}

function _maybeAdvanceStreet(room) {
  const opp = room.betTurn === 'host' ? 'guest' : 'host';

  // 두 플레이어 모두 행동 완료 + 베팅 동일 → 다음 스트리트
  const balanced = room.bets.host === room.bets.guest;
  const bothActed = room.acted.host && room.acted.guest;
  if (!bothActed || !balanced) {
    // 상대 차례로 넘김
    room.betTurn = opp;
    _setTimer(room, opp);
    return;
  }

  // 스트리트 진행
  if (room.phase === 'preflop') {
    _dealCommunity(room, 3); // 플랍
    room.phase = 'flop';
  } else if (room.phase === 'flop') {
    _dealCommunity(room, 1); // 턴
    room.phase = 'turn';
  } else if (room.phase === 'turn') {
    _dealCommunity(room, 1); // 리버
    room.phase = 'river';
  } else if (room.phase === 'river') {
    _doShowdown(room);
    return;
  }

  // 포스트플랍: 논버튼이 먼저
  const nonButton = room.button === 'host' ? 'guest' : 'host';
  room.betTurn    = nonButton;
  room.raiseCount = 0;
  room.acted      = { host: false, guest: false };
  room.bets       = { host: 0, guest: 0 };
  room.roundBet   = 0;
  _setTimer(room, nonButton);

  state.io.to(room.id).emit('texasholdem:community', { community: room.community, phase: room.phase });
  state.io.to(room.id).emit('game:move:made', _publicState(room, { type: 'street', phase: room.phase }));
}

function _dealCommunity(room, n) {
  for (let i = 0; i < n; i++) room.community.push(room.deck.pop());
}

function _doShowdown(room) {
  room.phase = 'showdown';
  room.timers.activeColor = null;

  const hostCards  = [...room.hands.host,  ...room.community];
  const guestCards = [...room.hands.guest, ...room.community];
  const hostVal    = evaluateBestHand(hostCards);
  const guestVal   = evaluateBestHand(guestCards);
  const cmp        = compareHandValues(hostVal.value, guestVal.value);

  let winner, reason;
  if (cmp > 0) {
    winner = 'white'; room.chips.host  += room.pot; reason = hostVal.name;
  } else if (cmp < 0) {
    winner = 'black'; room.chips.guest += room.pot; reason = guestVal.name;
  } else {
    // 타이: 반반
    const half = Math.floor(room.pot / 2);
    room.chips.host  += half;
    room.chips.guest += room.pot - half;
    winner = null; reason = '타이';
  }
  room.pot = 0;

  const moveRecord = {
    hostHand: room.hands.host, guestHand: room.hands.guest,
    hostHandName: hostVal.name, guestHandName: guestVal.name,
    winner, chips: { ...room.chips }, roundNum: room.roundNum,
    timestamp: Date.now(),
  };
  room.moves.push(moveRecord);

  state.io.to(room.id).emit('texasholdem:showdown', {
    hands:          room.hands,
    community:      room.community,
    hostHandName:   hostVal.name,
    guestHandName:  guestVal.name,
    winner, reason,
    chips:          room.chips,
    roundNum:       room.roundNum,
  });
  log(`텍사스홀덤 쇼다운 — host:${hostVal.name} vs guest:${guestVal.name}, 승자:${winner}, 방 ${room.id.slice(0,8)}`);

  const { endGame } = require('../endgame');
  if (room.chips.host <= 0 || room.chips.guest <= 0) {
    setTimeout(() => endGame(room, room.chips.host <= 0 ? 'black' : 'white', 'chips-depleted'), 4000);
  } else {
    setTimeout(() => _nextRound(room), 4500);
  }
}

function _nextRound(room) {
  if (room.status !== 'active') return;
  // 버튼 교대
  room.button = room.button === 'host' ? 'guest' : 'host';
  startTHRound(room);
}

function _setTimer(room, role) {
  room.timers.activeColor = role === 'host' ? 'white' : 'black';
  room.timers.lastTickAt  = Date.now();
}

function _publicState(room, move) {
  const toCall = room.bets && room.betTurn
    ? Math.max(0, (room.roundBet || 0) - (room.bets[room.betTurn] || 0))
    : 0;
  return {
    move,
    board:         null,
    phase:         room.phase,
    community:     room.community,
    pot:           room.pot,
    chips:         room.chips,
    bets:          room.bets,
    roundBet:      room.roundBet || 0,
    betTurn:       room.betTurn,
    raiseCount:    room.raiseCount || 0,
    toCall,
    timers:        { white: room.timers.white, black: room.timers.black, activeColor: room.timers.activeColor },
    turn:          room.betTurn,
  };
}

// ── 핸드 평가 ─────────────────────────────────────────────────────
const HAND_NAMES = ['하이카드','원 페어','투 페어','트리플스','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시','로열 플러시'];

function evaluateBestHand(cards) {
  // 7장 중 최선의 5장 조합
  let best = null;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const five = cards.filter((_, idx) => idx !== i && idx !== j);
      const val = evaluate5(five);
      if (!best || compareHandValues(val.value, best.value) > 0) best = val;
    }
  }
  return best || { value: [0], name: '하이카드' };
}

function evaluate5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = new Set(suits).size === 1;

  // 스트레이트 확인
  let isStraight = false, straightHigh = 0;
  if (new Set(ranks).size === 5) {
    if (ranks[0] - ranks[4] === 4) { isStraight = true; straightHigh = ranks[0]; }
    // 휠: A-2-3-4-5
    if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { isStraight = true; straightHigh = 5; }
  }

  if (isFlush && isStraight) {
    const rank = straightHigh === 14 ? 9 : 8;
    return { value: [rank, straightHigh], name: HAND_NAMES[rank] };
  }

  const freq = {};
  ranks.forEach(r => { freq[r] = (freq[r] || 0) + 1; });
  const groups = Object.entries(freq)
    .map(([r, c]) => ({ r: +r, c }))
    .sort((a, b) => b.c - a.c || b.r - a.r);

  const [g0, g1] = groups;
  if (g0.c === 4) return { value: [7, g0.r, g1.r], name: HAND_NAMES[7] };
  if (g0.c === 3 && g1 && g1.c === 2) return { value: [6, g0.r, g1.r], name: HAND_NAMES[6] };
  if (isFlush) return { value: [5, ...ranks], name: HAND_NAMES[5] };
  if (isStraight) return { value: [4, straightHigh], name: HAND_NAMES[4] };
  if (g0.c === 3) return { value: [3, g0.r, ...groups.slice(1).map(g => g.r)], name: HAND_NAMES[3] };
  if (g0.c === 2 && g1 && g1.c === 2) {
    const pairs = [g0.r, g1.r].sort((a, b) => b - a);
    return { value: [2, ...pairs, groups.find(g => g.c === 1).r], name: HAND_NAMES[2] };
  }
  if (g0.c === 2) return { value: [1, g0.r, ...groups.slice(1).map(g => g.r)], name: HAND_NAMES[1] };
  return { value: [0, ...ranks], name: HAND_NAMES[0] };
}

function compareHandValues(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

module.exports = { initRoom, resetRoom, handleMove, startTHRound, evaluateBestHand, evaluate5, compareHandValues };
