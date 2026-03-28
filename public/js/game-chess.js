// game-chess.js — Chess GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.chess = (function () {
  let _chess = null;

  function initBoard(state, myColor, handleAction /*, myRole */) {
    _chess = new Chess();
    if (state.fen) _chess.load(state.fen);
    Board.init({ chess: _chess, orientation: myColor, myColor, onMove: handleAction });
    return { board: Board, chess: _chess };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    _chess = new Chess();
    if (state.fen) _chess.load(state.fen);
    Board.init({
      chess:         _chess,
      orientation:   hostColor,
      myColor:       hostColor,
      onMove:        handleAction,
      spectatorMode: true,
    });
    Board.setMyTurn(false);
    return { board: Board, chess: _chess };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    _chess = new Chess();
    Board.init({ chess: _chess, orientation: myColor, myColor, onMove: handleAction });
    Board.setMyTurn(myColor === 'white');
    return { board: Board, chess: _chess };
  }

  function onMoveMade({ fen, move }) {
    _chess.load(fen);
    Board.updateAfterMove(fen, move);
    if (typeof Sound !== 'undefined' && !_chess.in_check()) {
      Sound.play(move.captured ? 'capture' : 'move');
    }
  }

  // chess.turn() returns 'w'|'b'; myColor is 'white'|'black'
  function getMyTurn(state, myColor) {
    return _chess ? _chess.turn() === myColor[0] : false;
  }

  function startSolo(playerColor, helpers) {
    const {
      switchBoardArea, updateTurnIndicator, showGameOver,
      setActiveBoard, setGameStatus,
      connectingOverlay, spectatorJoinOverlay,
      myLabel, oppLabel, myDot, oppDot,
    } = helpers;

    const aiColor = playerColor === 'white' ? 'black' : 'white';
    _chess = new Chess();
    let soloGameOver = false;
    let aiThinking   = false;

    setGameStatus('active');
    switchBoardArea('chess');

    Board.init({ chess: _chess, orientation: playerColor, myColor: playerColor, onMove: handlePlayerMove });
    Board.setMyTurn(playerColor === 'white');

    connectingOverlay.style.display    = 'none';
    spectatorJoinOverlay.style.display = 'none';

    const colorLabel = playerColor === 'white' ? '백 (선공)' : '흑 (후공)';
    myLabel.textContent  = `나 (${colorLabel})`;
    oppLabel.textContent = 'AI 봇';
    myDot.className      = 'player-color-dot ' + playerColor;
    oppDot.className     = 'player-color-dot ' + aiColor;

    document.getElementById('resign-btn').style.display = '';
    document.getElementById('draw-btn').style.display   = 'none';
    document.getElementById('leave-btn').style.display  = '';

    setActiveBoard(Board);
    updateTurnIndicator(playerColor === 'white' ? 'white' : 'black');

    document.getElementById('resign-btn').onclick = () => {
      if (soloGameOver) return;
      if (!confirm('게임을 포기하시겠습니까?')) return;
      endSoloGame(aiColor, 'resign');
    };

    if (playerColor !== 'white') setTimeout(aiMove, 600);

    function handlePlayerMove({ from, to, promotion }) {
      if (soloGameOver || aiThinking) return;
      if (_chess.turn() !== playerColor[0]) return;
      const move = _chess.move({ from, to, promotion: promotion || 'q' });
      if (!move) return;
      Board.updateAfterMove(_chess.fen(), move);
      if (_chess.in_checkmate()) { endSoloGame(playerColor, 'checkmate'); return; }
      if (_chess.in_draw() || _chess.in_stalemate()) { endSoloGame('draw', 'draw'); return; }
      aiThinking = true;
      updateTurnIndicator(aiColor);
      Board.setMyTurn(false);
      setTimeout(aiMove, 400 + Math.random() * 300);
    }

    function aiMove() {
      if (soloGameOver) return;
      const move = AIChess.getBestMove(_chess, aiColor);
      if (!move) { endSoloGame(playerColor, 'no-moves'); return; }
      _chess.move(move);
      Board.updateAfterMove(_chess.fen(), move);
      aiThinking = false;
      if (_chess.in_checkmate()) { endSoloGame(aiColor, 'checkmate'); return; }
      if (_chess.in_draw() || _chess.in_stalemate()) { endSoloGame('draw', 'draw'); return; }
      updateTurnIndicator(playerColor);
      Board.setMyTurn(true);
    }

    function endSoloGame(winner, reason) {
      soloGameOver = true;
      setGameStatus('finished');
      Board.setMyTurn(false);
      if (typeof Stats !== 'undefined') {
        const result = winner === playerColor ? 'win' : winner === 'draw' ? 'draw' : 'loss';
        Stats.record('chess', result);
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
