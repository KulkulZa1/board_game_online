// ai-chess.js — Chess minimax AI (depth 2)
window.AIChess = (function () {
  const PIECE_VAL = { p: 10, n: 30, b: 31, r: 50, q: 90, k: 900 };

  function evaluate(chess) {
    if (chess.in_checkmate()) return chess.turn() === 'w' ? -9999 : 9999;
    if (chess.in_draw() || chess.in_stalemate()) return 0;
    let score = 0;
    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece) continue;
        const v = PIECE_VAL[piece.type] || 0;
        score += piece.color === 'w' ? v : -v;
      }
    }
    return score;
  }

  function minimax(chess, depth, alpha, beta, isMax) {
    if (depth === 0 || chess.game_over()) return evaluate(chess);
    const moves = chess.moves();
    let best = isMax ? -Infinity : Infinity;
    for (const m of moves) {
      chess.move(m);
      const score = minimax(chess, depth - 1, alpha, beta, !isMax);
      chess.undo();
      if (isMax) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
      else        { best = Math.min(best, score); beta  = Math.min(beta,  best); }
      if (beta <= alpha) break;
    }
    return best;
  }

  function getBestMove(chess, aiColor) {
    const moves = chess.moves({ verbose: true });
    if (!moves.length) return null;
    const isMax = aiColor === 'white';
    let bestMove = moves[Math.floor(Math.random() * moves.length)];
    let bestScore = isMax ? -Infinity : Infinity;
    for (const m of moves) {
      chess.move(m);
      const score = minimax(chess, 2, -Infinity, Infinity, !isMax);
      chess.undo();
      if (isMax ? score > bestScore : score < bestScore) {
        bestScore = score; bestMove = m;
      }
    }
    return bestMove;
  }

  return { getBestMove };
})();
