# AGENTS.md — Working Agreement for AI Coding Agents

This is the entry point for **any** AI agent working in this repository (Codex, Cursor,
Copilot, Gemini CLI, Claude Code, or a human who wants the short version).

Claude Code users: `CLAUDE.md` has the same rules plus deeper architecture notes.
Everything in this file applies regardless of which tool you are.

**Read order for a new session:** this file → `GAMES.md` (if touching a game) →
`ADDING_A_GAME.md` / `ADDING_AN_ARCADE_GAME.md` (if adding one).

---

## 1. Setup — do this first

```bash
npm install     # REQUIRED on a fresh clone
npm start       # http://localhost:3000
```

> **If you skip `npm install`, every test fails with `Cannot find module 'express'` /
> `'chess.js'` / `'uuid'`.** That is a missing-dependency error, *not* a broken repo.
> Do not "fix" it by editing `require` statements.

Node.js **>= 18** required. There is **no build step** and no `.env` file.

---

## 2. Commands

| Command | What it does | When |
|---------|--------------|------|
| `npm start` | Runs the server on `:3000` (alias: `npm run dev`) | Manual testing |
| `npm run lint` | Parses every `.js` in the repo for **syntax errors only** | After any JS edit |
| `npm test` | Smoke test on `:13001` — **82 assertions** (handlers, room state, HTTP routes) | After any change |
| `npm run test:games` | 5 rule-engine/flow suites from `prototypes/` — Mahjong (engine, flow, timer), BANG! flow, and a 36-assertion backgammon/texasholdem/dotsboxes handler suite | After game-logic edits |
| `npm run test:full` | Routes + static assets + handlers + full-repo JS syntax pass, on `:3100` | Before finishing |
| `npm run check` | `lint && test && test:games && test:full` | **Run before declaring done** |
| `npm run sandbox` | Serves Layer C editors on `:3001` (dev-only) | Sandbox work |
| `npm run build` | Prints "there is no build step" — a deliberate no-op | Never needed |
| `npm run verify:production` | Hits `/api/version` to confirm the deployed commit | After a Render deploy |

**There is no test framework and no single-test runner.** Tests are plain Node scripts
that assert and exit non-zero. `scripts/smoke-test.js` / `scripts/smoke-check.js` are
monolithic — to narrow your focus, read the relevant section, or start the server and
`curl` the route yourself. The `test:games` suites *are* individually runnable:

```bash
node prototypes/mahjong-flow-test.js          # one suite at a time
node prototypes/newer-games-handler-test.js
```

`scripts/run-game-flow-tests.js` holds the list — add new rule-engine suites there.

**There is no ESLint and no Prettier.** `npm run lint` catches syntax errors, not style.
Do not add a linter, formatter, bundler, or TypeScript.

---

## 3. The layer model — know which layer you are in

Four layers. The first three are all intentional and maintained; **arcade and sandbox are
not scope creep.**

| Layer | What | Lives in | Server involvement |
|-------|------|----------|--------------------|
| **A — Board games** | 12 turn-based 1v1 games | `server/handlers/` + `public/js/game-*.js` | Full: rooms, sockets, validation |
| **A′ — Multiplayer specials** | Mahjong (4p), BANG! (4–7p) | `server/mahjong.js`, `server/bang.js` | Own lifecycle, **not** the registry |
| **B — Arcade** | 9 solo games | `public/arcade/<name>/` | **None** — static pages |
| **C — Sandbox** | 3 design tools | `sandbox/` | **Dev-only, never in production** |
| *(experimental)* | 3D chess prototype | `public/games3d/chess3d/` | None — no socket wiring |

Layer A games: chess, omok, connect4, othello, checkers, indianpoker, applegame,
battleship, backgammon, texasholdem, dotsboxes, mancala.

Layer B games: snake, breakout, vampire, plant, tower-defense, factory, bootstrap,
jackpot, neon-cascade.

---

## 4. Traps — read before editing

These are the mistakes that actually break this repo.

### 4.1 `sandbox/tower-defense/` ships to production

`public/arcade/tower-defense/` contains **only `index.html`**. The engine is served from
`sandbox/tower-defense/` through an Express alias mounted at
`/arcade/tower-defense/runtime/` (see `server/index.js`).

So `sandbox/tower-defense/{config,game,ui}.js` are **production files** despite living
under `sandbox/`. Test any change to them at `/arcade/tower-defense/`, not just in the
sandbox editor. The other two sandboxes (`vampire-survivors`, `plant-growing`) are
genuinely dev-only and feed their arcade games via `localStorage` instead.

### 4.2 `/sandbox/` must return 404 in production

`sandbox/` is served only by `npm run sandbox`. The smoke test asserts
`/sandbox/ → 404`. Never mount `sandbox/` as a static root in `server/index.js`.

### 4.3 Mahjong and BANG! are not in the handler registry

They do **not** use the 2-player host/guest `RoomState`, and `game:move` never reaches
them. Each owns its own table lifecycle and socket namespace. Do not try to fit a
4+ player game into `createRoomState()` — add a self-contained module instead.

### 4.4 Adding a game without updating the smoke test breaks CI

- New board game → add it to `REQUIRED_GAMES` in `scripts/smoke-test.js`
- New arcade game → add its route(s) to the `ROUTES` array in the same file

### 4.5 chess.js is pinned to `0.12.0`

Not `^0.12.0`. The v0.13+ API is incompatible. **Do not upgrade it**, and do not let a
dependency-update task bump it.

### 4.6 State is in-memory and intentionally lost on restart

No database. Board-game state lives in `state.rooms`; player stats live in browser
`localStorage`. Do not add a persistence layer without discussing the architecture first.

---

## 5. Conventions

- **Vanilla JavaScript (ES6+)** — no TypeScript, no frameworks, no bundler
- **2-space** indentation; camelCase functions/variables, PascalCase classes
- **Comments in Korean** — match the surrounding file's style
- Socket events are namespaced with a colon: `room:create`, `game:move`, `mahjong:*`, `bang:*`
- **All move validation is server-side.** Never trust client-supplied game state
- **No new dependencies** unless genuinely essential (there are only 4 runtime deps)

---

## 6. How to add things

| Task | Guide | Shape of the change |
|------|-------|---------------------|
| Board game (Layer A) | `ADDING_A_GAME.md` | 10 files; only 2 need multi-line edits |
| Arcade game (Layer B) | `ADDING_AN_ARCADE_GAME.md` | 3 files, **zero** server changes |
| Game rules change | — | `server/handlers/<game>.js` → `handleMove` |
| AI difficulty | — | `public/js/ai-<game>.js` → depth constants at top |
| Game metadata | — | `public/js/game-registry.js` (Layer A only) |

The Layer A registry pattern means a new board game needs a handler file plus a **one-line**
registration in `server/handlers/index.js` — no other server file changes.

---

## 7. Verifying your work

`npm run check` is necessary but **not sufficient** — it proves routes resolve and JS
parses, not that a game is playable. Also do the manual check for your layer:

| You changed | Verify by |
|-------------|-----------|
| Board game handler / UI | Two browser tabs on `/` → create + join a room → play a few moves |
| Board game AI | Solo mode ("혼자하기") from the lobby |
| Mahjong / BANG! | `/mahjong.html`, `/bang.html` — start a table, fill seats with AI |
| Arcade game | Load `/arcade/<name>/` and play a round |
| Sandbox | `npm run sandbox` → `:3001`; **if tower-defense, also check `/arcade/tower-defense/`** |
| Server routes | `curl http://localhost:3000/api/status` |

`prototypes/` holds two different kinds of script:
- **Rule-engine/flow suites** (mahjong-*, bang-flow, newer-games-handler) — these *are* CI,
  run by `npm run test:games`. Keep them passing.
- **Balance simulators** (`bootstrap-sim/`, `jackpot-autoplay.js`, `civ-mvp-autoplay.js`) —
  not wired into any npm script; run directly with `node` when tuning arcade economies.

---

## 8. Reporting back

State plainly what you changed, what you verified, and what you did **not** verify.
If `npm run check` fails and the failure is unrelated to your change, say so explicitly
rather than silently working around it. Do not claim a game was play-tested unless it was.

---

*Companion docs: `CLAUDE.md` (architecture deep-dive), `GAMES.md` (per-game reference),
`COWORK_BRIEF.md` (session orientation), `ROADMAP.md` (status and direction).*
