// ai-backgammon.js — 백가몬 AI (휴리스틱 전략)
window.AIBackgammon = (function () {

  // 유효 수 중 최선의 수 반환
  function getBestMove(board, color, remainingMoves) {
    const moves = _getValidMoves(board, color, remainingMoves);
    if (moves.length === 0) return null;

    // 점수 기반 우선순위
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const score = _scoreMove(board, color, m);
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  function _scoreMove(board, color, move) {
    let score = 0;
    const opp = color === 'white' ? 'black' : 'white';

    // 탈출 보너스
    if (move.to === 'off') return 200 + move.dieUsed;

    // 바에서 입장
    if (move.from === 'bar') score += 50;

    const destPt = board.points[move.to];

    // 상대 말 잡기
    if (destPt.color === opp && destPt.count === 1) score += 30;

    // 포인트 점령 (자기 말 2개 이상)
    if (destPt.color === color && destPt.count >= 1) score += 15;

    // 홈 보드에 가까울수록 선호
    if (color === 'white') {
      score += (25 - move.to) * 0.5;
    } else {
      score += move.to * 0.5;
    }

    // 홀로 있는 말 노출 패널티
    if (move.from !== 'bar') {
      const fromPt = board.points[move.from];
      if (fromPt.count === 1) score -= 10; // 이동 후 해당 포인트 비워짐
    }

    return score + Math.random() * 5; // 약간의 무작위성
  }

  // ── 이동 유효성 로직 (서버 미러) ──────────────────────────────────
  function _getValidMoves(bg, color, remainingMoves) {
    if (!remainingMoves || remainingMoves.length === 0) return [];
    const unique   = [...new Set(remainingMoves)];
    const oppColor = color === 'white' ? 'black' : 'white';
    const dir      = color === 'white' ? -1 : 1;
    const moves    = [];

    if (bg.bar[color] > 0) {
      for (const die of unique) {
        const entry = color === 'white' ? (25 - die) : die;
        if (entry < 1 || entry > 24) continue;
        if (_blocked(bg, entry, oppColor)) continue;
        moves.push({ from: 'bar', to: entry, dieUsed: die });
      }
      return moves;
    }

    const allHome = _allHome(bg, color);
    for (let p = 1; p <= 24; p++) {
      if (bg.points[p].color !== color || bg.points[p].count === 0) continue;
      for (const die of unique) {
        const dest = p + dir * die;
        if (color === 'white' && dest <= 0) {
          if (allHome && _canBO(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
        } else if (color === 'black' && dest >= 25) {
          if (allHome && _canBO(bg, color, p, die)) moves.push({ from: p, to: 'off', dieUsed: die });
        } else if (dest >= 1 && dest <= 24) {
          if (!_blocked(bg, dest, oppColor)) moves.push({ from: p, to: dest, dieUsed: die });
        }
      }
    }
    const seen = new Set();
    return moves.filter(m => { const k=`${m.from}|${m.to}|${m.dieUsed}`; if(seen.has(k))return false; seen.add(k);return true; });
  }

  function _blocked(bg, p, opp) {
    return bg.points[p].color === opp && bg.points[p].count >= 2;
  }

  function _allHome(bg, color) {
    if (bg.bar[color] > 0) return false;
    const [lo, hi] = color === 'white' ? [1, 6] : [19, 24];
    for (let p = 1; p <= 24; p++) {
      if (p >= lo && p <= hi) continue;
      if (bg.points[p].color === color && bg.points[p].count > 0) return false;
    }
    return true;
  }

  function _canBO(bg, color, fromP, die) {
    const dir  = color === 'white' ? -1 : 1;
    const dest = fromP + dir * die;
    if (color === 'white') {
      if (dest >= 1) return false;
      if (dest === 0) return true;
      for (let p = fromP + 1; p <= 6; p++) {
        if (bg.points[p].color === 'white' && bg.points[p].count > 0) return false;
      }
      return true;
    } else {
      if (dest <= 24) return false;
      if (dest === 25) return true;
      for (let p = 19; p < fromP; p++) {
        if (bg.points[p].color === 'black' && bg.points[p].count > 0) return false;
      }
      return true;
    }
  }

  // 보드에 이동 적용 (깊은 복사)
  function applyMove(board, color, move) {
    const bg = _deepCopy(board);
    const opp = color === 'white' ? 'black' : 'white';

    if (move.from === 'bar') {
      bg.bar[color]--;
    } else {
      bg.points[move.from].count--;
      if (bg.points[move.from].count === 0) bg.points[move.from].color = null;
    }

    if (move.to === 'off') {
      bg.borneOff[color]++;
    } else {
      if (bg.points[move.to].color === opp && bg.points[move.to].count === 1) {
        bg.points[move.to].count = 0;
        bg.points[move.to].color = null;
        bg.bar[opp]++;
      }
      bg.points[move.to].count++;
      bg.points[move.to].color = color;
    }
    return bg;
  }

  function _deepCopy(board) {
    return {
      points:   board.points.map(p => p ? { color: p.color, count: p.count } : null),
      bar:      { white: board.bar.white,      black: board.bar.black      },
      borneOff: { white: board.borneOff.white, black: board.borneOff.black },
    };
  }

  return { getBestMove, applyMove };
})();
