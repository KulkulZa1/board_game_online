// ai-mancala.js — 만칼라 규칙(서버와 같음) + 알파베타 AI
window.AIMancala = (function () {
  const WHITE_STORE = 6, BLACK_STORE = 13;

  const SEARCH_DEPTH = 8;   // 수 단위 (보너스 턴도 한 수)

  // 한쪽 진영이 비면 끝 — 남은 씨앗은 각자 창고로 (서버·혼자하기와 같은 규칙)
  function _finish(p) {
    const wE = [0,1,2,3,4,5].every((i) => p[i] === 0), bE = [7,8,9,10,11,12].every((i) => p[i] === 0);
    if (!wE && !bE) return null;
    const q = [...p];
    for (let i = 0; i <= 5; i++)  { q[WHITE_STORE] += q[i]; q[i] = 0; }
    for (let i = 7; i <= 12; i++) { q[BLACK_STORE] += q[i]; q[i] = 0; }
    return q;
  }

  // 알파베타 — 보너스 턴이면 같은 쪽이 한 번 더 둔다. 점수 = AI 창고 - 상대 창고
  function _search(p, toMove, ai, depth, alpha, beta) {
    const done = _finish(p);
    const store = (q, c) => q[c === 'white' ? WHITE_STORE : BLACK_STORE];
    const other = ai === 'white' ? 'black' : 'white';
    if (done) { const d = store(done, ai) - store(done, other); return d * 100 + Math.sign(d) * depth; }   // 확정 승패는 크게, 빨리 이길수록
    if (depth === 0) return store(p, ai) - store(p, other);
    const pits = (toMove === 'white' ? [0,1,2,3,4,5] : [7,8,9,10,11,12]).filter((i) => p[i] > 0);
    const maxing = toMove === ai;
    let best = maxing ? -Infinity : Infinity;
    for (const pit of pits) {
      const r = applyMove(p, toMove, pit);
      const next = r.bonusTurn ? toMove : (toMove === 'white' ? 'black' : 'white');
      const v = _search(r.pits, next, ai, depth - 1, alpha, beta);
      if (maxing) { if (v > best) best = v; if (v > alpha) alpha = v; }
      else        { if (v < best) best = v; if (v < beta) beta = v; }
      if (alpha >= beta) break;
    }
    return best;
  }

  // AI의 색에 따라 최선의 pit 선택 — 예전엔 한 수만 보고(보너스 턴·캡처 가산) 상대의 되갚기를 못 봤다
  function getBestPit(pits, color) {
    const myPits = color === 'white' ? [0,1,2,3,4,5] : [7,8,9,10,11,12];
    const available = myPits.filter(i => pits[i] > 0);
    if (available.length === 0) return null;
    let best = [], bestScore = -Infinity;
    for (const pit of available) {
      const r = applyMove(pits, color, pit);
      const next = r.bonusTurn ? color : (color === 'white' ? 'black' : 'white');
      const v = _search(r.pits, next, color, SEARCH_DEPTH - 1, -Infinity, Infinity);
      if (v > bestScore) { bestScore = v; best = [pit]; }
      else if (v === bestScore) best.push(pit);
    }
    return best[Math.floor(Math.random() * best.length)];   // 동점이면 무작위
  }

  // 이동 적용 (솔로 모드 로컬 상태)
  function applyMove(pits, color, pit) {
    const p = [...pits];
    const isWhite = color === 'white';
    const myStore  = isWhite ? WHITE_STORE : BLACK_STORE;
    const oppStore = isWhite ? BLACK_STORE : WHITE_STORE;
    const myPits   = isWhite ? [0,1,2,3,4,5]   : [7,8,9,10,11,12];
    const oppPits  = isWhite ? [7,8,9,10,11,12] : [0,1,2,3,4,5];

    let seeds = p[pit]; p[pit] = 0;
    let idx = pit;
    while (seeds > 0) {
      idx = (idx + 1) % 14;
      if (idx === oppStore) continue;
      p[idx]++; seeds--;
    }

    const bonusTurn = idx === myStore;

    if (!bonusTurn && myPits.includes(idx) && p[idx] === 1) {
      const oppIdx = 12 - idx;
      if (oppPits.includes(oppIdx) && p[oppIdx] > 0) {
        p[myStore] += p[oppIdx] + 1;
        p[idx] = 0; p[oppIdx] = 0;
      }
    }

    return { pits: p, bonusTurn };
  }

  return { getBestPit, applyMove };
})();
