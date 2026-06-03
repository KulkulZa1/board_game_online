# Vampire Survivors Director Loop Notes

This note records the launch-readiness work for `/arcade/vampire/`.

## Implemented in this pass

- Character selection on the run start overlay.
  - `Chess Knight`: free starter, faster movement, starts with `arrow`.
  - `Omok Stone`: unlocks after surviving 3:00 or with coins, starts with `orb` + `nova`.
  - `Reversi Mage`: unlocks after the first evolution or with coins, starts with `shield` + `laser`.
- Difficulty selection on the run start overlay.
  - Easy, Normal, and Hard tune enemy HP, speed, damage, spawn pressure, boss interval, and coin rewards.
- Pause support.
  - `P`, `Escape`, the header pause button, and browser tab backgrounding pause active runs.
- Meta progression stored in `localStorage` under `vps_meta_v2`.
  - Coins, best time, best kills, unlocks, and achievements persist between runs on the same browser.
- Survival completion.
  - The game now ends in a win when `elapsed >= getSurviveGoal()`.
- Boss milestone pressure.
  - Boss interval is difficulty-aware and starts at about 2 minutes on Normal.
- Revive hook.
  - A dead run can revive once by spending coins or, in native Capacitor builds, through `AdMobHelper.showRewardedRevive()`.

## Verification targets

- `npm run lint`
- `npm test`
- `npm run test:full`
- `npm run check`
- `npm run build`
- Manual browser check at `/arcade/vampire/`:
  - start overlay shows character, difficulty, and meta chips.
  - selecting different characters changes starting weapons.
  - pause overlay appears with `P` and resumes without time jump.
  - death screen shows coin rewards and a revive action.
  - mobile viewport stacks selection cards without covering controls.

## Remaining design work

- Daily challenge and map unlocks are still design-level backlog items.
- Premium character purchase and ad-removal IAP are not implemented; current rewarded revive uses test ad IDs and must be replaced before store submission.
- The sandbox version still needs a full mirror of the production evolution/meta loop if sandbox editing is expected to tune every production rule.
- Two-player cooperative Vampire Survivors mode remains a larger architecture task because it needs deterministic state sync or authoritative server simulation.
