# Test Designer — wf-20260801-fix-187 — ISS-SEC-PUBLIC-UNMANAGED-001

## Test Suite

Per TestStrategist's strategy (`05-test-strategist.md`), this is a curl-based live verification against the local Directus. No automated test file is produced — the curls are ad-hoc shell commands executed by the Orchestrator during Step 7 (TestRunner) and captured in `07-test-results.md`.

### TS-1..TS-5 test definitions

See `05-test-strategist.md` for full test descriptions.

### What would a test file look like if we wrote one?

If we wanted a permanent test for this, the natural form would be a Vitest integration test in `apps/api/test/directus-public-reads.spec.ts` that:
1. Spins up Directus via Testcontainers
2. Runs `bootstrap.sh` against it
3. Issues unauth `GET /items/{events,speakers,event_speakers}` and asserts field shape

**Not adding this** for the following reasons:
- Testcontainers + Directus bootstrap takes ~2-3 min; existing Testcontainers tests in the repo don't cover Directus permission flows.
- The change is a one-time preventive control (revoke-and-regrant); the regression risk is "someone re-creates `permissions: null` rows on these three collections via admin UI." This is a governance problem, not a code problem — the durable fix is `bootstrap.sh` running in CI, which the repo already does (via `infrastructure/directus/bootstrap.sh` in the docker-compose healthcheck / seed flow).
- Adding a test file would inflate the PR with infra nobody asked for.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Test design is intentionally minimal: live curl verification is sufficient. Documented why no permanent test file is added in this PR; recorded the form a permanent test would take for future contributors."
```