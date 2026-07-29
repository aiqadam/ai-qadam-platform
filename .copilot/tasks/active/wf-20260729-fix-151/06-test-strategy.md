# Step 6 — Regression Test Strategy: ISS-WEB-NEXT-SSR-JSDOM-001

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No | 0 |
| New API endpoint | No | 0 |
| Business rule with edge cases | No | 0 |
| Cross-module service call | No | 0 |
| New database query | No | 0 |
| Pure function / utility | No — dependency-manifest fix | 0 |

**Score: 0.** No integration/E2E tier triggered by the rubric. However,
this bug's failure mode is specifically an SSR-boundary
module-resolution crash — invisible to a pure unit test unless the test
actually exercises the real `require()`/import chain through the
installed `node_modules`, not a mock. A synthetic "score 0 → skip
testing" reading would miss the actual regression risk, so this
strategy adds one targeted test despite the low rubric score.

## Regression Test Plan

**Key constraint (per `issue-resolution.md` Step 6):** must include a
test that (1) would have failed before the fix and (2) passes after.

| Target | Test | Would fail pre-fix? | Passes post-fix? |
|---|---|---|---|
| `isomorphic-dompurify`'s `jsdom`/`undici` resolution | New vitest test: `import DOMPurify from 'isomorphic-dompurify'; DOMPurify.sanitize('<b>x</b>')` — asserts no throw and returns the expected sanitized string | **Yes** — pre-fix, this import chain throws `Cannot find module 'undici/lib/handler/wrap-handler.js'` at module-load time, the exact error from the issue | **Yes** — confirmed post-fix by running the suite (see `07-test-results.md`) |

This is a genuine regression test, not just a manual live-verification
step: it directly exercises the real installed `node_modules` resolution
path (no mocking of `isomorphic-dompurify` or `jsdom`), so any future
dependency bump that reintroduces a similar jsdom/undici mismatch will
fail this test in CI automatically, rather than only being caught by a
human noticing a 500 in production.

**Live verification (supplementary, not a substitute):** curl every
route the issue documented as broken
(`/workspace/admin/users`, `/workspace/dashboard`,
`/workspace/admin/audit`, `/workspace/announce`) — confirms the fix at
the actual SSR-bundle level, not just the isolated import. Already
executed once during Step 4 development (all 200); re-run formally at
Step 8.

## Required Test Levels

- [x] Unit (new: `isomorphic-dompurify` resolution regression test)
- [ ] Integration (Testcontainers) — N/A, no schema/DB touched
- [x] Live route verification (manual/scripted curl, not a Playwright
      spec — the bug is a boot-time module-resolution crash, not a
      user-flow behavior needing browser interaction)

## Gate Result

gate_result:
  status: passed
  summary: "Rubric score 0, but a targeted regression test is added anyway because the bug's failure mode (SSR-boundary module resolution) is invisible to mocked unit tests and only becomes visible when the real installed dependency chain is exercised. Test proven to fail pre-fix (verified by reverting the override locally and re-running) and pass post-fix."
  findings: []
