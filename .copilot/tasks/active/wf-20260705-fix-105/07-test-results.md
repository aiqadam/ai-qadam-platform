# Step 8 — Test Results

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** TestRunner

---

## Tests executed

### Layer 1 — Bash syntax check

```bash
$ bash -n scripts/uat-seed.sh
$ echo $?
0
```

**Result:** PASS — script parses cleanly.

### Layer 2 — bats regression suite

```bash
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats
```

**Result:** **41/41 PASS** (was 37/37 + 4 new). Full log captured at
`.copilot/tasks/active/wf-20260705-fix-105/06-bats-final.log`.

#### Test-by-test summary

| # | Test | Result |
|---|---|---|
| 1 | AC-1: mock mode exits 0 and provisions all 4 operator_invite tokens | ok |
| 2 | AC-1: mock mode summary lists all four token names | ok |
| 3 | AC-1: three happy rows share the bare operator email; the no-user row is plus-addressed | ok |
| 4 | AC-5: valid-invite row carries role_groups=['aiqadam-staff']; other three rows carry [] | ok |
| 5 | AC-2: uat-seed.sh has a DIRECTUS_TOKEN guard that emits a FATAL message | ok |
| 6 | AC-3: ensure_operator_invite has idempotency GET check before POST | ok |
| 7-9 | AC-4: uat-env-setup.sh contains UAT_ONBOARD_TOKEN / USED_TOKEN / EXPIRED_TOKEN | ok |
| 10 | FR-WORKFLOW-003 row 1: --reset BP-UAT-013 mock mode logs exactly 4 fixture lines | ok |
| 11 | FR-WORKFLOW-003 row 2: each domain fixture's delete line precedes its create line | ok |
| 12 | FR-WORKFLOW-003 row 3: non-localhost DIRECTUS_URL exits 4 with zero writes | ok |
| 13 | FR-WORKFLOW-003 row 3b: non-localhost AK_URL (DIRECTUS_URL local) exits 4 with zero writes | ok |
| 14 | FR-WORKFLOW-003 row 4: --reset BP-UAT-999 (no manifest) exits non-zero with actionable FATAL | ok |
| 15 | FR-WORKFLOW-003 row 5: --reset all processes both manifests and exits 0 | ok |
| 16 | FR-WORKFLOW-003 row 6: no-flag mock output is structurally equivalent to the pre-FR baseline | ok |
| 17 | FR-WORKFLOW-003 row 7: member_email resolves to the sibling identity fixture in mock mode | ok |
| 18 | FR-WORKFLOW-003 row 8: unresolvable member_email fails loudly; prior fixtures still succeed | ok |
| 19 | FR-WORKFLOW-003 row 9: --reset BP-UAT-013 output has no member_email/resolved-to substrings | ok |
| 20 | FR-WORKFLOW-003 row 10: --reset with no following argument exits 2 with usage message | ok |
| 21 | FR-WORKFLOW-003 row 11: unknown flag exits 2 with usage message | ok |
| 22 | FEAT-UAT-COV-003 row 12: --reset BP-UAT-001 mock mode re-creates uat-member-consented's consent row | ok |
| 23 | FR-WORKFLOW-003 AC-6: bash -n scripts/uat-seed.sh passes (syntax check) | ok |
| 24-26 | FR-WORKFLOW-003 AC-5/AC-7: doc-presence structural checks | ok |
| 27 | ISS-UAT-001-1: ensure_test_user emits one ensure_linked mock line per identity fixture | ok |
| 28 | ISS-UAT-001-1: ensure_linked mock line carries the right email per identity | ok |
| 29 | ISS-UAT-001-1: api_ensure_directus_user_link helper is structurally present in uat-seed.sh | ok |
| 30 | ISS-UAT-SEED-002 AC-1: uat-seed.sh contains no localhost:3001 reference | ok |
| 31 | ISS-UAT-SEED-002 AC-5: uat-seed.sh contains no host.docker.internal reference | ok |
| 32 | ISS-UAT-SEED-002 AC-2: api_base default port is derived from apps/api/.env PORT | ok |
| 33 | ISS-UAT-SEED-002 AC-3: API_BASE_URL env override wins over the derived default | ok |
| 34 | ISS-UAT-SEED-002 AC-4: api_base default falls back to :3000 when apps/api/.env is absent | ok |
| 35 | ISS-UAT-013-14 structural: reset_domain_fixture derives token_hash + token_prefix from manifest token_plain | ok |
| 36 | ISS-UAT-013-14 behavioral: --reset BP-UAT-013 mock mode still exits 0 with exactly 4 operator_invites create lines | ok |
| 37 | ISS-UAT-013-14 unconditional: pnpm uat:seed mock mode (no --reset) still provisions all 4 operator_invites | ok |
| **38** | **ISS-UAT-013-15 AC-2 (structural): uat-seed.sh has an MSYS-aware CURL_BIN detection block using 'command -v curl.exe'** | **ok** |
| **39** | **ISS-UAT-013-15 AC-2 (structural): every runtime curl invocation in uat-seed.sh routes through $CURL_BIN** | **ok** |
| **40** | **ISS-UAT-013-15 AC-2 (runtime sim): CURL_BIN resolution branch — curl.exe-on-PATH selects curl.exe; absent falls back to curl** | **ok** |
| **41** | **ISS-UAT-013-15 AC-2 (structural): check_deps now also verifies $CURL_BIN is on PATH** | **ok** |

### Layer 3 — No live infrastructure tests in this workflow

Per AGENTS.md §6.1 honesty disclosure: AC-1 (live `pnpm uat:seed` from
agent terminal succeeds) and AC-4 (BP-UAT-013 re-run unblocked) require
the full local stack + a terminal where curl.exe reaches Windows-host
localhost — which is the failure mode this issue describes. The live
verification is owned by the queued follow-up workflow
`wf-20260705-fix-103-uat-013-verify` (queue position 3) per AGENTS.md
§6.1 honesty disclosure.

---

## No flaky tests observed

All 41 tests pass deterministically across reruns. The 4 new tests are
purely structural or runtime-sim — no timing or network dependencies.

---

## No regressions

Compared to the pre-fix baseline of 37/37 passing:
- Pre-existing FR-WORKFLOW-003 row 6 (baseline-shift bug) still passes
  because mock-mode short-circuits all curl paths before `$CURL_BIN` is
  resolved. Mock output is byte-identical.
- ISS-UAT-SEED-002 AC-2/3/4 (api_base derivation) required a stub
  patch in `extract_api_base_from_helper()` to honor the new
  MSYS-aware resolution; after the patch, all three pass.

---

## Gate Result

```
gate_result:
  status: passed
  notes: |
    Test execution complete. 41/41 bats passing (37 pre-existing +
    4 new ISS-UAT-013-15). Bash -n syntax check passes. No flaky
    tests. No regressions. Live-stack verification (AC-1, AC-4)
    honestly deferred to queued follow-up wf-20260705-fix-103-uat-013-verify
    per AGENTS.md §6.1.
```