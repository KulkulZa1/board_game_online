# Roadmap & Project Status

## Current Status: v1.4.0 (in progress)

**Live games (8):** 체스, 오목, 사목, 오셀로, 인디언 포커, 체커, 사과게임, 배틀십  
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
- **New games:** 배틀십 (Battleship) — placement phase + hunt-and-target AI

---

## Where We're Heading

### Phase B — More Games (short term, 1–4 weeks)

Priority order (highest value, lowest effort first):

| # | Game | Effort | Status |
|---|------|--------|--------|
| 1 | 배틀십 (Battleship) | Medium | ✅ Done |
| 2 | 백가몬 (Backgammon) | Medium | ⬜ Next |
| 3 | 텍사스 홀덤 (Texas Hold'em) | Medium | ⬜ Planned |
| 4 | 도트앤박스 (Dots & Boxes) | Easy | ⬜ Planned |
| 5 | 만칼라 (Mancala) | Easy | ⬜ Planned |
| 6 | 장기 (Korean Chess) | Hard | ⬜ Future |
| 7 | 고 9×9 (Mini Go) | Hard | ⬜ Future |

All Phase B games use the existing Socket.io architecture. Adding each game:
- 10 files, max 2 with >1-line edits (see `ADDING_A_GAME.md`)
- No infrastructure changes needed

### Phase C — Mobile Launch (1–2 months)

1. Wrap as Android app with **Capacitor** (~10 hours)
2. Add **AdMob** for solo mode interstitials
3. Submit to **Google Play**
4. Optional: user stats sync via Supabase (free tier)

Why Capacitor first?
- Zero code changes (web app already works as PWA)
- Ads unlock revenue before building anything new
- Google Play requires no subscription fee for web wrapper

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

*Last updated: 2026-05-01*
