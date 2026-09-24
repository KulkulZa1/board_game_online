// game-indianpoker.js — Indian Poker GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.indianpoker = (function () {

  function initBoard(state, myColor, handleAction, myRole) {
    IndianPoker.init({ myRole, onAction: handleAction });
    return { board: IndianPoker };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    IndianPoker.init({ myRole: 'spectator', onAction: () => {} });
    if (state.hands && state.hands.host && state.hands.guest) {
      IndianPoker.showDeal({
        opponentCard: state.hands.guest,
        pot:          state.pot      || 0,
        chips:        state.chips    || {},
        ante:         5,
        roundNum:     1,
      });
    }
    return { board: IndianPoker };
  }

  function initGame(state, myColor, handleAction, myRole) {
    IndianPoker.init({ myRole, onAction: handleAction });
    return { board: IndianPoker };
  }

  // Indian Poker moves are handled via indianpoker:* socket events — no board update needed
  function onMoveMade() {}

  function startSolo(playerColor, helpers, options) {
    options = options || {};
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
      showToastMsg,
    } = helpers;

    const numDecks     = options.numDecks     || 2;
    const winCondition = options.winCondition || 2; // 1=칩 소진, 2=덱 소진 후 비교

    const ANTE       = 5;
    const FOLD_PENALTY = ANTE; // 10을 가지고 폴드 시 추가 손실
    let playerChips  = 50, aiChips = 50;
    let pot = 0, raiseCount = 0;
    let playerCard, aiCard;
    let round = 1;
    let soloGameOver = false;
    const playerRole = 'guest'; // 솔로에서 플레이어는 guest 역할 (먼저 배팅)

    // 덱 생성
    let deck = AIIndianPoker.createDeck(numDecks);

    setGameStatus('active');
    switchBoardArea('indianpoker');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    myLabel.textContent  = '나 (플레이어)';
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot white';
    oppDot.className     = 'player-color-dot black';

    document.getElementById('resign-btn').style.display = 'none';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    IndianPoker.init({ myRole: playerRole, onAction: handlePlayerAction });
    setActiveBoard(IndianPoker);
    updateTurnIndicator('white');

    // 게임오버 화면의 winner 는 '내 색(myColor)'과 비교된다. 혼자하기에서 내 색은 URL 의
    // ?color= 값이라 'white' 로 고정하면 안 된다 — 로비에서 다른 게임에 흑을 골라 둔 채
    // 인디언 포커를 시작하면 승패가 뒤집혀 보였다. (라운드 쇼다운 표시는 역할 기준: 게스트=플레이어)
    const oppColorOf = (c) => (c === 'white' ? 'black' : 'white');
    function finishSolo(reason) {
      soloGameOver = true;
      setGameStatus('finished');
      const result = playerChips > aiChips ? 'win' : playerChips < aiChips ? 'loss' : 'draw';
      const winner = result === 'win' ? playerColor : result === 'loss' ? oppColorOf(playerColor) : 'draw';
      if (typeof Stats !== 'undefined') Stats.record('indianpoker', result);
      showGameOver(winner, reason);
      document.getElementById('rematch-btn').textContent = '다시하기';
      document.getElementById('rematch-btn').onclick = () => location.reload();
    }

    // 이번 라운드에 각자 건 칩 — 콜은 '차액을 내는 것'이어야 한다.
    // ⚠ 예전엔 콜이 공짜였다. AI 가 레이즈하면 플레이어가 한 푼 안 내고 '자동 콜',
    //   플레이어가 레이즈하면 AI 가 한 푼 안 내고 콜 — 모든 레이즈가 일방적 기부였다.
    let playerBet = 0, aiBet = 0, awaitingPlayer = false;
    function payPlayer(n) { const a = Math.max(0, Math.min(n, playerChips)); playerChips -= a; playerBet += a; pot += a; }
    function payAI(n)     { const a = Math.max(0, Math.min(n, aiChips));     aiChips     -= a; aiBet     += a; pot += a; }
    const chipsView = () => ({ host: aiChips, guest: playerChips });

    // ↑ 위 let/const 는 반드시 첫 startRound() 호출보다 앞에 있어야 한다 (TDZ).
    startRound();

    function startRound() {
      if (soloGameOver) return;

      // 앤티를 낼 수 없으면 끝 (온라인과 같은 규칙 — 예전엔 칩이 음수가 됐다)
      if (playerChips < ANTE || aiChips < ANTE) { finishSolo('out-of-chips'); return; }

      // 덱 소진 확인
      if (deck.length < 2) {
        if (winCondition === 2) { finishSolo('deck-exhausted'); return; }   // 덱 소진 → 칩 비교
        // winCondition===1: 칩 소진까지 계속 → 덱 새로 생성
        deck = AIIndianPoker.createDeck(numDecks);
      }

      playerCard  = deck.pop();
      aiCard      = deck.pop();
      pot         = 0;
      raiseCount  = 0;
      playerBet   = 0;
      aiBet       = 0;
      playerChips -= ANTE;
      aiChips     -= ANTE;
      pot         = ANTE * 2;

      // showDeal: 내 카드는 ?, 상대(AI) 카드는 보임
      IndianPoker.showDeal({
        opponentCard: aiCard,
        pot,
        chips: chipsView(),
        ante:     ANTE,
        roundNum: round,
      });
      updateTurnIndicator('white');

      setTimeout(() => {
        if (soloGameOver) return;
        awaitingPlayer = true;
        IndianPoker.showBetTurn({ betTurn: playerRole, pot, chips: chipsView(), lastAction: null });
      }, 1000);
    }

    // 플레이어(게스트)가 먼저 행동한다. 규칙은 온라인 서버와 같다:
    //   레이즈 = 차액을 맞추고 5 더 · 걸린 베팅을 맞춘 콜 = 쇼다운 · 첫 행동 체크 = AI 차례
    function handlePlayerAction({ action }) {
      if (soloGameOver || !awaitingPlayer) return;
      awaitingPlayer = false;

      if (action === 'fold') {
        aiChips += pot;
        pot = 0;
        // 10을 가지고 폴드하면 페널티 (가진 만큼만)
        const penalty = playerCard.rank === 10 ? Math.min(FOLD_PENALTY, playerChips) : 0;
        if (penalty > 0) {
          playerChips -= penalty;
          aiChips     += penalty;
          if (typeof showToastMsg === 'function') {
            showToastMsg(`⚠️ 10을 가지고 폴드! ${penalty}칩 추가 손실`);
          }
        }
        endRound('fold', false, penalty);
        return;
      }

      if (action === 'raise' && raiseCount < 3 && playerChips >= Math.max(0, aiBet - playerBet) + 5) {
        payPlayer(Math.max(0, aiBet - playerBet) + 5);
        raiseCount++;
        aiRespond();
        return;
      }

      // 콜 (칩이 모자라거나 레이즈 상한이면 레이즈도 콜로 처리)
      const owed = aiBet - playerBet;
      if (owed > 0) { payPlayer(owed); endRound('showdown', null, 0); return; }   // 레이즈를 맞춤 → 쇼다운
      aiRespond();                                                                 // 첫 행동 체크 → AI 차례
    }

    function aiRespond() {
      setTimeout(() => {
        if (soloGameOver) return;
        // AI 는 자기 카드를 모른다 — 보이는 것(플레이어 카드)과 못 본 카드 묶음(남은 덱 + 자기 카드)만 넘긴다
        const unseen = deck.map((c) => c.rank).concat(aiCard.rank);
        const aiAction = AIIndianPoker.decideAction(playerCard.rank, unseen, pot, raiseCount, Math.max(0, playerBet - aiBet));
        if (aiAction === 'fold') {
          playerChips += pot;
          pot = 0;
          // AI가 10을 가지고 폴드하면 AI에게 페널티 (가진 만큼만)
          const penalty = aiCard.rank === 10 ? Math.min(FOLD_PENALTY, aiChips) : 0;
          if (penalty > 0) {
            aiChips     -= penalty;
            playerChips += penalty;
            if (typeof showToastMsg === 'function') {
              showToastMsg(`AI가 10을 가지고 폴드! ${penalty}칩 추가 획득`);
            }
          }
          endRound('fold', true, penalty);
          return;
        }
        const raiseCost = Math.max(0, playerBet - aiBet) + 5;
        if (aiAction === 'raise' && raiseCount < 3 && aiChips >= raiseCost) {
          payAI(raiseCost);
          raiseCount++;
          // 플레이어가 콜·폴드·재레이즈를 고른다 (예전엔 공짜 '자동 콜'로 곧장 쇼다운)
          awaitingPlayer = true;
          IndianPoker.showBetTurn({ betTurn: playerRole, pot, chips: chipsView(), lastAction: { role: 'host', action: 'raise' } });
          return;
        }
        // AI 콜 — 두 번째로 행동하므로 차액을 맞추면 베팅이 닫힌다
        payAI(Math.max(0, playerBet - aiBet));
        endRound('showdown', null, 0);
      }, 800);
    }

    function endRound(reason, playerWonFold, penalty) {
      let showdownWinner;   // 역할 기준 — 'black'=게스트=플레이어, 'white'=호스트=AI, 'draw'

      if (reason === 'fold') {
        showdownWinner = playerWonFold ? 'black' : 'white';
        // 칩은 이미 위에서 처리됨
      } else {
        // 쇼다운: A > 10 특수 규칙. 동점이면 팟을 나눈다 (온라인과 같음 — 홀수 칩은 먼저 행동한 쪽)
        const cmp = AIIndianPoker.compareRanks(playerCard.rank, aiCard.rank);
        if (cmp > 0)      { playerChips += pot; showdownWinner = 'black'; }
        else if (cmp < 0) { aiChips     += pot; showdownWinner = 'white'; }
        else {
          const half = Math.floor(pot / 2);
          aiChips     += half;
          playerChips += pot - half;
          showdownWinner = 'draw';
        }
        pot = 0;
      }

      IndianPoker.showShowdown({
        hostCard:  { rank: aiCard.rank,     suit: aiCard.suit     },
        guestCard: { rank: playerCard.rank, suit: playerCard.suit },
        winner:    showdownWinner,
        reason,
        pot:   0,
        chips: chipsView(),
        roundNum: round,
      });
      pot = 0;

      setTimeout(() => {
        if (playerChips <= 0 || aiChips <= 0) {
          finishSolo('out-of-chips');
        } else {
          round++;
          startRound();
        }
      }, 2000);
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, startSolo };
})();
