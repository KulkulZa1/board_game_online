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

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn };
})();
