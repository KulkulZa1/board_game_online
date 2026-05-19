# Roadmap & Project Status

## Current Status: v1.4.0

**Last reviewed: 2026-05-19 — three-layer model confirmed. See Architecture section below.**

---

## Three-Layer Project Model

This project has three distinct, intentional layers:

| Layer | What | Served At | Purpose |
|-------|------|-----------|---------|
| **A — Board Games** | 12 turn-based 1v1 multiplayer games | `/` (lobby) → `/game.html` | Core platform — real-time multiplayer |
| **B — Arcade Games** | 4 solo standalone games | `/arcade/*` | Solo play extension — no server needed |
| **C — Sandbox** | 3 config-driven game design tools | local only (`npm run sandbox`) | Developer design tools — not production |

All three layers are **intentional**. Arcade games and sandbox are not scope creep.

---

## Live Games

**Board games (12):** 체스, 오목, 사목, 오셀로, 인디언 포커, 체커, 사과게임, 배틀십, 백가몬, 텍사스 홀덤, 도트앤박스, 만칼라  
**Arcade games (4):** 스네이크, 벽돌깨기, 뱀파이어 서바이버, 식물 키우기  
**Platform:** Web (PWA) — https://board-game-online.onrender.com  
**Deployment:** Render.com, Node.js + Socket.io, no database

Full Japanese riichi mahjong is tracked as a future candidate, but should start as a solo yaku/scoring trainer before any 4-player multiplayer implementation. See `docs/new-game-candidates.md`.

---

## What We've Done

### v1.0 — Foundation
- 6 board games with multiplayer (Chess, Omok, Connect4, Othello, Indian Poker, Checkers)
- Real-time 1v1 over Socket.io
- Reconnection, spectator mode, chat, timers

### v1.2 — Solo AI & Polish
- AI opponent for all 6 games
- Board size selection (Omok, Connect4)
- Indian Poker rule overhaul
- Move history panel

### v1.3 — 사과게임
- 7th game: Apple Game (사과게임) — drag-select grid puzzle, multiplayer + AI

### v1.4 — Refactor + Expansion (current)
- **Architecture:** Monolithic `server.js` split into `server/` modules + game handler registry
- **Frontend:** `game-registry.js` as central metadata store; per-game CSS files
- **Docs:** `ADDING_A_GAME.md` — 10-step checklist; AI agent token cost per game: 3k (was 52k)
- **New board games:** 배틀십, 백가몬, 텍사스 홀덤, 도트앤박스, 만칼라 — 5 games added (12 total)
- **Arcade layer:** 4 solo games at `/arcade/*` (snake, breakout, vampire, plant)
- **Sandbox layer:** 3 config-driven design tools (vampire-survivors, plant-growing, tower-defense)
- **Smoke tests:** `scripts/smoke-test.js` — 70+ assertions covering board game handlers + HTTP routes

---

## Where We're Heading

### Layer A — Board Games (future)

| Game | Effort | Status |
|------|--------|--------|
| 장기 (Korean Chess) | Hard | ⬜ Future |
| 고 9×9 (Mini Go) | Hard | ⬜ Future |

All future board games use the existing Socket.io architecture. See `ADDING_A_GAME.md`.

### Layer B — Arcade Games (future)

Arcade games are standalone HTML/CSS/JS pages with no server dependency. See `ADDING_AN_ARCADE_GAME.md`.

| Game | Effort | Status |
|------|--------|--------|
| Tower Defense (towers) | Medium | ⬜ Planned — sandbox prototype done |
| 블랙잭 (Blackjack) | Easy | ⬜ Future |
| 지뢰찾기 (Minesweeper) | Easy | ⬜ Future |

### Layer C — Sandbox (stable)

Sandbox is a developer-only design tool. It is **not served in production** — use `npm run sandbox` locally.

| Sandbox | Status | Corresponding Arcade Game |
|---------|--------|--------------------------|
| vampire-survivors | ✅ Complete | `/arcade/vampire/` (independent implementation) |
| plant-growing | ✅ Complete | `/arcade/plant/` (independent implementation) |
| tower-defense | ✅ Complete | No arcade version yet |

**Sandbox ↔ Arcade relationship:** Sandbox tools are design prototypes. Sandbox configs inform arcade game design but are not directly imported — each arcade game is a standalone, hardcoded production implementation. This is intentional: sandbox is for experimentation, arcade is for shipping.

### Phase C — Mobile Launch (🔄 in progress)

| Step | Task | Status |
|------|------|--------|
| C1 | `capacitor.config.json` — app ID, server URL, AdMob plugin config | ✅ Done |
| C2 | `public/js/admob.js` — AdMob wrapper (no-op on web, live in native) | ✅ Done |
| C3 | Wire AdMob into solo game over flow in `game.js` | ✅ Done |
| C4 | `BUILDING_ANDROID.md` — full build + Play Store guide | ✅ Done |
| C5 | Run `npx cap add android` + build signed AAB locally | ⬜ Developer action |
| C6 | Replace placeholder AdMob IDs with real account IDs | ⬜ Developer action |
| C7 | Play Store submission + review | ⬜ Developer action |
| C8 | Optional: Supabase user stats sync | ⬜ Future |

**Developer actions required** (needs local Android SDK):
```bash
npm install --save-dev @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/admob
npx cap add android
# Edit android/app/AndroidManifest.xml (see BUILDING_ANDROID.md step 3)
# Replace AdMob IDs in capacitor.config.json + public/js/admob.js
npx cap sync android
npx cap open android   # build + test in Android Studio
```

### Phase D — Desktop / Premium (3–6 months, evaluate after C)

1. **Electron** packaging for offline desktop play (~15 hours)
2. **Steam** submission if DAU > 1,000 ($100 app fee, ~50h integration)
3. **Unity** spin-off only for 3D/physics games (completely separate product)

### Phase E — Infrastructure Scaling (when needed)

Only needed if DAU > 500:
- Add Redis adapter for Socket.io multi-instance support
- Move room state to Redis (survives restarts)
- Add PostgreSQL + Supabase auth for user accounts
- Add CDN (Cloudflare) for static assets

---

## Board Game Category Tiers

### Tier 1 — Drop-in (no infrastructure change needed)
틱택토, 도트앤박스✅, 만칼라✅, 님, 배틀십✅, 블랙잭, 지뢰찾기, 스도쿠

### Tier 2 — Medium complexity (still fits current stack)
백가몬✅, 텍사스 홀덤✅, 하트, 루미, 9맨즈모리스, 쇼기, 장기

### Tier 3 — Needs new infrastructure
마작 (4-player), 스크래블 (dictionary), 워드체인 (dictionary)

### Out of scope for v1.x
Real-time action games, 3D/physics games → Unity spin-off (v2)

---

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Turn-based multiplayer only (Layer A) | Fits Socket.io perfectly; lower latency requirements |
| No database | Fast iteration; localStorage for stats is sufficient for v1 |
| Client-side AI (board games) | No server load; AI logic is per-game and runs in browser |
| Capacitor over React Native | Zero rewrite; leverage existing PWA |
| Web-first, not Unity | Faster iteration; no compile step; 0 install friction |
| game-registry.js pattern | Single source of truth; AI agents read 1 file instead of 5 |
| Arcade games as standalone pages | No server dependency; zero infrastructure overhead; instantly shippable |
| Sandbox not served in production | Dev tool only; use `npm run sandbox` locally; `express.static` covers only `public/` |
| Sandbox ↔ Arcade: no code sharing | By design — sandbox is for experimentation, arcade is for shipping; distinct goals justify distinct implementations |
| Keep Vanilla JS + Express + Socket.io | v1 board game layer is stable; React/TypeScript migration unjustified |

---

## Files to Know

| File | What it does |
|------|-------------|
| `ADDING_A_GAME.md` | Complete guide to add a new board game (Layer A) |
| `ADDING_AN_ARCADE_GAME.md` | Guide to add a new arcade game (Layer B) |
| `CLAUDE.md` | Architecture + conventions for AI assistants |
| `server/handlers/index.js` | Game registry — one line per game |
| `public/js/game-registry.js` | Frontend game metadata — one entry per game |
| `server/events.js` | All socket event handlers |
| `public/js/game.js` | Frontend orchestrator |
| `scripts/smoke-test.js` | 70+ assertion smoke test (handlers + HTTP routes) |

---

## Architecture Review — 2026-05-19

### Decision: Keep current Vanilla JS + Express + Socket.io structure

**Reason:** The v1 board game layer is stable, well-structured, and aligned with the
original purpose. Migration to React/TypeScript is unjustified — current problems
are scope management issues, not language/framework deficiencies.

### Three-layer model confirmed

- **Layer A** (board games): Core purpose, stable, keep building
- **Layer B** (arcade games): Intentional extension, production-ready, keep building
- **Layer C** (sandbox): Intentional design tool, dev-only, stable set (3 sandboxes)

### Production exposure policy

| Route | Served | Included in smoke tests |
|-------|--------|------------------------|
| `/` (lobby), `/game.html` | ✅ Yes | ✅ Yes |
| `/arcade/*` (arcade games) | ✅ Yes | ✅ Yes |
| `/sandbox/` | ❌ No (404) | ✅ Yes (assert 404) |
| `/games3d/` | ✅ Yes | ⬜ Not yet |

### Known issues to fix before next feature work
1. ✅ `sandbox/` route removed from production server
2. ✅ `package.json` name/description updated
3. ✅ Basic smoke test added (`npm test`)
4. ✅ Three-layer model documented
5. ✅ Arcade games added to smoke tests
6. ⬜ Android AdMob IDs need real values before Play Store submission
7. ⬜ 3D chess importmap compatibility check on target devices

### Next 5 tasks (in priority order)
1. Validate all 12 board games manually on mobile (reconnect + rematch edge cases)
2. Add per-game handler unit tests for at least 3 of the newer games (backgammon, texasholdem, dotsboxes)
3. Replace AdMob placeholder IDs if targeting Android release
4. Add Tower Defense arcade game (production version using sandbox TD as design reference)
5. Decide fate of arcade games: keep 4 existing, evaluate TD arcade next, freeze other additions until v1 board games are fully stable

*Last updated: 2026-05-19*
