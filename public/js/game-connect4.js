// game-connect4.js — Connect4 GameHandler + Solo Mode
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.connect4 = (function () {

  function initBoard(state, myColor, handleAction /*, myRole */) {
    Connect4Board.init({ board: state.board, myColor, onMove: handleAction, colHeights: state.colHeights, boardSize: state.boardSize });
    return { board: Connect4Board };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    Connect4Board.init({
      board:         state.board,
      myColor:       'white',
      onMove:        handleAction,
      spectatorMode: true,
      colHeights:    state.colHeights,
      boardSize:     state.boardSize,
    });
    Connect4Board.setMyTurn(false);
    return { board: Connect4Board };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    Connect4Board.init({ board: state.board, myColor, onMove: handleAction, colHeights: state.colHeights, boardSize: state.boardSize });
    Connect4Board.setMyTurn(myColor === 'white');
    return { board: Connect4Board };
  }

  function onMoveMade({ board, move, colHeights }) {
    Connect4Board.updateAfterMove(board, move, colHeights);
    if (typeof Sound !== 'undefined') Sound.play('move');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  // =========================================================
  // ========== 솔로 모드 (vs AI) ==========
  // helpers = {
  //   switchBoardArea, updateTurnIndicator, showGameOver,
  //   setActiveBoard, setGameStatus,
  //   connectingOverlay, spectatorJoinOverlay,
  //   myLabel, oppLabel, myDot, oppDot,
  // }
  // =========================================================
  function startSolo(playerColor, helpers, options) {
    options = options || {};
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
      appendMoveToList,
    } = helpers;

    const bs = (options.boardSize && options.boardSize.rows) ? options.boardSize : { rows: 6, cols: 7 };
    const ROWS = bs.rows;
    const COLS = bs.cols;

    const aiColor = playerColor === 'white' ? 'black' : 'white';

    let soloBoard      = [];
    let soloColHeights = Array(COLS).fill(0);
    let soloTurn       = 'white';
    let soloGameOver   = false;
    let aiThinking     = false;
    let moveNum        = 0;

    function makeSoloBoard() {
      return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    // 초기화
    soloBoard      = makeSoloBoard();
    soloColHeights = Array(COLS).fill(0);
    soloTurn       = 'white';
    soloGameOver   = false;
    aiThinking     = false;

    setGameStatus('active');
    switchBoardArea('connect4');

    Connect4Board.init({
      board:      soloBoard,
      myColor:    playerColor,
      onMove:     handleSoloPlayerMove,
      colHeights: soloColHeights,
      boardSize:  { rows: ROWS, cols: COLS },
    });
    Connect4Board.setMyTurn(playerColor === 'white');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'white' ? '빨강 (선공)' : '노랑 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot ' + playerColor;
    oppDot.className     = 'player-color-dot ' + aiColor;

    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    setActiveBoard(Connect4Board);
    updateTurnIndicator(soloTurn);

    // 솔로 모드 기권 처리
    document.getElementById('resign-btn').onclick = () => {
      if (soloGameOver) return;
      if (!confirm('게임을 포기하고 다시 시작하시겠습니까?')) return;
      endSoloGame(aiColor, 'resign');
    };

    // AI가 선공이면 먼저 두게
    if (playerColor !== 'white') {
      setTimeout(soloAIMove, 600);
    }

    // --- 내부 함수 ---

    function handleSoloPlayerMove({ col }) {
      if (soloGameOver || aiThinking) return;
      if (soloTurn !== playerColor) return;
      if (soloColHeights[col] >= ROWS) return;

      applySoloMove(col, playerColor);

      if (AIConnect4.checkWin(soloBoard, playerColor)) {
        endSoloGame(playerColor, 'four-in-a-row');
        return;
      }
      if (soloColHeights.every(h => h >= ROWS)) {
        endSoloGame('draw', 'board-full');
        return;
      }

      soloTurn = aiColor;
      updateTurnIndicator(soloTurn);
      Connect4Board.setMyTurn(false);
      aiThinking = true;
      setTimeout(soloAIMove, 400 + Math.random() * 300);
    }

    function soloAIMove() {
      if (soloGameOver) return;
      const col = AIConnect4.getBestMove(soloBoard, soloColHeights, aiColor, playerColor);
      applySoloMove(col, aiColor);
      aiThinking = false;

      if (AIConnect4.checkWin(soloBoard, aiColor)) {
        endSoloGame(aiColor, 'four-in-a-row');
        return;
      }
      if (soloColHeights.every(h => h >= ROWS)) {
        endSoloGame('draw', 'board-full');
        return;
      }

      soloTurn = playerColor;
      updateTurnIndicator(soloTurn);
      Connect4Board.setMyTurn(true);
    }

    function applySoloMove(col, color) {
      const row = ROWS - 1 - soloColHeights[col];
      soloBoard[row][col] = color;
      soloColHeights[col]++;
      moveNum++;
      Connect4Board.updateAfterMove(soloBoard, { col, color }, soloColHeights);
      if (typeof Sound !== 'undefined') Sound.play('move');
      if (typeof appendMoveToList === 'function') {
        const colLetter = String.fromCharCode(65 + col);
        appendMoveToList({ moveNum, color, notation: colLetter });
      }
    }

    function endSoloGame(winner, reason) {
      soloGameOver = true;
      setGameStatus('finished');
      Connect4Board.setMyTurn(false);

      if (winner !== 'draw') {
        const winCells = getSoloWinCells(soloBoard, winner);
        if (winCells.length) Connect4Board.highlightWin(winCells);
      }

      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('connect4', result);
      }

      if (typeof Sound !== 'undefined') {
        if (winner === 'draw')           Sound.play('draw');
        else if (winner === playerColor) Sound.play('win');
        else                             Sound.play('lose');
      }

      showGameOver(winner, reason);

      document.getElementById('rematch-btn').textContent = '다시하기';
      document.getElementById('rematch-btn').onclick = () => location.reload();
    }

    function getSoloWinCells(board, color) {
      const dirs = [[0,1],[1,0],[1,1],[1,-1]];
      for (const [dr, dc] of dirs) {
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 7; c++) {
            if (board[r][c] !== color) continue;
            const cells = [[r, c]];
            for (let i = 1; i < 4; i++) {
              const nr = r + dr*i, nc = c + dc*i;
              if (nr < 0 || nr >= 6 || nc < 0 || nc >= 7 || board[nr][nc] !== color) break;
              cells.push([nr, nc]);
            }
            if (cells.length === 4) return cells.map(([rr, cc]) => ({ row: rr, col: cc }));
          }
        }
      }
      return [];
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
