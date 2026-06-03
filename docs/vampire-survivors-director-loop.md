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
- Permanent upgrades.
  - Coins can buy `Might`, `Vitality`, `Magnet`, and `Haste` ranks from the start overlay.
- Daily challenge.
  - A date-based daily modifier fixes one starter weapon, increases pressure, and grants a once-per-day clear bonus.
- Map unlocks.
  - `Meadow` is free, `Night Board` unlocks after the first clear, and `Snow Endgame` unlocks after a Hard clear or coins.
- Survival completion.
  - The game now ends in a win when `elapsed >= getSurviveGoal()`.
- Boss milestone pressure.
  - Boss interval is difficulty-aware and starts at about 2 minutes on Normal.
- Revive hook.
  - A dead run can revive once by spending coins or, in native Capacitor builds, through `AdMobHelper.showRewardedRevive()`.
- Start boost hook.
  - Runs can be boosted once with coins or native rewarded ad through `AdMobHelper.showRewardedStartBoost()`.
- Tower Defense hybrid mechanic.
  - During a run, `T` places the selected tower at the player position and `Y` cycles Cannon/Frost/Tesla.
  - Tower charges recover over time and from kills, creating a small defend-or-save decision layer inside the survival loop.
  - Towers expire after a limited lifetime and the oldest tower is replaced when the cap is reached.

## Verification targets

- `npm run lint`
- `npm test`
- `npm run test:full`
- `npm run check`
- `npm run build`
- Manual browser check at `/arcade/vampire/`:
  - start overlay shows character, difficulty, and meta chips.
  - start overlay shows map selection, daily challenge, permanent upgrades, and start boost controls.
  - selecting different characters changes starting weapons.
  - pause overlay appears with `P` and resumes without time jump.
  - death screen shows coin rewards and a revive action.
  - `T` places a tower, tower projectiles damage enemies, Frost freezes enemies, and Tesla chains to nearby enemies.
  - mobile viewport stacks selection cards without covering controls.

## Remaining design work

- Premium character purchase and ad-removal IAP are not implemented; current rewarded hooks use test ad IDs and must be replaced before store submission.
- The sandbox version still needs a full mirror of the production evolution/meta loop if sandbox editing is expected to tune every production rule.
- Two-player cooperative Vampire Survivors mode remains a larger architecture task because it needs deterministic state sync or authoritative server simulation.
- The TD hybrid currently ships as an in-run tower-placement layer, not a full sandbox-authored premium TD stage publishing system.
