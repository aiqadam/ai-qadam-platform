# Step 1: Issue Lookup — ISS-BRIDGE-STALE-001

**Source:** already-local issue, fully triaged during `wf-20260730-uat-158`
(discovery only, no fix workflow queued until now). Not fresh GitHub intake —
`.copilot/issues/ISS-BRIDGE-STALE-001.md` already contains Symptom, confirmed
Root cause (via source read), Impact, and Acceptance Criteria from the
discovery session.

**Registry check:** `.copilot/issues/registry.md` row confirms `open`,
`blocker`, module `api/directus-bridge`, discovery workflow
`wf-20260730-uat-158`, no fix workflow queued — consistent with this workflow
being the fix.

**Related issues (do not conflate):**
- `ISS-UAT-BRIDGE-001`, `ISS-UAT-BRIDGE-002` — historical, `ISS-UAT-BRIDGE-002`
  is the 2026-07-04 email migration that caused today's drift (Authentik-only
  PATCH, never touched `directus_user_id` or reconciled the Directus-side row).
- `ISS-UAT-SEED-003` — the workflow whose Step 13 post-merge UAT
  (`wf-20260730-uat-158`) discovered this issue live. Not the same defect;
  that one was a seed-fixture gap, already resolved.

**Business-Process field:** Already set to `BP-UAT-010` in
`ISS-BRIDGE-STALE-001.md`'s header table (registration flow is where this was
discovered) — but per the issue's own Impact section, the actual blast radius
is much wider (registrations, point awards, badges, referrals, EULA/consent,
me-profile, admin-invite attribution, audit-actor resolution, RBAC policy
sync). `BP-UAT-010` is the correct value for the mandatory post-merge
Step 13 trigger since that's the process this was caught against; the fix
itself is not scoped to that one business process.

**GitHub sync:** Issue already linked (`GitHub-Issue:` =
https://github.com/aiqadam/ai-qadam-platform/issues/159, established by the
prior `ISS-WF-GH-LINK-001` fix). Synced Project status to `in-progress` as
the last action of this step (CodeDeveloper starts this same session).

**`issue_ref` set in `handoff.yaml`:** `ISS-BRIDGE-STALE-001`.

## Gate

**Status:** passed — no new intake needed, issue already well-formed with
clear ACs; proceeding to Step 2 (Impact Analysis).
