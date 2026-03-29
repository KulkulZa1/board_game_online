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

    startRound();

    function startRound() {
      if (soloGameOver) return;

      // 덱 소진 확인
      if (deck.length < 2) {
        if (winCondition === 2) {
          // 덱 소진 → 칩 비교로 승패 결정
          soloGameOver = true;
          setGameStatus('finished');
          const winner = playerChips > aiChips ? 'white'
                       : playerChips < aiChips ? 'black'
                       : 'white'; // 동점이면 AI(host) 승
          if (typeof Stats !== 'undefined') {
            Stats.record('indianpoker', playerChips > aiChips ? 'win' : playerChips < aiChips ? 'loss' : 'draw');
          }
          showGameOver(winner, 'deck-exhausted');
          document.getElementById('rematch-btn').textContent = '다시하기';
          document.getElementById('rematch-btn').onclick = () => location.reload();
          return;
        }
        // winCondition===1: 칩 소진까지 계속 → 덱 새로 생성
        deck = AIIndianPoker.createDeck(numDecks);
      }

      playerCard  = deck.pop();
      aiCard      = deck.pop();
      pot         = ANTE * 2;
      raiseCount  = 0;
      playerChips -= ANTE;
      aiChips     -= ANTE;

      // showDeal: 내 카드는 ?, 상대(AI) 카드는 보임
      IndianPoker.showDeal({
        opponentCard: aiCard,
        pot,
        chips: { host: aiChips, guest: playerChips },
        ante:     ANTE,
        roundNum: round,
      });
      updateTurnIndicator('white');

      setTimeout(() => {
        if (soloGameOver) return;
        IndianPoker.showBetTurn({
          betTurn: playerRole,
          pot,
          chips: { host: aiChips, guest: playerChips },
          lastAction: null,
        });
      }, 1000);
    }

    function handlePlayerAction({ action }) {
      if (soloGameOver) return;

      if (action === 'fold') {
        aiChips += pot;
        pot = 0;
        // 10을 가지고 폴드하면 페널티
        const penalty = playerCard.rank === 10 ? FOLD_PENALTY : 0;
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

      if (action === 'raise') {
        const raiseAmt = 5;
        playerChips -= raiseAmt;
        pot         += raiseAmt;
        raiseCount++;
      }
      // call 또는 raise 후 AI 응답
      setTimeout(() => {
        const aiAction = AIIndianPoker.decideAction(aiCard.rank, playerCard.rank, pot, raiseCount);
        if (aiAction === 'fold') {
          playerChips += pot;
          pot = 0;
          // AI가 10을 가지고 폴드하면 AI에게 페널티
          const penalty = aiCard.rank === 10 ? FOLD_PENALTY : 0;
          if (penalty > 0) {
            aiChips     -= penalty;
            playerChips += penalty;
            if (typeof showToastMsg === 'function') {
              showToastMsg(`AI가 10을 가지고 폴드! ${penalty}칩 추가 획득`);
            }
          }
          endRound('fold', true, penalty);
        } else if (aiAction === 'raise' && raiseCount < 3) {
          aiChips -= 5;
          pot     += 5;
          raiseCount++;
          // 플레이어 자동 콜 후 쇼다운
          endRound('showdown', null, 0);
        } else {
          endRound('showdown', null, 0);
        }
      }, 800);
    }

    function endRound(reason, playerWonFold, penalty) {
      let playerWon;

      if (reason === 'fold') {
        playerWon = playerWonFold;
        // 칩은 이미 위에서 처리됨
      } else {
        // 쇼다운: A > 10 특수 규칙 적용
        const cmp = AIIndianPoker.compareRanks(playerCard.rank, aiCard.rank);
        playerWon = cmp > 0; // 동점이면 AI(host) 승
        if (playerWon) playerChips += pot;
        else           aiChips     += pot;
        pot = 0;
      }

      const chips = { host: aiChips, guest: playerChips };

      IndianPoker.showShowdown({
        hostCard:  { rank: aiCard.rank,     suit: aiCard.suit     },
        guestCard: { rank: playerCard.rank, suit: playerCard.suit },
        winner:    playerWon ? 'black' : 'white', // 'black'=guest=플레이어, 'white'=host=AI
        reason,
        pot:   0,
        chips,
        roundNum: round,
      });
      pot = 0;

      setTimeout(() => {
        if (playerChips <= 0 || aiChips <= 0) {
          soloGameOver = true;
          setGameStatus('finished');
          const winner = playerChips >= aiChips ? 'white' : 'black';
          if (typeof Stats !== 'undefined') {
            Stats.record('indianpoker', playerChips > aiChips ? 'win' : playerChips < aiChips ? 'loss' : 'draw');
          }
          showGameOver(winner, 'out-of-chips');
          document.getElementById('rematch-btn').textContent = '다시하기';
          document.getElementById('rematch-btn').onclick = () => location.reload();
        } else {
          round++;
          startRound();
        }
      }, 2000);
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, startSolo };
})();
