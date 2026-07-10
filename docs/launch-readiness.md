# Launch readiness notes

These notes capture the current launch-readiness checks for the Node/Express static game platform.

## Runtime and deployment

- Runtime: Node.js 18+, Express, Socket.io, static HTML/CSS/JS.
- Local start: `npm start` or `npm run dev`.
- Render start command: `node server.js`.
- Render build command: `npm install`.
- Health endpoint: `/api/status`.
- Render deploys from `main`, so branch changes are not visible on production until the PR is merged and Render redeploys.

## Security findings

- `/api/status` returns aggregate health publicly; detailed `roomList`, `tunnelUrl`, and the local shutdown key are loopback-only.
- Admin routes are available to loopback requests by default. Set `ENABLE_ADMIN_ROUTES=true` only if a controlled deployment intentionally needs remote admin shutdown endpoints.
- Socket.io defaults to the Render production origin plus local/LAN development origins. Set `ALLOWED_ORIGINS` to a comma-separated list when adding a tunnel or alternate production domain.
- Do not commit `.env`, `.shutdown-key`, server logs, or pid files.

## Current audit snapshot

This launch-readiness pass found and fixed:

- Hostname-based local/admin trust in `/api/status`; it now uses loopback remote address checks.
- Admin shutdown/terminate routes were always registered; they now reject non-loopback access unless `ENABLE_ADMIN_ROUTES=true`.
- Plant Growing sandbox saved `sandbox_pg_config`, but the main Plant game ignored it; the main game now uses saved sandbox stages on the same origin.
- Plant sandbox could not add, duplicate, rename, or delete growth stages; the stage editor now supports those actions.
- Sandbox pages caused a browser favicon 404; sandbox pages now declare `/icons/icon.svg`.
- `npm run dev` was missing; it now starts the local server like `npm start`.
- Multiplayer chat now shows short speech bubbles above host/guest player bars while preserving the existing chat log.
- The smoke test now covers chat payload trimming plus client-side bubble behavior for live messages versus history replay.
- Vampire Survivors sandbox now mirrors the production skill-level/evolution loop with editable evolution recipes and a runtime smoke check for `orb + spinach -> blackhole`.
- Vampire Survivors now has a native-only purchase boundary for ad removal, restore purchase, and premium character unlocks. Web remains no-op; real store product setup is still required.
- Public arcade pages no longer request `/sandbox/...` assets. Tower Defense now loads its reused runtime through `/arcade/tower-defense/runtime/`, while `/sandbox/` remains a dev-only 404 route in production.
- Vampire Survivors now persists an active run locally during play, pause, mobile visibility changes, page unload, and revive. A valid saved run appears as a Continue/Discard panel on the start overlay and restores into the pause menu.
- Vampire Survivors has a first Socket.io co-op relay: the host creates a shareable `?vpsRoom=...` link, the guest sends movement/dash/tower input, the host simulates an ally, and the guest sees a compact mirror of the host state.
- Vampire Survivors now keeps evolution recipes visible on start, pause, and level-up overlays so players can plan around missing passives or max-level weapons before the end-run report.
- Vampire Survivors evolutions now have a stronger success payoff: banner, particle burst, screen shake, and defensive WebAudio chime.
- Vampire Survivors level-up cards now use weighted RNG friction and visible reason tags instead of a flat shuffle for every non-evolution choice.
- Vampire Survivors low-health runs now have near-miss feedback during play: throttled screen-space alerts, player-ring pulse, canvas edge warning, and a critical HP bar state. This makes the existing near-miss achievement legible before the end screen.
- Vampire Survivors now has a first hack-and-slash support layer. Level-up cards can modify the dash slash with `Cleave Edge`, `Rupture Mark`, and `Echo Step`, creating wider path cuts, bleed/burst pressure, and delayed after-slashes without replacing the existing auto-attack/evolution loop.
- Tower Defense sandbox now has a validated `Publish` action. Published configs save under `td_published_config`, export as `td-published-config.json`, and `/arcade/tower-defense/` prefers that published key before falling back to draft/default config.
- Tower Defense arcade now exposes game-first controls: `Play Stage 1`, quick Cannon/Frost/Tesla/Amplifier placement, and a Meteor panic ability. The editor remains available, but the route is no longer dependent on the Stages tab for the first playable action.
- Service worker caching no longer serves old JS/CSS before checking the network; this prevents deployed game logic from appearing stale after Render deploys.
- All HTML pages now load `/js/sw-update.js`, which registers the service worker consistently and reloads controlled pages once after an updated worker takes control.
- Server responses for HTML, `sw.js`, JS, CSS, and `manifest.json` now send `Cache-Control: no-cache, no-store, must-revalidate`.
- Public `/api/status` no longer exposes room ids, room detail snapshots, or tunnel URLs to proxied/non-local traffic.
- Chat spam now emits a clear rate-limit message after 8 messages in 10 seconds instead of silently dropping messages.
- The production lockfile now resolves `ws` to 8.21.0 through updated Engine.IO/Socket.io adapter packages; `npm audit fix` reported zero remaining vulnerabilities in the successful audit run.

Current production observations before this branch is merged and Render redeploys:

- On 2026-07-10, `/api/version` reported production commit `f09f83a` on `main`, while `origin/main` was `b0f8b94`. The deployed service was one merge behind the repository, so this mismatch is a Render deploy-state issue rather than only a browser cache issue.
- The deployed Factory and Bootstrap routes both started successfully with no captured console warnings/errors at desktop size. Factory did not contain the new breakthrough HUD and Bootstrap did not contain the new active-action control, as expected before this branch is merged and redeployed.
- At a 390x844 production viewport, both routes avoided horizontal page overflow. Bootstrap's dashboard content overflowed its mobile grid height and visually collided with the tutorial/control region; this branch changes the mobile board to content-height document flow.
- Factory's production mobile HUD placed the throughput/speed box over the phase-stability panel. This branch moves that box above the bottom build controls on narrow screens so the expanded breakthrough panel remains readable.
- Production home and arcade routes loaded on the deployed `main` commit; `/sandbox/` is expected to return 404.
- Branch changes that move Tower Defense runtime files off `/sandbox/...` require merge and Render redeploy before they are visible on production.
- The new chat speech-bubble behavior is not visible on production until this branch is merged and Render redeploys.
- Production currently still serves `sw.js` with the old JS/CSS stale-while-revalidate policy until this branch is merged and Render redeploys.
- Production asset headers checked on 2026-05-20 showed `/sw.js` and `/api/version` were no-store, but `/js/chat.js` and `/manifest.json` still used `Cache-Control: public, max-age=0`; this branch changes JS/CSS/manifest to no-store too.
- Shell-based `Invoke-WebRequest` to the HTTPS production status endpoint failed in this Windows environment with a receive error, but the in-app browser loaded the production app successfully.

## Chat speech bubble behavior

- Live host/guest chat creates a temporary bubble above the sending player's bar.
- Loaded history does not replay bubbles after refresh or reconnect.
- New messages from the same player replace the existing bubble instead of stacking.
- Bubble text is assigned through `textContent`, capped for display, and auto-hidden after roughly four seconds.
- Spectator-authored messages remain chat-log-only until the shell has a stable spectator avatar area.

## Vampire run resume behavior

- Active `/arcade/vampire/` runs save to `localStorage` under `vps_run_snapshot_v1`.
- Snapshots are written on fresh start, periodic play, pause, mobile tab/app hide, page unload, and revive.
- Death, win, and starting a new run clear the snapshot so end-run rewards are not replayed.
- Restoring a run opens the pause menu at the saved elapsed time; the player must explicitly resume.
- Snapshots older than 36 hours are discarded.

## Vampire co-op relay behavior

- `/arcade/vampire/` loads Socket.io and can host a lightweight co-op room from the start overlay.
- The host gets a shareable URL with `?vpsRoom=<id>`; a second browser can join as guest.
- The host remains authoritative for simulation and rewards.
- The guest controls an ally body through relayed movement, dash, and tower intent.
- The ally can attract enemies, collect XP, fire a simple bolt, dash-damage nearby enemies, and place shared-charge hybrid towers.
- The guest receives a compact state mirror rather than a full deterministic local simulation. Full synchronized co-op progression remains future work.

## Sandbox to main-game flow

Sandbox editors save same-origin `localStorage` configuration. Main arcade games read those values on the same origin:

| Sandbox | Storage key | Main game |
|---|---|---|
| `/sandbox/vampire-survivors/` | `sandbox_vs_config` | `/arcade/vampire/` |
| `/sandbox/plant-growing/` | `sandbox_pg_config` | `/arcade/plant/` |
| `/sandbox/tower-defense/` | `sandbox_td_config` / `td_published_config` | `/arcade/tower-defense/` via `/arcade/tower-defense/runtime/` |

Local and production browser storage are separate. A stage created on localhost will not appear on Render unless it is also created on the production origin, imported from a published JSON file, or exported into source code. The sandbox editors remain developer tools; public arcade pages must not request `/sandbox/` assets.

Tower Defense publish flow:

1. Edit `sandbox/tower-defense/`.
2. Click `Publish`; validation rejects missing stages, unknown enemy types, and invalid wave values.
3. Import the exported `td-published-config.json` on `/arcade/tower-defense/` if the sandbox and arcade are on different origins.
4. The arcade route displays whether a published, draft, or default config was loaded.

The Vampire Survivors sandbox now edits skill evolutions as config data, but arcade-only meta systems such as coins, achievements, character unlocks, daily challenge, map unlocks, and the in-run TD hybrid still need a shared schema before the sandbox can tune every production rule.

## Verification checklist

Run before opening a PR:

```bash
npm install
npm run lint
npm test
npm run build
npm run dev
```

Manual checks:

- Open the home page and game list.
- Launch at least one protected v1.0 game without changing its code.
- Launch Vampire, Plant, and Tower Defense.
- In Vampire, start a run, pause or reload, then confirm the Continue panel restores the saved run into the pause menu.
- In Vampire, host a co-op room, open the share URL in a second browser, join as guest, start the host run, and confirm guest input moves the green ally plus the guest mirror receives state.
- Save sandbox config for each sandbox-backed game and reopen the matching main game on the same origin.
- For Tower Defense, publish from the sandbox, import the exported JSON into `/arcade/tower-defense/`, and confirm the arcade route reports `Published config loaded`.
- Check browser console and network panels for errors.
- Compare local routes with `https://board-game-online.onrender.com/` after Render redeploys.

## Remaining launch risks

- Sandbox persistence is browser-local only. Tower Defense now has file-based publish/import validation, but cross-device publishing still needs a server-backed content store, schema validation on the server, and moderation.
- Production verification cannot prove branch changes until the branch is merged to `main` and Render finishes redeploying.
- Gameplay smoke tests are still mostly manual. The co-op relay has a socket smoke test, but full two-browser play should be checked before launch.
