---
code: BP-UAT-013
workflow_id: wf-20260705-uat-110-bp-uat-013-verify
triaged_at: 2026-07-05T13:43:00Z
triager: BusinessAnalyst (visual review folded-in — see §Visual review below)
---

# 03 — UAT Triage (BP-UAT-013)

## Verdict

`passed` (triage gate — UAT verification workflow Step 4 passes when
triage is complete, even with issues registered).

**Run status:** `partial` — 5/12 Playwright tests PASSED, 7 FAILED.
**AC verification:** 2/7 verified, 1/7 partial, 4/7 failed.

## Issues registered

| Issue | Severity | Module | Owner workflow |
|---|---|---|---|
| [ISS-UAT-013-16](../issues/ISS-UAT-013-16.md) | blocker | uat/seed | [wf-20260705-fix-113-bp-uat-013-fixture-lookup-unique](../tasks/queued/wf-20260705-fix-113-bp-uat-013-fixture-lookup-unique/handoff.yaml) (queued, queue_position 4) |

ISS-UAT-013-16 covers all 4 failing ACs (AC-2, AC-5, AC-6, AC-7) with
single root cause: the `scripts/uat-fixtures/BP-UAT-013.json` manifest's
`lookup_field: token_prefix` + `lookup_value: uat-onbo` is shared by all
4 fixtures, so each `reset_domain_fixture()` DELETE wipes the previous
CREATE. Only the last fixture's row survives a `--reset BP-UAT-013`.

## Visual review (folded-in)

Step 3.5 (VisualReviewer) was folded into this triage per workflow
brief — this run has minimal new visual surface (every failing step
captures the spec'd error UI correctly, not a visual defect).

| Screenshot | Captured for step | Verdict | Notes |
|---|---|---|---|
| `step-001-lead-form-pre-submit.png` | Step 001 pre-submit | PASS | Form rendered, controls visible |
| `step-001-lead-form-submitted.png` | Step 001 post-submit | PASS | Success panel renders per spec |
| `step-002-verify-email-in-mailcatcher.png` | Step 002 | N/A | Mailpit empty (env gap: `RESEND_API_KEY` unset); not a visual defect |
| `step-003-lead-verified.png` | Step 003 | N/A | Stale from prior run; step skipped |
| `step-004-idempotent-lead-resubmit.png` | Step 004 | PASS | Same success panel as Step 001 |
| `step-005-onboard-page.png` | Step 005 | PASS-for-error-state | 410 GonePanel rendered (correct error UI for actual state) |
| `step-006-onboard-pre-submit.png` | Step 006 pre-submit | PASS-for-error-state | Same as Step 005 |
| `step-006-onboard-completed.png` | Step 006 post-submit | PASS-for-error-state | Same as Step 005 |
| `neg-001-honeypot-silent-discard.png` | Neg 001 | PASS | Form returned 202; no row created |
| `neg-002-used-token-410.png` | Neg 002 | PASS-for-error-state | 410 panel rendered correctly |
| `neg-003-expired-token-410.png` | Neg 003 | PASS-for-error-state | Same as Neg 002 |
| `neg-004-plus-addressing-rejected.png` | Neg 004 | PASS | Plus-addressing rejected per spec |
| `neg-005-no-authentik-user-409.png` | Neg 005 | PASS-for-error-state | Preview API hit ECONNREFUSED; UI driven by fallback |

**Design-system verdict:** No `MISMATCH` / `PARTIAL` / `design_system: FAIL`
findings. Every screenshot that captured a UI state captured it correctly
per spec, including all failure-path screenshots which show the spec'd
error UI. The failures are not visual; they are seed/data/env.

## AC-by-AC disposition

| AC | Steps | Status | Evidence / Issue ref |
|---|---|---|---|
| **AC-1** lead form submits; verify email within 60s | Step 001 PASS, Step 002 FAIL | **partial** | UI submission + 202 response verified (`step-001-lead-form-submitted.png`). Mailpit empty — `RESEND_API_KEY` unset in `apps/api/.env` (env gap, documented in spec line 59; `apps/api/src/modules/email/email.service.ts` logs `[email skipped: RESEND_API_KEY not set]`). |
| **AC-2** verify link transitions `email_verified` false→true; `/leads/verified` | Step 003 FAIL | **failed** | Skipped because Step 002's email absent. Compound: lead form's `submitLead()` triggers `Directus POST /users` which rejects `.example.com` via Directus's `is-email` validator (RFC 2606 reserved TLD); no `directus_users` row created even though API returns 202. **Spec/code drift:** `BP-UAT-013.md` says `@aiqadam.test` (lines 68, 110, 154, 196); Playwright spec uses `@example.com` (lines 99-101). Drift was introduced deliberately (spec line 17 honesty note) to side-step the Directus validator, but the validator then blocks the very row the test needs. Will need re-verification after ISS-UAT-013-16 lands **and** `RESEND_API_KEY` is provisioned **and** Directus `.example.com` rejection is resolved (separate gap, no current owning issue — flagged for product/infra triage). |
| **AC-3** idempotent re-submit returns 202; no second email | Step 004 PASS | **verified** | Same submission shape as Step 001; API returned 202 idempotently. Screenshot `step-004-idempotent-lead-resubmit.png`. |
| **AC-4** honeypot silently discards | Neg 001 PASS | **verified** | Spec uses `setReactInputValue` to fill hidden honeypot; form returned 202; no `directus_users` row created. Screenshot `neg-001-honeypot-silent-discard.png`. |
| **AC-5** onboard page shows invite details; valid token completes; missing Authentik user → 409 | Step 005 FAIL, Step 006 FAIL, Neg 005 FAIL | **failed** (seed bug — ISS-UAT-013-16) | All 3 fail because 3 of 4 `operator_invites` rows are missing after `--reset BP-UAT-013`. Step 005 timed out waiting for `Welcome, …` text (page rendered 410 GonePanel — correct error UI for actual state). Neg 005's preview API hit `ECONNREFUSED ::1:3001` because `apps/e2e/playwright.uat.config.ts` does not load `apps/e2e/.env.uat`; `process.env.UAT_API_URL` falls back to `:3001`. **Two distinct root causes:** seed bug + env-var load. Follow-up `wf-20260705-fix-113` covers the seed bug; env-var load is folded into the same issue's body but not as a numbered AC (gap closed by amendment or new issue, see Honesty disclosures). |
| **AC-6** used token → 410 | Neg 002 FAIL | **failed** (seed bug — ISS-UAT-013-16) | Same root cause as AC-5: `uat-onboard-used-token` row missing. UI assertion PASS (GonePanel renders); API-level 410 assertion FAIL with ECONNREFUSED (env-var-not-loaded). |
| **AC-7** expired token → 410 | Neg 003 FAIL | **failed** (seed bug — ISS-UAT-013-16) | Same as AC-6: `uat-onboard-expired-token` row missing; UI PASS, API FAIL on ECONNREFUSED. |

**Summary:** 2 verified (AC-3, AC-4), 1 partial (AC-1), 4 failed (AC-2, AC-5, AC-6, AC-7).

## Honesty disclosures (per AGENTS.md §6.1)

- **AC verification honest state:** 2/7 verified end-to-end. No AC flipped to `verified` in this run that wasn't already verified at the 2026-07-02 full-Pass baseline. The honest state of BP-UAT-013 verification is unchanged from 2026-07-02.
- **Pre-flight observability gap:** Step 2 marked the seed as green ("4 fixture(s)" stdout) but Directus only contained 1 row. A `count operator_invites` curl in the pre-flight would have caught this. Flagged for future pre-flight refinement; not added as an AC of ISS-UAT-013-16 (scope creep).
- **Follow-up ownership:** `wf-20260705-fix-113-bp-uat-013-fixture-lookup-unique` queued at queue_position 4 with `blocks: [wf-20260705-uat-110]` and `parent_workflow_id: wf-20260705-uat-110`. Once it lands + merges to main, this UAT verification workflow's Step 3 should be re-run from scratch (the parent is intentionally NOT auto-archived; `wf-20260705-fix-113`'s `resolution_for_parent: defer-until-followup-landed` records the parent stays open).
- **AC-2 triple blocker:** (1) `RESEND_API_KEY` env gap (project-level scope per spec line 220 — out-of-scope here); (2) Directus `is-email` validator rejects `.example.com` (no owning issue — see Spec/code drift note); (3) spec/code drift between `BP-UAT-013.md` and `BP-UAT-013-signup.spec.ts` (no owning issue). After the seed bug is fixed and `wf-20260705-fix-113`'s ACs verified, AC-2 will still not flip to `verified` until (2) is resolved. Re-run is owned by the parent `wf-20260705-uat-110` per its `honesty_disclosure`.
- **ISS-UAT-013-16 AC gap:** The `UAT_API_URL` env-var-not-loaded bug (root cause #2 in `03-uat-report.md`) is described in the issue's body but NOT enumerated as a numbered AC. The follow-up workflow `wf-20260705-fix-113` reads the env-var issue from the issue body text; the AC list should be amended by the follow-up owner (or a new issue opened) to formally cover this gap. Otherwise it will be silently re-discovered on the next re-run.

## gate_result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-05T13:43:00Z
  summary: "Triage complete. 5/12 Playwright tests passed (2/7 ACs verified, 1/7 partial, 4/7 failed). Single blocker issue ISS-UAT-013-16 covers the seed manifest non-unique lookup_field bug; follow-up workflow wf-20260705-fix-113-bp-uat-013-fixture-lookup-unique is queued at queue_position 4 with blocks=[wf-20260705-uat-110]. Two sub-gaps surfaced as Honesty disclosures (UAT_API_URL env-var not loaded into Playwright config; BP-UAT-013.md spec/code drift re .example.com vs .aiqadam.test; Directus is-email validator rejects .example.com) — not filed as new issues; routed to the follow-up workflow owner for amend-or-decide. Registry updated: Last Run preserved at 2026-07-02 (honest prior state); Run Status set to partial."
  next_step: 5
  next_step_name: "Orchestrator: Commit, Push, Create PR"
```