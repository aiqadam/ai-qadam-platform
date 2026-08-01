# 04 — Security Reviewer — wf-20260801-fix-189

## Verdict: **PASS** — no blockers, no findings.

## Invariants reviewed

| # | Invariant | Result | Notes |
|---|---|---|---|
| 1 | **Tenant isolation** — new field never crosses tenant boundary | **Pass** | Field is on `directus_users` (one row per member, each member is a single tenant). No collection-level or row-level cross-tenant read introduced. Field is per-user. |
| 2 | **Auth at controller level** — no bypass | **N/A** | No API/controller change. The existing `setOnboardedAt` / `getOnboardedAt` controllers already enforce authentication; this PR only adds the underlying schema column they target. |
| 3 | **Zod validation at boundaries** — no unvalidated input | **N/A** | No new API surface. |
| 4 | **No secrets in code** | **Pass** | No new env vars, no new tokens, no new files outside `bootstrap.sh`. |
| 5 | **No cross-schema queries** | **Pass** | Field is a single-column addition to the existing `directus_users` table; no JOIN introduced. |
| 6 | **Rate limiting** | **N/A** | No new endpoint. |
| 7 | **CSRF** | **N/A** | No new state-changing endpoint exposed to browser. The PATCH path that *writes* `onboarded_at` already exists in `MeProfileService.setOnboardedAt()` and is reachable only via the protected onboarding controller — no change here. |
| 8 | **RBAC scope unchanged** | **Pass** | `MEMBER_PROFILE_FIELDS` already listed `onboarded_at` since `ISS-USR-PROFILE-002`. After this fix, the permission row that references it finally has something to grant — same members, same scopes, same policies. **No widening.** |
| 9 | **Field sensitivity** — `onboarded_at` is not PII | **Pass** | A timestamp is metadata about when a user finished onboarding; not personally identifying beyond "is this user onboarded?". Combined with the existing public `MemberProfile` shape (which already includes `onboarded_at` in its return type and `PROFILE_FIELDS` in its query), the field is already implicitly readable by the user themselves via `GET /me/profile`. After this fix, the actual *value* is queryable. No additional surface beyond what was already contractually documented in apps/api code. |

## Readonly concern (verified)

`meta.readonly: true` prevents admin UI accidental writes. This is a *safety* property, not a security one — same as `email_verified_at`. The bootstrap PATCH that *writes* the field is the only intended write path (via `MeProfileService.setOnboardedAt()`), which is controller-level authenticated and lives behind the onboarding endpoint.

## No regressions to other security invariants

- The `ISS-USR-PROFILE-002` retry-without-onboarded_at fallback (`me-profile.service.ts:200-225`) becomes a no-op in practice — same code path, just doesn't have to fire because the field now exists. No security implication.
- The `ISS-RBAC-PERMS-001` 403 symptom that motivated the original report (PR #223 fixed permission rows but field was missing) is finally closed by this fix.

## Scope-out confirmation

- No `.env` changes.
- No new dependencies.
- No CI / GitHub Actions changes.
- No new permissions / policies / roles.

## Decision

Gate status: **PASS**.