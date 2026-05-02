# CLAUDE.md — AI Assistant Guide for board_game_online

## Overview

This is a real-time multiplayer board game platform built with Node.js + Express + Socket.io. It supports **12 games** (Chess, Omok, Connect4, Othello, Checkers, Indian Poker, Apple Game, Battleship, Backgammon, Texas Hold'em, Dots & Boxes, Mancala), runs as a Progressive Web App (PWA), and is deployed on Render.com. There is **no database** — all game state is held in memory on the server, and player stats are stored in browser localStorage.

---

## Development Setup

```bash
# Install dependencies (requires Node.js >= 18)
npm install

# Start the server
node server.js

# Visit http://localhost:3000
```

**Environment variables** (none are required for local dev):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server listening port (Render sets 10000) |
| `TUNNEL_URL` | none | Public URL printed on startup (Cloudflare/Render) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins |

There is no `.env` file in the repo — configure via the shell or deployment platform.

---

## Repository Structure

```
board_game_online/
├── server.js            # Thin entry point: require('./server/index.js')
├── server/              # Backend modules (Node.js, no build step)
│   ├── index.js         # Express + Socket.io setup, server startup
│   ├── state.js         # Shared mutable state (rooms, tokenMap, io ref)
│   ├── utils.js         # Pure helpers (rateCheck, getRoleColor, etc.)
│   ├── rooms.js         # createRoomState(), resetForRematch()
│   ├── endgame.js       # endGame(), startGame(), approveSpectator()
│   ├── timers.js        # Timer tick loop, rate-limit cleanup
│   ├── events.js        # All socket.on() event handlers
│   ├── routes.js        # HTTP routes (/api/status, /admin/*)
│   └── handlers/        # Per-game move handlers
│       ├── index.js     # Game registry Map (gameType → handler module)
│       ├── chess.js
│       ├── omok.js
│       ├── connect4.js
│       ├── othello.js
│       ├── checkers.js
│       ├── indianpoker.js
│       ├── applegame.js
│       ├── battleship.js
│       ├── backgammon.js
│       ├── texasholdem.js
│       ├── dotsboxes.js
│       └── mancala.js
│
├── package.json         # 4 dependencies: express, socket.io, chess.js (0.12.0), uuid
├── render.yaml          # Render.com deployment config
├── ADDING_A_GAME.md     # Developer guide: 10-step checklist to add a new game
├── README.md            # Korean-language project intro
├── CHANGELOG.md         # Version history
│
└── public/
    ├── index.html       # Lobby (game selection + room create/join)
    ├── game.html        # Game page (board + chat + timer)
    ├── admin.html       # Admin dashboard (status, shutdown)
    ├── privacy.html     # Play Store privacy policy
    ├── manifest.json    # PWA manifest
    ├── sw.js            # Service Worker (caching/offline)
    ├── css/
    │   ├── lobby.css    # Lobby styles
    │   ├── game.css     # Shared game UI (layout, chat, modals, spectator)
    │   └── games/       # Per-game CSS (one file per game)
    │       ├── chess.css
    │       ├── omok.css
    │       ├── connect4.css
    │       ├── othello.css
    │       ├── indianpoker.css
    │       ├── checkers.css
    │       ├── applegame.css
    │       ├── battleship.css
    │       ├── backgammon.css
    │       ├── texasholdem.css
    │       ├── dotsboxes.css
    │       └── mancala.css
    └── js/
        ├── admob.js                   # AdMob interstitial wrapper (no-op on web, live in native)
        ├── game-registry.js           # Central metadata: all game names, rules, icons, titles
        ├── game.js                    # Main frontend orchestrator (socket events, routing)
        ├── lobby.js                   # Room management UI
        ├── game-chess.js              # Chess UI handler
        ├── game-omok.js               # Omok UI handler
        ├── game-connect4.js           # Connect4 UI handler
        ├── game-othello.js            # Othello UI handler
        ├── game-checkers.js           # Checkers UI handler
        ├── game-indianpoker.js        # Indian Poker UI handler
        ├── game-applegame.js          # Apple Game UI handler
        ├── game-battleship.js         # Battleship UI handler
        ├── game-backgammon.js         # Backgammon UI handler
        ├── game-texasholdem.js        # Texas Hold'em UI handler
        ├── game-dotsboxes.js          # Dots & Boxes UI handler
        ├── game-mancala.js            # Mancala UI handler
        ├── ai-chess.js                # Chess AI (minimax depth-3, alpha-beta)
        ├── ai-omok.js                 # Omok AI (heuristic pattern scoring)
        ├── ai-connect4.js             # Connect4 AI (minimax depth-6, alpha-beta)
        ├── ai-othello.js              # Othello AI (minimax depth-4, corner weighting)
        ├── ai-checkers.js             # Checkers AI (minimax depth-4)
        ├── ai-indianpoker.js          # Indian Poker AI (card comparison heuristic)
        ├── ai-applegame.js            # Apple Game AI (greedy largest rectangle)
        ├── ai-battleship.js           # Battleship AI (hunt-and-target strategy)
        ├── ai-backgammon.js           # Backgammon AI (heuristic)
        ├── ai-texasholdem.js          # Texas Hold'em AI (hand-strength heuristic)
        ├── ai-dotsboxes.js            # Dots & Boxes AI (chain strategy)
        ├── ai-mancala.js              # Mancala AI (heuristic)
        ├── board.js                   # Chess board renderer
        ├── omok-board.js              # Omok board renderer
        ├── connect4-board.js          # Connect4 board renderer
        ├── othello-board.js           # Othello board renderer
        ├── checkers-board.js          # Checkers board renderer
        ├── indian-poker.js            # Indian Poker UI module
        ├── applegame-board.js         # Apple Game board renderer
        ├── battleship-board.js        # Battleship board renderer
        ├── backgammon-board.js        # Backgammon board renderer
        ├── dotsboxes-board.js         # Dots & Boxes board renderer
        ├── mancala-board.js           # Mancala board renderer
        ├── chat.js                    # Chat + emoji system
        ├── timer.js                   # Timer with client-side interpolation
        ├── review.js                  # Chess game replay
        ├── sound.js                   # Web Audio API procedural sounds
        ├── stats.js                   # Player stats (localStorage)
        └── guest.js                   # Guest profile management
```

---

## Architecture

### Backend

The backend is split into modules under `server/`. The entry point `server.js` is just one line: `require('./server/index.js')`.

**Key data structures (in-memory, in `server/state.js`):**
- `state.rooms: Map<roomId, RoomState>` — all active game rooms
- `state.tokenMap: Map<playerToken, {roomId, role}>` — reconnection tokens
- `state.io` — the Socket.io server instance

**Game handler registry (`server/handlers/index.js`):**
```javascript
module.exports = new Map([
  ['chess',       require('./chess')],
  ['battleship',  require('./battleship')],
  // ...
]);
```
Each handler exports: `{ initRoom(base, opts), resetRoom(room), handleMove(socket, room, role, data) }`

**The `game:move` dispatcher** in `server/events.js` is now one line:
```javascript
const handler = handlers.get(room.gameType);
if (handler) handler.handleMove(socket, room, role, data);
```

**HTTP API (`server/routes.js`):**
- `GET /api/status` — server health + room list (shutdown key for localhost only)
- `POST /admin/shutdown` — graceful shutdown (requires shutdown key)
- `POST /admin/terminate` — force-end a specific game

**Socket.io events (client → server, in `server/events.js`):**

| Event | Purpose |
|-------|---------|
| `room:create` | Create a new game room |
| `room:join` | Join an existing room by ID |
| `room:reconnect` | Reconnect with a player token |
| `game:move` | Submit a game move (routes via handler registry) |
| `game:resign` | Resign the game |
| `game:draw:offer` | Offer/accept/decline a draw |
| `chat:send` | Send a chat message |
| `indianpoker:action` | Indian Poker betting action |

**Room lifecycle:**
- Waiting rooms: deleted after 30 minutes idle
- Finished games: deleted after 10 minutes
- Timer tick: every 500ms, checks all active rooms

### Frontend

**No frameworks** — vanilla HTML/CSS/JavaScript only.

- `game-registry.js` — single source of truth for all per-game metadata (names, rules, titles, icons)
- `game.js` — orchestrator: socket connection, event routing, UI coordination
- Each `game-*.js` — UI handler for one game (standard 6-method interface)
- Each `ai-*.js` — client-side AI engine (runs in browser, submits moves via socket)
- Each `*-board.js` — DOM board renderer
- `css/games/` — per-game styles loaded in `<head>`

**Standard game handler interface** (all `game-*.js` files export this):
```javascript
window.GameHandlers.gamename = {
  initBoard(state, myColor, handleAction),      // reconnect
  initSpectatorBoard(state, hostColor, handleAction),
  initGame(state, myColor, handleAction),        // fresh start
  onMoveMade({ move, board, ... }),              // server broadcast
  getMyTurn(state, myColor),                     // returns boolean
  startSolo(playerColor, helpers, options),      // AI mode
}
```

**AI is client-side only** — AI runs in the browser and submits moves through the normal socket flow, identical to a human player.

---

## Key Conventions

### Code Style
- **Language**: JavaScript (ES6+), no TypeScript, no build tools
- **Indentation**: 2 spaces
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Socket.io events**: kebab-case with colon namespace (`room:create`, `game:move`)
- **Comments**: Korean throughout the codebase — maintain this style when adding comments
- **No linter/formatter** configured (no ESLint, no Prettier)

### Adding a New Game

See **`ADDING_A_GAME.md`** for the complete 10-step guide.

Summary — 10 files, maximum 2 with >1-line edits:

| File | Action |
|------|--------|
| `server/handlers/mygame.js` | **CREATE** |
| `server/handlers/index.js` | **EDIT** — 1 line |
| `public/js/game-mygame.js` | **CREATE** |
| `public/js/mygame-board.js` | **CREATE** |
| `public/js/ai-mygame.js` | **CREATE** |
| `public/css/games/mygame.css` | **CREATE** |
| `public/js/game-registry.js` | **EDIT** — 1 entry |
| `public/index.html` | **EDIT** — 1 card block |
| `public/game.html` | **EDIT** — board area + 3 script tags |
| `public/js/stats.js` | **EDIT** — 1 line |

### Dependency Rules
- **chess.js is pinned to `0.12.0`** (not `^0.12.0`) — the v0.13+ API is incompatible. Do NOT upgrade.
- Keep the dependency list minimal — avoid adding new packages unless essential.

### Security Patterns
- All move validation happens **server-side** — never trust client-side game state
- Rate limits are applied to room creation (5/min), reconnect (5/min), join (10/min)
- The admin shutdown key is stored in `.shutdown-key` with mode `0o600`
- `.shutdown-key` is in `.gitignore` — never commit it

### State & Persistence
- **No database** — all game state is in-memory and lost on server restart
- **Player stats** are stored in browser `localStorage` only
- Stats persist up to 30 days of inactivity; no server-side sync
- Do not add a database without discussing the architecture change first

---

## Tests

**There are no automated tests.** The project has no test runner, no test files, and no `test` script in `package.json`.

When making changes:
- Manually test the affected game(s) by running the server and playing locally
- Test both 2-player (open two browser tabs) and solo (vs AI) modes
- Verify the admin endpoint still responds: `GET /api/status`

---

## Deployment

Deployed on **Render.com** via `render.yaml`:
- Runtime: Node.js
- Build command: `npm install`
- Start command: `node server.js`
- Port: `10000` (set via `PORT` env var by Render)
- Health check: `GET /api/status`

**Branch strategy:**
- `main` → production (auto-deployed by Render on push)
- Feature branches merge directly to `main`

---

## Common Tasks

### Check server health
```bash
curl http://localhost:3000/api/status
```

### Add or modify game rules
Rule validation is in `server/handlers/<gamename>.js`. Search for `handleMove` in the relevant handler file.

### Add a new game
Follow `ADDING_A_GAME.md`. The registry pattern means you only need to create the handler file and register it in `server/handlers/index.js` — no other server file needs to change.

### Modify AI difficulty
AI engines are in `public/js/ai-*.js`. Adjust minimax depth constants at the top of each file. Higher depth = stronger AI but slower (runs in browser).

### Update per-game styles
Each game has its own CSS file at `public/css/games/<gamename>.css`. Shared layout styles are in `public/css/game.css`.

### Update game metadata (rules, titles, icons)
Edit `public/js/game-registry.js`. This is the single source of truth used by both the lobby and game page.

### Update PWA assets
- Icons: `public/icons/`
- Manifest: `public/manifest.json`
- Service Worker cache list: `public/sw.js`

---

## Known Limitations

- Server restart loses all in-progress games (by design — no persistence layer)
- Rate limits are in-memory and reset on server restart
- Chess AI (depth-3) is intentionally weak to be playable in a browser
- No user accounts — players are identified by temporary tokens per session
- Admin shutdown is single-server only (not suitable for multi-instance deployments)
- Scaling beyond a single Render instance requires adding a Redis adapter for Socket.io
