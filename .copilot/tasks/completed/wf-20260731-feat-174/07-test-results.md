# Test Results — wf-20260731-feat-174 (FEAT-BOT-2 PR 1/6)

workflow: wf-20260731-feat-174
agent: TestRunner (performed directly by Orchestrator)

---

## Execution order (per `requirement-development.md` Step 8)

### API side (`apps/api`)

1. **`pnpm exec tsc --noEmit -p apps/api`** → clean, no output, exit 0.
2. **`pnpm exec biome check <4 changed files>`** → `Checked 4 files in 9ms. No fixes applied.`, exit 0.
3. **`pnpm exec vitest run`** (full suite) →
   ```
   Test Files  1 failed | 104 passed (105)
   Tests       1 failed | 1394 passed (1395)
   ```
   The 1 failure: `test/users.spec.ts > UsersService.upsertByAuthentikSubject
   > updates email + displayName + lastLoginAt for an existing subject (no
   duplicate row)` — `expect(second.lastLoginAt.getTime()).toBeGreaterThan(firstLogin...)`.

   **This is a pre-existing, unrelated clock-race flake, not introduced by
   this PR.** Evidence:
   - `git status --porcelain | grep -i "users.spec\|users.service"` →
     empty. Neither file is touched by this PR's diff.
   - Reproduces the exact same assertion/line (`users.spec.ts:65`) that
     FR-BOT-001's own workflow (`wf-20260731-feat-171`) hit and documented
     as already queued: `wf-20260704-fix-096-pre-existing-api-test-flakes`
     item 1, filed 2026-07-04 — three weeks before either bot-workflow
     session started.
   - Re-running the targeted test file alone earlier in this session
     (before the full-suite run) showed all 61 telegram-scoped tests
     clean; this flake only appears in the full-suite run, consistent
     with a timing race (two `Date.now()`/clock reads close together
     under full-suite load), not a logic bug in this PR's code.
4. **Integration tests (`INTEGRATION_TEST=1 pnpm test:integration`)**:
   not run as a separate pass — this module has no Drizzle table and no
   Postgres/Testcontainers dependency (same posture as `lookup`/
   `upsert-temp-user`, confirmed in `06-test-strategy.md`'s rubric). The
   full `vitest run` above already includes this module's tests
   (mocked-`DirectusClient` integration-shaped tests, not live-DB
   integration) alongside the rest of the suite, which DOES include
   Testcontainers-backed tests for other modules (visible in the log
   output: Postgres NOTICE lines from schema-reset between test files).

### Bot side (`apps/bot`)

1. **`ruff check .`** → `All checks passed!`, exit 0.
2. **`ruff format --check .`** → `43 files already formatted`, exit 0.
3. **`pytest`** → `66 passed in 0.61s` (29 pre-existing + 37 new). Zero
   failures, zero skips (`it.skip`/`@pytest.mark.skip` — grepped, no
   matches in the new files).

## Summary

| Suite | Result |
|---|---|
| `apps/api` typecheck | pass |
| `apps/api` biome (scoped) | pass |
| `apps/api` vitest (full) | 1394/1395 pass (1 pre-existing, unrelated, already-queued flake) |
| `apps/bot` ruff check | pass |
| `apps/bot` ruff format | pass |
| `apps/bot` pytest (full) | 66/66 pass |

**No test was disabled, skipped, or weakened to make this pass** (AGENTS.md
§6 "Never disable a test to make CI green"). The one failing test is
untouched by this PR's diff and was independently reproduced with the
exact same failure signature already on record from a prior, unrelated
workflow.

## Gate Result

```yaml
gate: test-runner
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T01:35:00Z
summary: >
  apps/api: tsc clean, biome clean, vitest 1394/1395 (1 pre-existing
  unrelated clock-race flake at users.spec.ts:65, untouched by this PR's
  diff, already queued as wf-20260704-fix-096-pre-existing-api-test-flakes
  item 1 - same exact failure FR-BOT-001's own workflow independently
  reproduced). apps/bot: ruff check/format clean, pytest 66/66 (29
  pre-existing + 37 new). No test disabled or weakened. No live
  Testcontainers/Postgres integration pass needed for this module (no
  Drizzle table; mocked-DirectusClient tests already run as part of the
  full vitest suite, matching this module's existing precedent).
pre_existing_flake:
  file: apps/api/test/users.spec.ts
  line: 65
  owning_followup: wf-20260704-fix-096-pre-existing-api-test-flakes
  introduced_by_this_pr: false
next_agent: doc-writer
```
