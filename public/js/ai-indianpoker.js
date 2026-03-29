// ai-indianpoker.js — Indian Poker AI (cards: 1-10, A beats only 10)
window.AIIndianPoker = (function () {
  // aiCard: AI's own card (it sees this in solo mode)
  // playerCard: the player's card (AI can see this — it's on the player's forehead)
  // pot: current pot
  // raiseCount: how many raises have happened
  function decideAction(aiCard, playerCard, pot, raiseCount) {
    const maxRaises = 3;
    const rand = Math.random();

    // Determine if AI wins at showdown
    let aiBeatsPlayer;
    if (aiCard === 1 && playerCard === 10) aiBeatsPlayer = true;   // A beats 10
    else if (playerCard === 1 && aiCard === 10) aiBeatsPlayer = false; // A beats 10
    else aiBeatsPlayer = aiCard > playerCard;

    const diff = Math.abs(aiCard - playerCard);
    // "close" only if neither card is A (A creates unusual gaps)
    const isClose = diff <= 2 && aiCard !== 1 && playerCard !== 1;

    // Special: AI holds 10 — never fold (would incur penalty)
    if (aiCard === 10) {
      if (raiseCount < maxRaises && rand < 0.5) return 'raise';
      return 'call';
    }

    if (aiBeatsPlayer) {
      if (raiseCount < maxRaises && rand < 0.7) return 'raise';
      return 'call';
    } else if (isClose) {
      if (raiseCount < maxRaises && rand < 0.2) return 'raise';
      if (rand < 0.3) return 'fold';
      return 'call';
    } else {
      if (rand < 0.55) return 'fold';
      return 'call';
    }
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
