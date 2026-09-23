// server/handlers/indianpoker.js — 인디언 포커 핸들러
const state = require('../state');
const { log } = require('../utils');

function shuffleDeck(numDecks) {
  numDecks = numDecks || 2;
  const suits = ['♠','♥','♦','♣'];
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (let rank = 1; rank <= 10; rank++) {
      const suit = suits[Math.floor(Math.random() * 4)];
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// A(1) beats 10 only; otherwise higher rank wins. Returns positive if a beats b.
function compareIndianPokerRanks(a, b) {
  if (a === 1 && b === 10) return 1;
  if (b === 1 && a === 10) return -1;
  return a - b;
}

function initRoom(base, opts) {
  const ipNumDecks   = (opts && Number.isInteger(opts.numDecks)   && opts.numDecks   >= 1 && opts.numDecks   <= 5) ? opts.numDecks   : 2;
  const ipWinCond    = (opts && opts.winCondition === 1) ? 1 : 2;
  base.phase         = 'waiting';
  base.numDecks      = ipNumDecks;
  base.winCondition  = ipWinCond;
  base.deck          = shuffleDeck(ipNumDecks);
  base.deckUsed      = 0; // cards dealt so far
  base.hands         = { host: null, guest: null };
  base.chips         = { host: 100, guest: 100 };
  base.pot           = 0;
  base.bets          = { host: 0, guest: 0 };
  base.ante          = 5;
  base.roundNum      = 0;
  base.betTurn       = null;
  base.raiseCount    = 0;
}

function resetRoom(room) {
  room.deck       = shuffleDeck(room.numDecks);
  room.hands      = { host: null, guest: null };
  room.chips      = { host: 100, guest: 100 };
  room.pot        = 0;
  room.bets       = { host: 0, guest: 0 };
  room.roundNum   = 0;
  room.betTurn    = null;
  room.raiseCount = 0;
  room.phase      = 'waiting';
}

function startIndianPokerRound(room) {
  if (room.status !== 'active') return;
  // 앤티 차감
  if (room.chips.host < room.ante || room.chips.guest < room.ante) {
    // 칩 부족 → 게임 종료
    let winner;
    if (room.chips.host < room.ante && room.chips.guest < room.ante) {
      // 양측 모두 앤티 부족 → 칩 많은 쪽 승리, 동일하면 무승부(null)
      if (room.chips.host > room.chips.guest) winner = 'white';
      else if (room.chips.guest > room.chips.host) winner = 'black';
      else winner = 'draw'; // null이면 클라이언트가 패배로 표시한다
    } else {
      winner = room.chips.host < room.ante ? 'black' : 'white';
    }
    const { endGame } = require('../endgame');
    endGame(room, winner, 'chips-depleted');
    return;
  }
  room.chips.host  -= room.ante;
  room.chips.guest -= room.ante;
  room.pot          = room.ante * 2;
  room.bets         = { host: 0, guest: 0 };
  room.raiseCount   = 0;
  room.roundNum++;

  // 덱 소진 처리
  if (room.deck.length < 2) {
    if (room.winCondition === 2) {
      // 덱 소진 → 칩 비교로 승패 결정
      const winner = room.chips.host > room.chips.guest ? 'white'
                   : room.chips.guest > room.chips.host ? 'black'
                   : 'draw'; // 동점 무승부 — null이면 클라이언트가 패배로 표시한다
      const { endGame } = require('../endgame');
      endGame(room, winner, 'deck-exhausted');
      return;
    }
    // winCondition===1: 칩 소진까지 계속 → 덱 재생성
    room.deck = shuffleDeck(room.numDecks);
  }

  room.deckUsed    = (room.deckUsed || 0) + 2;
  room.hands.host  = room.deck.pop();
  room.hands.guest = room.deck.pop();
  room.phase = 'bet';
  room.betTurn = 'guest'; // 게스트 먼저

  // 타이머 설정 (베팅 타임: 30초 고정)
  room.timers.white       = 30 * 1000;
  room.timers.black       = 30 * 1000;
  room.timers.activeColor = 'black'; // guest=black
  room.timers.lastTickAt  = Date.now();

  // 각자에게 상대 카드만 전송
  const hostSocketId  = room.players.host.socketId;
  const guestSocketId = room.players.guest.socketId;

  if (hostSocketId)  state.io.to(hostSocketId).emit('indianpoker:dealt',  { opponentCard: room.hands.guest, pot: room.pot, chips: room.chips, ante: room.ante, roundNum: room.roundNum });
  if (guestSocketId) state.io.to(guestSocketId).emit('indianpoker:dealt', { opponentCard: room.hands.host,  pot: room.pot, chips: room.chips, ante: room.ante, roundNum: room.roundNum });

  state.io.to(room.id).emit('indianpoker:bet:turn', { betTurn: 'guest', pot: room.pot, chips: room.chips });
  log(`인디언 포커 라운드 ${room.roundNum} 시작 — 방 ${room.id.slice(0,8)}, pot=${room.pot}`);
}

function doShowdown(room) {
  room.phase = 'showdown';
  room.timers.activeColor = null;
  room.timers.lastTickAt  = null;

  const hCard = room.hands.host;
  const gCard = room.hands.guest;
  let winner, reason = 'showdown';

  const cmp = compareIndianPokerRanks(hCard.rank, gCard.rank);
  if (cmp > 0) {
    winner = 'white'; // host wins
    room.chips.host += room.pot;
  } else if (cmp < 0) {
    winner = 'black'; // guest wins
    room.chips.guest += room.pot;
  } else {
    // 동점이면 팟을 나눈다. 예전엔 '동점이면 호스트 승'이었는데 이 규칙은 어디에도 안내되지
    // 않았고(규칙 설명엔 없음), 호스트는 이미 마지막 행동권까지 가진 쪽이라 이중 이득이었다.
    // 덱이 2벌이면 약 5% 라운드가 동점이다. 보드는 원래 winner === 'draw' 를 그릴 줄 안다.
    // 홀수 칩 하나는 먼저 행동해 불리한 게스트에게 준다.
    winner = 'draw';
    const half = Math.floor(room.pot / 2);
    room.chips.host  += half;
    room.chips.guest += room.pot - half;
  }
  room.pot = 0;

  const moveRecord = {
    hostCard: hCard, guestCard: gCard, winner,
    chips: { ...room.chips }, roundNum: room.roundNum,
    timestamp: Date.now()
  };
  room.moves.push(moveRecord);

  state.io.to(room.id).emit('indianpoker:showdown', {
    hostCard: hCard, guestCard: gCard, winner, reason,
    pot: 0, chips: room.chips, roundNum: room.roundNum
  });

  log(`인디언 포커 쇼다운 — host:${hCard.rank} vs guest:${gCard.rank}, 승자:${winner}, 방 ${room.id.slice(0,8)}`);

  const { endGame } = require('../endgame');

  if (room.chips.host <= 0 || room.chips.guest <= 0) {
    setTimeout(() => endGame(room, room.chips.host <= 0 ? 'black' : 'white', 'chips-depleted'), 3000);
  } else {
    setTimeout(() => startIndianPokerRound(room), 4000);
  }
}

function handleMove(socket, room, role, data) {
  // 인디언 포커는 game:move가 아닌 indianpoker:action으로 처리
  // 이 함수는 호환성을 위해 존재
}

function handleIndianPokerAction(socket, room, role, { action }) {
  // amount는 서버 측 고정값(5)만 사용 — 클라이언트 amount 파라미터 무시
  if (room.phase !== 'bet') return;
  if (room.betTurn !== role) {
    if (socket) socket.emit('game:move:invalid', { reason: '아직 당신의 차례가 아닙니다.' });
    return;
  }
  if (!['fold','call','raise'].includes(action)) return;

  if (action === 'fold') {
    // 폴드: 상대가 팟 획득
    const winner = role === 'host' ? 'black' : 'white';
    const winnerRole = role === 'host' ? 'guest' : 'host';
    room.chips[winnerRole] += room.pot;
    room.pot = 0;
    room.phase = 'showdown';
    // 결과를 보여주는 4초 동안 시계를 멈춘다. 안 멈추면 폴드한 쪽 시계가 계속 흘러
    // 0이 된 뒤 매 틱(500ms)마다 자동 콜이 헛돈다. (텍사스 홀덤은 같은 수정에 회귀 테스트가 있다)
    room.timers.activeColor = null;
    room.timers.lastTickAt  = null;

    // 10을 가지고 폴드하면 추가 페널티
    const folderCard = role === 'host' ? room.hands.host : room.hands.guest;
    const FOLD_PENALTY = room.ante; // 앤티만큼 추가 손실
    // 가진 만큼만 옮긴다 — 예전엔 폴드한 쪽을 0으로 자르면서 이긴 쪽엔 5를 다 줘서 칩이 생겨났다
    const paidPenalty = (folderCard && folderCard.rank === 10) ? Math.min(FOLD_PENALTY, room.chips[role]) : 0;
    room.chips[role]       -= paidPenalty;
    room.chips[winnerRole] += paidPenalty;

    state.io.to(room.id).emit('indianpoker:showdown', {
      hostCard:  room.hands.host,
      guestCard: room.hands.guest,
      winner,
      reason: 'fold',
      foldPenalty: paidPenalty,
      pot:   0,
      chips: room.chips
    });

    log(`인디언 포커 폴드 — ${role} 폴드, 방 ${room.id.slice(0,8)}`);

    const { endGame } = require('../endgame');

    if (room.chips.host <= 0 || room.chips.guest <= 0) {
      setTimeout(() => endGame(room, room.chips.host <= 0 ? 'black' : 'white', 'chips-depleted'), 3000);
    } else {
      setTimeout(() => startIndianPokerRound(room), 4000);
    }
    return;
  }

  if (action === 'raise') {
    if (room.raiseCount >= 3) {
      // 최대 raise 초과 → 자동 call
      action = 'call';
    } else {
      const raiseAmount = 5; // 고정 레이즈
      // 레이즈 = 상대 베팅을 먼저 맞추고 5를 더 거는 것.
      // ⚠ 예전엔 5만 더했다. 상대가 레이즈해 둔 상태(5 대 0)에서 '레이즈'하면 5 대 5 —
      //   이름만 레이즈인 콜이었고, 레이즈 횟수만 소모한 채 상대에게 0짜리 콜을 넘겼다.
      const oppBetNow = room.bets[role === 'host' ? 'guest' : 'host'];
      const cost = Math.max(0, oppBetNow - room.bets[role]) + raiseAmount;
      if (room.chips[role] < cost) {
        if (socket) socket.emit('game:move:invalid', { reason: '칩이 부족합니다.' });
        return;
      }
      room.chips[role] -= cost;
      room.bets[role]  += cost;
      room.pot         += cost;
      room.raiseCount++;

      const nextBetTurn = role === 'host' ? 'guest' : 'host';
      room.betTurn = nextBetTurn;

      // 타이머 리셋 — 상대 차례
      const nextTimerColor = nextBetTurn === 'host' ? 'white' : 'black';
      room.timers.activeColor = nextTimerColor;
      room.timers[nextTimerColor] = 30 * 1000;
      room.timers.lastTickAt = Date.now();

      state.io.to(room.id).emit('indianpoker:bet:turn', { betTurn: nextBetTurn, pot: room.pot, chips: room.chips, lastAction: { role, action: 'raise', amount: cost } });
      return;
    }
  }

  if (action === 'call') {
    // call: 베팅 차이 맞추기
    const myBet   = room.bets[role];
    const oppRole = role === 'host' ? 'guest' : 'host';
    const oppBet  = room.bets[oppRole];
    const diff    = oppBet - myBet;
    if (diff > 0) {
      if (room.chips[role] < diff) {
        // 올인
        const allIn = room.chips[role];
        room.chips[role] -= allIn;
        room.bets[role]  += allIn;
        room.pot         += allIn;
      } else {
        room.chips[role] -= diff;
        room.bets[role]  += diff;
        room.pot         += diff;
      }
    }

    // 베팅이 닫히는 조건: 상대 베팅을 '맞춘' 콜(diff > 0)이거나, 두 번째로 행동하는 호스트의 콜.
    // 게스트가 라운드 첫 행동으로 콜(=체크, diff 0)한 경우만 호스트에게 차례가 간다.
    // ⚠ 예전엔 게스트의 콜이면 무조건 호스트 차례였다 — 게스트가 호스트의 레이즈를 콜해도
    //   베팅이 안 닫혀 호스트만 한 번 더(재레이즈) 행동할 수 있었다.
    if (role === 'guest' && diff <= 0) {
      room.betTurn = 'host';
      const nextTimerColor = 'white';
      room.timers.activeColor = nextTimerColor;
      room.timers[nextTimerColor] = 30 * 1000;
      room.timers.lastTickAt = Date.now();
      state.io.to(room.id).emit('indianpoker:bet:turn', { betTurn: 'host', pot: room.pot, chips: room.chips, lastAction: { role, action: 'call' } });
    } else {
      // 호스트의 콜, 또는 걸린 베팅을 맞춘 게스트의 콜 → 쇼다운
      doShowdown(room);
    }
  }
}

module.exports = {
  initRoom,
  resetRoom,
  handleMove,
  handleIndianPokerAction,
  startIndianPokerRound,
  doShowdown,
  shuffleDeck,
};
