# Step 8: Test Results

**Workflow:** wf-20260728-fix-139 · **Issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Pre-flight

`apps/web-next` dev server was already running locally on
`http://localhost:4322` (confirmed via `/auth/sign-up` — a web-next-only
route — returning 200). No additional infra needed; the fix and its
regression test operate entirely at the HTTP-redirect level, no
Authentik/Directus/Postgres round-trip required.

## Regression test — fail-before / pass-after

`apps/e2e/tests/uat/sign-in-default-redirect.spec.ts`, run via
`BASE_URL=http://localhost:4322 pnpm exec playwright test
tests/uat/sign-in-default-redirect.spec.ts --project=chromium-desktop`.

**Pre-fix** (4 changed app files `git stash`ed back to `origin/main`
state):
```
x bare /auth/sign-in with no ?next= redirects to /api/v1/auth/login?next=/me
    Expected: "/me"  Received: "/"
x homepage "Sign in" CTA sends next=/me, not next=/
    (same failure mode — captured href carried next=%2F)
ok gated-page "Sign in" CTA still returns to the original page (no regression)
  2 failed, 1 passed
```

**Post-fix** (`git stash pop`):
```
ok bare /auth/sign-in with no ?next= redirects to /api/v1/auth/login?next=/me
ok homepage "Sign in" CTA sends next=/me, not next=/
ok gated-page "Sign in" CTA still returns to the original page (no regression)
  3 passed (12.3s)
```

This proves the regression test genuinely exercises the reported bug and
that the fix resolves it, per Step 6's key constraint.

## Full-suite regression check

| Suite | Result |
|---|---|
| `apps/web-next` — `astro check` | 0 errors, 0 warnings (39 pre-existing hints, unrelated) |
| `apps/web` — `astro check` | 0 errors, 0 warnings (25 pre-existing hints, unrelated) |
| `apps/web-next` — `pnpm test` (vitest) | 932/932 passing |
| `apps/web` — `pnpm test` (vitest) | 54/54 passing |
| `apps/e2e` — `biome check` on new spec file | clean |

No regressions in either app's existing test suite.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Regression test fail-before/pass-after verified live (git stash cycle). 932/932 + 54/54 pre-existing unit tests pass. 0 typecheck errors in both apps."
```
