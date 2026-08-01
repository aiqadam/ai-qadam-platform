# 02 — Impact Analysis — wf-20260801-fix-189

## Summary
Add `directus_users.onboarded_at` field (timestamp, nullable, readonly)
to the Directus schema, idempotently, via `bootstrap.sh`.

## Files modified

| File | Lines | Reason |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | +12 | New `ensure "field directus_users.onboarded_at"` block placed adjacent to `email_verified_at` (model analog). |

## Files NOT modified (read-only verification)

| File | Why we touched it |
|---|---|
| `apps/api/src/modules/me-profile/me-profile.service.ts` | Code that targets this field (setOnboardedAt, getOnboardedAt, PROFILE_FIELDS, DirectusUserRow.onboarded_at). No change — confirms the field is real, used, and the fix is purely schema-side. |
| `apps/api/src/modules/members/onboarding.service.ts` | Calls `setOnboardedAt()` at end of `completeOnboarding()`. No change — confirms this field is meant to be set on onboarding completion. |
| `apps/api/src/modules/members/onboarding.controller.ts` | Doc comment references this field. No change. |
| `apps/api/src/modules/me-profile/me-profile.controller.ts` | Doc comment references this field. No change. |
| `apps/api/test/me-profile-service.spec.ts` | Tests already cover `onboarded_at` read/write shape — passes today because tests don't depend on real schema. No change. |
| `apps/api/test/members-onboarding.integration.spec.ts` | Same — passes today. No change. |

## Downstream effects

- **Permissions**: No new permission row needed. `MEMBER_PROFILE_FIELDS` (line 2729) already includes `onboarded_at`. The permission row it backs (created on bootstrap) was already a no-op (the bug); after this fix, the permission row becomes functional. No change to RBAC matrix — *safer*, not riskier.
- **MEMBER_PROFILE_FIELDS allowlist**: Already contains `onboarded_at`. No change.
- **API callers**: `setOnboardedAt` / `getOnboardedAt` / `patchProfile`'s retry-without-onboarded_at fallback (`ISS-USR-PROFILE-002` workaround at lines 200-225) become a no-op-once-fixed in practice — the field will exist, the retry path never triggers. No change to code.
- **Data**: Existing directus_users rows get the new field with NULL value (no migration needed — `is_nullable: true`). No backfill required. Legacy users with NULL onboarded_at remain correct (per `getOnboardedAt` doc: "Returns null when the Directus field is unset (legacy users who joined before this feature)").
- **Tests**: `apps/api/test/me-profile-service.spec.ts:322-475` already covers all four behaviors. No new tests needed — the existing tests pin the contract that this fix satisfies.

## Risk

| Risk | Mitigation |
|---|---|
| Field already exists on some env → ensure() fails | `ensure()` helper is existence-check-on-miss by design (skip if 200). Confirmed pattern across 30+ other fields in same file. |
| Field type wrong (e.g. datetime vs timestamp) | `email_verified_at` precedent — same use case (nullable, set once by service, readonly) — uses `timestamp` successfully. |
| Permission grant still missing | Pre-existing permissions already include `onboarded_at` in `MEMBER_PROFILE_FIELDS`. Verified by grep: only hit of `onboarded_at` outside the new block is the allowlist at line 2729. |
| Stale apps/api code references unmapped field | Apps/api code already references the field (4 files, 65 grep matches). The schema gap was the only thing missing. |

## Blast radius

- **Schema**: 1 new column on `directus_users`. Nullable, default NULL.
- **Apps**: 0 application changes.
- **Tests**: 0 test additions (existing tests cover the behavior).
- **Permissions**: 0 new rows (existing allowlist already lists it).
- **Environments**: Local will be brought up to date by the bootstrap re-run during live verification; QA / prod updates will land on their next normal bootstrap run (out of scope per `ISS-RBAC-ONBOARDED-AT-001`'s `scope_out`).