# Balance & Level Design Reference

This document captures the **precise mathematical curves** that drive difficulty,
progression, and economy in the two real-time games (Vampire Survivors arcade,
Tower Defense sandbox). It is the single source of truth for designers/agents
tuning game feel. All curves are intentional — change the formula here and in the
code together.

---

## 1. Combination Systems (verified implemented)

Both games are built around **combining picks**, not just stacking one thing.

### Vampire Survivors — Weapon Evolution
A base weapon at **max level (5)** + a **specific passive** evolves into a
super-weapon. Source: `EVOLUTION_DEFS` in `public/arcade/vampire/game.js`.

| Evolved | Base weapon | Required passive | Result |
|---------|-------------|------------------|--------|
| 🌀 Blackhole | 🔵 Orb | 🧲 Magnet | Giant orbit that pulls enemies in |
| 🌩 Stormbow | 🏹 Arrow | ⏩ Cooldown | 5-shot piercing volley |
| ☀ Supernova | 💥 Nova | ⚔ Damage | Chained mega-explosions |
| ☠ Deathray | ⚡ Laser | 👟 Speed | Piercing instant-kill beam |
| 🛡 Aegis | 🛡 Shield | ❤ HP regen | Reflect barrier (damages nearby) |

Reachability: `availableEvolutions()` → `buildChoices()` **guarantees** an
evolution card appears on level-up when its combo is satisfied.

### Level-up choice weighting
Non-evolution level-up cards are weighted, not flat-random:

- Owned weapon level-ups are favored over generic passives, especially at level 4 or when their required passive is already owned.
- Passives that complete or support an owned weapon's evolution recipe are favored over unrelated passives.
- New weapons are favored in the first few levels to create an early build fork, then become less common.
- Cards expose short reason tags (`Build starter`, `Power up`, `Combo passive`, `Near evolution`) so the RNG friction is readable rather than opaque.

### Vampire Survivors - Dash Slash Supports

The first hack-and-slash modifier layer uses three support cards:

- `Cleave Edge`: wider, stronger dash slash path.
- `Rupture Mark`: dash hits bleed and burst when killed.
- `Echo Step`: dash leaves delayed after-slashes.

These cards compete with weapon level-ups, new weapons, and passive/evolution setup. They are useful early but not mandatory: auto-attacks still carry baseline DPS, while slash supports reward active movement through enemy clusters.

The first unowned slash support is guaranteed into early level-up choices before pure RNG resumes. This makes the active hack-and-slash layer visible quickly without replacing the weapon evolution chase.

### Tower Defense Synergies
Towers within a synergy radius of a partner type gain bonuses, recomputed on
every place/sell/upgrade. Source: `SYNERGIES` in `sandbox/tower-defense/config.js`,
applied by `recomputeSynergies()`.

| Synergy | Combo | Radius | Effect |
|---------|-------|--------|--------|
| 💥 Shatter | Frost + Cannon | 130 | Cannons deal +60% to slowed/frozen |
| 🌩️ Overload | Tesla + Tesla | 150 | +2 extra chain targets |
| ❄️⚡ Cryo-Charge | Frost + Tesla | 130 | Tesla chains also slow on hit |

---

## 2. Vampire Survivors — Curves

Time `t` is seconds survived; `m = t/60` minutes. Endless (no win condition).

### 2.1 XP / Level curve
```
xpNeeded(lv) = round(20 + 12 · lv^1.8)
```
Fast early levels (dopamine), smooth slowdown, continues infinitely.

| Lv | 1 | 5 | 10 | 15 | 20 | 30 |
|----|---|---|----|----|----|----|
| XP needed | 32 | 237 | 777 | 1571 | 2631 | 5456 |

XP **income** also rises so level cadence stays ~steady:
`xpVal = round(base · (1 + t/300))` where base = `[3, 8, 20]` per tier.

### 2.2 Enemy HP difficulty curve
```
difficulty = 1 + 0.9·m + 0.06·m²      (accelerating — matches player DPS growth)
enemyHP    = [30, 80, 250][tier] · difficulty
```

| Time | 1m | 3m | 5m | 10m | 15m |
|------|----|----|----|-----|-----|
| difficulty | 1.96 | 4.24 | 7.0 | 16.0 | 28.0 |

### 2.3 Enemy spawn (wave) curve
- Wave tick: every `WAVE_INTERVAL = 5s`.
- Normal wave count: `min(8 + t/12, 38)`.
- Horde wave (every 3rd wave): `min(20 + t/10, 60)`.
- Hard cap: `MAX_ENEMIES = 200`.
- Tier mix shifts toward tougher enemies over time (45s / 120s / 240s / 400s gates).

### 2.4 Enemy attack scaling
`attackDmg = round([10, 20, 38][tier] · (1 + t/500))` — gentle rise (≈2× at 10m)
so late waves stay lethal without being unfair.

### 2.5 Boss curve
- Appears every `BOSS_INTERVAL = 300s` (5 min).
- `bossHP = round((5000 + bossNum·4000) · (1 + t/200))`
- `bossAtkDmg = 40 + bossNum·15`
- Two phases: at <50% HP the boss **enrages** (+40% speed, denser radial volleys).

| Boss # | Time | HP |
|--------|------|----|
| 1 | 5m | ≈22.5k |
| 2 | 10m | ≈52k |
| 3 | 15m | ≈93.5k |

Design intent: each boss is ~15–25s of focused fire for an on-pace build, and
drops 4 item boxes on death.

### 2.6 Item boxes (random power-ups)
- Spawn every `ITEM_BOX_INTERVAL = 40s`, live `ITEM_BOX_LIFETIME = 28s`.
- Pool: medkit, invuln barrier, freeze bomb, turbo, precision (temp dmg),
  max-HP, permanent dmg, nuke. Bosses also drop a burst of 4.

---

## 3. Tower Defense — Curves

### 3.1 Stage progression (10 hand-authored stages)
Each stage's per-wave `hpMult` ramps monotonically from **1.0 → 4.0** across the
campaign, with `speedMult` 1.0 → 1.9 and boss waves introduced from stage 3.
Source: `STAGES` in `config.js`. Enemy types unlock: grunt → runner (st.2) →
tank (st.4); boss density rises to 3 boss waves by Apocalypse/Endgame.

### 3.2 Economy
| Value | Amount |
|-------|--------|
| Starting gold | 120 |
| Cannon / Frost / Tesla cost | 80 / 70 / 110 |
| Sell refund | 70% |
| Reward per kill | grunt 10, runner 8, tank 50, boss 200 |
| Gold bonus passive | ×1.25 (stacks) |
| 20% chance per kill | bonus coin (auto-collected) |

A grunt wave (6–10) funds roughly one L2 upgrade (100g) — tight but fair early.

### 3.3 Tower upgrade curve (5 levels)
`damageMult` 1.0 → 2.8 (cannon), 1.0 → 2.4 (frost), 1.0 → 3.0 (tesla);
`rangeMult` 1.0 → 1.45. Specials unlock at L3+ (pierce/arc/void, deepfreeze, megachain).

### 3.4 Infinity mode scaling
```
hpMult   = (1 + wv·0.12) · 1.015^wv          (linear + gentle compounding)
bossHP  ·= (1 + wv·0.15)  on boss waves       (bossHpScale, now applied)
speedMult = 1 + wv·0.04
count     = 6 + wv·2
interval  = max(400ms, 1000 − wv·20)
boss      = every 5th wave
```

| Wave | 10 | 25 | 50 |
|------|----|----|----|
| hpMult | ≈2.4× | ≈4.3× | ≈14.7× |

Compounding ensures the run eventually ends even though tower levels cap at 5
(only passives keep scaling player power).

---

## 4. Tuning guidance for agents

- **Keep curves here in sync with code.** Each formula above maps to a labelled
  comment in `game.js` / `config.js`.
- TD is config-driven: prefer editing `config.js` (`TD_CONFIG`) over `game.js`.
- TD now starts with 160g so the first wave supports an actual combo decision
  instead of a single-tower wait state.
- TD Meteor is an active panic button, not baseline DPS. Tune `METEOR.cost`,
  `cooldownSec`, `radius`, and `damage` together so it saves broken lanes but
  cannot replace tower placement.
- TD perfect-wave rewards use `waveLeaks === 0` and should remain small
  capacity bonuses; they are meant to make clean defense satisfying, not to
  trivialize later pressure.
- VPS is currently hardcoded in `game.js` (see ARCHITECTURE plan for the
  config-extraction proposal).
- When changing a damage/HP number, re-derive the **time-to-kill** target
  (trash ≈ 1–3 hits, boss ≈ 15–25s) rather than tuning blind.
