# Step 1 — UAT Script Validation

`docs/02-business-processes/uat/BP-UAT-010.md` already exists, has 7 ACs,
seed fixtures documented, and a negative scenario (unauthenticated
visitor). No gaps requiring correction for this run's scope.

This run is a **targeted post-merge re-verification** (Step 13 of
`wf-20260731-fix-165` / ISS-UAT-010-2), not a full 7-AC pass — scoped to
AC-1 (open-event registration, regression guard) and AC-6 (full-event
waitlist rendering, the exact defect this fix addresses). This mirrors
the precedent set by `wf-20260731-uat-163` (Step 13 for
ISS-BRIDGE-STALE-001), which also ran a narrower, fix-scoped
re-verification rather than repeating the entire script.

**Gate:** `passed` → Step 2.
