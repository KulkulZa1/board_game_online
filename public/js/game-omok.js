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

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn };
})();
