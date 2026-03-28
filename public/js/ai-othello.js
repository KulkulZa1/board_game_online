// ai-othello.js — Othello minimax AI (depth 3)
window.AIOthello = (function () {
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const CORNER_BONUS = [[0,0],[0,7],[7,0],[7,7]];

  function validMoves(board, color) {
    const opp = color==='white'?'black':'white';
    const moves = [];
    for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
      if (board[r][c]) continue;
      for (const [dr,dc] of DIRS) {
        let rr=r+dr, cc=c+dc, n=0;
        while (rr>=0&&rr<8&&cc>=0&&cc<8&&board[rr][cc]===opp) { rr+=dr; cc+=dc; n++; }
        if (n>0&&rr>=0&&rr<8&&cc>=0&&cc<8&&board[rr][cc]===color) { moves.push({row:r,col:c}); break; }
      }
    }
    return moves;
  }

  function applyMove(board, r, c, color) {
    const b = board.map(row => [...row]);
    const opp = color==='white'?'black':'white';
    b[r][c] = color;
    for (const [dr,dc] of DIRS) {
      const flip = [];
      let rr=r+dr, cc=c+dc;
      while (rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr][cc]===opp) { flip.push([rr,cc]); rr+=dr; cc+=dc; }
      if (flip.length&&rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr][cc]===color)
        flip.forEach(([fr,fc]) => { b[fr][fc]=color; });
    }
    return b;
  }

  function evaluate(board, color) {
    const opp = color==='white'?'black':'white';
    let score = 0;
    CORNER_BONUS.forEach(([r,c]) => {
      if (board[r][c]===color) score += 25;
      else if (board[r][c]===opp) score -= 25;
    });
    for (const row of board) for (const cell of row) {
      if (cell===color) score++;
      else if (cell===opp) score--;
    }
    return score;
  }

  function minimax(board, depth, alpha, beta, aiColor, curColor) {
    const moves = validMoves(board, curColor);
    const opp = curColor==='white'?'black':'white';
    if (depth===0||moves.length===0) return evaluate(board, aiColor);
    const isMax = curColor===aiColor;
    let best = isMax ? -Infinity : Infinity;
    for (const {row,col} of moves) {
      const nb = applyMove(board, row, col, curColor);
      const s  = minimax(nb, depth-1, alpha, beta, aiColor, opp);
      if (isMax) { best=Math.max(best,s); alpha=Math.max(alpha,best); }
      else        { best=Math.min(best,s); beta =Math.min(beta, best); }
      if (beta<=alpha) break;
    }
    return best;
  }

  function getBestMove(board, aiColor) {
    const moves = validMoves(board, aiColor);
    if (!moves.length) return null;
    const opp = aiColor==='white'?'black':'white';
    let best=null, bestScore=-Infinity;
    for (const m of moves) {
      const nb = applyMove(board, m.row, m.col, aiColor);
      const s  = minimax(nb, 3, -Infinity, Infinity, aiColor, opp);
      if (s>bestScore) { bestScore=s; best=m; }
    }
    return best;
  }

  return { getBestMove, validMoves, applyMove };
})();
