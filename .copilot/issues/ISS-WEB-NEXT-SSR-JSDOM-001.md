# ISS-WEB-NEXT-SSR-JSDOM-001

| Field | Value |
|---|---|
| Severity | blocker |
| Module | web-next/ssr-runtime (environment) |
| Status | resolved |
| Resolved | 2026-07-29 |
| Workflow | wf-20260729-fix-151 |
| Business-Process | — |
| Discovered by | wf-20260729-feat-150 (Step 13, post-merge UAT pre-flight for BP-UAT-021) |
| Date | 2026-07-29 |
| **Confirmed live on QA** | **2026-07-29, reported by user: `https://qa.aiqadam.org/workspace/admin/users` → 500. Same signature confirmed via curl: `/workspace/dashboard` and `/workspace/admin/audit` also 500 on QA; `/` and `/events` return 200. This is not a local-dev-only issue — it is live-broken on the shared QA deployment for every operator.** |

## Summary

Every SSR route under `apps/web-next/src/pages/workspace/**` returns
HTTP 500 in local dev (`http://localhost:4322`). Root cause:
`jsdom@28.1.0` (a transitive dependency of `isomorphic-dompurify`, which
`AnnounceComposer.tsx` imports) requires
`undici/lib/handler/wrap-handler.js`, a file path that does not exist in
the currently-installed `undici@8.8.0` (confirmed: `ls
node_modules/.pnpm/undici@8.8.0/node_modules/undici/lib/handler/` shows
only `cache-handler.js`, `cache-revalidation-handler.js`,
`decorator-handler.js`, `deduplication-handler.js`, `redirect-handler.js`,
`retry-handler.js` — no `wrap-handler.js`). This is a genuine
jsdom/undici API-shape incompatibility baked into the current
`pnpm-lock.yaml` resolution, not a corrupted/stale install — confirmed
by `pnpm install` and `pnpm install --force` both completing without
error and without changing the failure.

Because Astro bundles all SSR routes together, this single broken
import in `AnnounceComposer.tsx`'s dependency chain takes down every
`/workspace/*` route's server render, not just the announce composer
itself. Confirmed via direct `curl` against multiple unrelated routes:

| Route | Local (`:4322`) | QA (`qa.aiqadam.org`) |
|---|---|---|
| `/` (homepage) | 200 | 200 |
| `/events` | 200 | 200 |
| `/workspace/admin/users` | 500 | 500 |
| `/workspace/admin/audit` | 500 | 500 |
| `/workspace/admin/rbac-sync` | 500 | not checked |
| `/workspace/dashboard` | 500 | 500 |
| `/workspace/announce` | 500 | not checked |

**QA reproduction is not proof of the identical root cause** — QA runs a
Docker-built image (`apps/web-next/Dockerfile`), not `astro dev`, so its
`node_modules` resolution could in principle differ from the local
`pnpm install` state this issue's root-cause analysis was performed
against. No SSH/log access to the QA host is available to this agent
session (per `docs/04-development/workflow.md`'s documented
"commit-level confirmation is not currently self-serve" limitation) to
directly confirm the QA container's stack trace matches. Treat "same
jsdom/undici bug" as the leading hypothesis, not a confirmed fact, until
someone with host access pulls the QA container logs. The identical
failure *signature* (public routes fine, every `/workspace/*` route 500,
same routes affected) is strong circumstantial evidence for the same
cause, since QA is built from the same `pnpm-lock.yaml`.

## Impact

**Confirmed live on QA — every operator is currently locked out of the
entire `/workspace/*` cabinet system on `qa.aiqadam.org`.** This is not
merely a local-dev blocker anymore: any real country lead, organizer, or
super-admin trying to use QA today gets a 500 on every operator screen
(dashboard, admin/users, admin/audit, and presumably every other
`/workspace/*` route). Severity should be treated as user-facing outage
on QA, not just an environment gap blocking test automation.

Also blocks **live browser verification of every `/workspace/*`
cabinet** in local dev, including `BP-UAT-021` (the post-merge UAT
script for `FR-ADM-011`, discovered while attempting Step 13 of
`wf-20260729-feat-150`). Also blocks any other pending/future BP-UAT
script targeting a `/workspace/*` route on `web-next`.

**Not caused by FR-ADM-011's diff.** `wf-20260729-feat-150`'s changes
never import `isomorphic-dompurify`, `jsdom`, or `undici`, and the
failure reproduces identically on routes that PR never touched
(`/workspace/admin/audit`, `/workspace/dashboard`). Confirmed pre-existing
on `origin/main` before this PR's changes were introduced (the same
`node_modules` state predates this workflow's session).

## Reproduction

```bash
cd apps/web-next
pnpm dev   # or: npx astro dev
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4322/workspace/dashboard
# 500

npx astro dev logs
# Cannot find module 'undici/lib/handler/wrap-handler.js'
# Require stack: .../jsdom/lib/jsdom/browser/resources/jsdom-dispatcher.js
#   -> ... -> isomorphic-dompurify/index.js
```

## Attempted fixes (this session, all unsuccessful at fully resolving)

1. `pnpm install` — no-op, lockfile already satisfied per pnpm's own check.
2. `pnpm install --force` — full re-resolution + reinstall, same failure persists after restart.
3. Cleared `apps/web-next/node_modules/.vite` and `.astro` caches — no effect (confirms this is a `require()`-time module-resolution bug, not a stale build artifact).
4. Confirmed `jsdom`'s own `node_modules/undici` symlink correctly points at `undici@8.8.0` (the only lockfile-declared version) — the bug is that 8.8.0 itself lacks the file jsdom's code expects, not a version-selection/hoisting problem.

## Suggested fix directions (not attempted — out of scope for this discovery)

- Pin `jsdom` to a version whose internal `undici` usage matches what
  `undici@8.8.0` actually exports (check jsdom's changelog for the
  `wrap-handler.js` internal path — it may have been renamed/moved in a
  later undici minor, meaning jsdom 28.1.0 was built against a
  pre-release or different-numbered undici API).
- Alternatively, pin `undici` to whatever version jsdom 28.1.0 was
  actually built/tested against.
- Consider whether `isomorphic-dompurify` (only used by
  `AnnounceComposer.tsx`) needs to be a hard SSR-bundle dependency at
  all, or could be dynamically imported / `client:only` to avoid pulling
  jsdom into the server bundle in the first place.

## Resolution

- **Workflow:** `wf-20260729-fix-151`
- **PR:** `<pending>`
- **Root cause:** the root `package.json`'s `pnpm.overrides.undici`
  (`">=7.28.0"`, open-ended, added for an unrelated CVE fix in
  `ISS-CI-001`) let pnpm resolve `jsdom`'s `undici` dependency to
  `8.8.0` — a major version past jsdom's actual `^7.21.0` requirement,
  removing an internal file (`lib/handler/wrap-handler.js`) jsdom
  requires directly.
- **Fix:** added a pnpm selector-scoped override,
  `"jsdom>undici": "7.29.0"`, to `package.json`. This resolves `jsdom`'s
  copy of `undici` to the latest 7.x (satisfying both jsdom's own range
  and the original `>=7.28.0` CVE-fix floor) while leaving the blanket
  override untouched for every other consumer — critically,
  `testcontainers@12.0.4` (used by `apps/api`'s entire Testcontainers
  integration suite), which needs `undici@^8.5.0` and would have broken
  under a naive blanket downgrade. Confirmed via impact analysis that
  `isomorphic-dompurify` is the only `jsdom` dependent in the monorepo,
  so no other consumer needed the scoped treatment.
- **Regression test:**
  `apps/web-next/src/lib/isomorphic-dompurify-resolution.test.ts` —
  proven via literal stash/reinstall/test/pop/reinstall/test execution
  to fail before the fix (exact original error reproduced) and pass
  after.
- **Live verification:** all 5 previously-500 routes
  (`/workspace/admin/users`, `/workspace/dashboard`,
  `/workspace/admin/audit`, `/workspace/admin/rbac-sync`,
  `/workspace/announce`) confirmed returning 200 in local dev after the
  fix. Full `apps/api` (1350/1350) and `apps/web-next` (947/947) test
  suites pass; both packages build and typecheck clean; `pnpm audit`
  shows no new high/critical findings.
- **QA verification:** **not yet performed** — this fix has not been
  deployed to QA at time of writing. The user's original report
  (`https://qa.aiqadam.org/workspace/admin/users` → 500) will only be
  confirmed resolved once this PR merges and QA's `deploy-qa` CI job
  redeploys. The Docker-build-vs-local-`pnpm-install` root-cause-identity
  caveat noted earlier in this file is now resolved by this fix landing
  identically for both environments (same `pnpm-lock.yaml`), but the
  live QA confirmation itself is a follow-up action for whoever has
  visibility into the next QA deploy, not verified by this workflow.
- **Merged:** `<pending>`
