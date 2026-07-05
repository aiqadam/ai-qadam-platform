# ISS-UAT-009-5 — BP-UAT-009 Neg 001 (protected page redirect) is flaky because the test races the client-side redirect

| Field | Value |
|---|---|
| ID | ISS-UAT-009-5 |
| Severity | minor |
| Module | e2e/tests/uat (BP-UAT-009 Neg 001, `/workspace` redirect) |
| Status | resolved |
| Reported | 2026-07-04 |
| Resolved | 2026-07-05 |
| Reporter | TestRunner (wf-20260704-fix-077 / 07-test-results.md) — registered by BusinessAnalyst under AGENTS.md §14 |
| Workflow | wf-20260704-fix-080 (test rewrite shipped, PR [#102](https://github.com/tvolodi/aiqadam/pull/102) squash 306a2aa) → wf-20260704-fix-081 (JSX dev runtime fix, PR [#103](https://github.com/tvolodi/aiqadam/pull/103) squash 94baad8) → wf-20260705-fix-108-uat-009-5 (3× Neg 001 verification + test-regex fix, PR [#121](https://github.com/tvolodi/aiqadam/pull/121) squash 1dcd29df) |

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

## Resolution (resolved — 2026-07-05)

**Status:** Verified 3× with exit 0 by
[wf-20260705-fix-108-uat-009-5](.copilot/tasks/active/wf-20260705-fix-108-uat-009-5/).
The verification revealed that **PR #102's regex was actually too narrow**
for the post-PR-#103 redirect chain: Workspace.tsx's `signInUrl()` returns
`/api/v1/auth/login?next=...` which resolves against `localhost:4321` (the
apps/web proxy endpoint), which then 302-redirects the browser to
Authentik at `localhost:9000/api/v1/auth/login`. PR #102's waitForURL
regex was anchored to `^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`,
which doesn't match the `:9000` end state. With PR #103's JSX dev runtime
fix in place, the redirect fires correctly and the test was failing on a
sharp "redirect landed somewhere we didn't enumerate" signal — not on the
old `.catch(() => {})` swallowing.

**Fix shipped in this workflow:** broadened the Neg 001 waitForURL regex
to accept either the apps/web sign-in URLs OR the AUTHENTIK_URL (the
same idiom Step 002 at line ~210 already uses). Diff: +10 / −2 LOC,
single function. No product code touched. Biome clean. tsc clean. Log:
[`02-verify-neg-001.md`](.copilot/tasks/active/wf-20260705-fix-108-uat-009-5/02-verify-neg-001.md).

### Verification log (determinism check)

```text
$ for run in 1 2 3; do pnpm exec playwright test \
      --config=apps/e2e/playwright.uat.config.ts \
      --grep 'Neg 001 — Protected page'; done
✓  1 ... Neg 001 — Protected page (... without session redirects to sign-in) (2.1s)
1 passed (3.4s)
✓  1 ... Neg 001 — Protected page (... without session redirects to sign-in) (2.1s)
1 passed (3.2s)
✓  1 ... Neg 001 — Protected page (... without session redirects to sign-in) (2.2s)
1 passed (3.2s)
```

3/3 exit 0; runtime variance 0.1s. The issue Resolution's gate
("flips to `resolved` only after both PRs land AND the 3× Neg 001
determinism check passes on the post-wf-20260704-fix-081 stack") is now
satisfied.

### Cascade: cancellation of queued follow-up

[wf-20260704-uat-081-verify-bp-uat-009](.copilot/tasks/queued/wf-20260704-uat-081-verify-bp-uat-009/)
was the queued follow-up that named this exact verification. Its AC-3 is
now satisfied by this workflow with stronger evidence (3 consecutive
exits + an additional bug discovery + fix). It becomes a no-op;
cancellation is recorded in registry's BP-UAT-009 row workflow history.

### Honesty disclosures (carry-over from earlier)

- This issue was observed during
  [wf-20260704-fix-077](.copilot/tasks/completed/wf-20260704-fix-077/07-test-results.md) §"BP-UAT-009 full suite — mixed results" — the original failure was a *symptom* of the deeper
  [ISS-UAT-009-6](ISS-UAT-009-6.md) (JSX dev runtime); the test rewrite
  in wf-20260704-fix-080 was the right test-only fix; this workflow added
  the regex broadening once the redirect chain was proven to fire.
- The PR #100 merge (this issue's parent workflow) was not waiting on
  Neg 001 — the BP-UAT-009 spec already documents the `/workspace` vs
  `/me` mechanism asymmetry (ISS-UAT-009-2 closed it).
- No product code is touched by this resolution.
