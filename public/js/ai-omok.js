// ai-omok.js — Omok heuristic AI
window.AIOmok = (function () {
  const DIRS = [[0,1],[1,0],[1,1],[1,-1]];

  function countDir(board, r, c, dr, dc, color, size) {
    let n = 0, rr = r+dr, cc = c+dc;
    while (rr>=0&&rr<size&&cc>=0&&cc<size&&board[rr][cc]===color) { n++; rr+=dr; cc+=dc; }
    return n;
  }

  function scorePosition(board, r, c, aiColor, oppColor, size) {
    let s = 0;
    for (const [dr, dc] of DIRS) {
      const ai  = countDir(board,r,c,dr,dc,aiColor,size)  + countDir(board,r,c,-dr,-dc,aiColor,size);
      const opp = countDir(board,r,c,dr,dc,oppColor,size) + countDir(board,r,c,-dr,-dc,oppColor,size);
      // Attack
      if (ai >= 4) s += 100000;
      else if (ai === 3) s += 1000;
      else if (ai === 2) s += 100;
      else if (ai === 1) s += 10;
      // Defense (slightly lower priority)
      if (opp >= 4) s += 90000;
      else if (opp === 3) s += 900;
      else if (opp === 2) s += 90;
    }
    // Proximity bonus
    const surroundDirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr, dc] of surroundDirs) {
      const rr=r+dr, cc=c+dc;
      if (rr>=0&&rr<size&&cc>=0&&cc<size&&board[rr][cc]) s += 5;
    }
    return s;
  }

  function getBestMove(board, aiColor, size) {
    const oppColor = aiColor === 'black' ? 'white' : 'black';
    let best = null, bestScore = -1;
    let hasStone = false;
    for (let r=0; r<size; r++) for (let c=0; c<size; c++) if (board[r][c]) { hasStone = true; break; }
    if (!hasStone) return { row: Math.floor(size/2), col: Math.floor(size/2) };

    for (let r=0; r<size; r++) {
      for (let c=0; c<size; c++) {
        if (board[r][c]) continue;
        const s = scorePosition(board, r, c, aiColor, oppColor, size);
        if (s > bestScore) { bestScore = s; best = { row: r, col: c }; }
      }
    }
    return best || { row: Math.floor(size/2), col: Math.floor(size/2) };
  }

  function checkWin(board, color, size) {
    for (let r=0; r<size; r++) {
      for (let c=0; c<size; c++) {
        if (board[r][c] !== color) continue;
        for (const [dr,dc] of DIRS) {
          let n=1, rr=r+dr, cc=c+dc;
          while (rr>=0&&rr<size&&cc>=0&&cc<size&&board[rr][cc]===color) { n++; rr+=dr; cc+=dc; }
          if (n >= 5) return true;
        }
      }
    }
    return false;
  }

  return { getBestMove, checkWin };
})();
