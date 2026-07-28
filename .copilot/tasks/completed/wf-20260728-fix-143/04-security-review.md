# Security Review — wf-20260728-fix-143 (ISS-UAT-RBAC-001)

## Code Changes Reviewed

- `apps/api/src/modules/rbac-sync/directus-policy-applier.ts`
- `apps/api/test/rbac-directus-applier.spec.ts`
- `apps/api/.env.example`
- `apps/api/.env` (local, gitignored, not in diff — `RBAC_SYNC_WRITE_ENABLED=true` added per the new CLAUDE.md dev/test `.env` exception)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | `filter_country` passthrough unchanged; no new tenant-scoped query added. |
| INV-2 Secrets by reference | Yes | Pass | No secret literals in the diff. `.env.example` addition documents a boolean feature flag, not a credential. |
| INV-3 Auth at controller level | No | N/A | No new controller/endpoint. `apply()` is only reachable from `RbacSyncService`, itself gated by `InternalAuthGuard` (webhook/poll paths, unchanged). |
| INV-4 Validation at boundaries | No | N/A | No new external input surface — `directusUserId` originates server-side from `resolveDirectusUserId`, not user input. |
| INV-5 No cross-schema queries | Yes | Pass | Fix reads/writes exclusively via Directus REST (`DirectusClient`); no direct cross-schema JOIN introduced. |
| INV-6 Rate limiting | No | N/A | No new public endpoint. |
| INV-7 CSRF | No | N/A | No new browser-initiated state change. |
| INV-8 No dangerouslySetInnerHTML | No | N/A | Backend-only change. |
| INV-9 No N+1 queries | Yes | Pass | One additional `GET` per `apply()` call (to read existing `directus_access` row ids before the replace `PATCH`) — a fixed 2-call sequence per user per sync run, not a query inside an unbounded loop. `applyEngines` already calls `apply()` once per user; this does not change that cardinality. |
| INV-10 Drizzle parameterization | No | N/A | No raw SQL; Directus REST via `fetch`, `directusUserId` is `encodeURIComponent`-escaped in the URL path (unchanged pattern from before this fix). |
| INV-11 HttpOnly tokens | No | N/A | Not a browser/token-storage change. |

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Notes

- The fix replaces a user's full `directus_access` policy set on every sync
  (`delete: <existing row ids>, create: <expected policy rows>`), which is
  the intended idempotent-full-replace semantics `ExpectedDirectusState`
  already implies (unchanged from the original design — this fix corrects
  *how* the write is sent, not *what* is written).
- `fetchExistingAccessRowIds` reads via `/users/{id}?fields=policies`
  specifically because `GET /items/directus_access` is confirmed (live,
  2026-07-28) to 403 even for a true `admin_access: true` token — this is
  Directus's own protected-system-collection behavior, not a permission
  gap this PR needs to fix.
- Separately discovered (not fixed by this PR, filed as
  [ISS-RBAC-PERMS-001](../../issues/ISS-RBAC-PERMS-001.md)): the policies
  this fix attaches currently grant zero actual permissions (no
  `directus_permissions` rows exist for any of the 7 ADR-0021 policies).
  This is a missing-grant gap, not an over-grant/security risk — the
  current (broken) state and the post-fix state are both maximally
  restrictive from a security standpoint; ISS-RBAC-PERMS-001 will need its
  own security review when it adds the actual per-collection grants
  (country filters, PII gating per ADR-0021 §4.1) since that's where a
  real over-broad-grant risk could be introduced.

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "No BLOCKER or MAJOR findings. Fix corrects a payload-shape bug in an existing internal-only sync path; no new attack surface, no secrets, no cross-schema access."
  findings: []
```
