# UAT Script Registry

Single index of every UAT script in `docs/02-business-processes/uat/`.
One row per script. Updated by BusinessAnalyst after each `uat-verification` run.

## Scripts

| Code | Name | Process Ref | Status | Last Run | Run Status | Open Issues |
|---|---|---|---|---|---|---|
| [BP-UAT-000](BP-UAT-000.md) | UAT environment setup and health check | [infrastructure/runbooks/](../../04-development/infrastructure/runbooks/) | Ready | — | — | — |
| [BP-UAT-001](BP-UAT-001.md) | Event publication broadcast | [event-publication-broadcast.md](../operations/event-publication-broadcast.md) | Ready | — | — | — |
| [BP-UAT-002](BP-UAT-002.md) | Operator event control panel | [operator-event-control.md](../operations/operator-event-control.md) | Ready | — | — | — |
| [BP-UAT-003](BP-UAT-003.md) | Member self-service profile | [member-profile.md](../operations/member-profile.md) | Ready | — | — | — |
| [BP-UAT-004](BP-UAT-004.md) | Operator cohort builder | [operator-cohort-builder.md](../operations/operator-cohort-builder.md) | Ready | — | — | — |
| [BP-UAT-005](BP-UAT-005.md) | Operator announce composer | [operator-announce-composer.md](../operations/operator-announce-composer.md) | Ready | — | — | — |
| [BP-UAT-006](BP-UAT-006.md) | Event CSAT — capture and operator surface | [event-csat.md](../operations/event-csat.md) | Ready | — | — | — |
| [BP-UAT-007](BP-UAT-007.md) | Pre-event reminder cron | [event-pre-event-reminders.md](../operations/event-pre-event-reminders.md) | Ready | — | — | — |
| [BP-UAT-008](BP-UAT-008.md) | Speaker pipeline and post-event cron | [event-speaker-pipeline.md](../operations/event-speaker-pipeline.md) | Ready | — | — | — |
| [BP-UAT-009](BP-UAT-009.md) | Auth sign-in and sign-out | [FR-AUTH-001](../../03-requirements/FR-AUTH-001.md) | Implemented | 2026-07-02 | partial | [ISS-UAT-009-1](../../../.copilot/issues/ISS-UAT-009-1.md), [ISS-UAT-009-2](../../../.copilot/issues/ISS-UAT-009-2.md), [ISS-UAT-009-3](../../../.copilot/issues/ISS-UAT-009-3.md), [ISS-UAT-009-4](../../../.copilot/issues/ISS-UAT-009-4.md) |
| [BP-UAT-010](BP-UAT-010.md) | Event registration flow | [FR-REG-001](../../03-requirements/FR-REG-001.md) | Ready | — | — | — |
| [BP-UAT-011](BP-UAT-011.md) | QR check-in | [FR-REG-004](../../03-requirements/FR-REG-004.md) | Ready | — | — | — |
| [BP-UAT-012](BP-UAT-012.md) | Points engine and leaderboard | [FR-GAM-001](../../03-requirements/FR-GAM-001.md) | Ready | — | — | — |
| [BP-UAT-013](BP-UAT-013.md) | Member signup and operator onboarding | [FR-USR-001](../../03-requirements/FR-USR-001.md) | Implemented | 2026-07-02 | partial | [ISS-UAT-013-9](../../../.copilot/issues/ISS-UAT-013-9.md), [ISS-UAT-013-10](../../../.copilot/issues/ISS-UAT-013-10.md), [ISS-UAT-013-12](../../../.copilot/issues/ISS-UAT-013-12.md), [ISS-UAT-013-13](../../../.copilot/issues/ISS-UAT-013-13.md) |
| [BP-UAT-014](BP-UAT-014.md) | Waitlist management | [FR-REG-002](../../03-requirements/FR-REG-002.md) | Ready | — | — | — |
| [BP-UAT-015](BP-UAT-015.md) | Registration cancellation | [FR-REG-003](../../03-requirements/FR-REG-003.md) | Ready | — | — | — |
| [BP-UAT-016](BP-UAT-016.md) | Member referral programme | [member-referrals.md](../operations/member-referrals.md) | Ready | — | — | — |
| [BP-UAT-017](BP-UAT-017.md) | Pre-event member matching (T-7) | [event-member-matches.md](../operations/event-member-matches.md) | Ready | — | — | — |
| [BP-UAT-018](BP-UAT-018.md) | Lead nurture cron | [lead-nurture.md](../operations/lead-nurture.md) | Ready | — | — | — |

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
