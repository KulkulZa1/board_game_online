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

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn };
})();
