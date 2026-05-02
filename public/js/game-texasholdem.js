// game-texasholdem.js — 텍사스 홀덤 프론트엔드 핸들러
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.texasholdem = (function () {

  function _init(st, myColor, handleAction, myRole, spectatorMode) {
    TexasHoldemBoard.init({
      myColor:      myColor,
      myRole:       myRole || 'host',
      onAction:     handleAction,
      spectatorMode,
    });
    return { board: TexasHoldemBoard };
  }

  function initBoard(st, myColor, handleAction, myRole) {
    return _init(st, myColor, handleAction, myRole, false);
  }

  function initSpectatorBoard(st, hostColor, handleAction) {
    return _init(st, hostColor, handleAction, 'spectator', true);
  }

  function initGame(st, myColor, handleAction, myRole) {
    return initBoard(st, myColor, handleAction, myRole);
  }

  function onMoveMade(data) {
    TexasHoldemBoard.update(data);
    if (data.move && data.move.type !== 'deal') {
      if (window.Sound) Sound.play('move');
    }
  }

  function getMyTurn(st, myColor) {
    return false; // 텍사스홀덤은 betTurn으로 관리
  }

  // ── 솔로 (vs AI) 모드 ────────────────────────────────────────────
  function startSolo(playerColor, helpers, options) {
    const { showGameOver } = helpers;
    const playerRole = 'host';
    const aiRole     = 'guest';
    const SMALL_BLIND = 10, BIG_BLIND = 20, MAX_RAISES = 4;
    const START_CHIPS = 1000;

    const SUITS = ['♠','♥','♦','♣'];
    let chips    = { host: START_CHIPS, guest: START_CHIPS };
    let button   = 'host';
    let ended    = false;

    function cleanup() { ended = true; }

    function makeDeck() {
      const d = [];
      for (const suit of SUITS) for (let r=2;r<=14;r++) d.push({rank:r,suit});
      for (let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
      return d;
    }

    function startRound() {
      if (ended) return;
      if (chips[playerRole] <= 0 || chips[aiRole] <= 0) {
        cleanup();
        const winner = chips[playerRole] > 0 ? playerRole : aiRole;
        if (window.Stats) Stats.record('texasholdem', winner === playerRole ? 'win' : 'loss');
        showGameOver({ winner: winner === playerRole ? playerColor : (playerColor==='white'?'black':'white'), reason: '칩 소진' });
        return;
      }

      const deck    = makeDeck();
      const hand    = { host: [deck.pop(), deck.pop()], guest: [deck.pop(), deck.pop()] };
      let community = [];
      let pot       = 0;
      let bets      = { host: 0, guest: 0 };
      let roundBet  = BIG_BLIND;
      let raiseCount = 0;
      let phase     = 'preflop';

      // 블라인드
      const sb = button, bb = sb==='host'?'guest':'host';
      const sbAmt = Math.min(SMALL_BLIND, chips[sb]);
      const bbAmt = Math.min(BIG_BLIND,   chips[bb]);
      chips[sb] -= sbAmt; chips[bb] -= bbAmt;
      bets[sb]   = sbAmt;  bets[bb]   = bbAmt;
      pot        = sbAmt + bbAmt;

      // 내 카드 표시
      TexasHoldemBoard.init({
        myColor: playerColor, myRole: playerRole,
        onAction: handlePlayerAction, spectatorMode: false,
      });
      TexasHoldemBoard.showDeal({ hand: hand[playerRole], roundNum: 0 });
      TexasHoldemBoard.update({
        phase, community, pot, chips: { ...chips }, bets: { ...bets },
        roundBet, betTurn: button, raiseCount, toCall: Math.max(0, bets[bb]-bets[button]),
        button,
      });
      if (window.Sound) Sound.play('move');

      // 프리플랍: 버튼(SB)이 먼저
      let betTurn = button;
      let acted = { host: false, guest: false };

      function handlePlayerAction(data) {
        if (ended || betTurn !== playerRole) return;
        processAction(data.action, playerRole);
      }

      function processAction(action, role) {
        if (ended) return;
        const opp = role === 'host' ? 'guest' : 'host';
        const toCall = Math.max(0, roundBet - bets[role]);

        if (action === 'fold') {
          chips[opp] += pot;
          pot = 0;
          if (window.Sound) Sound.play('move');
          TexasHoldemBoard.showShowdown({
            hands: hand, community, winner: opp === playerRole ? playerColor : (playerColor==='white'?'black':'white'),
            hostHandName: '', guestHandName: '', reason: '폴드', chips: { ...chips },
          });
          setTimeout(() => {
            if (!ended) { button = button==='host'?'guest':'host'; startRound(); }
          }, 3000);
          return;
        }

        if (action === 'check') {
          acted[role] = true;
          if (window.Sound) Sound.play('move');
        } else if (action === 'call') {
          const amt = Math.min(toCall, chips[role]);
          chips[role] -= amt; bets[role] += amt; pot += amt;
          acted[role] = true;
          if (window.Sound) Sound.play('move');
        } else if (action === 'raise') {
          if (raiseCount >= MAX_RAISES) { action = 'call'; processAction('call', role); return; }
          const newTotal = roundBet + BIG_BLIND;
          const needed   = newTotal - bets[role];
          if (chips[role] < needed) { processAction('call', role); return; }
          chips[role] -= needed; bets[role] += needed; pot += needed;
          roundBet = newTotal; raiseCount++;
          acted[role]  = true;
          acted[opp]   = false;
          betTurn      = opp;
          if (window.Sound) Sound.play('move');
        }

        TexasHoldemBoard.update({
          phase, community, pot, chips: { ...chips }, bets: { ...bets },
          roundBet, betTurn, raiseCount,
          toCall: Math.max(0, roundBet - bets[betTurn]),
          button,
        });

        // 다음 행동 결정
        const balanced = bets.host === bets.guest;
        const bothActed = acted.host && acted.guest;

        if (bothActed && balanced) {
          // 스트리트 진행
          setTimeout(advanceStreet, 800);
        } else if (betTurn !== playerRole) {
          // AI 차례
          setTimeout(doAIAction, 1000);
        }
      }

      function doAIAction() {
        if (ended || betTurn !== aiRole) return;
        const toCall = Math.max(0, roundBet - bets[aiRole]);
        const choice = AITexasHoldem.decideAction(hand[aiRole], community, pot, toCall, raiseCount, chips[aiRole]);
        processAction(choice.action, aiRole);
      }

      function advanceStreet() {
        if (ended) return;
        bets = { host: 0, guest: 0 };
        roundBet = 0; raiseCount = 0;
        acted = { host: false, guest: false };

        if (phase === 'preflop') {
          community.push(...[deck.pop(), deck.pop(), deck.pop()]);
          phase = 'flop';
        } else if (phase === 'flop') {
          community.push(deck.pop());
          phase = 'turn';
        } else if (phase === 'turn') {
          community.push(deck.pop());
          phase = 'river';
        } else if (phase === 'river') {
          doShowdown(); return;
        }

        // 포스트플랍: 논버튼이 먼저
        betTurn = button === 'host' ? 'guest' : 'host';
        TexasHoldemBoard.update({
          phase, community, pot, chips: { ...chips }, bets: { ...bets },
          roundBet, betTurn, raiseCount,
          toCall: 0, button,
        });

        if (betTurn !== playerRole) setTimeout(doAIAction, 1000);
      }

      function doShowdown() {
        if (ended) return;
        const { evaluateBest, compareHandValues } = AITexasHoldem;

        // compareHandValues 내부에 있음
        function cmp(a, b) {
          for (let i=0;i<Math.max(a.length,b.length);i++){const d=(a[i]||0)-(b[i]||0);if(d!==0)return d;}return 0;
        }

        const hv = evaluateBest([...hand.host,  ...community]);
        const gv = evaluateBest([...hand.guest, ...community]);
        const result = hv && gv ? cmp(hv.value, gv.value) : 0;

        let winner, reason;
        if (result > 0) {
          winner = 'host'; chips.host  += pot; reason = hv ? hv.name : '';
        } else if (result < 0) {
          winner = 'guest'; chips.guest += pot; reason = gv ? gv.name : '';
        } else {
          const half = Math.floor(pot/2);
          chips.host += half; chips.guest += pot-half;
          winner = null; reason = '타이';
        }
        pot = 0;

        const winnerColor = winner === null ? null
          : winner === playerRole ? playerColor
          : (playerColor==='white'?'black':'white');

        TexasHoldemBoard.showShowdown({
          hands: hand, community,
          hostHandName:  hv ? hv.name : '',
          guestHandName: gv ? gv.name : '',
          winner: winnerColor, reason,
          chips: { ...chips },
        });

        if (window.Sound) Sound.play('move');

        setTimeout(() => {
          if (!ended) { button = button==='host'?'guest':'host'; startRound(); }
        }, 4000);
      }

      // 프리플랍에서 AI가 먼저 행동해야 할 수도 있음
      if (betTurn !== playerRole) setTimeout(doAIAction, 800);
    }

    startRound();
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
