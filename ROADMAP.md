# Roadmap & Project Status

## Current Status: v1.4.0

**Last reviewed: 2026-05-19 — architecture review completed. See below.**

**Live games (12):** 체스, 오목, 사목, 오셀로, 인디언 포커, 체커, 사과게임, 배틀십, 백가몬, 텍사스 홀덤, 도트앤박스, 만칼라  
**Platform:** Web (PWA) — https://board-game-online.onrender.com  
**Deployment:** Render.com, Node.js + Socket.io, no database

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
- **New games:** 배틀십, 백가몬, 텍사스 홀덤, 도트앤박스, 만칼라 — 5 games added; Phase B complete (12 total)

---

## Where We're Heading

### Phase B — More Games (short term, 1–4 weeks)

Priority order (highest value, lowest effort first):

| # | Game | Effort | Status |
|---|------|--------|--------|
| 1 | 배틀십 (Battleship) | Medium | ✅ Done |
| 2 | 백가몬 (Backgammon) | Medium | ✅ Done |
| 3 | 텍사스 홀덤 (Texas Hold'em) | Medium | ✅ Done |
| 4 | 도트앤박스 (Dots & Boxes) | Easy | ✅ Done |
| 5 | 만칼라 (Mancala) | Easy | ✅ Done |
| 6 | 장기 (Korean Chess) | Hard | ⬜ Future |
| 7 | 고 9×9 (Mini Go) | Hard | ⬜ Future |

All Phase B games use the existing Socket.io architecture. Adding each game:
- 10 files, max 2 with >1-line edits (see `ADDING_A_GAME.md`)
- No infrastructure changes needed

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

## Game Category Tiers

### Tier 1 — Drop-in (no infrastructure change needed)
틱택토, 도트앤박스, 만칼라, 님, 배틀십✅, 블랙잭, 지뢰찾기, 스도쿠

### Tier 2 — Medium complexity (still fits current stack)
백가몬, 텍사스 홀덤, 하트, 루미, 9맨즈모리스, 쇼기, 장기

### Tier 3 — Needs new infrastructure
마작 (4-player), 스크래블 (dictionary), 워드체인 (dictionary)

### Out of scope for v1.x
Real-time action games, 3D/physics games → Unity spin-off (v2)

---

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Turn-based multiplayer only | Fits Socket.io perfectly; lower latency requirements |
| No database | Fast iteration; localStorage for stats is sufficient for v1 |
| Client-side AI | No server load; AI logic is per-game and runs in browser |
| Capacitor over React Native | Zero rewrite; leverage existing PWA |
| Web-first, not Unity | Faster iteration; no compile step; 0 install friction |
| game-registry.js pattern | Single source of truth; AI agents read 1 file instead of 5 |

---

## Files to Know

| File | What it does |
|------|-------------|
| `ADDING_A_GAME.md` | Complete guide to add a new game |
| `CLAUDE.md` | Architecture + conventions for AI assistants |
| `server/handlers/index.js` | Game registry — one line per game |
| `public/js/game-registry.js` | Frontend game metadata — one entry per game |
| `server/events.js` | All socket event handlers |
| `public/js/game.js` | Frontend orchestrator |

---

---

## Architecture Review — 2026-05-19

### Decision: Keep current Vanilla JS + Express + Socket.io structure

**Reason:** The v1 board game layer is stable, well-structured, and aligned with the
original purpose. Migration to React/TypeScript is unjustified — current problems
are scope management issues, not language/framework deficiencies.

### What is in scope (keep building)
- v1 multiplayer board games (core purpose)
- v2 arcade standalone solo games (additive, limited scope)
- PWA + Android Capacitor packaging

### What is out of scope until further review
- `sandbox/` game design tools — developer-only, NOT player-facing, NOT served in production
- 3D games beyond chess3d (Bowling, Mini Golf, Racing — separate product territory)
- User accounts / Supabase (only when DAU > 200)
- Real-time action multiplayer / Colyseus (separate product)

### Known issues to fix before next feature work
1. ✅ `sandbox/` route removed from production server
2. ✅ `package.json` name/description updated
3. ✅ Basic smoke test added (`npm test`)
4. ⬜ Android AdMob IDs need real values before Play Store submission
5. ⬜ 3D chess importmap compatibility check on target devices

### Next 5 tasks (in priority order)
1. Validate all 12 games manually on mobile (reconnect + rematch edge cases)
2. Add per-game handler unit tests for at least 3 of the newer games (backgammon, texasholdem, dotsboxes)
3. Replace AdMob placeholder IDs if targeting Android release
4. Decide fate of `sandbox/`: keep as local-only dev tool or delete
5. Decide fate of arcade games: keep 4 existing, freeze new additions until v1 is fully stable

*Last updated: 2026-05-19*
