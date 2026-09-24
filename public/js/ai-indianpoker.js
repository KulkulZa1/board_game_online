// ai-indianpoker.js — Indian Poker AI (cards: 1-10, A beats only 10)
window.AIIndianPoker = (function () {
  // 인디언 포커의 핵심은 '내 카드는 모른다'는 것이다. AI 도 같은 조건으로 둔다:
  //   playerCard   — 상대(플레이어)의 카드: 이마에 붙어 있으니 AI 도 본다
  //   unknownRanks — AI 가 아직 못 본 카드들의 숫자 (남은 덱 + AI 자신의 카드). 없으면 1~10 균등으로 본다
  //   pot, raiseCount, toCall — 지금 팟, 레이즈 횟수, 콜하려면 더 내야 하는 칩
  // ⚠ 예전 AI 는 자기 카드를 보고 쇼다운 승패를 미리 알고 베팅했다(플레이어는 자기 카드를 못 본다) —
  //   이길 때만 레이즈하고 질 때는 접는, 사람이 이길 수 없는 상대였다.
  function decideAction(playerCard, unknownRanks, pot, raiseCount, toCall) {
    const maxRaises = 3;
    const rand = Math.random();
    const pool = unknownRanks && unknownRanks.length ? unknownRanks : [1,2,3,4,5,6,7,8,9,10];
    let win = 0, tens = 0;
    for (const r of pool) {
      const c = compareRanks(r, playerCard);
      win += c > 0 ? 1 : c === 0 ? 0.5 : 0;
      if (r === 10) tens++;
    }
    const p = win / pool.length;          // 쇼다운에서 이길 확률 (비기면 절반)
    const p10 = tens / pool.length;       // 내가 10 을 들고 있을 확률 — 10 을 들고 접으면 벌칙 5
    const owe = Math.max(0, toCall || 0);

    if (p >= 0.7) {
      if (raiseCount < maxRaises && rand < 0.75) return 'raise';
      return 'call';
    }
    if (p >= 0.45) {
      if (raiseCount < maxRaises && rand < 0.15) return 'raise';
      return 'call';
    }
    // 불리할 때: 가끔 블러프, 아니면 기댓값으로 콜/폴드 (접으면 10 벌칙 위험을 진다)
    if (raiseCount < maxRaises && rand < 0.1) return 'raise';
    const evCall = p * (pot + owe) - owe;
    const evFold = -p10 * 5;
    return evCall >= evFold ? 'call' : 'fold';
  }

  // Generates a random card { rank:1-10, suit:'♠'|'♥'|'♦'|'♣' }
  const SUITS = ['♠', '♥', '♦', '♣'];
  function dealCard() {
    const rank = Math.floor(Math.random() * 10) + 1;
    const suit = SUITS[Math.floor(Math.random() * 4)];
    return { rank, suit };
  }

  // Creates and shuffles a deck of numDecks × 10 cards (ranks 1-10)
  function createDeck(numDecks) {
    const deck = [];
    for (let d = 0; d < numDecks; d++) {
      for (let rank = 1; rank <= 10; rank++) {
        const suit = SUITS[Math.floor(Math.random() * 4)];
        deck.push({ rank, suit });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  const CARD_LABELS = ['A','2','3','4','5','6','7','8','9','10'];
  function cardLabel(n) { return CARD_LABELS[(n - 1) % 10]; }

  // Returns positive if a beats b, 0 on tie, negative if b beats a
  function compareRanks(a, b) {
    if (a === 1 && b === 10) return 1;   // A beats 10
    if (b === 1 && a === 10) return -1;  // A beats 10
    return a - b;                         // higher wins normally
  }

  return { decideAction, dealCard, createDeck, cardLabel, compareRanks };
})();
