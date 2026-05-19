# Co-work Brief — Multi-Agent Handoff

> Hand this file to a new AI session to orient it quickly.
> "Read COWORK_BRIEF.md, then CLAUDE.md, then begin the task."

---

## Project in one sentence

Real-time 1v1 multiplayer board game platform (12 games) with a solo arcade section
(4 games) and developer-only game design sandbox tools (3 sandboxes).
Tech: Node.js + Express + Socket.io + Vanilla JS. No database. No build step.

---

## Three layers — read this first

| Layer | Games | Served at | Dev command |
|-------|-------|-----------|-------------|
| A — Board Games | 12 multiplayer | `/` lobby → `/game.html` | `node server.js` |
| B — Arcade Games | 4 solo | `/arcade/*` | (same server) |
| C — Sandbox | 3 design tools | **NOT in production** | `npm run sandbox` |

---

## Start here for any task

```bash
npm install          # install 4 deps (express, socket.io, chess.js 0.12.0, uuid)
node server.js       # start on :3000
npm test             # smoke test — 65 assertions, must all pass
```

---

## Key files (read these, not the whole codebase)

| File | What it tells you |
|------|-------------------|
| `GAMES.md` | State shape + move format + win conditions for all 12 board games + arcade/sandbox summaries |
| `CLAUDE.md` | Full architecture, conventions, directory layout, security patterns |
| `ADDING_A_GAME.md` | 10-step checklist for adding a new board game |
| `ADDING_AN_ARCADE_GAME.md` | Guide for adding a solo arcade game |
| `ROADMAP.md` | What's done, what's planned, key architectural decisions |

---

## Current state (v1.4.0 — 2026-05-19)

### Stable and complete
- All 12 board game handlers (`server/handlers/*.js`)
- All 12 frontend game handlers + AI engines + board renderers
- 4 arcade games at `/arcade/{snake,breakout,vampire,plant}/`
- 3 sandbox design tools (`sandbox/{vampire-survivors,plant-growing,tower-defense}/`)
- Smoke test: 65 assertions (handlers + HTTP routes including all arcade games)

### Known open items
1. Android AdMob IDs are placeholders — need real values before Play Store submission
2. 3D chess (`/games3d/chess3d/`) importmap compatibility needs device testing
3. Per-game handler unit tests for backgammon, texasholdem, dotsboxes (not yet written)
4. Tower Defense arcade game (production version) — sandbox prototype exists, arcade not yet built

---

## Architecture at a glance

**Server:**
```
server.js → server/index.js → registers routes + socket events
server/events.js: socket.on('game:move') → handlers.get(room.gameType).handleMove(...)
server/handlers/index.js: Map of gameType → { initRoom, resetRoom, handleMove }
server/endgame.js: endGame(room, winner, reason, extras) — call to finish any game
```

**Frontend:**
```
public/js/game.js: orchestrator — connects socket, routes events to GameHandlers[gameType]
public/js/game-registry.js: central metadata for all 12 games (icons, names, rules)
public/js/game-<name>.js: UI handler per game — initGame, onMoveMade, getMyTurn, startSolo
public/js/ai-<name>.js: client-side AI per game — runs in browser
```

**Sandbox:**
```
sandbox/<name>/config.js: window.<X>_CONFIG (live) + window.<X>_DEFAULTS (reset copy)
sandbox/<name>/game.js: game loop, reads config every frame
sandbox/<name>/ui.js: 7 editor tabs, sliders, charts, localStorage persistence
```

---

## Rules for any AI agent working here

1. **Run `npm test` before and after changes** — all 65 must pass
2. **chess.js is pinned to 0.12.0** — do not upgrade (v0.13+ has incompatible API)
3. **Sandbox is NOT served in production** — assert `/sandbox/ → 404` in smoke test
4. **No database** — do not add persistence without architectural discussion
5. **Comments in Korean** — match existing style when adding inline comments
6. **No build tools** — vanilla JS, no webpack, no TypeScript, no ESLint
7. **New board game?** Follow `ADDING_A_GAME.md` exactly — 10 files, max 2 with multi-line edits
8. **New arcade game?** Follow `ADDING_AN_ARCADE_GAME.md` — 3 files + lobby card + smoke test entry

---

## Branch strategy

```
main                              ← production (auto-deployed to Render.com)
claude/add-claude-documentation-* ← current work branch
```

Push to feature branch; do not push directly to `main` without explicit permission.

---

*Last updated: 2026-05-19 | Repo: KulkulZa1/board_game_online*
