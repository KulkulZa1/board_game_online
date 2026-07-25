# Co-work Brief — Multi-Agent Handoff

> Hand this file to a new AI session to orient it quickly.
> **"Read COWORK_BRIEF.md, then AGENTS.md, then begin the task."**
>
> This is the *orientation* doc — what exists and what state it's in.
> `AGENTS.md` is the *working agreement* — commands, guardrails, verification.

---

## Project in one sentence

Real-time 1v1 multiplayer board game platform (12 games) plus two self-contained
multiplayer games (Mahjong, BANG!), a solo arcade section (9 games), and developer-only
game design sandboxes (3 tools).
Tech: Node.js + Express + Socket.io + Vanilla JS. No database. No build step.

---

## Layers — read this first

| Layer | Games | Served at | Dev command |
|-------|-------|-----------|-------------|
| A — Board Games | 12 multiplayer (1v1) | `/` lobby → `/game.html` | `npm start` |
| A′ — Specials | Mahjong (4p), BANG! (4–7p) | `/mahjong.html`, `/bang.html` | (same server) |
| B — Arcade Games | 9 solo | `/arcade/*` | (same server) |
| C — Sandbox | 3 design tools | **NOT in production** | `npm run sandbox` |
| *(experimental)* | 3D chess prototype | `/games3d/chess3d/` | (static, no server) |

---

## Start here for any task

```bash
npm install          # 4 deps (express, socket.io, chess.js 0.12.0, uuid) — REQUIRED first
npm start            # start on :3000
npm test             # smoke test — 82 assertions, must all pass
npm run test:games   # 5 rule-engine/flow suites (mahjong, bang, newer handlers)
npm run check        # lint + test + test:games + test:full — run before declaring done
```

Skipping `npm install` produces `Cannot find module 'express'` from every test. That is a
setup error, not a code error.

---

## Key files (read these, not the whole codebase)

| File | What it tells you |
|------|-------------------|
| `AGENTS.md` | **Working agreement — commands, traps, conventions, how to verify** |
| `GAMES.md` | State shape + move format + win conditions for every game, all layers |
| `CLAUDE.md` | Full architecture, directory layout, security patterns |
| `ADDING_A_GAME.md` | 10-step checklist for adding a board game |
| `ADDING_AN_ARCADE_GAME.md` | Guide for adding a solo arcade game |
| `ROADMAP.md` | What's done, what's planned, key architectural decisions |

---

## Current state (v1.4.0)

### Stable and complete
- 12 board game handlers (`server/handlers/*.js`) + frontend handlers, AI engines, renderers
- Mahjong and BANG! — self-contained multiplayer subsystems with their own socket namespaces
- 9 arcade games at `/arcade/{snake,breakout,vampire,plant,tower-defense,factory,bootstrap,jackpot,neon-cascade}/`
- 3 sandbox design tools (`sandbox/{vampire-survivors,plant-growing,tower-defense}/`)
- Smoke test: 82 assertions (handlers, room state, HTTP routes across all layers)
- Rule-engine suites via `npm run test:games`: Mahjong (engine/flow/timer), BANG! flow,
  and 36 assertions across backgammon / texasholdem / dotsboxes

### Known open items
1. Android AdMob IDs are placeholders — need real values before Play Store submission
2. 3D chess (`/games3d/chess3d/`) is an early prototype; importmap compatibility needs device testing
3. The 9 arcade games have no automated coverage beyond "route returns 200" — the
   `sim.js` files (bootstrap, jackpot, neon-cascade) are runnable but not asserted in CI
4. Chess, omok, connect4, othello, checkers, indianpoker, applegame, battleship and
   mancala handlers have no dedicated rule-engine suite (only the smoke-test interface check)

---

## Architecture at a glance

**Server:**
```
server.js → server/index.js → registers routes + socket events
server/events.js: socket.on('game:move') → handlers.get(room.gameType).handleMove(...)
server/handlers/index.js: Map of gameType → { initRoom, resetRoom, handleMove }
server/endgame.js: endGame(room, winner, reason, extras) — call to finish any game
server/mahjong.js, server/bang.js: separate table lifecycles (NOT the registry above)
```

**Frontend:**
```
public/js/game.js: orchestrator — connects socket, routes events to GameHandlers[gameType]
public/js/game-registry.js: central metadata for the 12 board games (icons, names, rules)
public/js/game-<name>.js: UI handler per game — initGame, onMoveMade, getMyTurn, startSolo
public/js/ai-<name>.js: client-side AI per game — runs in browser, submits via normal socket flow
```

**Sandbox:**
```
sandbox/<name>/config.js: window.<X>_CONFIG (live) + window.<X>_DEFAULTS (reset copy)
sandbox/<name>/game.js: game loop, reads config every frame
sandbox/<name>/ui.js: editor tabs, sliders, charts, localStorage persistence
```

⚠️ `sandbox/tower-defense/` is **also production code** — `/arcade/tower-defense/` loads it
through the `/arcade/tower-defense/runtime/` alias. See `AGENTS.md` §4.1.

---

## Rules for any AI agent working here

Full list with rationale in `AGENTS.md`. The short version:

1. **`npm install` first**, then `npm run check` before and after changes — 82 assertions must pass
2. **chess.js is pinned to 0.12.0** — do not upgrade (v0.13+ has an incompatible API)
3. **Sandbox is NOT served in production** — smoke test asserts `/sandbox/ → 404`
4. **No database** — do not add persistence without architectural discussion
5. **Comments in Korean** — match existing style
6. **No build tools** — vanilla JS, no webpack, no TypeScript, no ESLint
7. **New board game?** Follow `ADDING_A_GAME.md` + add to `REQUIRED_GAMES` in the smoke test
8. **New arcade game?** Follow `ADDING_AN_ARCADE_GAME.md` + add its route to `ROUTES` in the smoke test
9. **Mahjong / BANG! are separate subsystems** — do not fold them into the 2-player room model

---

## Branch strategy

```
main       ← production (auto-deployed to Render.com)
<feature>  ← your work branch
```

Push to a feature branch and open a PR; do not push directly to `main` without explicit
permission.

---

*Repo: KulkulZa1/board_game_online*
