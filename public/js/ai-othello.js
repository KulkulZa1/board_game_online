// ai-othello.js — Othello minimax AI (depth 3)
window.AIOthello = (function () {
  const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

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

  // 칸 가치표 — 모서리는 크고, 모서리 옆(X·C 칸)은 모서리를 내주므로 음수.
  // 예전 평가는 '모서리 +25, 나머지 돌 수'뿐이라 모서리 옆 칸을 스스로 채워 모서리를 내줬다.
  const W = [
    [100, -20, 10,  5,  5, 10, -20, 100],
    [-20, -50, -2, -2, -2, -2, -50, -20],
    [ 10,  -2,  1,  1,  1,  1,  -2,  10],
    [  5,  -2,  1,  0,  0,  1,  -2,   5],
    [  5,  -2,  1,  0,  0,  1,  -2,   5],
    [ 10,  -2,  1,  1,  1,  1,  -2,  10],
    [-20, -50, -2, -2, -2, -2, -50, -20],
    [100, -20, 10,  5,  5, 10, -20, 100],
  ];

  function evaluate(board, color) {
    const opp = color==='white'?'black':'white';
    let pos = 0, mine = 0, theirs = 0, empty = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = board[r][c];
      if (!v) { empty++; continue; }
      // 모서리를 이미 가졌으면 그 옆 칸은 더 이상 위험하지 않다
      let w = W[r][c];
      if (w < 0) {
        const cr = r < 4 ? 0 : 7, cc = c < 4 ? 0 : 7;
        if (board[cr][cc]) w = 5;
      }
      if (v === color) { pos += w; mine++; } else { pos -= w; theirs++; }
    }
    if (empty === 0) return (mine - theirs) * 1000;          // 끝난 판은 돌 수가 전부
    const mob = validMoves(board, color).length - validMoves(board, opp).length;
    return pos + mob * 5 + (empty < 14 ? (mine - theirs) * 3 : 0);   // 막판엔 돌 수도 센다
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
