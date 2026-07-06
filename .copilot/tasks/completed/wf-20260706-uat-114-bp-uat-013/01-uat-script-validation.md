---
code: BP-UAT-013
workflow_id: wf-20260706-uat-114-bp-uat-013
validated_at: 2026-07-06T00:00:00Z
validator: BusinessAnalyst
context: Re-validation post ISS-UAT-013-16 fix (PR #123, squash b20a1ef).
---

# 01 — UAT Script Validation (BP-UAT-013)

## Verdict

`passed` — All template-contract checks PASS. ISS-UAT-013-16 fix confirmed in manifest
(`lookup_field: "token_hash"` with per-row-unique `lookup_value`). Two non-blocking
documentation notes recorded below.

---

## Validation Checklist

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `process_ref` file exists | PASS | `docs/03-requirements/FR-USR-001.md` exists |
| 2 | `environment` URL present and concrete | PASS | `http://localhost:4321` |
| 3 | `seed_required` declared | PASS | `seed_required: true` |
| 4 | Seed fixtures described | PASS | 5-row fixture table; 4 domain rows in JSON manifest |
| 5 | Every step has required fields | PASS | Steps 001–006 + Neg 001–005 all carry AC ref, Precondition, Action, Expected state, Screenshot label |
| 6 | At least one negative scenario | PASS | 5 negative scenarios |
| 7 | All ACs covered | PASS | All 7 ACs covered (see table below) |
| 8 | `external_hops` declared for cross-origin navigation | PASS (with note) | 2 hops; note: Step 004 absent from Mailpit steps array (non-blocking) |
| 9 | `teardown_policy` defined | PASS | `action: clean-up` with 2 removes entries |
| 10 | `session_budget` defined | PASS | max_steps: 40, max_screenshots: 60, wall_clock_minutes: 20 |
| 11 | Manifest matches doc fixture table | PASS | 4 JSON fixtures match domain table; ISS-UAT-013-16 fix: all `lookup_field: "token_hash"` with distinct SHA-256 values |

---

## AC → Step/Scenario Mapping

| AC | Coverage |
|---|---|
| AC-1 | Step 001 (submit), Step 002 (email in catcher), Neg 004 (plus-addressing) |
| AC-2 | Step 003 (click verify link → `/leads/verified`) |
| AC-3 | Step 004 (idempotent re-submit → 202, no second email) |
| AC-4 | Neg 001 (honeypot → silent discard) |
| AC-5 | Step 005, Step 006 (valid token onboarding), Neg 005 (missing Authentik user → 409) |
| AC-6 | Neg 002 (used token → 410) |
| AC-7 | Neg 003 (expired token → 410) |

All 7 ACs covered. ✓

---

## Non-Blocking Documentation Notes

### Note 1 — Step 004 absent from Mailpit `external_hops.steps` array

Step 004 navigates to Mailpit (declared inline in step body) but `"004"` is absent from
the Mailpit hop's `steps: ["002", "003"]` array. Non-blocking: step body explicitly names
the hop; `uat-navigation-check.sh` will not trigger. Recommend adding `"004"` in next revision.

### Note 2 — Negative 005 email domain drift

Neg 005 precondition says `uat-operator+no-user@aiqadam.test`; fixture table and JSON manifest
use `uat-operator+no-user@example.com` (correct, per ISS-UAT-BRIDGE-002). Seeding will be
correct. Narrative is stale documentation drift only.

---

## ISS-UAT-013-16 Fix Confirmation

| Field | Before (wf-20260705 era) | After (PR #123 current) |
|---|---|---|
| `lookup_field` (all 4 fixtures) | `"token_prefix"` | `"token_hash"` |
| All 4 `lookup_value`s | shared `"uat-onbo"` | distinct per-fixture SHA-256 |

All four `lookup_value`s are now distinct. `--reset BP-UAT-013` will create exactly 4 rows.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-06T00:00:00Z
  summary: "BP-UAT-013 script complete and executable. All 11 checks pass. ISS-UAT-013-16
    fix confirmed in manifest. Two non-blocking notes filed. Approved for Step 2 pre-flight."
  next_step: 2
  next_step_name: Pre-Flight
```
