# ISS-UAT-009-5 — BP-UAT-009 Neg 001 (protected page redirect) is flaky because the test races the client-side redirect

| Field | Value |
|---|---|
| ID | ISS-UAT-009-5 |
| Severity | minor |
| Module | e2e/tests/uat (BP-UAT-009 Neg 001, `/workspace` redirect) |
| Status | open |
| Reported | 2026-07-04 |
| Resolved | — |
| Reporter | TestRunner (wf-20260704-fix-077 / 07-test-results.md) — registered by BusinessAnalyst under AGENTS.md §14 |
| Workflow | queued: wf-20260704-fix-080 |

## Symptom

`apps/e2e/tests/uat/BP-UAT-009.spec.ts:564` — **"Neg 001 — Protected page (/workspace) without session redirects to sign-in"** — fails on the live stack at 16.3s wall-clock time. The failure is reproducible across runs (verified by stash-and-rerun during [wf-20260704-fix-077](.copilot/tasks/completed/wf-20260704-fix-077/)).

### Reproduction (live stack)

```bash
pnpm exec playwright test \
    --config=playwright.uat.config.ts \
    --grep "Neg 001 — Protected page"
```

Observed result: exit 1; the `landedOnSignIn` soft-assert fires `false` because the URL after `domcontentloaded` is still `/workspace`. Hard assertion (`workspaceContent` count) is fine; the failure is purely in the URL-detection path.

### Root cause

`apps/web/src/pages/workspace/Workspace.tsx` redirects anonymous visitors via a **`window.location.replace()` inside `useEffect`** (client-side, after bootstrap resolves). Playwright's `page.goto(..., { waitUntil: 'domcontentloaded' })` returns BEFORE the `useEffect` fires.

The test currently does:

```typescript
await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'domcontentloaded' });
await hideDevToolbar(page);
await page.waitForURL(new RegExp(...), { timeout: 15_000 })
  .catch(() => { /* handled by the assertion below */ });
```

`.catch(() => {})` swallows the timeout, so the test runs the assertion against the not-yet-redirected URL → soft-assert fails.

### Why this is a test-design issue, not a product bug

The product behaviour (client-side redirect for SSR'd storefront surfaces, server-side redirect only where OIDC bootstrap genuinely requires it) is intentional — see `BP-UAT-009.md` §"`/workspace` (sister surface, exercised by `Neg 001`)". The test needs to `await waitForURL(...)` instead of catching the timeout.

This file does NOT propose a product code change.

## Proposed resolution

Rewrite BP-UAT-009 Neg 001 to:
1. `await page.waitForURL(...)` without `.catch(() => {})` — let the timeout fail the test loudly if it happens
2. Bump timeout from 15s to 25s (matches Step 005 / Step 006 budgets)
3. Replace the soft-assert with a hard assertion on the landing URL

Owned by `wf-20260704-fix-080` (queued).

## Honesty disclosures

- This issue was observed during [wf-20260704-fix-077](.copilot/tasks/completed/wf-20260704-fix-077/07-test-results.md) §"BP-UAT-009 full suite — mixed results". The TestRunner disclosed it as "PRE-EXISTING (unrelated)" without filing an owning issue because the agentic policy at the time required user authorization for new registry rows. Under the new AGENTS.md §14 (added 2026-07-04), BusinessAnalyst is authorized to register unambiguous minor test-design issues autonomously.
- The PR #100 merge (this issue's parent workflow) was not waiting on Neg 001 — the BP-UAT-009 spec already documents the `/workspace` vs `/me` mechanism asymmetry (ISS-UAT-009-2 closed it).
- No product code is touched by the proposed fix.
