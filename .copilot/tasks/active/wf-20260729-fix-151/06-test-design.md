# Step 7 — Regression Test Design: ISS-WEB-NEXT-SSR-JSDOM-001

## Tests Written

| File | Count/Focus | Required? |
|---|---|---|
| `apps/web-next/src/lib/isomorphic-dompurify-resolution.test.ts` | 1 test — imports `isomorphic-dompurify` and calls `.sanitize()`, exercising the real installed `node_modules` resolution path (no mocking). Proven to fail pre-fix (exact error from the issue: `Cannot find module 'undici/lib/handler/wrap-handler.js'`) and pass post-fix, by literally stashing/restoring the fix and re-running against both dependency states. | Yes |

## Fail-Before / Pass-After Proof (executed, not asserted)

1. `git stash` (reverts `package.json`, `pnpm-lock.yaml` to pre-fix).
2. `pnpm install --no-frozen-lockfile` (reinstalls against the reverted
   lockfile — confirmed `jsdom`'s resolved `undici` reverted to `8.8.0`).
3. `pnpm --filter web-next test -- isomorphic-dompurify-resolution.test.ts`
   → **FAILS** with `Cannot find module 'undici/lib/handler/wrap-handler.js'`
   — the exact stack trace from the original issue report.
4. `git stash pop` (restores the fix).
5. `pnpm install --no-frozen-lockfile` (reinstalls against the fixed
   lockfile — confirmed `jsdom`'s resolved `undici` back to `7.29.0`).
6. `pnpm --filter web-next test -- isomorphic-dompurify-resolution.test.ts`
   → **PASSES**.
7. Full suites re-run after the reinstall churn: `apps/web-next`
   947/947 pass, `apps/api` 1350/1350 pass.

## Acceptance Criteria Coverage

This is an `issue-resolution` workflow, not `requirement-development` —
there's no FR-style AC list. The equivalent "did the fix work" checks:

| Check | Test | Status |
|---|---|---|
| The specific reported symptom (`/workspace/admin/users` 500) is gone | Live curl verification, Step 4 + re-confirmed here: `200` | Verified |
| The fix doesn't regress the module import chain | New regression test, fail-before/pass-after proven | Verified |
| The fix doesn't regress `apps/api`'s Testcontainers suite (the risk flagged in Step 2) | Full `apps/api` test suite: 1350/1350 pass | Verified |
| The fix doesn't regress any other `apps/web-next` behavior | Full `apps/web-next` test suite: 947/947 pass | Verified |
| Other previously-broken routes (not just the one in the original report) are also fixed | Live curl: `/workspace/dashboard`, `/workspace/admin/audit`, `/workspace/admin/rbac-sync`, `/workspace/announce` all `200` | Verified |

## Known Test Gaps

- **QA verification not yet performed** — the fix has not been deployed
  to QA yet (this workflow ends at merge to `main`; QA deploy happens
  via the existing `deploy-qa` CI job on merge, per
  `docs/04-development/workflow.md`). The user's original QA report
  (`https://qa.aiqadam.org/workspace/admin/users` → 500) will only be
  confirmed fixed once this PR merges and QA redeploys. Flagged for
  Step 13/manual follow-up, not silently assumed fixed on QA.
- No `it.skip` in the new test file (single test, not skipped).

## Gate Result

gate_result:
  status: passed
  summary: "Regression test written and proven via literal fail-before/pass-after execution (stash/reinstall/test/pop/reinstall/test), not just written and assumed correct. Full test suites for both affected packages re-run clean after the reinstall churn. Live route verification covers routes beyond the one originally reported."
  findings:
    - "QA verification is necessarily deferred to post-merge (this fix hasn't been deployed to QA yet) — flagged, not silently skipped."
