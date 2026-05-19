# Render version verification

This project has had cases where Render production kept serving stale game code after a deploy. The version diagnostics added here make that state visible without GitHub or Render admin permissions.

## What is exposed publicly

- `/api/version` returns the running server branch, commit, and process start time.
- The lobby and admin pages load `/js/version-badge.js`.
- The badge fetches `/api/version` with `cache: no-store` and displays the branch plus short commit.
- `npm run verify:production` checks the public production URL and verifies the version endpoint, badge script, cache headers, and service-worker deploy policy.

No secret, Render token, GitHub token, or admin route is required.

## After merging and redeploying

Run:

```bash
EXPECTED_COMMIT=<expected-render-commit> npm run verify:production
```

If you do not know the exact commit yet, run:

```bash
npm run verify:production
```

The command prints the branch, commit, and start time currently served by Render.

## Local dry run

Start the app locally, then run the verifier against localhost:

```bash
PORT=3134 npm start
VERIFY_BASE_URL=http://127.0.0.1:3134 npm run verify:production
```

Expected local identity:

- Branch: `dev`
- Commit: `local`

## Failure meanings

`Lobby HTML does not load /js/version-badge.js`

: Production has not deployed this change yet, or Render is still serving an older HTML response.

`/api/version should send Cache-Control: no-store`

: The version endpoint may be cached somewhere, so the badge cannot be trusted as deploy evidence.

`/js/version-badge.js should send Cache-Control: no-store`

: A browser or edge cache may keep stale diagnostics code.

`/sw.js should use network-first handling`

: The service worker may still serve old game JS/CSS before checking the network. This is the historical stale-game-code risk.

`Expected commit <x>, but production reports <y>`

: Render is serving a different commit than the one you intended to verify. Check whether the PR was merged, whether Render redeployed from `main`, and whether the deployment finished.

## Current branch status

The focused diagnostics branch is `audit/version-diagnostics-focused`. It is based on the local `origin/main` snapshot and contains only the deploy/cache/version diagnostics needed for this launch-readiness step.
