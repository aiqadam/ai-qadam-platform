# UAT Script Registry

Single index of every UAT script in `docs/02-business-processes/uat/`.
One row per script. Updated by BusinessAnalyst after each `uat-verification` run.

## Scripts

| Code | Name | Process Ref | Status | Last Run | Run Status | Open Issues | Spec | Smoke Overlap |
|---|---|---|---|---|---|---|---|---|---|
| [BP-UAT-000](BP-UAT-000.md) | UAT environment setup and health check | — | — |
| [BP-UAT-001](BP-UAT-001.md) | Event publication broadcast | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+4 more |
| [BP-UAT-002](BP-UAT-002.md) | Operator event control panel | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+14 more |
| [BP-UAT-003](BP-UAT-003.md) | Member self-service profile | — | <br>smoke-me-profile.spec.ts<br>smoke-workspace-members.spec.ts |
| [BP-UAT-004](BP-UAT-004.md) | Operator cohort builder | — | — |
| [BP-UAT-005](BP-UAT-005.md) | Operator announce composer | — | <br>smoke-workspace-announce.spec.ts |
| [BP-UAT-006](BP-UAT-006.md) | Event CSAT — capture and operator surface | — | <br>smoke-csat.spec.ts<br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>+6 more |
| [BP-UAT-007](BP-UAT-007.md) | Pre-event reminder cron | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+4 more |
| [BP-UAT-008](BP-UAT-008.md) | Speaker pipeline and post-event cron | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+5 more |
| [BP-UAT-009](BP-UAT-009.md) | Auth sign-in and sign-out | [BP-UAT-009.spec.ts](../../../../apps/e2e/tests/uat/BP-UAT-009.spec.ts) | <br>smoke-auth-gates.spec.ts<br>smoke-me-profile.spec.ts<br>smoke-workspace-members.spec.ts |
| [BP-UAT-010](BP-UAT-010.md) | Event registration flow | [BP-UAT-010.spec.ts](../../../../apps/e2e/tests/uat/BP-UAT-010.spec.ts) | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+3 more |
| [BP-UAT-011](BP-UAT-011.md) | QR check-in | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+4 more |
| [BP-UAT-012](BP-UAT-012.md) | Points engine and leaderboard | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts |
| [BP-UAT-013](BP-UAT-013.md) | Member signup and operator onboarding | Implemented | 2026-07-02 | partial | [BP-UAT-013-signup.spec.ts](../../../../apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts) | <br>smoke-lead-nurture.spec.ts<br>smoke-leads.spec.ts<br>smoke-onboarding.spec.ts<br>+1 more |
| [BP-UAT-014](BP-UAT-014.md) | Waitlist management | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+4 more |
| [BP-UAT-015](BP-UAT-015.md) | Registration cancellation | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts<br>smoke-event-regen-social-card.spec.ts<br>+4 more |
| [BP-UAT-016](BP-UAT-016.md) | Member referral programme | — | <br>smoke-referrals.spec.ts<br>smoke-workspace-members.spec.ts |
| [BP-UAT-017](BP-UAT-017.md) | Pre-event member matching (T-7) | — | <br>smoke-event-matches-post-reg.spec.ts<br>smoke-event-matches.spec.ts |
| [BP-UAT-018](BP-UAT-018.md) | Lead nurture cron | — | <br>smoke-lead-nurture.spec.ts<br>smoke-leads.spec.ts |
| [BP-UAT-019](BP-UAT-019.md) | Operator approvals queue | — | <br>smoke-workspace-approvals.spec.ts |

## Status legend

- **Draft** — script authored, not yet validated by BusinessAnalyst
- **Ready** — BusinessAnalyst validated; ready to run
- **Implemented** — run at least once; results in `last_run` column
- **Deferred** — blocked on an unshipped feature; see Notes

## Run Status legend

- **passed** — all steps and negative scenarios passed on last run
- **partial** — some steps passed, some failed; issues registered
- **failed** — majority of steps failed; issues registered
- **—** — never run

## Spec / Smoke Overlap columns (auto-generated)

These two columns are populated by `scripts/gen-bp-uat-coverage.mjs`
(Section 6.1, FR-WORKFLOW-002). Run `node scripts/gen-bp-uat-coverage.mjs --write`
after any test-rename or test-add to keep the table in sync — do not edit
the cells by hand. The script is idempotent.

### Spec legend

- `<name>.spec.ts` — link to the BP-UAT Playwright spec under
  `apps/e2e/tests/uat/`. The Spec is **authored**, not necessarily **passing**.
  Pass/fail lives in the `Run Status` column from UATRunner's last execution.
- **—** — no Playwright spec authored yet. Authoring is owned by the queued
  follow-up workflows (see `.copilot/tasks/queued/uat-bp-uat-coverage-batch/`).

### Smoke Overlap legend

- A short list of `smoke-*.spec.ts` files whose name overlaps a topic word
  in the BP-UAT's domain. This is **heuristic** — never a substitute for
  cross-checking the script text. A non-empty list does NOT mean the smoke
  spec exercises the BP-UAT end-to-end; it is a reading hint only.
- **—** — no obvious topical overlap.

## Notes

### Execution order recommendation

**BP-UAT-000 must pass before any other script is attempted.** It verifies the
environment is ready. If BP-UAT-000 fails, fix the environment and re-run it —
do not proceed to business-process scripts with a broken stack.

Once BP-UAT-000 passes, run scripts in this order:

1. **BP-UAT-000** (environment setup) — **mandatory first step**
2. **BP-UAT-009** (auth) — prerequisite for all member-facing scripts
3. **BP-UAT-013** (signup / onboarding) — establishes accounts used downstream
4. **BP-UAT-010** (registration) — establishes confirmed registrations for 011, 012, 014, 015
5. **BP-UAT-014** (waitlist) — must run before BP-UAT-015 (uses same cancel endpoint)
6. **BP-UAT-015** (cancellation) — consumes the confirmed registration from step 4
7. **BP-UAT-011** (QR check-in) — requires a live event seed; run independently
8. **BP-UAT-012** (points + leaderboard) — requires a check-in; may reuse BP-UAT-011's event
9. **BP-UAT-016** (referral) — independent; needs a fresh member context
10. Cron scripts (001, 007, 008, 017, 018) are independent of each other and can run in any order

### Scripts requiring mail catcher

BP-UAT-010 (confirmation email), BP-UAT-013 (lead verify + onboarding), BP-UAT-014 (promotion email), BP-UAT-017 (match emails), BP-UAT-018 (nurture emails). Configure Mailpit or equivalent at `http://localhost:8025` before running these.

### Scripts with time-sensitive seeds

BP-UAT-007, BP-UAT-011, BP-UAT-017, BP-UAT-018 require `starts_at` / `email_verified_at` values computed relative to the seed execution time. Re-seed if more than 2 hours have passed between seed run and UAT execution.
