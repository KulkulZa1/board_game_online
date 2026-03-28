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

  function startSolo(playerColor, helpers) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
    } = helpers;

    const aiColor  = playerColor === 'black' ? 'white' : 'black';
    const size     = 15;
    let soloBoard  = _emptyOmokBoard({ size });
    let soloTurn   = 'black'; // 흑 선공
    let soloGameOver = false;
    let aiThinking   = false;

    setGameStatus('active');
    switchBoardArea('omok');

    OmokBoard.init({ board: soloBoard, myColor: playerColor, onMove: handlePlayerMove });
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

    if (playerColor !== 'black') setTimeout(aiMove, 600);

    function handlePlayerMove({ row, col }) {
      if (soloGameOver || aiThinking) return;
      if (soloTurn !== playerColor) return;
      if (soloBoard[row][col]) return;
      soloBoard[row][col] = playerColor;
      OmokBoard.updateAfterMove(soloBoard, { row, col });
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
      OmokBoard.updateAfterMove(soloBoard, move);
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
