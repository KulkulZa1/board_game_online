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
- Ad removal and premium character purchase boundary.
  - `AdMobHelper.purchaseAdRemoval()` and `restorePurchases()` are native-only hooks for Capacitor billing plugins.
  - When `adsRemoved` is owned, forced interstitials are suppressed while opt-in rewarded revive/boost actions remain available.
  - Locked premium characters can call `AdMobHelper.purchasePremiumCharacter()` and persist ownership in local meta only after the native helper reports success.
- Mobile interruption recovery.
  - Active runs save to `vps_run_snapshot_v1` during play, pause, visibility changes, page unload, and revive.
  - A saved run appears on the start overlay as Continue/Discard and restores into the pause menu instead of immediately unpausing.
  - Death, win, and starting a new run clear the snapshot so coins and achievements are only awarded by the final outcome.
- Co-op relay MVP.
  - The start overlay can host a Socket.io co-op room and expose a shareable `?vpsRoom=...` link.
  - A guest browser joins as a controller, sends movement/dash/tower intent, and controls a green ally in the host simulation.
  - The guest receives a compact host-state mirror; rewards and simulation stay host-authoritative.
- Tower Defense hybrid mechanic.
  - During a run, `T` places the selected tower at the player position and `Y` cycles Cannon/Frost/Tesla.
  - Tower charges recover over time and from kills, creating a small defend-or-save decision layer inside the survival loop.
  - The standalone Tower Defense arcade route now loads reused TD runtime files from `/arcade/tower-defense/runtime/` instead of broken `/sandbox/...` URLs, keeping the sandbox editor dev-only while making the main TD game loadable in production.
  - Towers expire after a limited lifetime and the oldest tower is replaced when the cap is reached.
- Achievement and run report layer.
  - One-time achievements grant coin rewards for survival milestones, first clear, hard clear, triple evolution, near-miss clear, defense-line tower play, and no-revive clear.
  - The end screen reports evolved weapon count, tower placements, lowest HP, and missed evolution hints so failed evolution attempts become readable next-run plans.
- Evolution planning UI.
  - The start overlay shows all evolution recipes, while level-up and pause overlays show a compact progress plan for the current run.
  - Level-up upgrade cards now render text through DOM text nodes instead of HTML strings, keeping the normal choice flow while reducing injection risk.
- Evolution payoff.
  - Picking a ready evolution now creates a short on-field celebration with a readable banner, screen-space text, heavier particles, screen shake, and a WebAudio chime that safely no-ops when audio is unavailable.
- Level-up decision tension.
  - Evolution choices remain guaranteed when ready, while the remaining cards are weighted toward early build starters, weapon level-ups, and combo passives that support owned weapons.
  - Cards show short tags like `Build starter`, `Power up`, `Combo passive`, and `Near evolution` so the player can read why a choice matters.
- Near-miss feedback.
  - Runs below 25% HP now show throttled `LOW HP` / `CRITICAL HP` alerts, a pulsing ring around the player, a canvas edge warning, and a critical HP bar state.
  - The feedback is transient runtime state only; it does not enter run snapshots or alter the existing near-miss clear achievement calculation.
- Sandbox evolution mirror.
  - `sandbox/vampire-survivors/` now stores evolved skills and `EVOLUTIONS` recipes in `VS_CONFIG`, exposes editable base/passive/result rows, shows golden evolution cards, and swaps max-level base skills into evolved skills at runtime.
  - Old local sandbox saves are migrated by appending missing default evolved skills and recipes.

## Verification targets

- `npm run lint`
- `npm test`
- `npm run test:full`
- `npm run check`
- `npm run build`
- `npm run test:full` includes a VM-level sandbox check that forces `orb` level 5 plus `spinach`, verifies the `blackhole` evolution card is offered, then selects it and checks the weapon swap.
- Manual browser check at `/arcade/vampire/`:
  - start overlay shows character, difficulty, and meta chips.
  - start overlay shows map selection, daily challenge, permanent upgrades, and start boost controls.
  - selecting different characters changes starting weapons.
  - pause overlay appears with `P` and resumes without time jump.
  - death screen shows coin rewards and a revive action.
  - `T` places a tower, tower projectiles damage enemies, Frost freezes enemies, and Tesla chains to nearby enemies.
  - lowering HP during a run produces visible low-health pressure without stacking repeated alerts.
  - end screen displays evolution count and missed evolution hints when a run ends without all possible evolutions.
  - mobile viewport stacks selection cards without covering controls.

## Remaining design work

- Real store configuration is not complete: product IDs, billing plugin choice, receipt validation, and production AdMob IDs must be configured before store submission.
- The sandbox version now mirrors skill leveling and evolution recipes, but it does not yet mirror the full production meta loop: character unlocks, difficulty/map selection, daily modifiers, coins, achievements, run snapshots, and TD hybrid tuning remain arcade-side.
- Two-player cooperative Vampire Survivors now has a playable host-authoritative relay MVP, but full production co-op still needs reconnect UX, lobby/share polish, richer guest rendering, fairness tuning, and longer two-device playtesting.
- Tower Defense now has a file-based sandbox publish/import flow into the standalone arcade route, but premium TD stage publishing still needs a server-backed content store, moderation, entitlement checks, and production monetization rules.
