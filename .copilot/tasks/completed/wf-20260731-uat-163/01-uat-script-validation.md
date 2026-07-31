# Step 1: Validate UAT Script — BP-UAT-010

`docs/02-business-processes/uat/BP-UAT-010.md` reviewed against
`docs/02-business-processes/uat/registry.md`. Script is well-formed:

- 7 numbered ACs, each mapped to at least one step.
- 6 positive steps + 3 negative scenarios (mandatory minimum met).
- Seed fixtures table present and complete (`uat-member`,
  `uat-event-open-uz`, `uat-event-full-uz`, `uat-member-points-baseline`) —
  now backed by a real manifest (`scripts/uat-fixtures/BP-UAT-010.json`,
  authored in `wf-20260731-fix-157` for `ISS-UAT-SEED-003`).
- `environment: http://localhost:4321` matches `apps/web`'s dev port.
- Known, already-disclosed limitations from the prior run (`last_run`
  frontmatter): AC-2 QR element likely absent (pre-existing gap, tracked as
  part of `ISS-UAT-010-1`'s doc/spec scope); AC-3 (email) deferred per the
  script's own Notes (no mail-catcher check policy); AC-6/AC-7 wording
  MISMATCH is `ISS-UAT-010-1`'s own known finding (real behavior differs
  from the doc's literal wording — real values are `waitlisted`, not
  `waitlist`, and points are awarded on check-in, not registration).

This run's purpose is narrower than a full fresh BP-UAT-010 pass: confirm
that ISS-BRIDGE-STALE-001's fix (a) does not regress the registration
flow, and (b) actually self-heals `uat-member`'s known-drifted
`directus_user_id` on this sign-in, landing new registrations on the
CORRECT Directus user id (`bb110099-c215-433b-8930-81e7f4dab21a`), not the
stale one (`a1524645-424a-4ad3-8974-faa94eecbb24`).

## Gate Result

**Status:** `passed` → Step 2 (Pre-Flight).
