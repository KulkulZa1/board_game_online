// game-checkers.js — Checkers GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.checkers = (function () {

  function initBoard(state, myColor, handleAction /*, myRole */) {
    const validMoves = state.validMoves || [];
    CheckersBoard.init({ board: state.board, myColor, onMove: handleAction, validMoves, mustJump: state.mustJump });
    return { board: CheckersBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    CheckersBoard.init({
      board:         state.board,
      myColor:       'white',
      onMove:        handleAction,
      spectatorMode: true,
      validMoves:    [],
      mustJump:      state.mustJump,
    });
    CheckersBoard.setMyTurn(false);
    return { board: CheckersBoard };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    CheckersBoard.init({
      board:      state.board,
      myColor,
      onMove:     handleAction,
      validMoves: state.validMoves || [],
      mustJump:   state.mustJump,
    });
    CheckersBoard.setMyTurn(myColor === (state.currentTurn || 'white'));
    return { board: CheckersBoard };
  }

  function onMoveMade({ board, move, validMoves, mustJump }) {
    CheckersBoard.updateAfterMove(board, move, validMoves, mustJump);
    if (typeof Sound !== 'undefined') Sound.play(move.captured ? 'capture' : 'move');
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

    const aiColor = playerColor === 'white' ? 'black' : 'white';

    function makeInitialBoard() {
      const b = Array.from({length:8}, () => Array(8).fill(null));
      for (let r=0; r<3; r++) for (let c=0; c<8; c++)
        if ((r+c)%2===1) b[r][c] = { color:'black', king:false };
      for (let r=5; r<8; r++) for (let c=0; c<8; c++)
        if ((r+c)%2===1) b[r][c] = { color:'white', king:false };
      return b;
    }

    let soloBoard  = makeInitialBoard();
    let soloTurn   = 'white';
    let soloGameOver = false;
    let aiThinking   = false;

    setGameStatus('active');
    switchBoardArea('checkers');

    const { moves: initMoves, mustJump: initMJ } = AICheckers.getValidMoves(soloBoard, playerColor);
    CheckersBoard.init({ board: soloBoard, myColor: playerColor, onMove: handlePlayerMove, validMoves: initMoves, mustJump: initMJ });
    CheckersBoard.setMyTurn(playerColor === 'white');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'white' ? '빨강 (선공)' : '검정 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot ' + playerColor;
    oppDot.className     = 'player-color-dot ' + aiColor;

    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    setActiveBoard(CheckersBoard);
    updateTurnIndicator(soloTurn);

    document.getElementById('resign-btn').onclick = () => {
      if (soloGameOver) return;
      if (!confirm('게임을 포기하시겠습니까?')) return;
      endSoloGame(aiColor, 'resign');
    };

    if (playerColor !== 'white') setTimeout(aiMove, 600);

    function handlePlayerMove(move) {
      if (soloGameOver || aiThinking) return;
      if (soloTurn !== playerColor) return;
      soloBoard = AICheckers.applyMove(soloBoard, {
        from: { r: move.fromRow, c: move.fromCol },
        to:   { r: move.toRow,   c: move.toCol   },
        captured: move.capturedRow != null ? { r: move.capturedRow, c: move.capturedCol } : null,
      });
      const { moves: nm, mustJump: nj } = AICheckers.getValidMoves(soloBoard, playerColor);
      CheckersBoard.updateAfterMove(soloBoard, move, nm, nj);
      if (typeof Sound !== 'undefined') Sound.play(move.captured ? 'capture' : 'move');
      const { moves: aiMoves } = AICheckers.getValidMoves(soloBoard, aiColor);
      if (!aiMoves.length) { endSoloGame(playerColor, 'no-moves'); return; }
      soloTurn = aiColor;
      updateTurnIndicator(soloTurn);
      CheckersBoard.setMyTurn(false);
      aiThinking = true;
      setTimeout(aiMove, 400 + Math.random() * 300);
    }

    function aiMove() {
      if (soloGameOver) return;
      const best = AICheckers.getBestMove(soloBoard, aiColor);
      if (!best) { endSoloGame(playerColor, 'no-moves'); return; }
      soloBoard = AICheckers.applyMove(soloBoard, best);
      const fakeMove = { fromRow: best.from.r, fromCol: best.from.c, toRow: best.to.r, toCol: best.to.c,
                         captured: !!best.captured, capturedRow: best.captured?.r, capturedCol: best.captured?.c };
      const { moves: pm, mustJump: pj } = AICheckers.getValidMoves(soloBoard, playerColor);
      CheckersBoard.updateAfterMove(soloBoard, fakeMove, pm, pj);
      if (typeof Sound !== 'undefined') Sound.play(best.captured ? 'capture' : 'move');
      aiThinking = false;
      if (!pm.length) { endSoloGame(aiColor, 'no-moves'); return; }
      soloTurn = playerColor;
      updateTurnIndicator(soloTurn);
      CheckersBoard.setMyTurn(true);
    }

    function endSoloGame(winner, reason) {
      soloGameOver = true;
      setGameStatus('finished');
      CheckersBoard.setMyTurn(false);
      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('checkers', result);
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
