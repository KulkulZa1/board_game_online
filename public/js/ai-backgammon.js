// ai-backgammon.js — 백가몬 AI (한 번 굴린 주사위를 통째로 계획)
window.AIBackgammon = (function () {

  // 유효 수 중 최선의 수 반환 — 남은 주사위를 '다 쓰는 순서'까지 계획하고 그 첫 걸음을 둔다.
  // 예전엔 주사위 하나씩 따로 골랐고, 홀로 선 말(블롯)을 '움직이면' 감점해서 오히려 블롯을 남겼다.
  // 평가가 결정적이라 한 걸음씩 다시 불러도 같은 계획을 이어 간다.
  function getBestMove(board, color, remainingMoves) {
    const first = _getValidMoves(board, color, remainingMoves);
    if (first.length === 0) return null;
    let best = null, bestScore = -Infinity;
    const seen = new Map();   // 같은 결과 포지션은 한 번만
    (function walk(bg, dice, firstStep) {
      const moves = _getValidMoves(bg, color, dice);
      if (!moves.length) {
        const key = _key(bg);
        if (seen.has(key)) return;
        seen.set(key, true);
        const v = _evaluate(bg, color);
        if (v > bestScore) { bestScore = v; best = firstStep; }
        return;
      }
      for (const m of moves) {
        const i = dice.indexOf(m.dieUsed);
        const rest = dice.slice(0, i).concat(dice.slice(i + 1));
        walk(applyMove(bg, color, m), rest, firstStep || m);
      }
    })(board, remainingMoves.slice(), null);
    return best || first[0];
  }

  function _key(bg) {
    return bg.points.map((p) => (p && p.count ? (p.color === 'white' ? 'w' : 'b') + p.count : '')).join(',') +
      `|${bg.bar.white},${bg.bar.black}|${bg.borneOff.white},${bg.borneOff.black}`;
  }

  // 포지션 평가 (color 기준, 클수록 좋다)
  function _evaluate(bg, color) {
    const opp = color === 'white' ? 'black' : 'white';
    // 핍: 남은 이동 거리 — 백은 1쪽으로, 흑은 24쪽으로 간다
    const pips = (c) => {
      let n = bg.bar[c] * 25;
      for (let p = 1; p <= 24; p++) if (bg.points[p].color === c) n += bg.points[p].count * (c === 'white' ? p : 25 - p);
      return n;
    };
    let s = (pips(opp) - pips(color)) + bg.borneOff[color] * 2 - bg.borneOff[opp] * 2;
    s += bg.bar[opp] * 10 - bg.bar[color] * 12;
    // 상대 말이 아직 뒤에 남아 있어야 블롯이 위험하다 (서로 지나쳤으면 무시)
    const oppBehind = (p) => {
      if (bg.bar[opp] > 0) return true;
      for (let q = 1; q <= 24; q++) {
        if (bg.points[q].color !== opp || !bg.points[q].count) continue;
        if (color === 'white' ? q < p : q > p) return true;
      }
      return false;
    };
    const home = color === 'white' ? [1, 6] : [19, 24];
    let run = 0;
    for (let p = 1; p <= 24; p++) {
      const pt = bg.points[p];
      const inHome = p >= home[0] && p <= home[1];
      if (pt.color === color && pt.count >= 2) {
        s += inHome ? 7 : 4;                    // 만든 포인트 (홈 보드는 상대 입장을 막는다)
        run++; if (run >= 2) s += 3 * (run - 1);  // 이어진 포인트(프라임)
      } else run = 0;
      if (pt.color === color && pt.count === 1 && oppBehind(p)) {
        // 상대가 직접 맞힐 수 있는 거리(1~6)에 있으면 더 위험
        let direct = false;
        for (let d = 1; d <= 6; d++) {
          const src = color === 'white' ? p - d : p + d;   // 흑은 24쪽으로, 백은 1쪽으로 온다
          if (src >= 1 && src <= 24 && bg.points[src].color === opp && bg.points[src].count > 0) { direct = true; break; }
        }
        s -= (direct ? 9 : 4) + (inHome ? 0 : 2);
      }
    }
    return s;
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

  return { getBestMove, applyMove, getValidMoves: _getValidMoves };
})();
