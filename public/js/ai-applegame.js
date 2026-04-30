// ai-applegame.js — 사과게임 AI (탐욕 전략: 가장 많은 사과 제거)
window.AIAppleGame = (function () {

  /**
   * 보드에서 유효한 모든 직사각형(합=10, null 없음)을 찾아
   * 셀 수 내림차순으로 정렬하여 반환한다.
   */
  function findAllMoves(board) {
    const ROWS = board.length;
    const COLS = board[0].length;
    const moves = [];

    for (let r1 = 0; r1 < ROWS; r1++) {
      for (let c1 = 0; c1 < COLS; c1++) {
        for (let r2 = r1; r2 < ROWS; r2++) {
          for (let c2 = c1; c2 < COLS; c2++) {
            let sum = 0;
            let valid = true;
            const cells = [];
            outer: for (let r = r1; r <= r2; r++) {
              for (let c = c1; c <= c2; c++) {
                if (board[r][c] === null) { valid = false; break outer; }
                sum += board[r][c];
                cells.push({ row: r, col: c });
              }
            }
            if (valid && sum === 10) {
              moves.push({ row1: r1, col1: c1, row2: r2, col2: c2, cells, score: cells.length });
            }
          }
        }
      }
    }

    // 셀 수 많은 것 우선, 동점이면 좌상단 우선
    moves.sort((a, b) => b.score - a.score || a.row1 - b.row1 || a.col1 - b.col1);
    return moves;
  }

  /**
   * 유효한 수가 하나라도 있는지 빠르게 확인한다.
   */
  function hasAnyMove(board) {
    const ROWS = board.length;
    const COLS = board[0].length;
    for (let r1 = 0; r1 < ROWS; r1++) {
      for (let c1 = 0; c1 < COLS; c1++) {
        for (let r2 = r1; r2 < ROWS; r2++) {
          for (let c2 = c1; c2 < COLS; c2++) {
            let sum = 0, ok = true;
            outer: for (let r = r1; r <= r2; r++) {
              for (let c = c1; c <= c2; c++) {
                if (board[r][c] === null) { ok = false; break outer; }
                sum += board[r][c];
              }
            }
            if (ok && sum === 10) return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 최선의 수를 반환한다 (셀 수 최대 직사각형).
   * 유효한 수가 없으면 null 반환.
   */
  function getBestMove(board) {
    const moves = findAllMoves(board);
    return moves.length > 0 ? moves[0] : null;
  }

  return { getBestMove, findAllMoves, hasAnyMove };
})();
