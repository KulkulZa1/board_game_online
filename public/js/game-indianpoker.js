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

  function startSolo(playerColor, helpers) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
    } = helpers;

    const ANTE = 5;
    let playerChips = 50, aiChips = 50;
    let pot = 0, raiseCount = 0;
    let playerCard, aiCard;
    let round = 1;
    let soloGameOver = false;
    // 인디언 포커: 호스트(guest role)가 먼저 배팅
    const playerRole = 'guest'; // 솔로에서 플레이어는 guest 역할 (먼저 배팅)

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

    startRound();

    function startRound() {
      if (soloGameOver) return;
      playerCard  = AIIndianPoker.dealCard();
      aiCard      = AIIndianPoker.dealCard();
      pot         = ANTE * 2;
      raiseCount  = 0;
      playerChips -= ANTE;
      aiChips     -= ANTE;

      // showDeal: 내 카드는 ?, 상대 카드는 보임
      IndianPoker.showDeal({
        opponentCard: aiCard,   // 플레이어는 AI 카드를 봄
        pot,
        chips: { host: aiChips, guest: playerChips },
        ante: ANTE,
        roundNum: round,
      });
      updateTurnIndicator('white'); // 플레이어 차례
    }

    function handlePlayerAction({ action, amount }) {
      if (soloGameOver) return;
      if (action === 'fold') {
        aiChips += pot;
        pot = 0;
        endRound(false, 'fold');
        return;
      }
      if (action === 'raise') {
        const raiseAmt = 5;
        playerChips -= raiseAmt;
        pot += raiseAmt;
        raiseCount++;
      }
      // AI responds
      setTimeout(() => {
        const aiAction = AIIndianPoker.decideAction(aiCard, playerCard, pot, raiseCount);
        if (aiAction === 'fold') {
          playerChips += pot;
          pot = 0;
          endRound(true, 'fold');
        } else if (aiAction === 'raise' && raiseCount < 3) {
          aiChips -= 5;
          pot += 5;
          raiseCount++;
          // Player auto-calls for simplicity in solo mode
          endRound(playerCard > aiCard, 'showdown');
        } else {
          endRound(playerCard > aiCard, 'showdown');
        }
      }, 800);
    }

    function endRound(playerWon, reason) {
      if (reason === 'showdown') {
        if (playerWon) playerChips += pot;
        else aiChips += pot;
        pot = 0;
      }

      // Show result
      setTimeout(() => {
        if (playerChips <= 0 || aiChips <= 0 || round >= 5) {
          soloGameOver = true;
          setGameStatus('finished');
          const winner = playerChips >= aiChips ? 'white' : 'black';
          if (typeof Stats !== 'undefined') {
            Stats.record('indianpoker', playerChips >= aiChips ? 'win' : 'loss');
          }
          showGameOver(winner, 'out-of-chips');
          document.getElementById('rematch-btn').textContent = '다시하기';
          document.getElementById('rematch-btn').onclick = () => location.reload();
        } else {
          round++;
          startRound();
        }
      }, 1200);
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, startSolo };
})();
