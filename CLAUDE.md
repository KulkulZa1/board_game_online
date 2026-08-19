# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Other AI tools:** `AGENTS.md` holds the same guardrails in tool-agnostic form
> (Codex, Cursor, Gemini CLI, etc. read it; Copilot reads
> `.github/copilot-instructions.md`). Keep the three in sync when conventions change —
> `AGENTS.md` §4 "Traps" is the canonical list.

## Overview

A real-time multiplayer board game platform built with Node.js + Express + Socket.io. It has **three intentional layers**, plus one experimental one:

| Layer | What | Where |
|-------|------|-------|
| **A — Board Games** | 12 turn-based 1v1 multiplayer games (+ 2 self-contained multiplayer specials) | Lobby → `/game.html` |
| **B — Arcade Games** | 9 solo standalone games | `/arcade/*` |
| **C — Sandbox** | 3 config-driven game design tools | Dev-only, `npm run sandbox` |
| *(experimental)* **3D** | Standalone Three.js prototype, no server integration | `/games3d/chess3d/` |

Layer A supports **12 games**: Chess, Omok, Connect4, Othello, Checkers, Indian Poker, Apple Game, Battleship, Backgammon, Texas Hold'em, Dots & Boxes, Mancala. They share one 2-player host/guest `RoomState` and one handler-registry dispatch pattern (see Architecture below).

**Special case — Riichi Mahjong (4-player)**: lives OUTSIDE the 2-player room system as a self-contained module (`server/mahjong.js` + `server/handlers/mahjong-engine.js` + `/mahjong.html` + `public/js/mahjong-client.js`, socket events `mahjong:*`).
**Special case — BANG! (4-7 players)**: same self-contained pattern (`server/bang.js` + `server/handlers/bang-engine.js` + `/bang.html` + `public/js/bang-client.js`, socket events `bang:*`).
Do NOT try to fit either into the host/guest `RoomState` — they are intentionally separate subsystems.

Layer B currently has **9 arcade games**: Snake, Breakout, Vampire Survivors (`vampire`), Plant Growing (`plant`), Tower Defense (`tower-defense`), 산업의 시대 / "Industrial Age" (`factory`), 문명 키우기 / civilization idle-clicker (`bootstrap`), 월세 잭팟 / slot roguelite (`jackpot`), NEON CASCADE (`neon-cascade`). All are zero-server-dependency static pages served under `/arcade/<name>/` — see `ADDING_AN_ARCADE_GAME.md`.

Layer C has **3 design sandboxes**: `vampire-survivors`, `plant-growing`, `tower-defense`. They save live config to browser `localStorage` and feed the matching arcade game (see "Sandbox → arcade" below). Sandbox is dev-only — production must return 404 for `/sandbox/` (enforced by the smoke test).

The `/games3d/chess3d/` page (linked from the lobby) is an early, standalone Three.js prototype with no socket/server wiring — see `3D_near_future_plan.md` for the intended "v2" layering (`public/games3d/` staying additive, never touching v1 board-game code).

The platform runs as a PWA, is deployed on Render.com, and has **no database** — board game state is in-memory, stats are in browser localStorage. An Android build also exists via Capacitor (`capacitor.config.json`, `BUILDING_ANDROID.md`) — it is a thin native wrapper whose WebView points at the live Render URL (`server.url` in the config), not a bundled copy of `public/`.

**Do not treat arcade games or sandbox as scope creep.** All layers are intentional and should be maintained.

---

## Development Setup

```bash
# Install dependencies (requires Node.js >= 18)
npm install

# Start the game server
npm start          # or: npm run dev / node server.js
# Visit http://localhost:3000

# Serve sandbox locally (dev-only, not part of production server)
npm run sandbox
# Visit http://localhost:3001
```

**Validation commands:**

| Command | What it does |
|---------|---------------|
| `npm run lint` | `scripts/check-js.js` — parses every `.js` file in the repo for syntax errors (no ESLint config) |
| `npm test` | `scripts/smoke-test.js` — starts the server on port 13001, runs 82 assertions (handler registry, room creation, core routes) |
| `npm run test:full` | `scripts/smoke-check.js` — starts the server on port 3100, checks routes/static assets/handlers plus JS syntax across the whole repo (slower, more thorough than `npm test`) |
| `npm run test:games` | `scripts/run-game-flow-tests.js` — runs 7 rule-engine/flow suites from `prototypes/`: Mahjong (engine, flow, timer), BANG! flow, a 36-assertion backgammon/texasholdem/dotsboxes handler suite, a 40-assertion suite covering the other 9 board games (`core-games-handler-test.js`), and `snake-rogue-test.js` (42 assertions — snake's roguelite rules *and* balance). Each is also runnable standalone via `node prototypes/<name>.js` |
| `npm run check` | `lint && test && test:games && test:full` — run before considering a change done |
| `npm run build` | `scripts/no-build.js` — no-op that just prints "there is no build step" (there is genuinely no bundler) |
| `npm run verify:production` | `scripts/verify-production-version.js` — after a Render deploy, hits `/api/version` to confirm the live commit/branch match what you expect. Pass `EXPECTED_COMMIT=<sha>` to check a specific commit. See `docs/render-version-verification.md`. |

There is no single-test-file runner — `smoke-test.js`/`smoke-check.js` are monolithic scripts; to focus on one thing, read the relevant section of the script or run the server manually and hit routes with `curl`.

**Environment variables** (none are required for local dev):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | Server listening port (Render sets `10000`) |
| `TUNNEL_URL` | none | Public URL printed on startup and reported by `/api/status` (Cloudflare/Render) |
| `ALLOWED_ORIGINS` | `https://board-game-online.onrender.com` | Comma-separated CORS/Socket.io origin allowlist. `localhost`/`127.0.0.1`/`192.168.x.x` are always allowed for dev regardless of this setting. Set to `*` to allow all. |
| `ENABLE_ADMIN_ROUTES` | unset | Set to `"true"` to allow `/admin/shutdown` and `/admin/terminate` from non-loopback requests (normally admin routes only respond to requests from `localhost`) |
| `RENDER_GIT_COMMIT` / `RENDER_GIT_BRANCH` | none | Auto-injected by Render on deploy; exposed via `GET /api/version` for cache-busting/deploy verification |

There is no `.env` file in the repo — configure via the shell or deployment platform.

---

## Repository Structure

```
board_game_online/
├── server.js            # Thin entry point: require('./server/index.js')
├── server/               # Backend modules (Node.js, no build step)
│   ├── index.js          # Express + Socket.io setup, CORS, static routes, server startup
│   ├── state.js           # Shared mutable state (rooms, tokenMap, io ref)
│   ├── utils.js            # Pure helpers (rateCheck, getRoleColor, etc.)
│   ├── security.js          # isLocalRequest/isAdminEnabled — gates /admin/* to loopback unless ENABLE_ADMIN_ROUTES
│   ├── rooms.js              # createRoomState(), resetForRematch()
│   ├── endgame.js              # endGame(), startGame(), approveSpectator()
│   ├── timers.js                 # Timer tick loop (500ms), rate-limit cleanup
│   ├── events.js                  # All 2-player socket.on() event handlers + game:move dispatch
│   ├── routes.js                   # HTTP routes (/api/status, /api/version, /admin/*)
│   ├── mahjong.js                   # Riichi Mahjong room/table lifecycle (self-contained, 4-player)
│   ├── bang.js                       # BANG! table lifecycle (self-contained, 4-7 player)
│   └── handlers/                      # Per-board-game move handlers (one file per Layer A game)
│       ├── index.js                    # Game registry Map (gameType → handler module)
│       ├── mahjong-engine.js            # Mahjong rule engine (used by server/mahjong.js)
│       ├── bang-engine.js                # BANG! rule engine (used by server/bang.js)
│       └── <chess|omok|connect4|othello|checkers|indianpoker|applegame|battleship|backgammon|texasholdem|dotsboxes|mancala>.js
│
├── package.json          # 4 runtime deps: express, socket.io, chess.js (0.12.0), uuid
├── render.yaml            # Render.com deployment config
├── capacitor.config.json   # Android WebView wrapper config (points at the live Render URL)
├── GAMES.md                 # ALL games: state shapes, move formats, win conditions (read this first)
├── ADDING_A_GAME.md          # Developer guide: 10-step checklist to add a new 2-player board game
├── ADDING_AN_ARCADE_GAME.md   # Developer guide: adding a solo arcade game (3 files, zero server changes)
├── BUILDING_ANDROID.md         # Capacitor Android build guide
├── CHANGELOG.md / ROADMAP.md    # History / forward plan
├── docs/                          # Design docs + deploy runbooks (launch-readiness.md, render-version-verification.md, new-game-candidates.md, per-game GDDs, versioned release notes under v1.0/v1.1/v1.2)
├── prototypes/                     # Two kinds: rule-engine/flow suites (mahjong-*, bang-flow, newer-games-handler, core-games-handler) run by `npm run test:games`, AND balance simulators (bootstrap-sim, jackpot-autoplay, civ-mvp-autoplay) that are not wired into any npm script
├── sandbox/                         # Layer C design tools, served only by `npm run sandbox` (never in production)
│
└── public/                          # Everything served by Express as static files
    ├── index.html                    # Lobby (game selection + room create/join)
    ├── game.html                      # Layer A game page (board + chat + timer)
    ├── mahjong.html / bang.html        # Self-contained pages for the 4-player specials
    ├── admin.html                       # Admin dashboard (status, shutdown)
    ├── manifest.json / sw.js             # PWA manifest / Service Worker
    ├── games3d/chess3d/                   # Experimental standalone Three.js prototype (client-only)
    ├── arcade/<snake|breakout|vampire|plant|tower-defense|factory|bootstrap|jackpot|neon-cascade>/
    │                                        # Layer B: index.html + style.css + game.js (IIFE) per game
    ├── css/
    │   ├── lobby.css / game.css            # Shared lobby + game-page layout, chat, modals, spectator UI
    │   └── games/<gamename>.css             # One file per Layer A game (+ mahjong.css, bang.css)
    └── js/
        ├── game-registry.js                 # Single source of truth for Layer A game metadata (names, rules, icons, titles)
        ├── game.js                           # Layer A frontend orchestrator (socket events, routing)
        ├── lobby.js                           # Room management UI
        ├── mahjong-client.js / bang-client.js  # Frontend for the two self-contained specials
        ├── game-<gamename>.js                   # Per-game UI handler (standard interface, see below) — one per Layer A game
        ├── ai-<gamename>.js                      # Per-game client-side AI engine — one per Layer A game
        ├── <gamename>-board.js                    # Per-game DOM board renderer — one per Layer A game
        ├── chat.js / timer.js / review.js / sound.js / stats.js / guest.js
        │                                            # Chat+emoji, timer interpolation, chess replay, procedural audio, localStorage stats, guest profile
        ├── admob.js                                 # AdMob interstitial wrapper (no-op on web, live in native Android build)
        ├── sandbox-config.js                         # Reads Layer C sandbox localStorage config into the matching arcade game
        ├── version-badge.js                           # Fetches /api/version to show branch+commit badge on lobby/admin
        └── sw-update.js                                 # Service worker update UX
```

---

## Architecture

### Backend

The backend is split into modules under `server/`. The entry point `server.js` is one line: `require('./server/index.js')`.

**Key data structures (in-memory, in `server/state.js`):**
- `state.rooms: Map<roomId, RoomState>` — all active 2-player game rooms
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

**The `game:move` dispatcher** in `server/events.js` is one line:
```javascript
const handler = handlers.get(room.gameType);
if (handler) handler.handleMove(socket, room, role, data);
```

**Mahjong and BANG! do not go through this registry** — `server/mahjong.js` and `server/bang.js` own their own table lifecycle and socket events (`mahjong:*`, `bang:*`), delegating rule logic to `server/handlers/mahjong-engine.js` / `bang-engine.js`.

**HTTP API (`server/routes.js`):**
- `GET /api/status` — server health + room list (room detail / shutdown key only included for loopback requests)
- `GET /api/version` — deployed commit/branch (from `RENDER_GIT_COMMIT`/`RENDER_GIT_BRANCH`), used for cache-busting and `verify:production`
- `POST /admin/shutdown` — graceful shutdown (requires shutdown key; gated by `isAdminEnabled` in `server/security.js`)
- `POST /admin/terminate` — force-end a specific game (same gating)

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

**No frameworks** — vanilla HTML/CSS/JavaScript only, no build step, no bundler.

- `game-registry.js` — single source of truth for all per-game metadata (names, rules, titles, icons)
- `game.js` — orchestrator: socket connection, event routing, UI coordination
- Each `game-*.js` — UI handler for one game (standard interface below)
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

### Sandbox → arcade content flow

Sandbox editors (Layer C, `npm run sandbox`, never served in production) save live config to browser `localStorage`:

| Sandbox | Storage key | Feeds |
|---|---|---|
| `sandbox/vampire-survivors/` | `sandbox_vs_config` | `/arcade/vampire/` via `public/js/sandbox-config.js` |
| `sandbox/plant-growing/` | `sandbox_pg_config` | `/arcade/plant/` via `public/js/sandbox-config.js` |
| `sandbox/tower-defense/` | `sandbox_td_config` / `td_published_config` | `/arcade/tower-defense/` via a production-safe runtime alias at `/arcade/tower-defense/runtime/` (an Express static mount pointing at `sandbox/tower-defense/`, not the editor itself) |

Tower Defense has an explicit Publish/Import workflow for when the sandbox and main app run on different origins — see `README.md` § "Sandbox to arcade content flow" for the steps.

---

## Key Conventions

### Code Style
- **Language**: JavaScript (ES6+), no TypeScript, no build tools
- **Indentation**: 2 spaces
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **Socket.io events**: kebab-case with colon namespace (`room:create`, `game:move`, `mahjong:*`, `bang:*`)
- **Comments**: Korean throughout the codebase — maintain this style when adding comments
- **No linter/formatter** configured (no ESLint, no Prettier) — `npm run lint` only checks for syntax errors, not style

### Adding a New Board Game (Layer A)

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

Also add the new game to `REQUIRED_GAMES` in `scripts/smoke-test.js`.

### Adding a New Arcade Game (Layer B)

See **`ADDING_AN_ARCADE_GAME.md`**. Three files under `public/arcade/<name>/` (`index.html`, `style.css`, `game.js` as a single IIFE), zero server changes, zero `game-registry.js` changes. Also add the new route(s) to the `ROUTES` array in `scripts/smoke-test.js`.

### Dependency Rules
- **chess.js is pinned to `0.12.0`** (not `^0.12.0`) — the v0.13+ API is incompatible. Do NOT upgrade.
- The **browser** also needs chess.js (the client validates and previews chess moves). `server/index.js` serves the same installed copy at `/vendor/chess.js`, so `package.json` stays the single source of version truth. Do NOT reintroduce a CDN `<script>` for it — a blocked CDN or an offline PWA leaves `Chess` undefined and chess dies on load.
- Keep the dependency list minimal — avoid adding new packages unless essential.
- The only remaining third-party runtime fetch is three.js in `public/games3d/chess3d/` — that page is an isolated prototype with no server integration, and three is not a project dependency.

### Security Patterns
- All move validation happens **server-side** — never trust client-side game state
- Rate limits are applied to room creation (5/min), reconnect (5/min), join (10/min)
- `/admin/*` routes are gated by `server/security.js` to loopback requests only, unless `ENABLE_ADMIN_ROUTES=true`
- The admin shutdown key is stored in `.shutdown-key` with mode `0o600`; it is in `.gitignore` — never commit it
- Generated native project dirs (`android/`, `ios/`) are also gitignored — build locally via Capacitor, do not commit them

### State & Persistence
- **No database** — all game state is in-memory and lost on server restart
- **Player stats** are stored in browser `localStorage` only
- Stats persist up to 30 days of inactivity; no server-side sync
- Do not add a database without discussing the architecture change first

---

## Tests

**`npm test`** (`scripts/smoke-test.js`) starts a real server on port 13001 and checks:
1. **Module load** — all 12 board-game handlers load correctly (handler exists + `initRoom`/`handleMove`/`resetRoom` per game)
2. **Room state creation** — chess and connect4 rooms initialize with correct structure
3. **Core HTTP routes** — lobby, `/game.html`, `/api/status` (JSON shape), `/mahjong.html`, `/bang.html`, every `/arcade/<name>/` route (including nested runtime assets like `/arcade/tower-defense/runtime/game.js`), and `/sandbox/` → **must be 404** (sandbox must NOT be production-accessible)

**`npm run test:games`** (`scripts/run-game-flow-tests.js`) runs the rule-engine suites that the smoke tests don't cover: Mahjong engine/flow/timer, BANG! flow, `newer-games-handler-test.js` (36 assertions across backgammon, texasholdem, dotsboxes), and `core-games-handler-test.js` (40 assertions across chess, omok, connect4, othello, checkers, mancala, applegame, battleship, indianpoker). Add new rule-engine suites to the `tests` array in that script.

Between them the two handler suites cover the rules of all 12 Layer A games. They assert real rule edges — forced/multi-jump and king promotion in checkers, Othello's pass-and-continue, Mancala sowing/capture, Battleship placement rejection, size-dependent draw thresholds — and they carry regression coverage for bugs that shipped once (see CHANGELOG).

**`npm run test:full`** (`scripts/smoke-check.js`) does the same route/handler checks as `npm test` plus a JS syntax pass over the whole repo — slower, run it (via `npm run check`) before considering larger changes done.

When adding a new board game handler, add it to `REQUIRED_GAMES` in `scripts/smoke-test.js`. When adding a new arcade route, add it to the `ROUTES` array in the same file.

When making changes:
- Run `npm run check` (lint + test + test:games + test:full) to verify handlers, routes, rule engines, and JS syntax
- Manually test the affected game(s) by running the server and playing locally
- Test both 2-player (open two browser tabs) and solo (vs AI) modes for board games

---

## Deployment

Deployed on **Render.com** via `render.yaml`:
- Runtime: Node.js
- Build command: `npm install`
- Start command: `node server.js`
- Port: `10000` (set via `PORT` env var by Render)
- Health check: `GET /api/status`
- Static roots: `public/` at `/`; `sandbox/` is intentionally NOT mounted in production (dev-only)

After a deploy, run `npm run verify:production` (optionally with `EXPECTED_COMMIT=<sha>`) to confirm the live server is serving the expected commit — see `docs/render-version-verification.md`.

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
Rule validation is in `server/handlers/<gamename>.js`. Search for `handleMove` in the relevant handler file. Mahjong/BANG! rules live in `server/handlers/mahjong-engine.js` / `bang-engine.js` instead.

### Add a new game
Follow `ADDING_A_GAME.md` (2-player) or `ADDING_AN_ARCADE_GAME.md` (solo arcade). The registry pattern means a 2-player game only needs a handler file plus a 1-line registration in `server/handlers/index.js` — no other server file needs to change. Arcade games need zero server changes at all.

### Modify AI difficulty
AI engines are in `public/js/ai-*.js`. Adjust minimax depth constants at the top of each file. Higher depth = stronger AI but slower (runs in browser).

### Update per-game styles
Each Layer A game has its own CSS file at `public/css/games/<gamename>.css`. Shared layout styles are in `public/css/game.css`.

### Update game metadata (rules, titles, icons)
Edit `public/js/game-registry.js`. This is the single source of truth used by both the lobby and game page (Layer A only — arcade games and Mahjong/BANG! are not in this registry).

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
- `/games3d/chess3d/` is an early prototype with no server integration — don't assume it follows the Layer A or B conventions
