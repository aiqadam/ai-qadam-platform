# 03 — Code Summary (Step 3)

**Workflow:** wf-20260704-fix-080
**Issue:** [ISS-UAT-009-5](.copilot/issues/ISS-UAT-009-5.md) — BP-UAT-009 Neg 001 flaky client-side redirect
**Branch:** fix/ISS-UAT-009-5-bp-uat-009-neg-001-redirect-spec
**Date:** 2026-07-04
**Agent:** CodeDeveloper

---

## What changed

Single file: `apps/e2e/tests/uat/BP-UAT-009.spec.ts`, lines ~573-608.

**Net:** 24 lines added, 6 lines removed. Test-only diff. No app code touched.

### Behaviour delta

**Before** — the redirect assertion swallowed its own timeout signal:

```ts
await page
  .waitForURL(new RegExp(`^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`), {
    timeout: 15_000,
  })
  .catch(() => {
    /* handled by the assertion below — report actual URL either way */
  });

const landedOnSignIn =
  page.url().startsWith(`${BASE_URL}/auth/sign-in`) ||
  page.url().startsWith(AUTHENTIK_URL) ||
  page.url().includes('/api/v1/auth/login');
expect.soft(landedOnSignIn, 'browser should land on sign-in (app or Authentik)').toBe(true);
```

The `.catch(() => {})` discards the waitForURL timeout. The `landedOnSignIn` soft-assert then runs against `page.url()` at the moment Playwright checks — which is whatever the URL is *right after the timeout fires*. When the client-side redirect genuinely doesn't happen within 15s, the URL is still `/workspace`, and the soft-assert fires `false` with a message that doesn't mention "redirect never fired" — only "didn't land on sign-in". The test report is honest but noisy, and the 15s budget is below the established 20s sibling budget.

**After** — capture the outcome as a boolean and assert on it directly, matching the Step 004 idiom at line 302-310:

```ts
const reachedSignIn = await page
  .waitForURL(new RegExp(`^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`), {
    timeout: 20_000,
  })
  .then(() => true)
  .catch(() => false);

expect
  .soft(
    reachedSignIn,
    'browser should auto-redirect to /auth/sign-in or /api/v1/auth/login after entering /workspace while signed-out',
  )
  .toBe(true);

// Defensive second check: …
const landedOnSignIn =
  page.url().startsWith(`${BASE_URL}/auth/sign-in`) ||
  page.url().startsWith(AUTHENTIK_URL) ||
  page.url().includes('/api/v1/auth/login');
expect
  .soft(landedOnSignIn, 'final URL must be a sign-in surface (app, Authentik, or api login)')
  .toBe(true);
```

### Why the two soft-asserts are both useful

- **`reachedSignIn`** — measures the waitForURL promise outcome. If the regex matched at any point within 20s, true. This is the "did the redirect fire" check.
- **`landedOnSignIn`** — measures the final URL after the 20s window. This is the "where did the browser settle" check. It's redundant *when* `reachedSignIn` is true (the wait succeeded, the URL matched) but catches a different failure mode: the wait timed out but the URL still moved to a sign-in surface (e.g. via some other mechanism). Keeping both gives a precise error message either way.

The hard assertions (`workspaceContent` toHaveCount(0) + workspace-heading count) are unchanged.

## Why this is correct even though AC-1 cannot be verified yet

The fix improves test quality independently of any infrastructure issue. The pre-existing `_jsxDEV is not a function` bug in `apps/web/.astro/dev.log` is a **separate** problem: it prevents the React island from mounting, which is what *causes* the redirect to never fire in the live test. Once the React/JSX-runtime issue is resolved (a separate workflow), this test will pass — and if it *doesn't* pass, the new soft-assert structure produces a clear error message instead of the previous misleading one.

## Files touched

| File | Lines | Reason |
|---|---|---|
| `apps/e2e/tests/uat/BP-UAT-009.spec.ts` | +24 / −6 | Test fix only — Step 004 idiom + 20s timeout + defensive `landedOnSignIn` |
| `.copilot/tasks/active/wf-20260704-fix-080/02-test-design.md` | +87 (new) | TestDesigner output |
| `.copilot/tasks/active/wf-20260704-fix-080/03-code-summary.md` | +60 (new) | CodeDeveloper output (this file) |

No app code, no docs, no shared helpers, no fixtures.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Test-only diff, mirrors an existing pattern in the same file (Step 004, lines 302-310), uses the same 20s timeout budget as the other client-side redirect tests in this file (lines 215, 242, 276). No app code touched. Hard assertions preserved."
  findings:
    - "Idiom parity: Step 004's `.then(() => true).catch(() => false)` adopted verbatim."
    - "Timeout parity: 15s → 20s matches sibling budget."
    - "Two soft-asserts (reachedSignIn + landedOnSignIn) provide distinct failure messages."
    - "Hard assertions (workspaceContent count + workspace heading count) unchanged."
    - "Diff is +24 / −6 LOC inside one block; below the 400-line PR budget by an order of magnitude."
```