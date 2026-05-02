// ai-mancala.js — 만칼라 AI (간단한 휴리스틱)
window.AIMancala = (function () {
  const WHITE_STORE = 6, BLACK_STORE = 13;

  // AI의 색에 따라 최선의 pit 선택
  function getBestPit(pits, color) {
    const myPits  = color === 'white' ? [0,1,2,3,4,5]   : [7,8,9,10,11,12];
    const myStore = color === 'white' ? WHITE_STORE : BLACK_STORE;
    const available = myPits.filter(i => pits[i] > 0);
    if (available.length === 0) return null;

    let best = null, bestScore = -Infinity;

    for (const pit of available) {
      let score = 0;

      // 보너스 턴: 마지막 씨앗이 창고에 들어가면 큰 점수
      const seeds = pits[pit];
      const landIdx = _landingIdx(pit, seeds, myStore);
      if (landIdx === myStore) score += 15;

      // 캡처: 마지막이 자신의 빈 pit + 상대 씨앗 있으면
      const oppPits = color === 'white' ? [7,8,9,10,11,12] : [0,1,2,3,4,5];
      if (myPits.includes(landIdx) && pits[landIdx] === 0 && landIdx !== pit) {
        const oppIdx = 12 - landIdx;
        if (oppPits.includes(oppIdx) && pits[oppIdx] > 0) {
          score += 10 + pits[oppIdx];
        }
      }

      // 많은 씨앗 이동 선호
      score += seeds * 0.3;

      // 약간의 랜덤성
      score += Math.random() * 2;

      if (score > bestScore) { bestScore = score; best = pit; }
    }

    return best;
  }

  function _landingIdx(startPit, seeds, myStore) {
    const oppStore = myStore === WHITE_STORE ? BLACK_STORE : WHITE_STORE;
    let idx = startPit;
    let remaining = seeds;
    while (remaining > 0) {
      idx = (idx + 1) % 14;
      if (idx === oppStore) continue;
      remaining--;
    }
    return idx;
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
