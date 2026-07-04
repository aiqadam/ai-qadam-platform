# 06 — Test Design (Step 2)

**Workflow:** wf-20260704-fix-080
**Issue:** [ISS-UAT-009-5](.copilot/issues/ISS-UAT-009-5.md) — BP-UAT-009 Neg 001 flaky
**Branch:** fix/ISS-UAT-009-5-bp-uat-009-neg-001-redirect-spec
**Date:** 2026-07-04
**Agent:** TestDesigner

---

## Re-statement of root cause

`apps/web/src/pages/workspace/Workspace.tsx` redirects anonymous visitors via a **`window.location.replace()` inside `useEffect`** (client-side, after bootstrap resolves). Playwright's `page.goto(..., { waitUntil: 'domcontentloaded' })` returns BEFORE the `useEffect` fires.

The test currently does:

```typescript
await page.waitForURL(new RegExp(...), { timeout: 15_000 })
  .catch(() => { /* handled by the assertion below */ });
```

`.catch(() => {})` swallows the timeout and the test runs the `landedOnSignIn` soft-assert against the not-yet-redirected URL → soft-assert fires `false`.

## Existing in-file precedent for a client-side redirect assertion

The sister pattern at [apps/e2e/tests/uat/BP-UAT-009.spec.ts:302-310](apps/e2e/tests/uat/BP-UAT-009.spec.ts#L302-L310) (Step 004) uses the correct idiom:

```typescript
const reachedSignedOut = await page
  .waitForURL(`${BASE_URL}/auth/signed-out`, { timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
expect.soft(reachedSignedOut, 'browser should auto-redirect to /auth/signed-out after sign-out')
  .toBe(true);
```

That captures the waitForURL outcome as a boolean and feeds it to a soft assert — Playwright's `waitForURL` is awaited, the timeout doesn't silently fall through, and the soft-assert reads truthy/falsy directly.

## Design choice

Apply the Step 004 idiom to Neg 001 with three changes:

1. Replace `.catch(() => {})` (silent swallow) with `.then(() => true).catch(() => false)` (capture outcome).
2. Bump the timeout from 15s → 20s. Other client-side redirects in this file use 20s (lines 215, 242, 276). 15s is below the established budget and is part of why Neg 001 races intermittently on warm runs.
3. Replace `expect.soft(landedOnSignIn, …)` with `expect.soft(reachedSignIn, …)` and feed the boolean directly. Keep `landedOnSignIn` as an `extra` assertion to **also** catch the case where the URL landed somewhere unexpected (e.g. the Authentik shell) — a defensive read.

`hideDevToolbar` and `shot` stay where they are (post-redirect). The hard assertions (`workspaceContent` toHaveCount(0) + the workspace-heading count) are already correct and **stay unchanged**.

## AC mapping

| AC | How this design satisfies it |
|---|---|
| AC-1 (Neg 001 deterministic on 3 live runs) | `await waitForURL(...).then().catch()` no longer races; 20s timeout absorbs React bootstrap + directus bootstrap |
| AC-2 (no regression to other steps) | Edit is contained to lines ~570-595; no shared helpers touched |
| AC-3 (matches docs) | `docs/02-business-processes/uat/BP-UAT-009.md` already states the contract ("Browser redirects to /auth/sign-in"); the rewrite enforces that more strictly |

## File diff plan

`apps/e2e/tests/uat/BP-UAT-009.spec.ts:564-603` — replace lines 575-588:

- BEFORE: `.catch(() => { /* handled by the assertion below */ })` + soft-assert on `landedOnSignIn`.
- AFTER: `.then(() => true).catch(() => false)` -> `reachedSignIn` boolean -> soft-assert with explanatory message.

No other files touched.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Design adopted the Step 004 idiom verbatim, with a 20s timeout bump to match sibling client-side-redirect tests. Edit surface ~14 LOC inside the Neg 001 block. No shared helpers, no fixture changes, no test infrastructure changes."
  findings:
    - "Idiom parity: design mirrors BP-UAT-009.spec.ts:302-310 (Step 004) — already battle-tested for client-side Authentik redirects."
    - "Timeout parity: 20s matches lines 215/242/276."
    - "Hard assertions (workspaceContent count + workspace heading count) unchanged — they were already correct."
    - "Defensive second check (landedOnSignIn) retained as a separate expect.soft so partial-redirect (e.g. Authentik shell) still produces an honest disclosure."
    - "Diff plan: ~14 LOC inside the Neg 001 test block only; AC-2 (no-regression) trivial."
```
