# Step 4 — Triage Report

## Outcome: clean pass, no new issues

Both re-verified ACs (AC-1 regression guard, AC-6 core fix check)
returned `MATCH`, cross-referenced against live Directus rows, not just
DOM text. No new defect discovered on this surface. ISS-UAT-010-2's fix
(`wf-20260731-fix-165`, PR #181) holds under a genuine live browser
session.

## AC-9 statement (required by protocol Step 4)

See `02-uat-report.md`'s own AC-9 section — no visual-vs-DOM divergence
observed this run; the DOM and Directus states now agree on both the
open-event and full-event paths, which is the specific property this fix
was built to guarantee.

## Reproduced-but-not-new findings

- `ISS-EVT-004-1` (`registeredCount` hardcoded to 0 in `apps/web`) —
  visible again in the step-003 screenshot's "0 / 2 spots" counter.
  Already open, already tracked, unrelated to this fix's surface
  (`RegistrationsDirectusService.register()`'s re-read timing vs. the
  event-detail page's own separate `registeredCount` fetch). Not
  re-filed.

## No new `.copilot/issues/ISS-<n>.md` created this run.

## `docs/02-business-processes/uat/BP-UAT-010.md` frontmatter updated

`last_run` field updated to this run's outcome (see the file's own diff)
— `linked_issues` already includes `ISS-UAT-010-2`, no change needed
there.

**Gate:** `passed` → Step 5 (Commit, Push, Create PR).
