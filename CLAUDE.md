# CLAUDE.md — AI Assistant Guide for board_game_online

## Overview

This is a real-time multiplayer board game platform built with Node.js + Express + Socket.io. It supports 6 games (Chess, Omok, Connect4, Othello, Checkers, Indian Poker), runs as a Progressive Web App (PWA), and is deployed on Render.com. There is **no database** — all game state is held in memory on the server, and player stats are stored in browser localStorage.

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
├── server.js            # Entire backend (Express + Socket.io, ~1,900 lines)
├── package.json         # 4 dependencies: express, socket.io, chess.js (0.12.0), uuid
├── render.yaml          # Render.com deployment config
├── README.md            # Korean-language project intro
├── CHANGELOG.md         # Version history (v1.0 → v1.2)
│
├── public/
│   ├── index.html       # Lobby (game selection + room create/join)
│   ├── game.html        # Game page (board + chat + timer)
│   ├── admin.html       # Admin dashboard (status, shutdown)
│   ├── privacy.html     # Play Store privacy policy
│   ├── manifest.json    # PWA manifest
│   ├── sw.js            # Service Worker (caching/offline)
│   ├── .well-known/
│   │   └── assetlinks.json  # Android TWA domain verification
│   ├── css/
│   │   ├── lobby.css
│   │   └── game.css
│   └── js/
│       ├── game.js                    # Main frontend orchestrator
│       ├── lobby.js                   # Room management UI
│       ├── game-chess.js              # Chess UI handler
│       ├── game-omok.js               # Omok UI handler
│       ├── game-connect4.js           # Connect4 UI handler
│       ├── game-othello.js            # Othello UI handler
│       ├── game-checkers.js           # Checkers UI handler
│       ├── game-indianpoker.js        # Indian Poker UI handler
│       ├── ai-chess.js                # Chess AI (minimax depth-3, alpha-beta)
│       ├── ai-omok.js                 # Omok AI (heuristic pattern scoring)
│       ├── ai-connect4.js             # Connect4 AI (minimax depth-6, alpha-beta)
│       ├── ai-othello.js              # Othello AI (minimax depth-4, corner weighting)
│       ├── ai-checkers.js             # Checkers AI (minimax depth-4)
│       ├── ai-indianpoker.js          # Indian Poker AI (card comparison heuristic)
│       ├── board.js                   # Chess board renderer
│       ├── omok-board.js              # Omok board renderer
│       ├── connect4-board.js          # Connect4 board renderer
│       ├── othello-board.js           # Othello board renderer
│       ├── checkers-board.js          # Checkers board renderer
│       ├── indian-poker.js            # Indian Poker UI module
│       ├── chat.js                    # Chat + emoji system
│       ├── timer.js                   # Timer with client-side interpolation
│       ├── review.js                  # Chess game replay
│       ├── sound.js                   # Web Audio API procedural sounds
│       ├── stats.js                   # Player stats (localStorage)
│       └── guest.js                   # Guest profile management
│
└── docs/
    ├── v1.0/            # Korean technical docs for v1.0
    ├── v1.1/            # v1.1 planning notes
    └── v1.2/            # v1.2 release notes
```

---

## Architecture

### Backend (`server.js`)

All backend logic lives in a **single file**. There is no build step.

**Key data structures (in-memory):**
- `rooms: Map<roomId, RoomState>` — all active game rooms
- `tokenMap: Map<playerToken, {roomId, playerIndex}>` — reconnection tokens

**HTTP API:**
- `GET /api/status` — server health, active room count (returns shutdown key for localhost requests)
- `POST /admin/shutdown` — graceful shutdown (requires shutdown key)
- `POST /admin/terminate` — force-end a specific game

**Socket.io events (client → server):**

| Event | Purpose |
|-------|---------|
| `room:create` | Create a new game room |
| `room:join` | Join an existing room by ID |
| `room:reconnect` | Reconnect with a player token |
| `game:move` | Submit a game move (routes to per-game handler) |
| `game:resign` | Resign the game |
| `game:draw:offer` | Offer/accept/decline a draw |
| `chat:send` | Send a chat message |
| `indianpoker:action` | Indian Poker betting action |

**Per-game server handlers:**
- `handleChessMove()` — delegates to chess.js for validation, tracks FEN history
- `handleOmokMove()` — 5-in-a-row check + renju rule (no 6+, no double-3)
- `handleConnect4Move()` — gravity simulation + 4-in-a-row check
- `handleOthelloMove()` — flip logic + auto-pass when no valid moves
- `handleCheckersMove()` — forced-jump enforcement + multi-jump chains
- `handleIndianPokerAction()` — state machine: deal → bet → showdown

**Room cleanup:**
- Waiting rooms: deleted after 30 minutes idle
- Finished games: deleted after 10 minutes
- Cleanup interval: runs every 60 minutes

### Frontend

**No frameworks** — vanilla HTML/CSS/JavaScript only.

- `game.js` is the orchestrator: handles socket connection, routes events to the correct `game-*.js` handler
- Each `game-*.js` module handles UI for one game
- Each `ai-*.js` module implements client-side AI (runs in the browser)
- Board renderers (`board.js`, `omok-board.js`, etc.) manage DOM manipulation for the board grid

**AI is client-side only** — the AI player runs in the browser and submits moves through the normal socket flow, just like a human player.

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
1. Add server-side handler function `handleXxxMove()` in `server.js`
2. Register the handler in the `game:move` socket event router
3. Create `public/js/game-xxx.js` for UI logic
4. Create `public/js/ai-xxx.js` for AI (if supporting solo mode)
5. Create `public/js/xxx-board.js` for board rendering (if needed)
6. Add game card to `public/index.html` lobby grid
7. Wire up the new handler in `public/js/game.js`

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
- `dev` → development branch for staging changes
- Feature branches merge to `dev`, then `dev` merges to `main`

---

## Common Tasks

### Check server health
```bash
curl http://localhost:3000/api/status
```

### View active rooms (local only)
The `/api/status` response includes the shutdown key only when requested from `localhost`. The admin UI at `/admin.html` uses this key.

### Add or modify game rules
All rule validation is in `server.js`. Search for `handle{GameName}Move` to find the relevant section.

### Modify AI difficulty
AI engines are in `public/js/ai-*.js`. Adjust minimax depth constants at the top of each file. Higher depth = stronger AI but slower (runs in browser).

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
