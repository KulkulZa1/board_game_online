// game-applegame.js — 사과게임 GameHandler + 솔로 모드
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.applegame = (function () {

  // ===== 멀티플레이어 =====

  function initBoard(state, myColor, handleAction /*, myRole */) {
    AppleGameBoard.init({
      board:   state.board,
      myColor,
      onMove:  handleAction,
      scores:  state.scores || { white: 0, black: 0 },
    });
    return { board: AppleGameBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    AppleGameBoard.init({
      board:         state.board,
      myColor:       'white',
      onMove:        handleAction,
      spectatorMode: true,
      scores:        state.scores || { white: 0, black: 0 },
    });
    AppleGameBoard.setMyTurn(false);
    return { board: AppleGameBoard };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    AppleGameBoard.init({
      board:   state.board,
      myColor,
      onMove:  handleAction,
      scores:  state.scores || { white: 0, black: 0 },
    });
    AppleGameBoard.setMyTurn(state.currentTurn === myColor);
    return { board: AppleGameBoard };
  }

  function onMoveMade({ board, move, scores }) {
    AppleGameBoard.updateAfterMove(board, move, scores);
    if (typeof Sound !== 'undefined') Sound.play('move');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  // ===== 솔로 모드 =====

  function startSolo(playerColor, helpers, options) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
      appendMoveToList,
    } = helpers;

    const aiColor = playerColor === 'white' ? 'black' : 'white';
    const SOLO_DURATION_MS = 2 * 60 * 1000;

    let soloBoard    = generateAppleBoard();
    let soloScores   = { white: 0, black: 0 };
    let soloTurn     = 'white';
    let soloGameOver = false;
    let aiThinking   = false;
    let moveNum      = 0;
    let timerMs      = SOLO_DURATION_MS;
    let timerInterval = null;

    setGameStatus('active');
    switchBoardArea('applegame');

    AppleGameBoard.init({
      board:   soloBoard,
      myColor: playerColor,
      onMove:  handleSoloPlayerMove,
      scores:  soloScores,
    });
    AppleGameBoard.setMyTurn(playerColor === 'white');

    if (connectingOverlay)    connectingOverlay.style.display    = 'none';
    if (spectatorJoinOverlay) spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'white' ? '백 (선공)' : '흑 (후공)';
    const aiLabel    = aiColor    === 'white' ? '백 (선공)' : '흑 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = `AI 봇 (${aiLabel})`;
    if (myDot)  myDot.className  = 'player-color-dot ' + playerColor;
    if (oppDot) oppDot.className = 'player-color-dot ' + aiColor;

    const resignBtn = document.getElementById('resign-btn');
    const drawBtn   = document.getElementById('draw-btn');
    const leaveBtn  = document.getElementById('leave-btn');
    if (resignBtn) resignBtn.style.display = '';
    if (drawBtn)   drawBtn.style.display   = 'none';
    if (leaveBtn)  leaveBtn.style.display  = '';

    setActiveBoard(AppleGameBoard);
    updateTurnIndicator(soloTurn);

    _updateTimerDisplay();
    timerInterval = setInterval(() => {
      if (soloGameOver) { clearInterval(timerInterval); return; }
      timerMs -= 1000;
      _updateTimerDisplay();
      if (timerMs <= 0) {
        clearInterval(timerInterval);
        endSoloGame('timeout');
      }
    }, 1000);

    if (resignBtn) {
      resignBtn.onclick = () => {
        if (soloGameOver) return;
        if (!confirm('게임을 포기하시겠습니까?')) return;
        endSoloGame('resign');
      };
    }

    // AI가 선공이면 먼저 실행
    if (playerColor !== 'white') {
      setTimeout(soloAIMove, 700);
    }

    // ---- 내부 함수 ----

    function _updateTimerDisplay() {
      const sec = Math.max(0, Math.ceil(timerMs / 1000));
      const m   = Math.floor(sec / 60);
      const s   = sec % 60;
      const str = `${m}:${s.toString().padStart(2, '0')}`;
      const timerEl = document.getElementById('my-timer');
      if (timerEl) timerEl.textContent = str;
      const oppEl = document.getElementById('opponent-timer');
      if (oppEl)   oppEl.textContent   = '-';
    }

    function handleSoloPlayerMove(rect) {
      if (soloGameOver || aiThinking) return;
      if (soloTurn !== playerColor) return;
      applySoloMove(rect, playerColor);

      if (!AIAppleGame.hasAnyMove(soloBoard)) {
        endSoloGame('no-moves');
        return;
      }

      soloTurn = aiColor;
      updateTurnIndicator(soloTurn);
      AppleGameBoard.setMyTurn(false);
      aiThinking = true;
      setTimeout(soloAIMove, 500 + Math.random() * 400);
    }

    function soloAIMove() {
      if (soloGameOver) return;
      const move = AIAppleGame.getBestMove(soloBoard);
      if (!move) {
        aiThinking = false;
        endSoloGame('no-moves');
        return;
      }
      applySoloMove(move, aiColor);
      aiThinking = false;

      if (!AIAppleGame.hasAnyMove(soloBoard)) {
        endSoloGame('no-moves');
        return;
      }

      soloTurn = playerColor;
      updateTurnIndicator(soloTurn);
      AppleGameBoard.setMyTurn(true);
    }

    function applySoloMove(rect, color) {
      for (let r = rect.row1; r <= rect.row2; r++) {
        for (let c = rect.col1; c <= rect.col2; c++) {
          soloBoard[r][c] = null;
        }
      }
      const count = (rect.row2 - rect.row1 + 1) * (rect.col2 - rect.col1 + 1);
      soloScores[color] += count;
      moveNum++;

      AppleGameBoard.updateAfterMove(soloBoard, rect, { ...soloScores });
      if (typeof Sound !== 'undefined') Sound.play('move');

      if (typeof appendMoveToList === 'function') {
        appendMoveToList({
          moveNum,
          color,
          notation: `(${rect.row1 + 1},${rect.col1 + 1})→(${rect.row2 + 1},${rect.col2 + 1}) +${count}`,
        });
      }
    }

    function endSoloGame(reason) {
      if (soloGameOver) return;
      soloGameOver = true;
      clearInterval(timerInterval);
      setGameStatus('finished');
      AppleGameBoard.setMyTurn(false);

      let winner;
      if (reason === 'resign') {
        winner = aiColor;
      } else {
        const pw = soloScores[playerColor];
        const aw = soloScores[aiColor];
        if (pw > aw)      winner = playerColor;
        else if (aw > pw) winner = aiColor;
        else              winner = 'draw';
      }

      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('applegame', result);
      }
      if (typeof Sound !== 'undefined') {
        if (winner === 'draw')           Sound.play('draw');
        else if (winner === playerColor) Sound.play('win');
        else                             Sound.play('lose');
      }

      showGameOver(winner, reason);

      const rematchBtn = document.getElementById('rematch-btn');
      if (rematchBtn) {
        rematchBtn.textContent = '다시하기';
        rematchBtn.onclick = () => location.reload();
      }
    }
  }

  // ===== 솔로용 보드 생성 (서버와 동일한 알고리즘) =====

  function generateAppleBoard() {
    const ROWS = 10, COLS = 17;
    const board = [];
    let total = 0;

    for (let r = 0; r < ROWS; r++) {
      board[r] = [];
      for (let c = 0; c < COLS; c++) {
        const v = Math.floor(Math.random() * 9) + 1;
        board[r][c] = v;
        total += v;
      }
    }

    const rem = total % 10;
    if (rem !== 0) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cur = board[r][c];
          if (cur - rem >= 1)         { board[r][c] -= rem;       return board; }
          if (cur + (10 - rem) <= 9)  { board[r][c] += (10 - rem); return board; }
        }
      }
      // 폴백: 여러 셀에 분산
      let r2 = rem;
      for (let r = 0; r < ROWS && r2 > 0; r++) {
        for (let c = 0; c < COLS && r2 > 0; c++) {
          const d = Math.min(r2, board[r][c] - 1);
          if (d > 0) { board[r][c] -= d; r2 -= d; }
        }
      }
    }
    return board;
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
