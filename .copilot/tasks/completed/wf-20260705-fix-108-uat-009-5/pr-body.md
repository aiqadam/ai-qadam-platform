## What

Closes ISS-UAT-009-5 by verifying the issue Resolution gate (3× Neg 001
determinism check on the post-wf-20260704-fix-081 stack) AND shipping
the regex defect fix that the verification revealed.

## Why

ISS-UAT-009-5 had been declared "Resolved when both predecessor PRs
land AND 3× Neg 001 determinism check passes." Both PR #102 (306a2aa)
and PR #103 (94baad8) were already merged to main. The 3× determinism
check had been deferred to a queued follow-up
`wf-20260704-uat-081-verify-bp-uat-009` (never picked up).

Running the check via this workflow revealed that **PR #102's
`waitForURL` regex was too narrow** for the actual post-#103 redirect
chain — Workspace.tsx → useEffect → `window.location.replace()` → 302
→ Authentik at `:9000/api/v1/auth/login`, but the regex only anchored
to the apps/web origin `:4321`. The test was failing on a sharper
signal than before (clear "redirect landed somewhere we did not
enumerate") instead of failing on the swallowed `.catch(() => {})`.

## How

1. **Broaden the Neg 001 `waitForURL` regex** to also accept the
   AUTHENTIK_URL — adopting the same escape idiom that Step 002
   (~line 210) already uses:
   - Before: `^${BASE_URL}/(auth/sign-in|api/v1/auth/login)`
   - After:  `^(?:${escapedBase}/(auth/sign-in|api/v1/auth/login)|${escapedAuthentik})`

2. **Mark ISS-UAT-009-5.md** Status open → resolved; rewrite the
   Resolution section with the verification log + cascade.

3. **Update registry.md** row to reflect resolved state + 3-workflow
   provenance chain.

4. **Bump `BP-UAT-009.md` `last_run`** from empty to 2026-07-05.

### Verification (this workflow — `wf-20260705-fix-108-uat-009-5`)

| Run | Status | Time |
|---|---|---|
| Run 1 of 3 | passed | 2.1s |
| Run 2 of 3 | passed | 2.1s |
| Run 3 of 3 | passed | 2.2s |

3/3 exit 0; runtime variance 0.1s. Issue Resolution gate satisfied.
Log at
[.copilot/tasks/active/wf-20260705-fix-108-uat-009-5/02-verify-neg-001.md](https://github.com/tvolodi/aiqadam/blob/fix/ISS-UAT-009-5-neg-001-determinism/.copilot/tasks/active/wf-20260705-fix-108-uat-009-5/02-verify-neg-001.md).

## Risks

- **Workflow type consideration (AGENTS.md §13):** this could have been
  a `uat-verification` workflow (registry has precedents like
  `wf-20260703-uat-064`). It is filed as `issue-resolution` because
  (a) the original reporters filed the issue as a test-design bug
  rather than a UAT pass/fail, (b) the fix is a 1-line regex widening
  that fits the issue-resolution step map (lookup → pre-flight →
  code change → verify → close), not the broader uat-verification map.
  The user has the final say; this is the agent's recommended
  classification with a recorded refinement-vs-issue-body note.
- **Cascade — queued follow-up cancellation:** the queued follow-up
  `wf-20260704-uat-081-verify-bp-uat-009` was scoped to verify only
  Neg 001 of BP-UAT-009 (narrower scope). That scope is now satisfied
  by this workflow with stronger evidence. The full BP-UAT-009
  verification (Neg 001/002/003 + Pos 001) is **out of scope** for
  this PR. A future verification workflow on the full BP-UAT-009
  suite is still owed (it is separate work; not blocking this PR).

## Testing

- **Spec change:** broadened regex matches both apps/web sign-in URLs
  and Authentik URL; uses the same escape idiom as Step 002 in the
  same file.
- **Static checks:** `pnpm exec biome check apps/e2e/tests/uat/BP-UAT-009.spec.ts` → clean.
  `pnpm exec tsc --noEmit` → no errors.
- **Live verification:** 3 consecutive
  `pnpm exec playwright test --config=playwright.uat.config.ts --grep "Neg 001 — Protected page"`
  runs against `apps/web` on :4321 (post-PR-#103 JSX runtime fix) +
  `apps/api` on :3000 (AI Qadam NestJS, not foreign ai-dala-next
  Next.js) all exit 0 in ~2.1s.

## Checklist

- [x] Tests updated (spec change is the test)
- [x] Docs updated (issue file Resolution + registry row + BP-UAT-009.md last_run)
- [x] No new dependencies
- [x] Manually tested locally (3× Playwright runs)
- [x] Pre-flight process-identity check (apps/web on :4321 + apps/api NestJS on :3000)
