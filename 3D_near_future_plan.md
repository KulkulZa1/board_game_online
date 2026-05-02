# Near-Future & 3D Expansion Plan

*Last updated: 2026-05-02*

---

## 1. Where We Are Now

**Current platform:** Web PWA — 12 turn-based board games, Node.js + Socket.io, no database, deployed on Render.com.  
**Upcoming mobile:** Capacitor + AdMob wrapper ready; developer needs local Android SDK to build the AAB.

The platform is deliberately limited to **turn-based, server-validated, Socket.io games** because that constraint lets us ship quickly and keep the codebase small. Everything in this document is a deliberate step *beyond* that constraint.

---

## 2. Lightweight / Idle / Arcade Games (Near Term — 1–3 months)

These are **solo-only** games that run entirely in the browser with no server-side state. They require zero changes to the Socket.io backend and can ship as standalone pages under `public/games/<name>/`.

### Priority list

| # | Game | Style | Complexity | Notes |
|---|------|-------|------------|-------|
| 1 | **Snake** | Classic arcade | Low | Canvas 2D; classic 60 fps loop; touch joystick for mobile |
| 2 | **Typhoon / Bullet Dodge** | Vertical shooter | Low–Med | Canvas 2D; keyboard + touch; procedural wave spawning |
| 3 | **Growing Idle** (plant/clicker) | Idle / clicker | Low | DOM-based; click-to-grow loop; localStorage save |
| 4 | **Minesweeper** | Puzzle | Low | Already in Tier 1 ROADMAP; grid reveal logic |
| 5 | **Vampire Survivor-like** | Top-down roguelite | Med–High | Canvas 2D; ECS-style entity loop; auto-attack, XP, level-up |
| 6 | **Asteroids** | Classic arcade | Med | Canvas 2D; vector physics; wrap-around edges |

### Technical pattern for all arcade games

```
public/
  games/
    snake/
      index.html   # standalone page, no game.html dependency
      game.js      # self-contained game loop (requestAnimationFrame)
      style.css
    survivor/
      index.html
      game.js      # ECS entity manager + canvas renderer
      style.css
```

- **No server changes needed** — these pages are static HTML served by Express.
- **Lobby integration**: add a "🕹 아케이드" section card in `index.html` that opens `games/<name>/` in a new tab or slides to a new panel.
- **AdMob**: hook into the same `AdMobHelper.showAfterGame()` call used by board games when a run ends.
- **Score persistence**: use `localStorage` (same pattern as board game stats). No leaderboard until Supabase auth is added.

### Vampire Survivor-like — scope definition

A minimal "Survivor-clone" needs:
1. **Entity loop**: player, enemies, XP orbs, projectiles — each as plain JS objects in an array
2. **Collision**: circle–circle AABB (no physics engine needed)
3. **Wave spawner**: procedural enemy spawn rate scaling with elapsed time
4. **Upgrade picker**: pause on level-up, show 3 random passive upgrades (speed, damage, area)
5. **Renderer**: single `<canvas>` with `ctx.clearRect` + `ctx.fillRect`/`ctx.arc` per frame

Estimated effort: ~40 hours for a fun minimal version. No library needed; Pixi.js optional if visual quality matters.

---

## 3. 2.5D Games (Medium Term — 3–6 months)

"2.5D" means a 2D game with isometric or layered-parallax rendering that gives depth without a 3D engine.

| Game | Technique | Library | Notes |
|------|-----------|---------|-------|
| **Isometric Puzzle** (block-pushing) | Isometric tile renderer | None (canvas math) | 45° grid; push-blocks onto targets |
| **Tower Defense** | Top-down with z-ordering | None | Lane-based or open-field; 2D canvas |
| **Platformer** | Side-scroll parallax | None or Phaser.js | Phaser 3 is 300 KB; self-contained |
| **Card Roguelite** (Slay the Spire-like) | DOM / SVG cards | None | Pure DOM; turn-based; no 3D needed |

**Phaser.js** is the recommended stepping stone — it handles game loop, input, sprite atlas, and tilemap loading while staying in the browser with no install.

---

## 4. 3D Games (Long Term — 6–18 months)

### Option A — Three.js in the browser (recommended first step)

Three.js runs entirely client-side; the server stays unchanged (Socket.io or REST for multiplayer state).

| Game | 3D approach | Effort |
|------|-------------|--------|
| **3D Chess** | Three.js scene + existing chess.js logic | Medium — swap board renderer only |
| **3D Connect Four** | Cylinder-drop animation on a 3D rack | Low — purely visual upgrade |
| **3D Backgammon** | Three.js board, dice roll animation | Medium |
| **Bowling** | Three.js + Rapier.js physics | High |
| **Billiards / Pool** | Three.js + Rapier.js physics | High |
| **Mini Golf** | Three.js + Rapier.js physics | High |

**Three.js integration pattern:**
```
public/
  games/
    chess3d/
      index.html      # standalone page
      scene.js        # Three.js scene setup
      board.js        # 3D board + piece instancing
      ai.js           # reuse existing ai-chess.js
```
The server handler stays `server/handlers/chess.js` — only the renderer changes.

**Rapier.js** (WASM physics, 150 KB gzip) is the recommended physics engine: faster than Cannon.js, runs in browser, no server changes needed.

### Option B — Unity WebGL export (standalone games only)

Use Unity **only** for games that genuinely need physics, 3D animation, or VR:
- 3D platformer, racing game, first-person puzzle
- WebGL export (~20–50 MB download per game — not suitable for casual web traffic)
- Multiplayer via Unity Netcode for GameObjects (completely separate backend from Socket.io)

**Verdict**: Unity is a separate product stream, not an upgrade of this platform. Keep it isolated under a different subdomain or repo.

### Option C — Babylon.js (alternative to Three.js)

Babylon.js has a higher-level API (physics, XR, PBR materials out-of-the-box) but is 500 KB vs Three.js at 160 KB. Prefer Three.js unless WebXR (VR/AR) support is needed.

---

## 5. Multiplayer Architecture for 3D / Real-time Action

The current Socket.io architecture is designed for **turn-based games** (50–500 ms latency acceptable). Real-time action games (shooters, racing, physics) need:

| Requirement | Current stack | What's needed |
|-------------|--------------|---------------|
| Latency | 50–200 ms OK | < 50 ms target |
| Tick rate | Event-driven | 20–60 Hz server tick loop |
| Protocol | Socket.io (TCP) | WebRTC DataChannel (UDP) or Socket.io with `volatile` |
| State sync | Full state on each move | Delta compression + client prediction |
| Anti-cheat | Server validates each move | Server authoritative simulation |

**Recommendation:** For action games, run a **separate game server** (e.g., Colyseus.js — a Node.js framework designed for real-time multiplayer with room management, schema state sync, and 20 Hz tick). The lobby/matchmaking stays on the current Socket.io server; players are redirected to the Colyseus room URL after matching.

---

## 6. Phased Execution

### Phase D — Arcade / Idle games (next)

| Task | Effort | Outcome |
|------|--------|---------|
| Snake standalone page | 8h | First arcade game live |
| Vampire Survivor minimal | 40h | High engagement solo game |
| Growing Idle clicker | 12h | Casual session filler |
| Lobby "아케이드" section | 4h | Discoverable from main page |

### Phase E — 3D visual upgrades to existing games

| Task | Effort | Outcome |
|------|--------|---------|
| 3D Chess renderer (Three.js) | 20h | Same logic, dramatic visual upgrade |
| 3D Connect4 drop animation | 8h | Purely cosmetic; reuse handler |
| 3D Backgammon board | 24h | Dice roll 3D animation |

### Phase F — New 3D / physics games

| Task | Effort | Outcome |
|------|--------|---------|
| Bowling (Three.js + Rapier) | 60h | First physics game |
| Mini Golf | 80h | Multi-hole; procedural generation |
| Tower Defense 2D | 40h | High replayability |
| Card Roguelite | 50h | Slay the Spire-like; very high engagement |

### Phase G — Real-time multiplayer action (Colyseus)

| Task | Effort | Outcome |
|------|--------|---------|
| Colyseus server setup | 16h | Separate game server on Render |
| 2-player racing prototype | 40h | Proves real-time infra |
| Lobby → Colyseus handoff | 8h | Seamless room redirect |

---

## 7. Key Decisions To Make Before Starting Each Phase

| Decision | Phase | Options |
|----------|-------|---------|
| 3D library | E/F | Three.js (recommended) vs Babylon.js |
| Physics engine | F | Rapier.js (WASM) vs Cannon-es (pure JS) |
| Arcade games: separate pages or in-game modal | D | Separate pages (simpler, no coupling) |
| Action multiplayer | G | Colyseus vs raw WebRTC vs ws |
| User accounts | any | Supabase free tier when leaderboards needed |
| Monetisation gating | D+ | Free all browser; AdMob on mobile only |

---

## 8. Files to Know

| File | Relevance to this plan |
|------|----------------------|
| `ADDING_A_GAME.md` | Adding turn-based board games (unchanged) |
| `BUILDING_ANDROID.md` | Mobile AdMob integration |
| `public/games/` | New directory for arcade / 3D game pages |
| `server/handlers/index.js` | Add new board game handlers here |
| `render.yaml` | May need `instances: 2` when DAU > 500 |
