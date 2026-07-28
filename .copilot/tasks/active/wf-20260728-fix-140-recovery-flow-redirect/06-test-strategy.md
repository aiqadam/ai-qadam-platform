# Step 6: Test Strategy

**Workflow:** wf-20260728-fix-140-recovery-flow-redirect · **Issue:** [ISS-USR-REDIRECT-002](../../../issues/ISS-USR-REDIRECT-002.md)

## Approach

The bug is a pure data-parsing defect at the `AuthentikClient` boundary
— the existing `authentik-client.spec.ts` test file already exercises
this exact method by mocking the raw HTTP response, which is the right
level (the bug is specifically in the mismatch between the mock/code's
assumed shape and Authentik's real shape). No new test file needed;
correcting the existing mock to match the real API is both the fix's
regression test AND the reason the bug was undetected — the same edit
serves both purposes.

## Fail-before / pass-after verification

Performed live via `git stash` isolating the source-only change:

- **Source reverted (bug re-introduced), test already fixed:** test
  fails — `Expected: "https://..." Received: undefined`. Confirms the
  fixed test genuinely catches the bug.
- **Both fixed:** test passes.

Full transcript in `07-test-results.md`.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Existing test file's mock corrected to match Authentik's real response shape — this IS the regression test. Fail-before/pass-after verified live via git stash."
```
