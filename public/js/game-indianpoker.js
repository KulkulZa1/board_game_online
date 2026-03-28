// game-indianpoker.js — Indian Poker GameHandler
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.indianpoker = (function () {

  function initBoard(state, myColor, handleAction, myRole) {
    IndianPoker.init({ myRole, onAction: handleAction });
    return { board: IndianPoker };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    IndianPoker.init({ myRole: 'spectator', onAction: () => {} });
    if (state.hands && state.hands.host && state.hands.guest) {
      IndianPoker.showDeal({
        opponentCard: state.hands.guest,
        pot:          state.pot      || 0,
        chips:        state.chips    || {},
        ante:         5,
        roundNum:     1,
      });
    }
    return { board: IndianPoker };
  }

  function initGame(state, myColor, handleAction, myRole) {
    IndianPoker.init({ myRole, onAction: handleAction });
    return { board: IndianPoker };
  }

  // Indian Poker moves are handled via indianpoker:* socket events — no board update needed
  function onMoveMade() {}

  return { initBoard, initSpectatorBoard, initGame, onMoveMade };
})();
