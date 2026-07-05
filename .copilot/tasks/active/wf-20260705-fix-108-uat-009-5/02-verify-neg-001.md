# 02-verify-neg-001.md — wf-20260705-fix-108-uat-009-5

**Authored by:** Orchestrator (direct — Step 3 of uat-verification pattern;
                full Playwright runs executed by Orchestrator shell access)
**Date:** 2026-07-05
**Spec under test:** [apps/e2e/tests/uat/BP-UAT-009.spec.ts:564](apps/e2e/tests/uat/BP-UAT-009.spec.ts#L564-L626)
**Grep pattern:** `Neg 001 — Protected page`
**Config:** `apps/e2e/playwright.uat.config.ts` (localhost-only, sequential,
            no retries, screenshot every step)

---

## Verification command (verbatim from issue Resolution)

```bash
cd apps/e2e && pnpm exec playwright test \
    --config=playwright.uat.config.ts \
    --grep "BP-UAT-009 — negative scenarios › Neg 001 — Protected page"
# Run 3 times consecutively — all 3 must exit 0.
```

**Implementation note:** the exact grep pattern above (`›` character) was
matched by `pnpm exec playwright test --list` as referring to the Neg 001
test, but at runtime Playwright's CLI tokenises the `›` and routes the
remainder as a positional arg, exiting with `Error: No tests found`. The
equivalent grep that DOES reach the test at runtime is `'Neg 001 —
Protected page'` — matches only the test title and is unambiguous
(no other Playwright test file ships a test that contains that
substring — verified via `--list`).

---

## Run table

| Run | Test | Time (s) | Status | Exit | Log |
|---|---|---|---|---|---|
| 1 | Neg 001 — Protected page (/workspace) without session redirects to sign-in | 2.1 | ✓ passed (1 passed) | 0 | [neg-001-run-1.log](neg-001-run-1.log) |
| 2 | Neg 001 — Protected page (/workspace) without session redirects to sign-in | 2.1 | ✓ passed (1 passed) | 0 | [neg-001-run-2.log](neg-001-run-2.log) |
| 3 | Neg 001 — Protected page (/workspace) without session redirects to sign-in | 2.2 | ✓ passed (1 passed) | 0 | [neg-001-run-3.log](neg-001-run-3.log) |

**Determinism verdict: 3/3 green. Run time variance: 0.1s.**

---

## What this verification revealed beyond the issue's text

Per the issue Resolution §"Root cause is NOT flakiness", the test was
expected to be deterministic once PR #103 (ISS-UAT-009-6 — JSX dev runtime
fix) merged. That prediction was HALF right:

- **PR #103 DID resolve the JSX dev runtime bug.** With the fix in place,
  `apps/web` now hydrates React islands correctly. Workspace.tsx's
  `useEffect` fires the client-side redirect; the browser navigates from
  `http://localhost:4321/workspace` → 302 → `http://localhost:9000/api/v1/auth/login`.
- **The test rewrite in PR #102 (#102 squash `306a2aa`) had a regex
  defect** that no one had caught because no one had run the post-PR-#103
  end-to-end against a running `apps/web`. The `waitForURL` regex was
  anchored to `^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`, which does
  NOT match the Authentik `:9000` URL the browser actually lands on after
  the 302. So the test was still failing — just on a sharper assertion
  than before (clear "redirect went somewhere we didn't enumerate"
  signal vs. the pre-PR-#102 swallowed `.catch(() => {})`).

### The defect (1 line)

**Before** (PR #102, line 575):

```typescript
const reachedSignIn = await page
  .waitForURL(new RegExp(`^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`), {
    timeout: 20_000,
  })
```

**After** (this workflow's fix, line 575 of the same file):

```typescript
const escapedAuthentik = AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reachedSignIn = await page
  .waitForURL(
    new RegExp(
      `^(?:${BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(auth/sign-in|api/v1/auth/login)|${escapedAuthentik})`,
    ),
    { timeout: 20_000 },
  )
```

The regex now accepts:
1. `http://localhost:4321/auth/sign-in` (app-side sign-in page)
2. `http://localhost:4321/api/v1/auth/login` (app-side proxy endpoint)
3. `http://localhost:9000/...` (Authentik — any path after the 302)

This mirrors the **Step 002 idiom** at the same file (line ~210), which
already uses the same `AUTHENTIK_URL.replace(/[.*+?^${}()|[\]\\]/g,
'\\$&')` escape. Neg 001 was the only negative scenario that did not
adopt the idiom.

### Screenshot evidence (the redirect works)

The pre-fix run-1 screenshot at
[`apps/e2e/test-results/BP-UAT-009-BP-UAT-009-—-ne-d2031-ession-redirects-to-sign-in-uat-desktop-chrome/test-failed-1.png`](apps/e2e/test-results/BP-UAT-009-BP-UAT-009-—-ne-d2031-ession-redirects-to-sign-in-uat-desktop-chrome/test-failed-1.png)
shows the Authentik "Welcome to authentik! Login to continue to AI Qadam
Platform (local)" page — confirming that **the redirect chain is
working**, just landing outside the original test's regex.

The fix is a **test-only** change. No product code touched. No spec
contract change (Neg 001 still asserts "anon visitor to /workspace lands
on a sign-in surface"; the surface now correctly enumerates the
Authentik URL).

---

## ACs verified (per handoff.yaml)

- **AC-1: 3× BP-UAT-009 Neg 001 Playwright runs each exit 0** → ✅ verified
  (3/3 exit 0; 2.1s, 2.1s, 2.2s; 0.1s variance)
- **AC-2: apps/web on :4321 confirmed via process-identity pre-flight** → ✅ verified
  (see [01-pre-flight.md](01-pre-flight.md) §Process-identity probe)
- **AC-3: apps/api (AI Qadam NestJS) on :3000 confirmed via process-identity pre-flight** → ✅ verified
  (see [01-pre-flight.md](01-pre-flight.md) §Process-identity probe)
- **AC-4: ISS-UAT-009-5.md Resolution section + registry + BP-UAT-009.md last_run updated** → pending
  (Step 4 of this workflow)

---

## Gate

- **status:** passed
- **justification:** 3/3 Neg 001 runs green with the fix; redirect chain
  behaviour confirmed via screenshot; test-only code change (1 regex
  line + 1 helper string) within the §4 small-PR rule (10 net additions,
  0 deletions — well under 400 LOC budget).
- **next_step:** 4 (quality-gate)
