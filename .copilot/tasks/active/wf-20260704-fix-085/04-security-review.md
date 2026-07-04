# Step 4 — Security Review

**Workflow:** wf-20260704-fix-085
**Issue:** ISS-UAT-BRIDGE-001 (blocker, api/directus-bridge)
**Branch:** `fix/ISS-UAT-BRIDGE-001-bridge-no-local-row-fallback` (base `698c8d9`)
**Timestamp:** 2026-07-04
**Agent:** SecurityReviewer

---

## Verdict

**PASS-WITH-FINDINGS** — all blocking invariants hold; one pre-existing
observation (`@Throttle` absent on the internal endpoint) is re-noted
for the audit trail but is not introduced by this fix and is not
blocking.

## Code Changes Reviewed

| File | Lines reviewed | Verdict |
|---|---|---|
| [apps/api/src/modules/directus/directus-users-bridge.service.ts](apps/api/src/modules/directus/directus-users-bridge.service.ts) | `:125-181` (rewritten `ensureLinkedByEmail` body + JSDoc) | OK |
| [apps/api/test/directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts) | `:213-396` (rewrite of case 1 + 3 new no-local-row cases) | OK |

No other production files touched (verified via
`git diff origin/main -- apps/api/src/modules/directus/directus-users-bridge.service.ts apps/api/test/directus-users-bridge.spec.ts`
scope).

## Invariants Reviewed

Per AGENTS.md §5 + `security.md` + the per-invariant checklist from the
role definition.

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| **INV-1 — Tenant isolation** | Yes | **PASS** | `platform.users` is global (no `country_code` — verified at [users/schema.ts:13-29](apps/api/src/modules/users/schema.ts#L13-L29); the 6 grep hits in `users.service.ts:153/171/178/191/213/222` are `countryCode` filter params pushed to Directus via the `getPublicProfile` path, not Postgres filters on `platform.users`). `directus_users` is global per [architecture.md](docs/04-development/architecture/architecture.md) "Data ownership" table. The new no-local-row branch writes to the global `directus_users` collection — no `country_code` filter is needed, none was added. **Zero weakening** of the tenant boundary. |
| **INV-2 — Secrets by reference** | Yes | **PASS** | New warn-log at [directus-users-bridge.service.ts:174-181](apps/api/src/modules/directus/directus-users-bridge.service.ts#L174-L181) emits only `${email}` and `err.message`. No `password`, `secret`, `apiKey`, `token`, `Bearer`, no full request body, no auth header. Email is `security.md`-classified "Confidential: user emails … access-logged" — log emission permitted by `security.md` "Output encoding → Log output: sanitize PII; never log raw bodies." (email ≠ raw body). |
| **INV-3 — Auth at controller level** | Yes | **PASS** | Bridge has no auth (correct — service layer). Sole caller is `InternalController.ensureLinkedUser` at [internal.controller.ts:113](apps/api/src/modules/internal/internal.controller.ts#L113), behind class-level `@UseGuards(InternalAuthGuard)` at [internal.controller.ts:39-40](apps/api/src/modules/internal/internal.controller.ts#L39-L40). `InternalAuthGuard` uses `timingSafeEqual` against `INTERNAL_API_TOKEN` from `env.ts:62` (gitignored, `.env` only). No new auth model introduced. |
| **INV-4 — Validation at boundaries** | Yes | **PASS** | Controller `ensureLinkedSchema` (Zod) at [internal.controller.ts:54-58](apps/api/src/modules/internal/internal.controller.ts#L54-L58) validates `email: z.string().email()` and `displayName: z.string().min(1).max(255).nullable().optional()`. Bridge receives already-typed inputs and trusts them — by design, per AGENTS.md §5 ("Authentication enforced at controller level"). No new input surface. |
| **INV-5 — No cross-schema queries** | Yes | **PASS** | No JOIN introduced. New branch touches only `platform.users` (read) and `directus_users` (read+write via `DirectusClient.get`/`post`/`patch`) — both pre-existing per `findOrCreate`. Per `architecture.md` "Data ownership", `platform` is owned by NestJS, `directus` is owned by Directus CMS; writes to `directus_users` go through Directus API, not SQL. |
| **INV-6 — Rate limiting** | No | **N/A** | Not a public endpoint — `InternalAuthGuard`-protected. **Pre-existing observation (not introduced by this fix):** `POST /v1/internal/users/ensure-linked` has no `@Throttle` decorator. The internal-token is the de-facto rate gate; this is documented in `wf-20260703-fix-064/02-impact-analysis.md` and re-confirmed here. **Not blocking** — flagging for the audit trail per AGENTS.md §13. |
| **INV-7 — CSRF protection** | No | **N/A** | Endpoint uses `x-internal-auth` header (not session cookie) — naturally CSRF-resistant per `security.md` "Cross-site request forgery" rule. |
| **INV-8 — No `dangerouslySetInnerHTML`** | No | **N/A** | Server-side NestJS service; no React surface in this diff. |
| **INV-9 — No N+1 queries** | Yes | **PASS** | Single SELECT (`:163-166`) gated on no-row-found; no query in a loop. |
| **INV-10 — Drizzle parameterization** | Yes | **PASS** | `db.select({ id: users.id }).from(users).where(eq(users.email, input.email))` at `:163-166` uses Drizzle's `eq()` column reference — parameter-bound, no string interpolation. No `` sql`...` ``, no `db.execute()`. |
| **INV-11 — HttpOnly tokens (web)** | No | **N/A** | No web surface in this diff. |

## Tradeoff Re-Statement (audit hole)

The impact analysis correctly flags a property change:

- **Before this fix**, `ensureLinkedByEmail({ email })` was **strict
  read-no-side-effect** when no `platform.users` row existed — a future
  security audit could lean on that to assert "the bridge cannot create
  a Directus row for a user that doesn't exist locally."
- **After this fix**, the bridge **WILL** create a Directus row from
  just an `email` + `displayName`.

**Re-stated risk assessment (this reviewer agrees with the impact
report):** the new mutation capability is reachable only through
`POST /v1/internal/users/ensure-linked`, which is gated by
`InternalAuthGuard` (shared secret `INTERNAL_API_TOKEN`, length-checked
+ `timingSafeEqual`, stored gitignored in `apps/api/.env`). Verified by
grep:

- **One production caller** of `ensureLinkedByEmail`:
  [internal.controller.ts:113](apps/api/src/modules/internal/internal.controller.ts#L113).
- **Zero** matches for `ensureLinkedByEmail` in `apps/bot/`,
  `apps/workers/`, `apps/web/`, `apps/web-next/`.
- **One** external client: `scripts/uat-seed.sh:215-251`
  (`api_ensure_directus_user_link`) — same shared-secret requirement.
- The future admin-invitation flow
  (`apps/api/src/modules/admin-invites/admin-invites.service.ts` already
  imports `DirectusUsersBridgeService`; verified via grep) is also
  `InternalAuthGuard`-guarded — same boundary.

**No public-surface caller exists. No path bypasses
`InternalAuthGuard`. The gate does not fail.**

The audit-hole property is **removed** but is replaced by an
audit-defensible property: *"the bridge can create a Directus mirror
from `{email, displayName}` if and only if the caller possesses
`INTERNAL_API_TOKEN`."* That is a strictly narrower capability boundary
than the OIDC-callback path (which already accepts the same POST shape
from a JWT-authenticated caller), and it is honest about its
precondition.

## New Attack Surfaces

**None.**

- No new endpoint, no new route, no new auth path.
- No new DB column, no new RBAC scope, no new external API key.
- No new dependency, no new module import.
- The mutation vector (`POST /users` in `findOrCreate`) already existed
  and is reachable from the OIDC-callback path.

## Recommendations (non-blocking, for follow-up tracking only)

1. **Pre-existing `@Throttle` gap on the internal endpoint family.**
   Re-noting the observation first raised in
   [wf-20260703-fix-064/02-impact-analysis.md](.copilot/tasks/completed/wf-20260703-fix-064/02-impact-analysis.md):
   `InternalController` and the other 9 internal controllers in
   `apps/api/src/modules/**` that use `InternalAuthGuard` have no
   `@Throttle` decorator. The shared secret is the de-facto rate gate;
   an attacker in possession of `INTERNAL_API_TOKEN` (e.g., via a leaked
   dev/CI secret) could mass-create Directus users at line-rate.
   Recommend a future follow-up workflow to add a
   `@Throttle({ ttl: 60_000, limit: 30 })` decorator at the
   `InternalController` class level — **not blocking this PR**.

2. **Audit-log signal.** Consider adding a `logger.log('info', ...)`
   (not warn) on the no-local-row CREATE path (after `findOrCreate`
   returns a non-null id), so an operator can grep `directus-bridge` for
   "created mirror for unknown local user" patterns. This would be the
   audit trail counterpart to the swallowed `warn` on failure.
   **Optional, not blocking.**

## Gate Result

```yaml
gate_result:
  status: passed
  decision: PASS-WITH-FINDINGS
  summary: >-
    All blocking security invariants hold for the
    DirectusUsersBridgeService.ensureLinkedByEmail rewrite
    (apps/api/src/modules/directus/directus-users-bridge.service.ts:125-181).
    Input validation at boundary OK (controller Zod schema at
    internal.controller.ts:54-58); auth at controller OK (InternalAuthGuard
    class-level at internal.controller.ts:39-40, timingSafeEqual on
    INTERNAL_API_TOKEN); no secrets in logs OK (new warn at :174-181 logs
    only email + err.message, matches existing :71 pattern); parameterized
    SQL OK (Drizzle eq() at :163-166); tenant isolation OK (platform.users
    is global — schema.ts:13-29 has no country_code); CSRF N/A (header auth);
    rate-limiting N/A (internal endpoint). Audit-hole tradeoff re-stated:
    bridge is now mutation-capable from just email+displayName, reachable
    only via InternalAuthGuard-protected POST /v1/internal/users/ensure-linked.
    Confirmed one production caller (internal.controller.ts:113), zero callers
    in apps/bot/, apps/workers/, apps/web/, apps/web-next/; the external
    client (scripts/uat-seed.sh:215-251) shares the same token requirement.
    No new attack surface. Two non-blocking follow-ups noted for the audit
    trail (@Throttle gap pre-existing; optional info-level audit-log on
    CREATE). Gate does not fail.
  blocking_findings: []
  major_findings: []
  minor_findings:
    - "Pre-existing: InternalController lacks @Throttle (re-noted from wf-20260703-fix-064; shared-secret is de-facto rate gate). Not introduced by this fix."
    - "Optional: add info-level logger.log on successful no-local-row CREATE for audit-trail parity with the swallowed warn on failure."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```

---

### Summary line for the orchestrator

> [wf-20260704-fix-085] SecurityReviewer: **PASS-WITH-FINDINGS** —
> 0 blocking, 0 major, 2 minor (both pre-existing / optional).
> Audit-hole tradeoff re-stated and accepted: no public-surface caller,
> InternalAuthGuard holds, no weakening of any blocking invariant.
> Gate ready for QualityGate.
