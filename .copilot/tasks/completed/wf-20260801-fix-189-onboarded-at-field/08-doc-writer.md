# 08 — Doc Writer — wf-20260801-fix-189

## Doc changes

### `.copilot/issues/ISS-RBAC-ONBOARDED-AT-001.md` — Resolution section

Updated to:
- Status → `resolved`
- Resolved date → `2026-08-01`
- Workflow → `wf-20260801-fix-189`
- PR → (filled in at workflow end)
- Resolution body → full what/why/verification/honesty disclosures

### Inline docstring in `bootstrap.sh` — note field on `meta.note`

The new `ensure` block carries a meta note explaining:
- what sets the field (`MembersOnboardingService.completeOnboarding()`)
- why it's nullable (legacy users pre-this-fix)
- what references it (`MEMBER_PROFILE_FIELDS` line ~2729,
  `MeProfileService.{setOnboardedAt,getOnboardedAt,fetchProfileRow}`)
- what bug it closes (the second half of the symptom that motivated
  `ISS-RBAC-PERMS-001` — the 403 still happened after PR #223 because
  the underlying field was missing).

This is self-documenting at the schema-administration level: any
operator looking at the field in the Directus admin UI sees the
context.

## Doc changes NOT made

### `apps/api/src/modules/me-profile/me-profile.service.ts:201-225` retry comment

The `ISS-USR-PROFILE-002` retry-without-onboarded_at workaround is now
technically dead code (the field will exist after this PR lands), but
leaving it in is correct:
- It's a *defensive* retry that costs nothing if it never fires.
- Other Directus field-grant gaps could trigger the same symptom
  (the comment explicitly mentions this generalization).
- Removing it would require its own regression test to prove it never
  fires — out of scope for this minimal fix.
- Documented in code already.

### `apps/api/src/modules/me-profile/me-profile.controller.ts:255` doc comment

Still accurate — "Returns whether onboarded_at is set on directus_users."
After this fix, the field will actually exist; the comment is unchanged.

## Honesty disclosure

No deferrals needed. The fix is self-contained, idempotent, and
fully verified live. No infrastructure follow-up workflows queued
from this issue. The pre-existing
`wf-20260801-fix-188-public-policy-uuid-lookup` (separate concern,
8 hardcoded UUID-pinned public-read blocks) is unrelated to
`onboarded_at` and was already queued by the prior workflow.