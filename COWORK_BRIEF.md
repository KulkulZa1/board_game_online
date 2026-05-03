# Co-work Brief — Render.com Deployment Fix

> Hand this file to a new Claude session with:
> "Read COWORK_BRIEF.md and fix the deployment issue."

---

## Problem

The live server at **https://board-game-online.onrender.com** is showing **only 6 games**
(체스, 오목, 사목, 오셀로, 인디언 포커, 체커 — v1.0 era).

The `main` branch in this repo has **12 games + security fixes + v2 arcade section**
(last commit: `dd6246c`).

Render.com is serving an **old version** and has not picked up `main`.

---

## Root Cause (most likely)

`render.yaml` previously had **no `branch` field** — so Render.com used whatever branch
was configured in the dashboard at service-creation time (probably `develop` or an old
`claude/...` feature branch).

**This has been fixed locally** — `render.yaml` now contains `branch: main`.
The fix is committed on `main` at `dd6246c`.

---

## What needs to happen

### Step 1 — Verify the fix is on remote main
```bash
git fetch origin
git log --oneline origin/main -5
# Should show dd6246c at the top
```

### Step 2 — Run the diagnostic script
```bash
bash scripts/diagnose.sh
# This hits the live server and reports exactly what version is running.
# If Claude Code cannot reach the URL (network allowlist), skip to Step 3.
```

### Step 3 — Force Render to redeploy from main

**Option A (preferred) — via Render dashboard (user action required):**
1. Go to https://dashboard.render.com
2. Click **boardgame-online** service
3. Go to **Settings** → **Branch** → change to `main` if not already set
4. Click **Manual Deploy** → **Deploy latest commit**
5. Wait ~2 min, then open https://board-game-online.onrender.com — should show 12 games

**Option B — push a no-op commit to trigger auto-deploy:**
```bash
git checkout main
git commit --allow-empty -m "chore: trigger Render redeploy from main"
git push origin main
```

### Step 4 — Verify after deploy
Check https://board-game-online.onrender.com:
- Lobby shows **12 game cards** (체스 through 만칼라)
- An **아케이드 섹션** (Arcade section) is visible below board games
- `/api/status` response has no `"ip"` or `"socketId"` fields

---

## What is on main (v1.4.0 — commit dd6246c)

| Layer | What changed |
|-------|-------------|
| Server | `server.js` (2 lines) → thin entry point for `server/` modules |
| Handlers | 12 game handlers in `server/handlers/` registry |
| Frontend | `public/js/game-registry.js` — central metadata for all 12 games |
| Security | gameType validated via `handlers.has()` (not hardcoded list); `/api/status` strips IPs |
| Mobile | `capacitor.config.json`, `public/js/admob.js`, `BUILDING_ANDROID.md` |
| Docs | `CLAUDE.md`, `README.md`, `CHANGELOG.md`, `ROADMAP.md` all updated |

**12 games:** 체스, 오목, 사목, 오셀로, 인디언 포커, 체커, 사과게임, 배틀십, 백가몬, 텍사스 홀덤, 도트앤박스, 만칼라

---

## Branch structure

```
main              ← production target (dd6246c) — 12 games, all fixes
feat/v2-arcade-3d ← development — Snake, Breakout, 3D Chess (NOT deployed yet)
```

**DO NOT merge `feat/v2-arcade-3d` into `main` yet** — it's work-in-progress.

---

## Key files to know

| File | Purpose |
|------|---------|
| `render.yaml` | Render.com deploy config — now has `branch: main` |
| `server.js` | 2-line entry point: `require('./server/index.js')` |
| `server/handlers/index.js` | Game registry (12 entries) |
| `public/js/game-registry.js` | Frontend game metadata (12 entries) |
| `scripts/diagnose.sh` | Diagnostic script — run first |
| `scripts/check.sh` | Local smoke test (43 checks) |
| `CLAUDE.md` | Full architecture guide |

---

## Verification commands

```bash
# 1. Check remote main has 12 handlers
node -e "const h=require('./server/handlers'); console.log([...h.keys()].length, 'handlers');"
# Expected: 12 handlers

# 2. Start local server and run full check
bash scripts/start.sh
bash scripts/check.sh
bash scripts/stop.sh

# 3. Check live server (if network allows)
bash scripts/diagnose.sh
```

---

*Generated: 2026-05-02 | For: board_game_online repo (KulkulZa1/board_game_online)*
