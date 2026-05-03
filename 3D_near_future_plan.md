# Near-Future & 3D Expansion Plan

*Last updated: 2026-05-02 | Branch: feat/v2-arcade-3d*

---

## 1. Guiding Principle: Backward Compatibility First

**v1.x is production and must never break.**

Every v2 addition is an *additive* layer — new directories, new routes, new socket namespaces. Nothing in `server/`, `public/js/`, or `public/css/` that serves v1 board games changes unless it is a bug fix.

```
v1.x (turn-based board games) ←─ stays exactly as-is
v2.x (arcade, 3D, action)     ←─ added on top, no v1 regressions
```

---

## 2. Software Architecture

### 2.1 Layer Model

```
┌──────────────────────────────────────────────────────────────┐
│  BROWSER                                                      │
│  ┌─────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  v1 Board Games │  │  v2 Arcade     │  │  v2 3D Games  │  │
│  │  public/        │  │  public/arcade/│  │  public/games3d│ │
│  │  (Socket.io)    │  │  (standalone)  │  │  (Three.js +  │  │
│  │                 │  │                │  │   Socket.io)  │  │
│  └────────┬────────┘  └───────┬────────┘  └──────┬────────┘  │
└───────────┼───────────────────┼──────────────────┼───────────┘
            │ Socket.io /       │ Static HTTP       │ Socket.io /
            │ (existing ns)     │ (no server state) │ (future ns)
┌───────────┼───────────────────┼──────────────────┼───────────┐
│  SERVER   │                   │                  │            │
│  ┌────────▼──────────┐        │            ┌─────▼─────────┐  │
│  │  server/ (v1)     │        │            │ server/v2/    │  │
│  │  handlers/*.js    │        │            │ (future 3D    │  │
│  │  events.js        │◄───────┘            │  multiplayer) │  │
│  │  routes.js        │  serves arcade      └───────────────┘  │
│  │  (Express static) │  as static files                       │
│  └───────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Directory Structure (current + planned)

```
board_game_online/
│
├── server/                     ← v1 only — DO NOT TOUCH for v2 work
│   ├── handlers/               ← 12 game handlers (registry pattern)
│   ├── events.js               ← socket event dispatcher
│   └── ...
│
├── public/                     ← v1 static assets (lobby + board games)
│   ├── index.html              ← lobby (has arcade section added in v2)
│   ├── arcade/                 ← NEW v2: solo arcade games
│   │   ├── snake/              ← ✅ done
│   │   │   ├── index.html
│   │   │   ├── game.js
│   │   │   └── style.css
│   │   ├── survivor/           ← planned Phase D
│   │   └── idle-plant/         ← planned Phase D
│   │
│   └── games3d/                ← planned Phase E: 3D renderers
│       ├── chess3d/
│       │   ├── index.html
│       │   ├── scene.js        ← Three.js; reuses server/handlers/chess.js
│       │   └── style.css
│       └── connect4-3d/
│
└── 3D_near_future_plan.md      ← this file
```

### 2.3 Arcade Game Pattern (v2 standalone)

Each arcade game is a **completely self-contained page** under `public/arcade/<name>/`.

Rules:
- **No import of any v1 JS** (no game.js, no lobby.js, no socket.io)
- Solo-only by default; multiplayer wired in later via a separate socket namespace
- `localStorage` for scores (same convention as v1 stats.js)
- `AdMobHelper` from `/js/admob.js` for mobile ad integration
- `<a href="/">← 로비</a>` back link to the main lobby

```
public/arcade/<name>/
  index.html   ← standalone, loads only its own style.css + game.js
  game.js      ← IIFE, requestAnimationFrame loop, zero dependencies
  style.css    ← scoped to this game only
```

### 2.4 3D Game Pattern (v2 with Three.js)

3D games live under `public/games3d/<name>/`. They can reuse the **same server handlers** as the v1 board game — only the renderer changes.

```
public/games3d/chess3d/
  index.html        ← loads three.module.js (CDN) + scene.js
  scene.js          ← Three.js scene; submits moves via socket.io same as v1
  style.css
```

The server handler `server/handlers/chess.js` stays unchanged. The 3D page simply connects to the same room/socket flow with a different UI.

### 2.5 Real-time Action Games (future — Phase G)

Turn-based Socket.io is unsuitable for shooters/racing (<50 ms target). Planned approach:

- **Colyseus.js** on a separate Render service (`game2.board-game-online.onrender.com`)
- v1 lobby redirects to the Colyseus room URL after matchmaking
- Colyseus uses a 20 Hz authoritative server tick loop
- v1 server is completely untouched

```
Current:  browser ──socket.io──► server/ (turn-based, event-driven)
Phase G:  browser ──Colyseus───► server-v2/ (20 Hz tick, delta state)
          browser ──socket.io──► server/   (v1 board games, unchanged)
```

---

## 3. Arcade Games Roadmap (Phase D)

Solo games, no server state, drop-in pattern.

| # | Game | Style | Status | Effort |
|---|------|-------|--------|--------|
| 1 | 🐍 **Snake** | Classic arcade | ✅ Done | 1 day |
| 2 | 👾 **Vampire Survivor-like** | Roguelite auto-shooter | ⬜ Next | ~5 days |
| 3 | 🌱 **식물 키우기 (Growing Idle)** | Clicker / idle | ⬜ | 2 days |
| 4 | ☄️ **Typhoon / Bullet Dodge** | Vertical shooter | ⬜ | 3 days |
| 5 | 🐦 **Flappy Clone** | One-button reflex | ⬜ | 1 day |
| 6 | 💣 **Minesweeper** | Grid puzzle | ⬜ | 1 day |

### Vampire Survivor-like — Scope

Minimal viable version:
1. **Entity loop**: player, enemies (3 types), XP orbs, bullets — plain JS objects
2. **Collision**: circle–circle (no physics engine needed)
3. **Wave spawner**: enemy count/speed scales with elapsed time
4. **Level-up picker**: pause on level-up, choose 1 of 3 passive upgrades
5. **Renderer**: single `<canvas>`, `ctx.clearRect` per frame
6. **5 weapons**: basic shot, orbit, AOE burst, boomerang, laser
7. **Persistence**: best run time in `localStorage`

Estimated effort: ~40 hours. No library needed — Three.js/Pixi.js optional for visual upgrade.

---

## 4. 3D Visual Upgrades (Phase E)

Upgrade existing board game renderers to 3D without changing server logic.

| Game | 3D Tech | Effort | Notes |
|------|---------|--------|-------|
| ♟ Chess 3D | Three.js + BufferGeometry pieces | 20h | Same chess.js validation |
| 🔴 Connect4 3D | Three.js cylinder drop animation | 8h | Purely cosmetic upgrade |
| 🎲 Backgammon 3D | Three.js board + dice roll anim | 24h | Dice spin physics via Rapier |
| ⬤ Omok 3D | Three.js stone drop on grid | 12h | Ink-drop particle on place |

**Three.js setup (per game):**
```html
<!-- CDN, ES module, no build step -->
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.163/build/three.module.js"}}</script>
<script type="module" src="scene.js"></script>
```

---

## 5. New 3D / Physics Games (Phase F)

| Game | Engine | Multiplayer | Effort |
|------|--------|-------------|--------|
| 🎳 Bowling | Three.js + Rapier.js | Solo first | 60h |
| ⛳ Mini Golf | Three.js + Rapier.js | 1v1 via Socket.io | 80h |
| 🏰 Tower Defense | Phaser 3 (2D) | Solo | 40h |
| 🃏 Card Roguelite | DOM/SVG (no 3D needed) | Solo | 50h |
| 🚗 2-player Racing | Three.js + Colyseus | 1v1 real-time | 100h |

**Physics: Rapier.js (WASM)**
- 150 KB gzip, runs in browser
- Faster than Cannon-es; deterministic
- No server changes needed for solo physics

**Unity: out of scope for this repo** — use only for a separate 3D product if DAU > 5,000 and premium packaging is needed (Steam, App Store native).

---

## 6. When To Add User Accounts

Current: `localStorage` stats only.

Add Supabase auth when **any** of these become true:
- Leaderboard feature requested
- Cross-device score sync needed (arcade games)
- Play Store review requests account system
- DAU > 200 (worth the infrastructure cost)

**Migration plan**: add `supabase.js` as an optional enhancer. If Supabase JS client loads and user is signed in, sync localStorage stats to Supabase on game-over. Zero breaking change to existing code.

---

## 7. Scaling Triggers

| Trigger | Action |
|---------|--------|
| DAU > 200 | Add Redis adapter for Socket.io multi-instance |
| DAU > 500 | Move room state to Redis; add Cloudflare CDN |
| DAU > 2,000 | PostgreSQL + Supabase auth; leaderboards |
| Action games needed | Separate Colyseus server on Render |
| Premium packaging | Electron (desktop) or Unity (3D/physics spin-off) |

---

## 8. Phased Execution

### Phase D — Arcade (current, this branch)
- [x] Snake
- [ ] Vampire Survivor-like
- [ ] Growing Idle

### Phase E — 3D renderers for existing games
- [ ] Chess 3D (Three.js)
- [ ] Connect4 3D

### Phase F — New 3D/physics games
- [ ] Bowling (Three.js + Rapier)
- [ ] Mini Golf
- [ ] Tower Defense

### Phase G — Real-time multiplayer
- [ ] Colyseus server setup
- [ ] 2-player racing prototype
