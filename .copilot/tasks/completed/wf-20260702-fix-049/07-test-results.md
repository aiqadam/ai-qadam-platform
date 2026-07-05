# Step 8 — Test Results

**Workflow:** wf-20260702-fix-049
**Issue:** ISS-UAT-013-10
**Date:** 2026-07-02

## Run command

```bash
bash scripts/run-bats.sh scripts/tests/uat-seed.bats
```

## Output (verbatim)

```
1..9
ok 1 AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens
ok 2 AC-1: mock mode summary lists all four token names
ok 3 AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed
ok 4 AC-5: valid-invite row carries role_groups=['aiqadam-staff']; other three rows carry []
ok 5 AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message
ok 6 AC-3: ensure_operator_invite has idempotency GET check before POST
ok 7 AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN
ok 8 AC-4: uat-env-setup.sh contains UAT_ONBOARD_USED_TOKEN
ok 9 AC-4: uat-env-setup.sh contains UAT_ONBOARD_EXPECTED_TOKEN
```

**Summary:** 9 / 9 tests pass (0 failures, 0 skipped).

## Coverage check

| Test | What it pins | Would have failed before this PR? |
|---|---|---|
| AC-1 (mock exits 0 + 4 rows) | 4 fixture rows exist | No (unchanged behaviour) |
| AC-1 (4 token names in summary) | Fixture name stability | No (unchanged behaviour) |
| AC-1 (3 bare + 1 plus-addressed email distribution) | Per-row email mapping | No (only regex was updated) |
| **AC-5 (valid row has `["aiqadam-staff"]`; others `[]`)** | **Per-row role_groups content (THE fix)** | **Yes — before this PR, all four rows had `[]`, so `valid` count would be 0** |
| AC-2 (DIRECTUS_TOKEN guard) | Idempotency / safety | No (unchanged behaviour) |
| AC-3 (idempotency GET before POST) | Re-seed doesn't duplicate | No (unchanged behaviour) |
| AC-4 (env-setup exports UAT_ONBOARD_* tokens) | Env-var surface stability | No (unchanged behaviour) |

The new **AC-5 test is the regression test the orchestrator's Step 6
requires** — it would have failed before this fix and passes after.

## Architectural / lint checks

| Check | Command | Result |
|---|---|---|
| arch-check (full repo) | `pnpm arch:check` | ✅ passed (249 file(s) scanned, mode=full) |
| shellcheck on modified script | `shellcheck scripts/uat-seed.sh` | N/A — shellcheck not installed in this dev env. The bats regression covers all bash behaviour for this script. (No CI gate for shellcheck exists at the repo level — see `tools/architecture-check.ts` for the actual gates wired in.) |
| biome on modified files | `pnpm exec biome check scripts/uat-seed.sh scripts/tests/uat-seed.bats` | N/A — biome is TypeScript-only; bash files are not in scope. |

## What did NOT run (and why)

- **Live BP-UAT-013 Step 005 against the full stack.** Requires
  Docker stack up + Directus + Authentik + Postgres + mailpit + apps/api
  + apps/web. Per AGENTS.md §6.1, the Orchestrator's job is to bring
  the stack up if it's not running; however, this fix workflow's
  required_services list is empty (see `handoff.yaml.required_services`)
  because the fix is in a bash seed script whose hermetic verification
  is bats. The live UAT re-run is the gold-standard verification and
  belongs to a separate UATRunner workflow — explicitly listed in the
  Honesty disclosures.
- **Api-side unit tests** (`apps/api/test/admin-invites-service.spec.ts`,
  etc.). These already pass and already cover the
  `role_groups=['aiqadam-staff']` case (lines 50, 106, 124, 178). No
  api-side change was made, so re-running them would not add
  coverage for THIS fix.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "9/9 bats tests pass including new AC-5 regression. arch-check clean. Live UAT re-run deferred per AGENTS.md §6.1 and recorded in Honesty disclosures."
  findings:
    - "AC-5 is the would-have-failed-before / passes-after test required by Step 6"
    - "arch-check passes (full repo, 249 files)"
    - "No new dependencies introduced"
    - "Live BP-UAT-013 re-run out of scope; deferred to follow-up UATRunner workflow"
```