// game-othello.js — Othello GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.othello = (function () {

  function computeValidMoves(board, color) {
    if (!board) return [];
    const opp  = color === 'white' ? 'black' : 'white';
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    const moves = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (board[row][col] !== null) continue;
        let valid = false;
        for (const [dr, dc] of dirs) {
          let r = row+dr, c = col+dc, cnt = 0;
          while (r>=0&&r<8&&c>=0&&c<8&&board[r][c]===opp) { r+=dr; c+=dc; cnt++; }
          if (cnt > 0 && r>=0&&r<8&&c>=0&&c<8&&board[r][c]===color) { valid=true; break; }
        }
        if (valid) moves.push({ row, col });
      }
    }
    return moves;
  }

  function initBoard(state, myColor, handleAction /*, myRole */) {
    const validMoves = computeValidMoves(state.board, myColor);
    OthelloBoard.init({ board: state.board, myColor, onMove: handleAction, validMoves });
    return { board: OthelloBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    OthelloBoard.init({
      board:         state.board,
      myColor:       'black',
      onMove:        handleAction,
      spectatorMode: true,
    });
    OthelloBoard.setMyTurn(false);
    return { board: OthelloBoard };
  }

  function initGame(state, myColor, handleAction /*, myRole */) {
    const validMoves = computeValidMoves(state.board, myColor);
    OthelloBoard.init({ board: state.board, myColor, onMove: handleAction, validMoves });
    OthelloBoard.setMyTurn(myColor === 'black');
    return { board: OthelloBoard };
  }

  function onMoveMade({ board, move, validMoves, pass }, showToastMsg) {
    OthelloBoard.updateAfterMove(board, move, validMoves);
    if (typeof Sound !== 'undefined') Sound.play('move');
    if (pass && showToastMsg) showToastMsg('상대방이 패스했습니다. 계속 두세요.');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, computeValidMoves };
})();
