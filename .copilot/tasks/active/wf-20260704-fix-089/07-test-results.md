# Step 8 — Test Results (ISS-UAT-SEED-002)

## Suite under test
`scripts/tests/uat-seed.bats` (33 cases total — 28 pre-existing + 5 new for this fix)

## Result

```
1..33
ok 1-15, 17-33 (32 of 33 passed)
not ok 16 FR-WORKFLOW-003 row 6: no-flag mock output is byte-identical to the pre-FR baseline
   (in test file scripts/tests/uat-seed.bats, line 285)
   `[ "$((current_lines - baseline_lines))" -eq 2 ]' failed
```

## 5 new cases (all PASS)

| # | Name | Outcome |
|---|---|---|
| 29 | `ISS-UAT-SEED-002 AC-1: uat-seed.sh contains no localhost:3001 reference` | ok |
| 30 | `ISS-UAT-SEED-002 AC-5: uat-seed.sh contains no host.docker.internal reference` | ok |
| 31 | `ISS-UAT-SEED-002 AC-2: api_base default port is derived from apps/api/.env PORT` | ok |
| 32 | `ISS-UAT-SEED-002 AC-3: API_BASE_URL env override wins over the derived default` | ok |
| 33 | `ISS-UAT-SEED-002 AC-4: api_base default falls back to :3000 when apps/api/.env is absent` | ok |

## Pre-existing test 16 (NOT a regression)

Test `FR-WORKFLOW-003 row 6` was confirmed failing on `origin/main` (verified by `git checkout origin/main -- scripts/uat-seed.sh scripts/tests/uat-seed.bats && bash scripts/run-bats.sh scripts/tests/uat-seed.bats` → identical failure on the bare 28-case suite pre-this-fix). The failure mode is: `current_lines - baseline_lines != 2` because `origin/main` is now several commits ahead of the `8db37ac` baseline the test pins against (the test bakes in the count of `ensure_linked` mock lines from a specific pre-ISS-UAT-001-1 baseline that has shifted). This is a **known pre-existing test-design issue** unrelated to ISS-UAT-SEED-002, owned by a separate queued workflow (see workspace-state.md queued list).

**Net assessment:** 5/5 new cases pass. 27/28 pre-existing cases pass. 1 pre-existing case (#16) was already broken on main before this workflow and is still broken — unchanged delta from origin/main. No regressions introduced.

## Negative-case evidence

Each of the 5 new cases was hand-validated as failing on the pre-fix shape:

- AC-1 (pre-fix): `grep -F 'host.docker.internal:3001' scripts/uat-seed.sh` matches → test fails. Post-fix: no match.
- AC-2 (pre-fix): helper default resolves to `host.docker.internal:3001`, not the env-file's `PORT`. Post-fix: resolves to `localhost:${PORT}`.
- AC-3 (pre-fix vs post-fix): both preserve the `${VAR:-default}` override shape → test passes against either shape; this is intentional (the test guards against a future refactor that drops the override, not against the original bug).
- AC-4 (pre-fix): no `:3000` fallback at all; helper requires `APPOS_API_BASE_URL` to be exported. Post-fix: empty `apps/api/.env` ⇒ `api_port=3000` ⇒ `api_base=http://localhost:3000`.
- AC-5 (pre-fix): `grep -F 'host.docker.internal' scripts/uat-seed.sh` matches 5× (the comment + the literal). Post-fix: 0×.

## Live infra requirement

None. The helper-under-test is a pure bash function (no DB, no Docker, no network, no curl — `curl` is stubbed). The pre-push gate checks (`biome`, `typecheck`, `architecture-check`) do not apply to shell scripts.

## Gate Result

gate_result:
  status: passed
  summary: "5/5 new bats cases pass; 27/28 pre-existing cases pass; 1 pre-existing failure on origin/main (test 16) is unrelated and unchanged by this fix."
  findings:
    - "32/33 cases pass; the 1 failure is pre-existing on origin/main and outside this fix's scope."
    - "Bash syntax check (`bash -n`) for scripts/uat-seed.sh is verified by case 22 (FR-WORKFLOW-003 AC-6)."
    - "No regressions introduced in any adjacent code path."
    - "Live infra not required — helper is pure bash with mocked curl."
