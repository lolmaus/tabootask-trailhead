# Disposable static SPA / OAuth evaluation (#22)

This is an evaluation harness, not the product notebook UI. It uses adjacent
`apps/backend` and `apps/web` workspaces. No frontend auth route, Start server
function, OAuth proxy, database outside Convex, or deployed Start runtime is used.
Real Google/GitHub smoke and human acceptance remain separate gates.

## Repeat the local proof

Install the repository's pinned Node/pnpm and dependencies, then:

```sh
pnpm --filter @repo/web exec playwright install chromium
pnpm --filter @repo/web test:integration
```

Stop services on ports 3200, 3201, 3212 and 3213 first. The command stages backend
source in a private temporary directory, starts a fresh anonymous local Convex
database, configures synthetic identities, builds Start, and runs Chromium through
Wrangler's static asset handler. The initial Convex run may download its backend
binary. It needs network access but no provider accounts or paid resources.
It never copies existing deployment configuration or credentials.

The substitute identity service is unmistakably labeled and only enabled when
`PROBE_LOCAL_OAUTH=1` **and** `CONVEX_SITE_URL=http://127.0.0.1:3213`. Any other
origin fails closed. Tests still traverse real Better Auth state, callback,
component persistence, one-time-token return, session/JWT and Convex authorization
paths. They do not validate Google's or GitHub's real OAuth endpoints.

Success removes the temporary database, synthetic sessions and private logs.
Failure retains a private diagnostic directory, prints its path, and stops the
processes. Delete that printed directory after diagnosis. Playwright tracing,
screenshots and video are disabled so session return URLs are not published as
test artifacts. Do not upload private backend logs or browser storage.

Focused backend checks:

```sh
pnpm --filter @repo/backend test
pnpm --filter @repo/backend typecheck
```

## Static build and deployment boundary

```sh
VITE_CONVEX_URL=https://DEPLOYMENT.convex.cloud \
VITE_CONVEX_SITE_URL=https://DEPLOYMENT.convex.site \
pnpm --filter @repo/web build
pnpm --filter @repo/web deploy:probe
```

Replace the public deployment URLs. Keep provider credentials and deploy keys out
of `VITE_*`: these values are compiled into browser assets. Wrangler requires an
authorized Cloudflare account or its supported temporary evaluation mechanism.
Do not upgrade plans, buy domains, or select a final provider for this experiment.

Start's SPA build uses Node **at build time** to prerender `_shell.html`. The
postbuild script copies it to `dist/client/index.html` for Cloudflare's SPA
fallback. Only `dist/client/**` is uploaded by `wrangler.jsonc`.
`dist/server/**` is an intermediate prerender output and is not deployed.
The Wrangler configuration has no `main` or Worker script. Requests that miss an
asset return `index.html`; a direct `/probe/t22-evaluation` load and refresh must
both work on the HTTPS host. Normal browser requests go to static assets,
Convex's HTTP auth origin and Convex's API/WebSocket origin.

## Real-provider local and hosted setup

Use an isolated **development** Convex project and test identities. Set these
backend variables through the Convex dashboard's protected environment storage:

| Variable                                   | Value                                                |
| ------------------------------------------ | ---------------------------------------------------- |
| `SITE_URL`                                 | Exact frontend origin, e.g. the evaluation HTTPS URL |
| `BETTER_AUTH_SECRET`                       | Independently generated private random secret        |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Environment-specific Google OAuth registration       |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Environment-specific GitHub OAuth registration       |

`CONVEX_SITE_URL` is supplied by Convex. Leave `PROBE_LOCAL_OAUTH` **unset** on
hosted deployments. Configure `SITE_URL` and the secret before the first backend
push, since HTTP route registration evaluates auth configuration during deploy.
Use a development deploy key injected by a protected secret store to deploy
`apps/backend`; do not accidentally target a production project. The Convex CLI
selects the deployment associated with `CONVEX_DEPLOY_KEY` when that is set.

Register these **exact backend callback URLs**, not frontend proxy URLs:

```text
https://DEPLOYMENT.convex.site/api/auth/callback/google
https://DEPLOYMENT.convex.site/api/auth/callback/github
```

For local real-provider testing, the existing backend uses HTTP origin
`http://127.0.0.1:3213`; the frontend origin is `http://localhost:3200`.
Register the corresponding `/api/auth/callback/{provider}` URLs with separate
local provider applications, subject to each provider's loopback registration
rules. Those real registrations are not exercised by the substitute tests.
Use `pnpm --filter @repo/backend dev` and a `build:local` static frontend for
that pass. Callback URLs, backend trusted origin and browser build URLs must all
refer to the same environment. No wildcard trusted origins are used.

## Session and account behavior to evaluate

- The compatible runtime pins are `@convex-dev/better-auth` 0.12.6,
  `better-auth` 1.6.33, Convex 1.49.0 and React 19.3.1. Better Auth 1.7.x is
  outside the component's declared peer range. Its optional Vitest peer range
  stops at 4.x; our tests run on the existing Vitest 5.0.5 without importing
  Better Auth's test-utils plugin. The observed tests are evidence of that
  combination, not an upstream support guarantee for optional test tooling.
- OAuth-only, `accountLinking.enabled=true`, `disableImplicitLinking=true`,
  `allowUnlinkingAll=false`. Public fixture ownership uses auth user ID, never
  email. Independent same-email provider sign-in must fail until deliberately
  connected from the existing session. Linking does not merge existing users.
- Differing-email linking is rejected by the library default in this experiment
  (`allowDifferentEmails=false`). Record that behavior for decision #13; this
  does not settle the product's differing-email policy.
- Cross-domain session cookie material is stored by the official client in
  browser `localStorage`; it is readable by frontend JavaScript, not HttpOnly.
  The browser sends `Better-Auth-Cookie` to Convex and omits browser credentials.
  A successful OAuth return uses a short-lived, single-use `ott`; the official
  React provider consumes it and removes it from browser history.
- Sessions last one hour in this disposable fixture; cookie caching is disabled.
  Every protected function calls the component's session-backed auth-user
  helper. A still-valid JWT with a missing/expired session cannot authorize a
  write or history read. Do not replace that check with identity claims alone.
- Sequential last-method unlink rejection is tested. The pinned library checks
  account count and then deletes through separate adapter calls. Concurrent
  unlink safety is a source-level concern that still needs a dedicated probe
  or atomic guard before production. Unlinking alone does not revoke sessions.
- Backend auth types need `skipLibCheck` for upstream declarations; application
  source remains strict. The React provider boundary has one documented type
  adaptation for an upstream `AuthClient` generic that infers session data as
  `never` with 1.6.33. Runtime behavior is covered by the local browser proof.

## Hosted smoke and cleanup

Open a unique `https://FRONTEND/probe/t22-SUFFIX` fixture. Real test accounts must
exercise Google and GitHub independently, same-email non-merging, signed-in
linking, either-provider stable user ID/ownership, already-owned identity
rejection, differing-email behavior, unlink/last-method guard, reload/new tab,
sign-out and expiry/revocation. Verify public current text and backend denial of
anonymous/outsider writes and protected history. Observe reactive updates from a
second context and network destinations. Record failures precisely; local
substitute results cannot be relabeled as real-provider smoke.

Use **Delete fixture** while signed in as its owner. After acceptance, remove the
isolated Convex project/deployment (including its auth component data), delete
the named `tabootask-t22-static-probe` Cloudflare deployment, remove the test
OAuth applications and their provider grants, and remove protected deployment
secrets. Do not delete production resources. If keeping the evaluation online
temporarily, record the URL and intended cleanup time on ticket #22.

Static asset delivery has no application runtime service. Auth HTTP handlers,
component data, functions and reactive queries run on Convex and consume its
normal allowances. No additional hosted identity subscription is introduced.
The hosted proof must confirm use of approved/free resources; this harness
does not select production quotas, recovery policy or provider purchases.
