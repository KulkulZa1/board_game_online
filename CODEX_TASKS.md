# CODEX_TASKS.md — Polish Handoff (Claude → Codex)

> **Workflow:** Claude built the **core engines** (working & verified). Codex does the
> **polish/expansion** below. This split balances token usage: Claude designs + ships the
> hard mechanics; Codex fills in bulk content, mirrors, and tuning.
>
> Read `GAMES.md` and `CLAUDE.md` first. Every task lists exact files, the pattern to
> follow, and how to verify. Do NOT redesign the engines — extend them.

---

## What Claude already shipped (DONE — do not redo)

### Vampire Survivor (arcade) — `public/arcade/vampire/game.js`
- **Weapon leveling**: weapons level 1→5 when re-picked (`addWeapon`, `MAX_WEAPON_LEVEL`).
- **Evolution system**: max-level base weapon + required passive → evolved weapon.
  - `EVOLUTION_DEFS` (5 entries), `evolveWeapon()`, `availableEvolutions()`, `applyPassive()`.
  - Evolved weapons fully implemented: `blackhole`, `stormbow`, `supernova`, `deathray`, `aegis`.
- **Level-up UI** rebuilt: `buildChoices()` — guarantees an evolution card (golden, `.upgrade-btn.evolution`) when available; mixes weapon level-ups / new weapons / passives.
- **Weapon slots** show levels + evolved styling (`renderWeaponSlots`).
- Fixed a latent bug: `fireWeapon` early-return condition (`!x !== undefined`) → weapons now actually fire.

### Tower Defense (sandbox) — `sandbox/tower-defense/{config,game,ui}.js`
- **Multiple tower types**: `TD_CONFIG.TOWER_TYPES` (`frost`, `tesla`) + cannon (`TD_CONFIG.TOWER`).
  - `getTowerCfg(tower)`, type-aware `getTowerRange/Damage/FireRate/Cost`, `placeTower(x,y,type)`.
  - `fireFrost()` (slow projectile + AoE slow), `fireTesla()` (instant chain lightning).
- **Adjacency synergies**: `TD_CONFIG.SYNERGIES` (3) + `recomputeSynergies()` + `getActiveSynergies()`.
  - Shatter (frost+cannon), Overload (tesla+tesla), Cryo-Charge (frost+tesla). Verified working.
- **UI**: tower-type picker + live synergy legend in the Map/Placement tab.

---

## TASK A — Mirror evolution system into Sandbox VPS

**Goal:** Bring weapon leveling + evolution to the config-driven sandbox version so it can be
designed/tuned there, matching the arcade behavior.

**Files:** `sandbox/vampire-survivors/{config.js, game.js, ui.js}`

**Steps:**
1. In `config.js` (`VS_CONFIG`):
   - Add `evolved: true` flag + 5 evolved skills to the `SKILLS` array, mirroring arcade
     `WEAPON_DEFS` evolved entries (blackhole, stormbow, supernova, deathray, aegis).
   - Add an `EVOLUTIONS` array: `[{ id, base, req }]` where `base` = base skill id, `req` =
     passive/item id required (mirror arcade `EVOLUTION_DEFS`).
   - Add a `maxSkillLevel` field (default 5).
2. In `game.js`:
   - Track `skillLevels` per skill and `ownedPassives` (mirror arcade `player.weaponLevels`/`passives`).
   - On skill pickup: if owned, level up; else add at level 1.
   - Scale skill damage/projectile-count by level (read from config, every frame — keep config-driven).
   - Add `availableEvolutions()` + `evolveSkill()` reading `VS_CONFIG.EVOLUTIONS`.
   - Branch firing logic for evolved skill ids (port the arcade behaviors).
3. In `ui.js`:
   - Add an **Evolutions** sub-section in the Skill Designer tab: editable base→req→result rows.
   - Show evolution choices as golden cards in the in-game level-up modal.

**Pattern to follow:** Arcade `buildChoices()` / `evolveWeapon()` in `public/arcade/vampire/game.js`.
Keep the sandbox **config-driven** (read `VS_CONFIG` live every frame — do NOT hardcode like arcade).

**Verify:** Open `sandbox/vampire-survivors/index.html` via `file://` (or `npm run sandbox`).
Level a skill to max, pick its required passive → golden evolution card appears → picking it
swaps to evolved skill with new behavior. Edit evolution rows in the editor → reflected live.

---

## TASK B — Tower Defense: more content + synergy UI

**Files:** `sandbox/tower-defense/{config.js, game.js, ui.js}`

### B1. Amplifier tower type
Add a 3rd new tower type `amplifier` to `TD_CONFIG.TOWER_TYPES`:
- Deals no/low damage; instead **buffs adjacent towers** (e.g. +25% damage, +15% range within radius).
- Implement as a passive aura: in `recomputeSynergies()` (or a sibling `recomputeAuras()`),
  add an `auraBonus` to towers within an amplifier's radius; apply it in `getTowerDamage/Range`.
- `attack: 'support'` → `fireTower` should early-return for support towers (no projectiles).
- Add it to the UI tower-type picker (`renderMap` `TYPES` array) and a render color in `TYPE_FILL`.

### B2. More synergies
Extend `TD_CONFIG.SYNERGIES` with 2–3 more combos. Follow the exact schema:
`{ id, name, icon, a, b, radius, desc, bonus:{...} }`. Add matching handling in
`recomputeSynergies()` for any new `bonus` keys, and apply them where the tower fires.
Ideas: `cannon+cannon` "Barrage" (+firerate), `amplifier+tesla` "Supercharge" (+chain dmg).

### B3. Dedicated Synergies + Towers editor tab
Currently the Tower tab only edits the cannon. Add:
- A **tower-type selector** in the Tower tab so each type's stats/upgradeLevels are editable
  via the existing `sliderField()` + `data-path` binding (paths like `TOWER_TYPES.frost.damage`).
- A **Synergies tab** listing each synergy with editable `radius` and `bonus` values.

**Pattern to follow:** existing `renderTower()`, `sliderField()`, `bindSliders()`, `setNestedPath()`.

**Verify:** Place an amplifier next to towers → their range circles/damage increase.
New synergies light up in the Placement-tab legend when their tower pair is adjacent.
Editing `TOWER_TYPES.frost.*` sliders changes frost behavior live.

---

## TASK C — Balancing pass (both games)

Playtest and tune. Keep changes to **config/constants only** where possible.
- **VPS arcade**: evolution power curve (evolved weapons should feel like a payoff, not a win-button);
  XP curve vs. evolution timing; passive values in `PASSIVE_POOL`.
- **TD**: tower costs/damage across types so cannon/frost/tesla are all viable; synergy bonus
  magnitudes; infinity-mode scaling vs. new tower power.

Document any balance changes in `CHANGELOG.md`.

---

## Guardrails for Codex

- **No new dependencies.** Vanilla JS only, no build step.
- **Korean comments** in arcade files; English is fine in sandbox files (match each file's existing style).
- **Run `npm test`** after any change — all 65 assertions must still pass.
- **Don't touch** `server/`, board-game handlers, or the smoke-test route list unless a task says so.
- Sandbox stays **dev-only** (not served in production). Arcade stays player-facing.
- Verify each game by actually loading it (arcade via the running server at `/arcade/vampire/`,
  sandbox via `npm run sandbox`).
