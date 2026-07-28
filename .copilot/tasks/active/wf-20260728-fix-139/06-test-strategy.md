# Step 6: Test Strategy

**Workflow:** wf-20260728-fix-139 · **Issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Approach

The defect is entirely in server-side redirect-URL construction — no
client-side JS state, no live Authentik round-trip required to observe
it. A Playwright test reading the raw HTTP `Location` header (via
`request.get(..., { maxRedirects: 0 })`) and inspecting anchor `href`
attributes is sufficient and fully deterministic (no email/OTP/OIDC
dependency, unlike the full sign-up flow tests).

## Test file

`apps/e2e/tests/uat/sign-in-default-redirect.spec.ts` — 3 cases:

1. Homepage "Sign in" CTA (`AppNav.astro`) constructs `next=/me`, not
   `next=/`. **Documents the original bug.**
2. Bare `/auth/sign-in` visit (no `?next=`) redirects to
   `/api/v1/auth/login?next=/me`. **Documents the original bug.**
3. A gated page's "Sign in" CTA still carries real page context (not
   clobbered to `/me`). **Regression guard for the existing, correct
   behavior** (`ISS-UAT-009-2`/BP-UAT-009 territory) — must keep passing
   before and after the fix.

## Fail-before / pass-after verification

Executed manually (not just asserted in prose) via `git stash` on the
4 changed app-code files, against the live `apps/web-next` dev server
(`localhost:4322`):

- **Pre-fix (stashed):** tests 1 and 2 fail (`Received: "/"` /
  `Received: null`→`"/"" after test fix iteration), test 3 passes. This
  confirms tests 1/2 actually exercise the bug and test 3 is a true
  regression guard, not a tautology.
- **Post-fix (stash popped):** all 3 pass.

Full transcript in `07-test-results.md`.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "3-case Playwright spec, HTTP-level assertions, no live infra dependency beyond the already-running web-next dev server. Fail-before/pass-after verified live via git stash."
```
