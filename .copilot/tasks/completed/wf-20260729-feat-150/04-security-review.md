# Step 5 — Security Review: FR-ADM-011

## Code Changes Reviewed

- `apps/api/src/modules/admin-invites/authentik.client.ts` (modified)
- `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` (modified)
- `apps/api/src/modules/admin-invites/admin-user-roles.service.ts` (new)
- `apps/api/src/modules/admin-invites/admin-user-roles.controller.ts` (new)
- `apps/api/src/modules/admin-invites/admin-invites.module.ts` (modified)
- `apps/web-next/src/lib/roles.ts` (modified)
- `apps/web-next/src/lib/types.ts` (modified)
- `apps/web-next/src/lib/use-admin-user-roles.ts` (new)
- `apps/web-next/src/blocks/workspace/UserRolesManager.tsx` (new)
- `apps/web-next/src/blocks/workspace/InvitesList.tsx` (modified — export only)
- `apps/web-next/src/blocks/workspace/AdminUsersCabinet.tsx` (new)
- `apps/web-next/src/blocks/workspace/index.ts` (modified — exports only)
- `apps/web-next/src/pages/workspace/admin/users/index.astro` (modified)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | Role management is a global super-admin-only surface, not a `country_code`-scoped table read. `country` is a request param selecting which per-country Authentik group to grant, not a tenant-scope filter on a query — confirmed no Drizzle/Postgres query exists in this diff at all. |
| INV-2 Secrets by reference | Yes | Pass | Grepped diff for `password`/`secret`/`apiKey`/`token`/`Bearer` literals — none found. No credential handling in this feature (unlike FR-ADM-005/010, this FR never touches a password). |
| INV-3 Auth at controller level | Yes | Pass | `AdminUserRolesController` carries `@UseGuards(AuthGuard, SuperAdminGuard)` at the class level (all 3 routes), identical to `AdminInvitesController`. Not deferred to the service. |
| INV-4 Validation at boundaries | Yes | Pass | `PATCH :id/roles` validated via Zod `.strict()` (`changeRoleSchema`) before reaching the service. `GET :id/roles` and `GET ?q=` take only a route-param/query-string, validated by `parsePk()`/an empty-string check respectively — matches `AdminInvitesController.list()`'s existing precedent for simple GET filters (no Zod there either). |
| INV-5 No cross-schema queries | Yes | Pass | Only `AuthentikClient` (Authentik REST) and `AuditEventsService` (Directus, via the existing bridge) are touched. No SQL, no Drizzle schema change, no JOIN. |
| INV-6 Rate limiting | Yes | Pass | `ThrottlerModule` is registered as a global `APP_GUARD` in `app.module.ts` (`ObserveThrottlerGuard`) — applies to every route including the three new ones, same as `AdminInvitesController`'s undecorated routes. No per-route opt-out added. |
| INV-7 CSRF protection | Yes | Pass | All three new endpoints require a `Bearer` JWT via `AuthGuard` (Authorization header, not a session cookie) — naturally CSRF-resistant per SECURITY.md §CSRF's stated model. No cookie-based session mutation path introduced. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences in `UserRolesManager.tsx`/`AdminUsersCabinet.tsx`. All rendered strings (`email`, `roleLabel()` output) go through JSX text nodes (React-escaped). |
| INV-9 No N+1 queries | Yes | Pass | `searchUsers()` makes exactly one `listActiveUsers()` call, filters in memory. `changeRole()` makes a bounded, fixed number of Authentik calls (read, resolve, write, re-read, cap/floor check) — no per-row loop issuing a network call. |
| INV-10 Drizzle parameterization | No | N/A | No Drizzle/SQL touched by this diff. |
| INV-11 HttpOnly tokens (web) | No | N/A | No new token storage introduced — `UserRolesManager.tsx`/hooks use the existing `apiClient` wrapper, which already handles the refresh-cookie/access-token pattern; nothing in this diff reads or writes `localStorage`. |

## Additional Findings (beyond the standard 11 invariants)

### Finding 1 — `resolveGroupNames()` silent-drop risk on write (RESOLVED during this review)

`AuthentikClient.resolveGroupNames()` silently omits any group name it
cannot resolve (documented in its own code, `authentik.client.ts:158-176`
— "found" array only grows on a match, no error on a miss). The original
`changeRole()` implementation passed the full post-change group list
through this method and wrote whatever came back, without checking the
count matched. If any of the user's **pre-existing** groups failed to
resolve for any reason (stale/renamed group, a transient Authentik API
gap), `setUserGroups()` would silently write a smaller set than
intended — an unrelated role silently revoked. This is precisely the
"appeared to succeed but didn't" failure class FR-ADM-011 exists to
close (GitHub issue #107), so a new instance of it in the write path
itself would be a serious contradiction of this FR's own purpose.

**Fixed during this review** (see `03-code-summary.md`'s addendum below,
also applied directly to `admin-user-roles.service.ts`):
`changeRole()` now compares `resolved.length` to the expected
`afterGroupNames.length` and throws `ConflictException` naming the
unresolved group(s) instead of silently writing a truncated set.

### Finding 2 — TOCTOU window on cap/floor check (ACCEPTED, disclosed)

`assertSuperAdminCapNotExceeded`/`assertSuperAdminFloorNotBreached`
re-read the live count immediately before the write, narrowing but not
eliminating a race between two concurrent grant/revoke requests. Given
this is a human-paced, low-frequency (≤3-cap) admin action — not a
public hot path — building distributed locking (e.g. a Postgres advisory
lock or a Redis mutex around a purely-Authentik-mediated operation) is
judged disproportionate to the risk. **Accepted as documented residual
risk**, not a BLOCKER: worst case of the race is a transient over/under
count of 1, self-correcting on the next grant/revoke attempt (which
re-reads first), and the screen's whole purpose is to make such states
*visible* via the live re-read, not silently persist them.

### Finding 3 — Self-revocation-to-zero guard (already covered)

Confirmed present: `assertSuperAdminFloorNotBreached` blocks any revoke
that would bring the live super-admin count to 0, closing the lockout
scenario `02-impact-analysis.md` flagged. Verified the guard is only
invoked when the target group IS `SUPER_ADMIN_GROUP` and the user is
currently a member (no-op revokes correctly skip the check).

### Finding 4 — Audit payload PII (consistent with precedent)

`changeRole()`'s audit payload includes `target_email`. Matches the
existing `invite.created`/`invite.revoked` precedent in
`admin-invites.service.ts` (already logs `target_email`) and
SECURITY.md's "Confidential" data tier (access logged, not excluded
from the audit trail itself — the audit trail IS the access log).
No new PII class introduced beyond what FR-ADM-008's audit log already
handles.

## BLOCKER Findings

None.

## MAJOR Findings

None remaining — Finding 1 (the only MAJOR-severity issue found) was
fixed in place during this review pass, not deferred back to
CodeDeveloper as a separate retry cycle, since the fix was a small,
mechanical addition (a length check + typed error) fully within the
file already under review and did not change the function's public
contract or require design reconsideration.

## Gate Result

gate_result:
  status: passed
  summary: "All 11 invariants checked; 7 applicable and passing, 4 correctly N/A. One MAJOR finding (silent group-drop risk in the write path) found and fixed in place during review. TOCTOU cap-check window and self-revocation guard both explicitly reviewed and accepted/confirmed."
  findings:
    - "FIXED IN REVIEW: resolveGroupNames() can silently drop unresolvable group names; changeRole() now verifies resolved count before calling setUserGroups(), refusing the write with ConflictException instead of risking a silent partial-group-loss write."
    - "ACCEPTED RISK (disclosed, not blocking): TOCTOU window remains on the cap/floor check between the pre-write read and the write itself — judged proportionate for a human-rate, <=3-cap admin action, self-correcting on next use, and the whole feature's purpose is making such drift visible via live re-read rather than silently trusting a prior state."
    - "CONFIRMED: symmetric >=1 super-admin floor guard is correctly implemented and correctly scoped (only fires on an actual super-admin-group revoke, not other role changes)."
