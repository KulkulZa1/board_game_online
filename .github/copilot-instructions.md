# Copilot Instructions

**Full working agreement: [`AGENTS.md`](../AGENTS.md).** Read it before non-trivial work.
Deeper architecture: `CLAUDE.md`. Per-game reference: `GAMES.md`.

## What this is

Real-time multiplayer board game platform — Node.js + Express + Socket.io backend,
**vanilla** HTML/CSS/JS frontend. No build step, no bundler, no TypeScript, no database.

## Setup

```bash
npm install     # required on a fresh clone, or every test fails with "Cannot find module"
npm start       # :3000
npm run check   # lint + test + test:games + test:full — run before finishing
```

Tests are plain Node scripts, not a framework. Rule-engine suites in `prototypes/` are
individually runnable: `node prototypes/newer-games-handler-test.js`.

## Non-negotiables

- **Vanilla JS only** — no framework, no TypeScript, no bundler, no ESLint/Prettier
- **chess.js is pinned to `0.12.0`** — v0.13+ is API-incompatible; never bump it
- **No new dependencies** without strong justification (only 4 runtime deps today)
- **Comments in Korean** — match the surrounding file
- **2-space indent**; camelCase functions/variables
- **Server-side move validation only** — never trust client game state
- **No database** — state is in-memory by design; stats live in browser `localStorage`

## Repo-specific traps

- `sandbox/tower-defense/` is served in **production** via the
  `/arcade/tower-defense/runtime/` alias. `public/arcade/tower-defense/` is just a shell
  `index.html`. Changes there are user-facing.
- `/sandbox/` itself must return **404** in production — the smoke test asserts it.
- Mahjong (`server/mahjong.js`) and BANG! (`server/bang.js`) do **not** use the
  2-player room system or the `game:move` handler registry. They are self-contained.
- Adding a board game? Also add it to `REQUIRED_GAMES` in `scripts/smoke-test.js`.
  Adding an arcade game? Also add its route to the `ROUTES` array there.

## Layout

| Path | Contents |
|------|----------|
| `server/handlers/` | One file per board game: `initRoom` / `resetRoom` / `handleMove` |
| `server/events.js` | Socket handlers; `game:move` dispatches via the handler registry |
| `public/js/game-*.js` | Per-game UI handler | 
| `public/js/ai-*.js` | Per-game client-side AI (runs in the browser) |
| `public/arcade/<name>/` | Solo arcade game — single `game.js` IIFE, zero server code |
