// ai-indianpoker.js — Indian Poker simple AI
window.AIIndianPoker = (function () {
  // aiCard: AI's own card (it sees this in solo mode)
  // playerCard: the player's card (AI can see this — it's on the player's forehead)
  // pot: current pot
  // raiseCount: how many raises have happened
  function decideAction(aiCard, playerCard, pot, raiseCount) {
    const maxRaises = 3;
    // AI compares its card with player's visible card
    const isWinning  = aiCard > playerCard;
    const isClose    = Math.abs(aiCard - playerCard) <= 2;
    const rand       = Math.random();

    if (isWinning) {
      // AI is winning — raise (if raises left), else call
      if (raiseCount < maxRaises && rand < 0.7) return 'raise';
      return 'call';
    } else if (isClose) {
      // Too close to call — sometimes raise as bluff
      if (raiseCount < maxRaises && rand < 0.2) return 'raise';
      if (rand < 0.3) return 'fold';
      return 'call';
    } else {
      // AI is losing — mostly fold, sometimes call as bluff
      if (rand < 0.55) return 'fold';
      return 'call';
    }
  }

  // Generates a random card 1-13
  function dealCard() {
    return Math.floor(Math.random() * 13) + 1;
  }

  const CARD_LABELS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
  function cardLabel(n) { return CARD_LABELS[(n-1) % 13]; }

  return { decideAction, dealCard, cardLabel };
})();
