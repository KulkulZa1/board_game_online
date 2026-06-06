# VPS (뱀파이어 서바이버) — Architecture & Maintenance Guide

This arcade game has no build step. Files are plain `<script>`s served statically
and loaded in a fixed order from `index.html`. The runtime is a single closure
(IIFE) that owns all mutable game state.

## Load order (index.html)

```
vps-utils.js     → window.VPS.utils      (pure helpers: dist, distToSegment, fmtTime, shuffled)
vps-sfx.js       → window.VPS.SFX        (Web Audio sound singleton)
vps-config.js    → window.VPS.config     (pure static data: constants, WEAPON_DEFS, PASSIVE_POOL, …)
vps-equipment.js → window.VPS.equipment  (equipment grades, items, gems, set/cross-synergy data + utils)
game.js          → the game runtime (IIFE). Destructures all four modules at the top.
```

`game.js` **must** load last. The first thing its IIFE does is
`const { … } = window.VPS.config;` and `const { dist, … } = window.VPS.utils;`,
so the helper modules must already be present on `window`.

## Why this split

`game.js` was ~4.6k lines. The genuinely **stateless** parts — pure data and pure
helpers — were extracted into their own files. They have no dependency on the
game's mutable state, so they move cleanly and are independently testable/editable.
Everything still runs in one closure, so no behavior changed.

## Adding new equipment content (patching guide)

All equipment/gem/set data lives in `vps-equipment.js`. To add content:
- **New set**: add an entry to `SET_DEFS`. Effects keys prefixed `crossEffect_<id>` are
  auto-detected. Add a handler case in `applyCrossEffect` if the effect key is new.
- **New base item**: add to the relevant `EQUIP_BASES[slot]` array.
- **New gem**: add to `GEM_DEFS`.
- **New cross-synergy behavior**: add to `CROSS_SYNERGIES` and add one `if` branch in the
  appropriate game.js hit handler (`arrow hit`, `orb hit`, `dealDamage`, etc.).

## What stayed in game.js (and why)

The runtime keeps all **shared mutable state** and everything that closes over it:

- Hot state: `player`, `enemies`, `projectiles`, `enemyProjectiles`, `xpGems`,
  `particles`, `rings`, `powerups`, `itemBoxes`, `floatTexts`, `damageNumbers`,
  `camera`, `elapsed`, `state`, … (module-level `let`s).
- `POWERUP_POOL` / `ITEM_BOX_POOL` — their `apply()` callbacks read/write game
  state (`enemies`, `xpGems`, `spawnExplosion`, `gainXP`, …), so they **cannot**
  be moved without passing a context object. Left in place intentionally.

## Hard invariants (do not break)

1. **`render()` takes no parameters and is read-only.** It must never reference
   `dt`, nor mutate visual arrays (`*.life -=`, `splice`, `length = 0`). All
   lifetime/aging happens in `update(dt)`. A throw inside `render()` after
   `ctx.save()/translate` leaks the canvas transform and freezes the screen.
2. **Killing during iteration.** `dealDamage()` → `killEnemy()` splices the
   `enemies` array. Any loop that calls `dealDamage` while iterating `enemies`
   must use a **backward indexed loop** (`for (let i = enemies.length-1; i>=0; i--)`),
   never `for...of` (the iterator skips the shifted element). DoT/AoE that can
   kill mid-loop should `continue` once `e.dying` is set.
3. **Load order.** Helper modules before `game.js` (see above).

## Future extraction seams (incremental, in rough dependency order)

These are the natural next modules if further splitting is desired. Each needs a
shared state object (e.g. `S`) passed in, since they touch hot state:

| Candidate module | Functions |
|---|---|
| `persistence`  | loadMeta, saveMeta, run-snapshot save/load/restore, achievements |
| `coop`         | ensureCoopSocket, host/join, send input/state, guest mirror |
| `spawning`     | spawnWave, spawnBoss, spawnTreasureGoblin, wave-event logic |
| `weapons`      | fireWeapon, evolveWeapon, addWeapon, nearestEnemy |
| `combat`       | dealDamage, killEnemy, spawnExplosion, status effects |
| `choices`      | level-up / item-box choice builders + overlay |
| `render`       | the `render()` function (read-only; see invariant #1) |
| `towers`       | hybrid-tower place/fire/update |

Recommended approach for the next step: introduce a single `state.js`
(`window.VPS.state = { player:null, enemies:[], … }`) and have `game.js` read from
it, then peel functions off one module at a time, re-running `npm test` and the
DOM-stub load check after each move.

## Validation

- `npm test` — serves the game and asserts the three `vps-*.js` modules return 200.
- Node DOM-stub load: the four scripts can be `vm.runInContext`'d in order under a
  minimal `window`/`document` stub; the IIFE must execute through startup without a
  `ReferenceError` (catches missing/renamed destructured exports).
