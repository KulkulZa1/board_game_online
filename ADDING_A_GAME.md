# Adding a New Game — Developer Checklist

This guide describes the exact steps to add a new game to board_game_online.
Follow them in order. Each step references the exact file and location to edit.

Estimated time: 4–8 hours for a simple board game.

---

## Naming convention

Pick a short lowercase key for the game: `mygame`

| File type         | Naming pattern                          |
|-------------------|-----------------------------------------|
| Server handler    | `server/handlers/mygame.js`             |
| Frontend handler  | `public/js/game-mygame.js`              |
| Board renderer    | `public/js/mygame-board.js`             |
| AI engine         | `public/js/ai-mygame.js`               |
| Game-specific CSS | `public/css/games/mygame.css`           |

---

## Step 1 — Server handler

Create `server/handlers/mygame.js`:

```javascript
// server/handlers/mygame.js
const state = require('../state');

function initRoom(base, opts) {
  // Add game-specific fields to the room state object
  base.board       = createInitialBoard();
  base.currentTurn = 'white';
  // base.scores, base.phase, etc. as needed
}

function resetRoom(room) {
  // Reset for rematch (colors have already been swapped by caller)
  room.board       = createInitialBoard();
  room.currentTurn = room.hostColor;
}

function handleMove(socket, room, role, data) {
  const { io } = state;
  const yourColor = room.hostColor === role ? room.hostColor : room.guestColor;
  if (room.currentTurn !== yourColor) return;

  // Validate move
  // Apply move to room.board
  // Check for win/draw

  const nextColor = yourColor === 'white' ? 'black' : 'white';
  room.currentTurn        = nextColor;
  room.timers.activeColor = nextColor;
  room.timers.lastTickAt  = Date.now();

  io.to(room.id).emit('game:move:made', {
    move:   { /* move record */ },
    board:  room.board,
    timers: { white: room.timers.white, black: room.timers.black, activeColor: nextColor },
    turn:   nextColor,
  });

  // If game over:
  // const { endGame } = require('../endgame');
  // endGame(room, winnerColor, 'reason');
}

module.exports = { initRoom, resetRoom, handleMove };
```

## Step 2 — Register in game handler registry

Edit `server/handlers/index.js` — add one line:

```javascript
['mygame', require('./mygame')],
```

That's all the server needs. The dispatcher in `server/events.js` automatically routes `game:move` to `handler.handleMove()`.

---

## Step 3 — Game-specific CSS

Create `public/css/games/mygame.css` with all styles for your board/UI.

Then add to `public/game.html` (after the last game CSS link):
```html
<link rel="stylesheet" href="css/games/mygame.css?v=1.0">
```

---

## Step 4 — Board renderer

Create `public/js/mygame-board.js`:

```javascript
window.MyGameBoard = (function() {
  let _board, _myColor, _myTurn, _onMove;

  function init({ board, myColor, onMove, spectatorMode }) {
    _board   = board;
    _myColor = myColor;
    _onMove  = onMove;
    _render();
    // Attach event listeners if !spectatorMode
  }

  function setMyTurn(bool) {
    _myTurn = bool;
    // Toggle active class on board container
  }

  function updateAfterMove(newBoard, move) {
    _board = newBoard;
    _render();
  }

  function _render() {
    const el = document.getElementById('mygameboard');
    // Build DOM from _board
  }

  return { init, setMyTurn, updateAfterMove };
})();
```

---

## Step 5 — AI engine (for solo mode)

Create `public/js/ai-mygame.js`:

```javascript
window.AIMyGame = (function() {
  function getBestMove(board) {
    // Return move object or null if no moves available
  }

  return { getBestMove };
})();
```

---

## Step 6 — Frontend game handler

Create `public/js/game-mygame.js`:

```javascript
window.GameHandlers = window.GameHandlers || {};
window.GameHandlers.mygame = (function() {

  function initBoard(state, myColor, handleAction) {
    MyGameBoard.init({ board: state.board, myColor, onMove: handleAction });
    return { board: MyGameBoard };
  }

  function initSpectatorBoard(state, hostColor, handleAction) {
    MyGameBoard.init({ board: state.board, myColor: hostColor, onMove: handleAction, spectatorMode: true });
    return { board: MyGameBoard };
  }

  function initGame(state, myColor, handleAction) {
    return initBoard(state, myColor, handleAction);
  }

  function onMoveMade({ move, board }) {
    MyGameBoard.updateAfterMove(board, move);
    if (window.Sound) Sound.play('move');
  }

  function getMyTurn(state, myColor) {
    return state.currentTurn === myColor;
  }

  function startSolo(playerColor, helpers, options) {
    const { showGameOver, updateTurnIndicator } = helpers;
    // Set up local board, timer, alternating player↔AI turns
    // Call Stats.record('mygame', result) at game end
  }

  return { initBoard, initSpectatorBoard, initGame, onMoveMade, getMyTurn, startSolo };
})();
```

---

## Step 7 — Register in game-registry.js

Edit `public/js/game-registry.js` and add an entry to the `GAMES` array:

```javascript
{
  id:          'mygame',
  name:        '내게임',
  icon:        '🎯',
  desc:        '게임 설명<br>보드 크기',
  forceWhite:  false,
  soloLabelW:  '백 (선공)',
  soloLabelB:  '흑 (후공)',
  createTitle: '내게임 방 만들기',
  gameTitle:   '내게임 대국',
  specTitle:   '내게임 관전',
  boardAreaId: 'mygame-board-area',
  rules: {
    title: '🎯 내게임 규칙',
    sections: [
      { head: '목표',    text: '...' },
      { head: '이동',    text: '...' },
      { head: '종료',    text: '...' },
      { head: '솔로 모드', text: '...' },
    ]
  }
},
```

---

## Step 8 — Add to lobby game cards

Edit `public/index.html` — add a game card after the last `</div>` closing a `.game-card`:

```html
<div class="game-card" id="card-mygame" onclick="selectGame('mygame')">
  <div class="game-card-icon">🎯</div>
  <div class="game-card-name">내게임</div>
  <div class="game-card-desc">게임 설명<br>보드 크기</div>
  <div class="card-actions">
    <button class="btn-rules" onclick="showRules('mygame');event.stopPropagation()">📋 규칙</button>
    <button class="btn-solo"  onclick="startSolo('mygame');event.stopPropagation()">🤖 혼자</button>
    <button class="btn-play">플레이</button>
  </div>
</div>
```

---

## Step 9 — Add board area to game.html

Edit `public/game.html` — add after the last board area `<div>`:

```html
<!-- 내게임 보드 영역 -->
<div id="mygame-board-area" style="display:none;">
  <div id="mygameboard"></div>
</div>
```

Then add script tags (before `review.js`):
```html
<script src="js/ai-mygame.js?v=1.0"></script>
<script src="js/mygame-board.js?v=1.0"></script>
<script src="js/game-mygame.js?v=1.0"></script>
```

---

## Step 10 — Add to stats.js

Edit `public/js/stats.js` — add to `GAME_NAMES`:

```javascript
mygame: '🎯 내게임',
```

---

## Verification checklist

- [ ] `node server.js` starts without errors
- [ ] Lobby shows new game card with icon, name, desc
- [ ] 📋 Rules button shows correct rules text
- [ ] 🤖 혼자 → solo mode starts, board renders, timer counts
- [ ] Player can make a valid move → board updates
- [ ] AI responds within ~1 second
- [ ] Invalid move → nothing happens (no crash)
- [ ] Game ends → winner modal shows, stats recorded
- [ ] Multiplayer: create room → join in second tab → same board
- [ ] Both players see each other's moves in real time
- [ ] Reconnection works (close tab → reopen with same URL)
- [ ] 📊 Stats modal shows new game row after a game

---

## Files touched summary

| File | Action |
|------|--------|
| `server/handlers/mygame.js` | **CREATE** |
| `server/handlers/index.js`  | **EDIT** — 1 line |
| `public/js/game-mygame.js`  | **CREATE** |
| `public/js/mygame-board.js` | **CREATE** |
| `public/js/ai-mygame.js`    | **CREATE** |
| `public/css/games/mygame.css` | **CREATE** |
| `public/js/game-registry.js` | **EDIT** — 1 entry |
| `public/index.html`          | **EDIT** — 1 card block |
| `public/game.html`           | **EDIT** — board area div + 3 script tags |
| `public/js/stats.js`         | **EDIT** — 1 line |

**10 files, maximum 2 of which are more than 1-line edits.**
