// ai-texasholdem.js — 텍사스 홀덤 AI (핸드 강도 기반 휴리스틱)
window.AITexasHoldem = (function () {
  const HAND_NAMES = ['하이카드','원 페어','투 페어','트리플스','스트레이트','플러시','풀하우스','포카드','스트레이트 플러시','로열 플러시'];

  // AI 행동 결정
  // myHand: [{rank, suit}], community: [...], pot, toCall, raiseCount, myChips
  function decideAction(myHand, community, pot, toCall, raiseCount, myChips) {
    const allCards = [...myHand, ...community];
    const strength = _handStrength(myHand, community, allCards);
    const random = Math.random();

    // 콜 비율이 너무 크면 폴드 고려
    const callRatio = myChips > 0 ? toCall / myChips : 1;

    if (callRatio > 0.5 && strength < 2) {
      // 칩의 50% 이상을 콜해야 하는데 핸드가 약하면 폴드
      return { action: 'fold' };
    }

    if (toCall === 0) {
      // 체크 가능
      if (strength >= 4 && raiseCount < 4 && random < 0.6) {
        return { action: 'raise' }; // 강한 핸드면 베팅
      }
      return { action: 'check' };
    }

    // 콜 여부 결정
    if (strength >= 6) {
      // 매우 강한 핸드: 레이즈
      if (raiseCount < 4 && random < 0.7) return { action: 'raise' };
      return { action: 'call' };
    } else if (strength >= 3) {
      // 중간 핸드: 콜
      return { action: 'call' };
    } else if (strength >= 1) {
      // 약한 핸드: 가끔 콜, 가끔 폴드
      return random < 0.5 ? { action: 'call' } : { action: 'fold' };
    } else {
      // 최약: 블러핑 or 폴드
      return random < 0.2 ? { action: 'raise' } : { action: 'fold' };
    }
  }

  // 핸드 강도 계산 (0~9 또는 소수 사용)
  function _handStrength(hole, community, allCards) {
    if (allCards.length < 5) {
      // 프리플랍: 홀 카드만으로 강도 추정
      return _preflopStrength(hole);
    }
    const best = evaluateBest(allCards);
    return best ? best.value[0] : 0;
  }

  function _preflopStrength(hole) {
    if (!hole || hole.length < 2) return 0;
    const [c1, c2] = hole;
    const r1 = Math.max(c1.rank, c2.rank);
    const r2 = Math.min(c1.rank, c2.rank);
    const suited = c1.suit === c2.suit;
    const paired = r1 === r2;

    if (paired) {
      if (r1 >= 10) return 5; // 하이 페어
      if (r1 >= 7)  return 4; // 미드 페어
      return 3; // 로우 페어
    }
    if (r1 === 14 && r2 >= 10) return 4; // Ax 수티드
    if (r1 >= 12 && suited) return 3;
    if (r1 - r2 <= 2) return 2; // 연속 카드
    return 1;
  }

  // 핸드 평가 (7장 → 최선 5장)
  function evaluateBest(cards) {
    if (!cards || cards.length < 5) return null;
    let best = null;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const five = cards.filter((_, idx) => idx !== i && idx !== j);
        const val = _eval5(five);
        if (!best || _cmp(val.value, best.value) > 0) best = val;
      }
    }
    return best;
  }

  function _eval5(cards) {
    const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
    const suits = cards.map(c => c.suit);
    const isFlush = new Set(suits).size === 1;
    let isStraight = false, sh = 0;
    if (new Set(ranks).size === 5) {
      if (ranks[0] - ranks[4] === 4) { isStraight = true; sh = ranks[0]; }
      if (ranks[0] === 14 && ranks[1] === 5 && ranks[4] === 2) { isStraight = true; sh = 5; }
    }
    if (isFlush && isStraight) return { value: [sh===14?9:8, sh], name: HAND_NAMES[sh===14?9:8] };
    const freq = {};
    ranks.forEach(r => { freq[r] = (freq[r]||0)+1; });
    const gs = Object.entries(freq).map(([r,c])=>({r:+r,c})).sort((a,b)=>b.c-a.c||b.r-a.r);
    const [g0,g1] = gs;
    if (g0.c===4) return { value:[7,g0.r,g1.r], name:HAND_NAMES[7] };
    if (g0.c===3&&g1&&g1.c===2) return { value:[6,g0.r,g1.r], name:HAND_NAMES[6] };
    if (isFlush) return { value:[5,...ranks], name:HAND_NAMES[5] };
    if (isStraight) return { value:[4,sh], name:HAND_NAMES[4] };
    if (g0.c===3) return { value:[3,g0.r,...gs.slice(1).map(g=>g.r)], name:HAND_NAMES[3] };
    if (g0.c===2&&g1&&g1.c===2) { const p=[g0.r,g1.r].sort((a,b)=>b-a); return { value:[2,...p,gs.find(g=>g.c===1).r], name:HAND_NAMES[2] }; }
    if (g0.c===2) return { value:[1,g0.r,...gs.slice(1).map(g=>g.r)], name:HAND_NAMES[1] };
    return { value:[0,...ranks], name:HAND_NAMES[0] };
  }

  function _cmp(a, b) {
    for (let i=0; i<Math.max(a.length,b.length); i++) { const d=(a[i]||0)-(b[i]||0); if(d!==0)return d; } return 0;
  }

  return { decideAction, evaluateBest };
})();
