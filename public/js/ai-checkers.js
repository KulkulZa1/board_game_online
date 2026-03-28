// ai-checkers.js — Checkers greedy AI
window.AICheckers = (function () {

  function getValidMoves(board, color) {
    const opp    = color === 'white' ? 'black' : 'white';
    const fwdDir = color === 'white' ? -1 : 1;
    const jumps  = [];
    const moves  = [];

    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const piece = board[r][c];
        if (!piece || piece.color !== color) continue;
        const isKing = piece.king;
        const dirs = isKing ? [-1, 1] : [fwdDir];

        for (const dr of dirs) {
          for (const dc of [-1, 1]) {
            // Jump
            const mr = r+dr, mc = c+dc;
            const lr = r+dr*2, lc = c+dc*2;
            if (lr>=0&&lr<8&&lc>=0&&lc<8&&board[mr]&&board[mr][mc]&&board[mr][mc].color===opp&&!board[lr][lc]) {
              jumps.push({ from:{r,c}, to:{r:lr,c:lc}, captured:{r:mr,c:mc} });
            }
            // Simple move
            if (mr>=0&&mr<8&&mc>=0&&mc<8&&!board[mr][mc]) {
              moves.push({ from:{r,c}, to:{r:mr,c:mc} });
            }
          }
        }
      }
    }
    return jumps.length ? { moves: jumps, mustJump: true } : { moves, mustJump: false };
  }

  function applyMove(board, move) {
    const b = board.map(row => row.map(cell => cell ? {...cell} : null));
    const piece = {...b[move.from.r][move.from.c]};
    b[move.to.r][move.to.c] = piece;
    b[move.from.r][move.from.c] = null;
    if (move.captured) b[move.captured.r][move.captured.c] = null;
    // King promotion
    if ((piece.color==='white'&&move.to.r===0)||(piece.color==='black'&&move.to.r===7)) piece.king=true;
    return b;
  }

  function evaluate(board, aiColor) {
    const opp = aiColor==='white'?'black':'white';
    let score = 0;
    for (const row of board) for (const cell of row) {
      if (!cell) continue;
      const v = cell.king ? 3 : 1;
      score += cell.color===aiColor ? v : -v;
    }
    return score;
  }

  function getBestMove(board, aiColor) {
    const { moves } = getValidMoves(board, aiColor);
    if (!moves.length) return null;

    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const nb = applyMove(board, m);
      const s  = evaluate(nb, aiColor);
      // Add small randomness so AI doesn't always play same
      const rs = s + Math.random() * 0.5;
      if (rs > bestScore) { bestScore = rs; best = m; }
    }
    return best;
  }

  return { getBestMove, getValidMoves, applyMove };
})();
