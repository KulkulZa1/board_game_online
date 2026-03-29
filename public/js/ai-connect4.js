// ai-connect4.js — Connect4 AI (Minimax + Alpha-Beta Pruning, depth 7)
window.AIConnect4 = (function () {
  const MAX_DEPTH = 7;

  // 4-cell window 평가
  function scoreWindow(win, ai, player) {
    const aiCnt   = win.filter(c => c === ai).length;
    const plCnt   = win.filter(c => c === player).length;
    const nullCnt = win.filter(c => c === null).length;
    let score = 0;
    if (aiCnt === 4)                       score += 1000;
    else if (aiCnt === 3 && nullCnt === 1) score += 5;
    else if (aiCnt === 2 && nullCnt === 2) score += 2;
    if (plCnt === 3 && nullCnt === 1)      score -= 8;  // 위협 강하게 방어
    return score;
  }

  // 보드 전체 정적 평가
  function scoreBoard(board, ai, player, ROWS, COLS) {
    let score = 0;

    // 중앙 열 선호 (전략적으로 중요)
    const midCol = Math.floor(COLS / 2);
    for (let r = 0; r < ROWS; r++) {
      if (board[r][midCol] === ai) score += 3;
    }

    // 가로
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        score += scoreWindow([board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]], ai, player);
      }
    }
    // 세로
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r <= ROWS - 4; r++) {
        score += scoreWindow([board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]], ai, player);
      }
    }
    // 우하향 대각선
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        score += scoreWindow([board[r][c], board[r+1][c+1], board[r+2][c+2], board[r+3][c+3]], ai, player);
      }
    }
    // 우상향 대각선
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        score += scoreWindow([board[r][c], board[r-1][c+1], board[r-2][c+2], board[r-3][c+3]], ai, player);
      }
    }
    return score;
  }

  // 4목 완성 확인
  function checkWin(board, color) {
    const ROWS = board.length;
    const COLS = board[0] ? board[0].length : 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        if (board[r][c] === color && board[r][c+1] === color && board[r][c+2] === color && board[r][c+3] === color) return true;
      }
    }
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r <= ROWS - 4; r++) {
        if (board[r][c] === color && board[r+1][c] === color && board[r+2][c] === color && board[r+3][c] === color) return true;
      }
    }
    for (let r = 0; r <= ROWS - 4; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        if (board[r][c] === color && board[r+1][c+1] === color && board[r+2][c+2] === color && board[r+3][c+3] === color) return true;
      }
    }
    for (let r = 3; r < ROWS; r++) {
      for (let c = 0; c <= COLS - 4; c++) {
        if (board[r][c] === color && board[r-1][c+1] === color && board[r-2][c+2] === color && board[r-3][c+3] === color) return true;
      }
    }
    return false;
  }

  // 유효한 열 목록 (중앙 우선 정렬 — 탐색 효율화)
  function validCols(colHeights, ROWS, COLS) {
    const order = [];
    const mid = Math.floor(COLS / 2);
    for (let d = 0; d <= mid; d++) {
      if (mid - d >= 0)   order.push(mid - d);
      if (mid + d < COLS && d !== 0) order.push(mid + d);
    }
    return order.filter(c => colHeights[c] < ROWS);
  }

  // 돌 놓기 (in-place, row 반환)
  function drop(board, colH, col, color, ROWS) {
    const row = ROWS - 1 - colH[col];
    board[row][col] = color;
    colH[col]++;
    return row;
  }

  // 돌 되돌리기
  function undrop(board, colH, col, row) {
    board[row][col] = null;
    colH[col]--;
  }

  // 종료 조건 확인
  function isTerminal(board, colH, ai, player, ROWS, COLS) {
    return checkWin(board, ai) || checkWin(board, player) || validCols(colH, ROWS, COLS).length === 0;
  }

  // Minimax + Alpha-Beta
  function minimax(board, colH, depth, alpha, beta, isMax, ai, player, ROWS, COLS) {
    if (depth === 0 || isTerminal(board, colH, ai, player, ROWS, COLS)) {
      if (checkWin(board, ai))     return { score:  10000 + depth };
      if (checkWin(board, player)) return { score: -10000 - depth };
      if (validCols(colH, ROWS, COLS).length === 0) return { score: 0 };
      return { score: scoreBoard(board, ai, player, ROWS, COLS) };
    }

    const cols = validCols(colH, ROWS, COLS);
    if (isMax) {
      let best = { score: -Infinity, col: cols[0] };
      for (const col of cols) {
        const row = drop(board, colH, col, ai, ROWS);
        const res = minimax(board, colH, depth - 1, alpha, beta, false, ai, player, ROWS, COLS);
        undrop(board, colH, col, row);
        if (res.score > best.score) best = { score: res.score, col };
        alpha = Math.max(alpha, best.score);
        if (alpha >= beta) break;
      }
      return best;
    } else {
      let best = { score: Infinity, col: cols[0] };
      for (const col of cols) {
        const row = drop(board, colH, col, player, ROWS);
        const res = minimax(board, colH, depth - 1, alpha, beta, true, ai, player, ROWS, COLS);
        undrop(board, colH, col, row);
        if (res.score < best.score) best = { score: res.score, col };
        beta = Math.min(beta, best.score);
        if (alpha >= beta) break;
      }
      return best;
    }
  }

  /**
   * 최선의 열 반환
   * @param {Array}  board      - ROWS×COLS 2D 배열 (null | 'white' | 'black')
   * @param {Array}  colHeights - 열별 돌 개수
   * @param {string} aiColor    - AI 색상 ('white' | 'black')
   * @param {string} playerColor- 플레이어 색상
   * @returns {number} 최선의 열
   */
  function getBestMove(board, colHeights, aiColor, playerColor) {
    const ROWS = board.length;
    const COLS = board[0] ? board[0].length : 7;
    const boardCopy = board.map(r => [...r]);
    const hCopy     = [...colHeights];
    const result    = minimax(boardCopy, hCopy, MAX_DEPTH, -Infinity, Infinity, true, aiColor, playerColor, ROWS, COLS);
    return result.col;
  }

  return { getBestMove, checkWin };
})();
