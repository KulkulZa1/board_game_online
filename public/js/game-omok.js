// game-omok.js — Omok GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.omok = (function () {

  function _emptyOmokBoard(boardSize) {
    const sz = (boardSize && boardSize.size) || 15;
    return Array(sz).fill(null).map(() => Array(sz).fill(null));
  }

  function initBoard(state, myColor, handleAction /*, myRole */) {
    OmokBoard.init({ board: state.board || _emptyOmokBoard(state.boardSize), myColor, onMove: handleAction, boardSize: state.boardSize });
    return { board: OmokBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    OmokBoard.init({
      board:         state.board || _emptyOmokBoard(state.boardSize),
      myColor:       'black',
      onMove:        handleAction,
      spectatorMode: true,
      boardSize:     state.boardSize,
    });
    OmokBoard.setMyTurn(false);
    return { board: OmokBoard };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    OmokBoard.init({ board: _emptyOmokBoard(state.boardSize), myColor, onMove: handleAction, boardSize: state.boardSize });
    OmokBoard.setMyTurn(myColor === 'black');
    return { board: OmokBoard };
  }

  function onMoveMade({ board, move }) {
    OmokBoard.updateAfterMove(board, move);
    if (typeof Sound !== 'undefined') Sound.play('move');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  function startSolo(playerColor, helpers, options) {
    options = options || {};
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
      appendMoveToList, setupUndo,
    } = helpers;

    const aiColor  = playerColor === 'black' ? 'white' : 'black';
    const size     = (options.boardSize && options.boardSize.size) ? options.boardSize.size : 15;
    let soloBoard  = _emptyOmokBoard({ size });
    let soloTurn   = 'black'; // 흑 선공
    let soloGameOver = false;
    let aiThinking   = false;
    let moveNum      = 0;
    let moveHistory  = []; // [{row,col,color}] 무르기용

    setGameStatus('active');
    switchBoardArea('omok');

    OmokBoard.init({ board: soloBoard, myColor: playerColor, onMove: handlePlayerMove, boardSize: { size } });
    OmokBoard.setMyTurn(playerColor === 'black');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'black' ? '흑 (선공)' : '백 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot ' + playerColor;
    oppDot.className     = 'player-color-dot ' + aiColor;

    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    setActiveBoard(OmokBoard);
    updateTurnIndicator(soloTurn);

    document.getElementById('resign-btn').onclick = () => {
      if (soloGameOver) return;
      if (!confirm('게임을 포기하시겠습니까?')) return;
      endSoloGame(aiColor, 'resign');
    };

    // 무르기 (마지막 플레이어 + AI 수 제거)
    if (typeof setupUndo === 'function') {
      setupUndo(() => {
        if (soloGameOver || aiThinking) return;
        if (moveHistory.length < 2) return;
        const aiLast = moveHistory.pop();
        const playerLast = moveHistory.pop();
        soloBoard[aiLast.row][aiLast.col] = null;
        soloBoard[playerLast.row][playerLast.col] = null;
        moveNum = Math.max(0, moveNum - 2);
        soloTurn = playerColor;
        aiThinking = false;
        OmokBoard.updateAfterMove(soloBoard, null);
        OmokBoard.setMyTurn(true);
        updateTurnIndicator(playerColor);
        // 수기록 마지막 2줄 제거
        const ml = document.getElementById('move-list');
        if (ml) { for (let i=0; i<2 && ml.lastElementChild; i++) ml.removeChild(ml.lastElementChild); }
      });
    }

    if (playerColor !== 'black') setTimeout(aiMove, 600);

    function handlePlayerMove({ row, col }) {
      if (soloGameOver || aiThinking) return;
      if (soloTurn !== playerColor) return;
      if (soloBoard[row][col]) return;
      soloBoard[row][col] = playerColor;
      moveHistory.push({ row, col, color: playerColor });
      moveNum++;
      OmokBoard.updateAfterMove(soloBoard, { row, col });
      if (typeof appendMoveToList === 'function') {
        appendMoveToList({ moveNum, col, row, color: playerColor });
      }
      if (typeof Sound !== 'undefined') Sound.play('move');
      if (AIOmok.checkWin(soloBoard, playerColor, size)) { endSoloGame(playerColor, 'five-in-a-row'); return; }
      soloTurn = aiColor;
      updateTurnIndicator(soloTurn);
      OmokBoard.setMyTurn(false);
      aiThinking = true;
      setTimeout(aiMove, 400 + Math.random() * 300);
    }

    function aiMove() {
      if (soloGameOver) return;
      const move = AIOmok.getBestMove(soloBoard, aiColor, size);
      if (!move) return;
      soloBoard[move.row][move.col] = aiColor;
      moveHistory.push({ row: move.row, col: move.col, color: aiColor });
      moveNum++;
      OmokBoard.updateAfterMove(soloBoard, move);
      if (typeof appendMoveToList === 'function') {
        appendMoveToList({ moveNum, col: move.col, row: move.row, color: aiColor });
      }
      if (typeof Sound !== 'undefined') Sound.play('move');
      aiThinking = false;
      if (AIOmok.checkWin(soloBoard, aiColor, size)) { endSoloGame(aiColor, 'five-in-a-row'); return; }
      soloTurn = playerColor;
      updateTurnIndicator(soloTurn);
      OmokBoard.setMyTurn(true);
    }

    function endSoloGame(winner, reason) {
      soloGameOver = true;
      setGameStatus('finished');
      OmokBoard.setMyTurn(false);
      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('omok', result);
      }
      if (typeof Sound !== 'undefined') {
        if (winner === 'draw') Sound.play('draw');
        else if (winner === playerColor) Sound.play('win');
        else Sound.play('lose');
      }
      showGameOver(winner, reason);
      document.getElementById('rematch-btn').textContent = '다시하기';
      document.getElementById('rematch-btn').onclick = () => location.reload();
    }
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
