---
code: BP-UAT-013
workflow_id: wf-20260705-uat-110-bp-uat-013-verify
validated_at: 2026-07-05T13:13:00Z
validator: BusinessAnalyst (re-validation; original validation in wf-20260705-uat-100)
---

# 01 — UAT Script Validation (BP-UAT-013)

## Verdict

`passed` — All five validation checks PASS. The two prior blockers
(ISS-UAT-013-14 seed reset path, ISS-UAT-013-15 MSYS-aware curl) are now
resolved on `main` (PR #119 and PR #120 respectively). The UAT script
is byte-identical to the previously validated state, so the prior
validation's findings hold.

## Check matrix

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | AC-1..AC-7 each have ≥1 step or negative scenario mapped | PASS | AC-1→Step 001/002 + Neg 004; AC-2→Step 003; AC-3→Step 004; AC-4→Neg 001; AC-5→Step 005/006 + Neg 005; AC-6→Neg 002; AC-7→Neg 003 |
| 2 | All steps + negatives reference correct `expected_ui_state` + screenshot label | PASS | All 11 doc screenshot labels present in `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts`; spec adds 2 additive intermediate shots (`step-001-lead-form-pre-submit`, `step-006-onboard-pre-submit`) that are non-conflicting |
| 3 | No new preconditions since prior validation | PASS | Doc `Precondition:` lines byte-identical to wf-20260705-uat-100 read; spec retry-2/3 honesty notes are env caveats already covered by doc's Notes |
| 4 | Manifest matches doc fixture table | PASS | 4 `operator_invites` rows match column-for-column (`id`, `email`, `display_name`, `token_plain`); Mail catcher row documented-absent on both sides per manifest `description` |
| 5 | Spec file exists and consistent with script | PASS | `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` exists; mirrors doc 1:1; carries non-vacuous API+UI assertions for Neg 002/003/005; honesty disclosures for `RESEND_API_KEY`, `.test` TLD, port `:3001` |

## AC → step/scenario mapping

- **AC-1** (lead form submits; email within 60s): Step 001 (UI submit), Step 002 (mail catcher), Neg 004 (plus-addressing rejection also exercises AC-1 boundary)
- **AC-2** (verify link transitions `email_verified` false→true; lands `/leads/verified`): Step 003
- **AC-3** (idempotent re-submit returns 202; no second email): Step 004
- **AC-4** (honeypot silently discards): Neg 001
- **AC-5** (onboard page shows invite details; password + AUP; valid token completes; missing Authentik user → 409): Step 005, Step 006, Neg 005
- **AC-6** (used token → 410): Neg 002
- **AC-7** (expired token → 410): Neg 003

## Blocker status (re-check)

| Issue | PR | Status |
|---|---|---|
| ISS-UAT-013-14 (manifest POSTs missing `token_hash`/`token_prefix`) | #119 squash `e8f8546` | RESOLVED — merged to main 2026-07-05 |
| ISS-UAT-013-15 (`scripts/uat-seed.sh` not MSYS-aware; bash GNU curl cannot reach Windows-host `localhost`) | #120 squash `f55ce74` | RESOLVED — merged to main 2026-07-05 |

Both preconditions for live execution are now satisfied. Proceed to Step 2 pre-flight.

## gate_result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-05T13:13:00Z
  summary: BP-UAT-013 script re-validated; doc byte-identical to prior validation; both prior blockers resolved.
  next_step: 2
  next_step_name: Pre-Flight
```