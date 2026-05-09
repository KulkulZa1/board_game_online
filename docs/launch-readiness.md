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

- `/api/status` may include the local shutdown key only for loopback requests.
- Admin routes are available to loopback requests by default. Set `ENABLE_ADMIN_ROUTES=true` only if a controlled deployment intentionally needs remote admin shutdown endpoints.
- Set `ALLOWED_ORIGINS=https://board-game-online.onrender.com` for production Socket.io CORS tightening.
- Do not commit `.env`, `.shutdown-key`, server logs, or pid files.

## Current audit snapshot

This launch-readiness pass found and fixed:

- Hostname-based local/admin trust in `/api/status`; it now uses loopback remote address checks.
- Admin shutdown/terminate routes were always registered; they now reject non-loopback access unless `ENABLE_ADMIN_ROUTES=true`.
- Plant Growing sandbox saved `sandbox_pg_config`, but the main Plant game ignored it; the main game now uses saved sandbox stages on the same origin.
- Plant sandbox could not add, duplicate, rename, or delete growth stages; the stage editor now supports those actions.
- Sandbox pages caused a browser favicon 404; sandbox pages now declare `/icons/icon.svg`.
- `npm run dev` was missing; it now starts the local server like `npm start`.

Current production observations before this branch is merged and Render redeploys:

- Production home does not list Tower Defense and `/arcade/tower-defense/` returns `Cannot GET /arcade/tower-defense/`.
- Production Plant main game does not consume `sandbox_pg_config`; injected production-origin storage still showed the default `씨앗` stage and `+1/클릭`.
- Production Vampire started and advanced time, but 9 seconds of live play showed `0` kills, indicating the deployed build is missing the local attack-loop fix that exists on this branch.
- Production still requests `/favicon.ico` on at least one sandbox path; this branch fixes that by adding favicon links to sandbox HTML.

## Sandbox to main-game flow

Sandbox editors save same-origin `localStorage` configuration. Main arcade games read those values on the same origin:

| Sandbox | Storage key | Main game |
|---|---|---|
| `/sandbox/vampire-survivors/` | `sandbox_vs_config` | `/arcade/vampire/` |
| `/sandbox/plant-growing/` | `sandbox_pg_config` | `/arcade/plant/` |
| `/sandbox/tower-defense/` | `sandbox_td_config` | `/arcade/tower-defense/` |

Local and production browser storage are separate. A stage created on localhost will not appear on Render unless it is also created on the production origin or exported into source code.

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
- Save sandbox config for each sandbox-backed game and reopen the matching main game on the same origin.
- Check browser console and network panels for errors.
- Compare local routes with `https://board-game-online.onrender.com/` after Render redeploys.

## Remaining launch risks

- Sandbox persistence is browser-local only. Cross-device publishing needs a server-backed content store, schema validation, and moderation.
- Production verification cannot prove branch changes until the branch is merged to `main` and Render finishes redeploying.
- Gameplay smoke tests are still mostly manual. Add headless browser checks for core loops before launch.
