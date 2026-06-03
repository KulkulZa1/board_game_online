# V2 Architecture Plan — board_game_online

> **Status: PLAN ONLY — not yet implemented.** This document is for review.
> A phased, incremental refactoring plan for a possible "version 2." Each phase
> ships independently. Guiding principle: **fix the real pain (Layer B/C canvas
> duplication), preserve what works (Layer A handler registry, vanilla stack),
> and add infrastructure only when concrete triggers fire.**

---

## 1. Current Architecture Assessment

Healthy where deliberately designed (Layer A); accumulating debt where it grew
organically (Layer B/C canvas games).

### 1.1 Pain: duplicated canvas game engine (highest severity)

No shared real-time engine — every canvas game reimplements the same primitives
with slightly divergent signatures:

| Primitive | arcade/vampire | sandbox/vampire-survivors | sandbox/tower-defense |
|---|---|---|---|
| `dist(a,b)` | `Math.sqrt((dx)**2+…)` | `Math.hypot(…)` | `Math.sqrt(…)` |
| `spawnParticle` | `(x,y,color,size,life)` | `(x,y,color,size,life,emoji)` | `(x,y,color,count,life)` |
| `loop`/`update`/`draw` | yes | yes | yes |
| particle integrate+fade | yes | yes | yes |
| enemy spawner / wave timing | `spawnWave` | `spawnWaves` | `spawnEnemy` |

Three near-identical particle systems, three game loops, three `dist` helpers —
diverged just enough that they can't be naively merged.

### 1.2 Pain: monolithic single-file IIFEs
- `public/arcade/vampire/game.js` — ~1465 lines, one IIFE (config + spawning +
  weapons + collision + render + HUD + boss all mixed).
- `sandbox/tower-defense/` — game.js ~1525 + ui.js 954 + config.js 295.
- `sandbox/vampire-survivors/` — game.js 997 + ui.js 1037.
- Hard to test, diff, or edit a slice without reading the whole file.

### 1.3 Pain: arcade ↔ sandbox divergence is structural
ROADMAP documents "Sandbox ↔ Arcade: no code sharing — by design." Reasonable
when sandboxes were throwaway, but arcade vampire and sandbox vampire-survivors
now model the **same game**, drifting independently. Weapon evolution was built
twice (commit `e3148c2`). The sandbox TD is a complete TD engine, yet the roadmap
plans a *separate* arcade TD from scratch — the next duplication waiting to happen.

### 1.4 Pain: shared client utilities duplicated
`deepMerge`/`sliderField`/`setNestedPath` exist in **four** places
(`public/js/sandbox-config.js` + the 3 sandbox `ui.js`). Each sandbox
`graphics/theme.js` reimplements `resolveToken`/`tokenColor`/`tokenEmoji`.

### 1.5 Pain: Layer A handler boilerplate
Registry pattern is good, but each handler repeats the turn/timer epilogue
verbatim (get color → guard turn → push move → advance `currentTurn` +
`timers.activeColor`/`lastTickAt` → emit `game:move:made`). Copy-paste across
chess/connect4/omok/battleship/applegame/othello.

### 1.6 Pain: frontend dispatch is an if/else ladder
Despite `GameHandlers[gameType]`, `public/js/game.js` `onMoveMade` is a hardcoded
`if (gameType === 'othello') … else if 'battleship' …` ladder. Adding a game
means editing it — leaking the "only create the handler file" promise.

### 1.7 Pain: eager script loading
`public/game.html` loads ~49 `<script>` tags (all 12 games' handler+board+AI on
every visit). Manual, inconsistent `?v=` cache-busting.

### What is NOT broken
- Backend module split (`server/`) — clean, well-sized.
- Handler registry (`server/handlers/index.js`) — genuine one-line-per-game.
- `game-registry.js` single source of truth — works.
- Sandbox-404-in-production — enforced + smoke-tested.
- chess.js 0.12.0 pin — correct.

---

## 2. Proposed Target Architecture

Core idea: **one canvas engine** consumed by both arcade (Layer B) and sandbox
(Layer C). Sandbox = "engine + editor panel + live config"; arcade = "engine +
frozen config." Same engine, different config source and chrome. Collapses the
arcade↔sandbox duplication into a single implementation.

### 2.1 Shared canvas engine: `public/js/engine/`
```
public/js/engine/
├── core.js          # Engine: fixed-timestep loop, state machine, dt accumulator
├── canvas.js        # resize, DPR scaling, camera/viewport, screen-shake
├── entities.js      # pooled player/enemies/projectiles/particles/groundItems
├── systems/
│   ├── movement.js   # integrate vx/vy * dt
│   ├── collision.js  # circleHit, rectHit, distToSegment, spatial buckets
│   ├── particles.js  # ONE spawnParticle(x,y,{color,size,life,emoji,count})
│   ├── spawner.js    # wave/interval spawner from a config schedule
│   └── projectiles.js# fire/seek/pierce/lifetime
├── math.js          # canonical dist (Math.hypot), clamp, lerp, rand
├── render.js        # drawCircle/Sprite/Text/Bar/floatText/damageNum
└── theme.js         # promoted token resolution
```
Engine takes a **GameDefinition** config (union of today's `VS_CONFIG`,
`TD_CONFIG`, `WEAPON_DEFS`/`EVOLUTION_DEFS`) + game-specific hooks (`onTick`,
`onLevelUp`, `onSpawn`, win/lose predicates). Rules stay in a thin per-game module:
```
public/js/games-canvas/
├── vampire/        { config.js (tuning), rules.js (firing/evolution/leveling) }
└── tower-defense/  { config.js (STAGES/TOWER_TYPES/SYNERGIES), rules.js (place/synergy) }
```
- Arcade = engine + frozen `config.js` + `rules.js` + minimal chrome.
- Sandbox = engine + live (localStorage) `config.js` + `rules.js` + editor panel.

A future arcade TD becomes "engine + existing TD config" — no second TD engine.

### 2.2 Shared client utilities: `public/js/shared/`
`config-bridge.js` (deepMerge+load/save), `dom.js` (sliderField/nestedPath),
`theme.js` (one token map) — dedupes the 4× copies.

### 2.3 Backend: keep the registry, extract one helper
Add `advanceTurn(room, yourColor, moveRecord)` in `server/rooms.js`. Migrate the
5 *regular* handlers (connect4/omok/othello/chess/applegame). **Leave irregular
handlers explicit** (mancala bonus-turn, checkers multi-jump, backgammon dice,
dotsboxes). Removes ~10 lines/handler without a leaky abstraction.

### 2.4 Frontend dispatch: data-driven payload
Pass the whole payload to `GameHandlers[gameType].onMoveMade(payload, helpers)`;
each handler picks what it needs. Restores "registry = no orchestrator edits."

### 2.5 ES modules / build / TypeScript — recommendation
**Adopt native ES modules for new `engine/` + `shared/` code only. NO bundler,
NO TypeScript in v2.**

| Option | Verdict |
|---|---|
| Stay all-IIFE + `window.*` globals | reject for the new engine (can't modularize 1500 lines cleanly) |
| **Native ES modules, no bundler** | **adopt** — real modules, zero build step, works in target browsers + Capacitor WebView + `npx serve` |
| Bundler (esbuild/Vite) | defer — violates "no build step"; revisit only on a measured request-count/hygiene problem |
| TypeScript | reject — requires build step; vanilla-JS culture |

ES modules give ~80% of the modularity benefit at 0% build-step cost. Layer A's
49-script load can be improved separately/cheaply with dynamic `import()`.

### 2.6 Versioning hygiene
Replace ad-hoc `?v=1.2` strings with one version constant; bundle into Phase 1.

---

## 3. Persistence & Scaling — trigger-based, not premature

| Capability | Add when (trigger) | What |
|---|---|---|
| Redis Socket.io adapter | need a 2nd Render instance (DAU > ~500) | `@socket.io/redis-adapter` |
| Room state in Redis | adapter exists AND restart-loses-games is a real complaint | move `state.rooms` to Redis w/ TTL |
| PostgreSQL/Supabase | ship accounts / cross-device stats / leaderboards | auth + stats table; localStorage stays offline cache |
| CDN (Cloudflare) | static egress / global latency measurable | front `public/` with CDN |

Keep the room store behind the existing `state.js` boundary so in-memory → Redis
is localized later. **Do not add a DB in v2** unless accounts ship.

---

## 4. Migration Strategy — phased, each phase shippable

- **Phase 0 — Safety net:** jsdom/headless harness for engine primitives + per-handler
  unit tests for backgammon/texasholdem/dotsboxes. No behavior change. *(prereq)*
- **Phase 1 — Consolidate shared utils:** `public/js/shared/`; fix cache-busting. *(low risk)*
- **Phase 2 — Build engine, migrate ONE game:** ES-module `engine/`; migrate arcade
  vampire first (most complex/duplicated); keep old file until parity verified. *(medium)*
- **Phase 3 — Unify vampire arcade + sandbox:** sandbox vampire = engine in design
  mode; reconcile configs into one schema. Kills the biggest duplication. *(medium)*
- **Phase 4 — Arcade TD from the sandbox engine:** migrate sandbox TD onto the engine,
  ship arcade TD = engine + frozen TD config. Avoids the second TD reimplementation. *(high value)*
- **Phase 5 — Backend turn-helper:** `advanceTurn` for the 5 regular handlers. *(low, optional)*
- **Phase 6 — Frontend dispatch + lazy loading:** pass-through payload; dynamic `import()`. *(low/med)*
- **Phase 7 — Scaling hooks:** Redis adapter etc., only if a trigger fires. *(deferred)*

Phases 0–1 = cleanup. 2–4 = headline win (one engine). 5–6 = polish. 7 = conditional.

---

## 5. What NOT to Change
- Handler registry — only extract the epilogue, don't redesign.
- No TypeScript, no bundler (ES modules for new engine code only).
- chess.js pinned 0.12.0.
- Korean comments throughout new modules.
- Sandbox stays 404 in production; keep the smoke assertion; engine lives in
  `public/`, sandbox references a synced copy (do NOT move sandbox into `public/`).
- Server module split, `game-registry.js`, client-side AI, localStorage/no-DB —
  all fine as-is.
- Irregular game handlers stay explicit.

---

## 6. Risk Register

| # | Risk | L | I | Mitigation |
|---|---|---|---|---|
| R1 | Engine refactor regresses gameplay (no canvas tests today) | High | High | Phase 0 tests first; one game at a time; keep old file until parity |
| R2 | Merging configs silently changes balance | Med | Med | Treat balance as data; snapshot before/after; freeze arcade config vs live sandbox |
| R3 | ES modules break Capacitor WebView / `file://` | Low | Med | Modules work in modern WebViews; sandbox uses `npx serve`; verify on Android early |
| R4 | Many small module requests hurt cold-load | Low | Low | HTTP/2 + SW cache; measure first; bundler is the escape hatch |
| R5 | Turn-helper over-abstracts an irregular game | Low | High | Migrate only the 5 regular handlers; full smoke test |
| R6 | Sandbox exposed in production after refactor | Low | High | Keep `/sandbox/ → 404` assertion; don't move sandbox into `public/` |
| R7 | Scope creep → rewrite | Med | High | Phases independently shippable; stop after Phase 4 if value captured |
| R8 | Refactor stalls board-game stability (roadmap priority #1) | Med | Med | Small phases; Layer A untouched until Phase 5; interleave with bug-fixing |

---

## Summary Recommendation

Do a **targeted, phased v2 focused on Layer B/C**, not a platform rewrite. The
highest-value move: build **one shared ES-module canvas engine** and make the
sandbox the engine's "design mode" rather than a parallel reimplementation — this
kills the vampire duplication (Phases 2–3) and prevents the TD duplication before
it happens (Phase 4). Keep the vanilla stack, the handler registry, and the
no-DB/no-bundler/no-TypeScript/sandbox-404 constraints. Add Redis/Postgres only
when explicit usage triggers fire.
