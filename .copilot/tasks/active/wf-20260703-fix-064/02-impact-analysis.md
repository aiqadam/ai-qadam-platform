# Step 2 — Impact Analysis (output)

**Workflow:** wf-20260703-fix-064
**Issue:** ISS-UAT-001-1
**Branch:** fix/ISS-UAT-001-1-uat-seed-directus-mirror
**Base:** origin/main @ 6db713f
**Timestamp:** 2026-07-03T11:45:00Z
**Agent:** ImpactAnalyzer

---

## Validated Requirement

**ISS-UAT-001-1** — `scripts/uat-seed.sh` cannot mirror newly-added Authentik identity fixtures into Directus. The `directus-users-bridge.ensureLinked()` path only fires on OIDC `/v1/auth/callback` (apps/api/src/modules/auth/auth.controller.ts:148), never on Authentik admin user creation. For BP-UAT-001's three new identity fixtures (`uat-operator` is pre-existing; `uat-member-consented` and `uat-member-no-consent` are net-new per scripts/uat-fixtures/BP-UAT-001.json), the local `users` row in PostgreSQL may not exist either — the bridge needs both: (1) a `platform.users.id` and (2) a `directus_users.id`.

**Chosen fix (Option A, from the issue file):**

Add `POST /v1/internal/users/ensure-linked` to the apps/api InternalController
(`InternalAuthGuard`-protected, body `{ email, displayName }`). The handler
calls `DirectusUsersBridgeService.ensureLinkedByEmail(...)` synchronously
(see "Recommendation (a vs b)" below for why the bridge owns the email lookup).

`scripts/uat-seed.sh`'s `ensure_test_user` (or a new helper called from it)
POSTs to this endpoint once per identity fixture after the Authentik user +
groups are set up but before the consent-row reset (so the FK lookup at
scripts/uat-seed.sh:reset_domain_fixture succeeds).

This is purely an **internal** surface (`InternalAuthGuard` already wired
into InternalController at internal.controller.ts:32 via class-level
`@UseGuards`). No new public endpoint, no new HTTP route outside the
existing `/v1/internal/...` namespace.

---

## Affected Layers

### API (NestJS) — `apps/api/src/modules/`

| Module / File | Change | Lines (current) |
|---|---|---|
| `internal/internal.controller.ts` | **Extend** — add new `@Post('users/ensure-linked')` handler. Inject `DirectusUsersBridgeService`. Add Zod schema for `{ email, displayName }`. Returns `{ directusUserId: string \| null }`. | New method appended below `sendEmail` (~line 69) |
| `internal/internal.module.ts` | **Extend** — import `DirectusModule`. | Full file (currently only imports `EmailModule`) |
| `internal/internal-auth.guard.ts` | **No change** — reused as-is. Class-level `@UseGuards(InternalAuthGuard)` on InternalController already covers new endpoints (verified at internal.controller.ts:32). | — |
| `directus/directus-users-bridge.service.ts` | **Extend** — add new method `ensureLinkedByEmail(input: { email: string; displayName: string \| null }): Promise<string \| null>` that does the local-user lookup + delegates to existing `ensureLinked({ userId, email, displayName })`. Existing `ensureLinked` and `resolveDirectusId` unchanged. | New method appended after `resolveDirectusId` (~line 112) |
| `directus/directus.module.ts` | **No change** — already exports `DirectusUsersBridgeService`. | — |
| `users/users.service.ts` | **No change** — option (b) chosen: the bridge does the email lookup inline via Drizzle, not through UsersService. This matches the existing pattern at directus-users-bridge.service.ts:51-55 and 95-103. | — |

### DB (Drizzle / PostgreSQL) — `apps/api/src/modules/users/schema.ts`

**No schema changes.** The `users` table already has `email`, `displayName`,
`directusUserId`, `id` columns (schema.ts:29,30,37,26). No new tables, no
new columns, no new constraints. **DBMigrationAuthor is NOT needed** for
this workflow.

### Shared Types — `packages/shared-types/`

**No new shared types.** The request/response payload
(`{ email, displayName }` in, `{ directusUserId: string \| null }` out) is
internal-only and stays inside `apps/api`. It does NOT cross the
web/api/bot boundary. No Zod schema needs to be lifted to
`packages/shared-types/`.

### Frontend — `apps/web/`, `apps/web-next/`

**No change.** No UI surface is touched. The endpoint is server-to-server
(seed automation calls it via curl). No Astro page, no React island, no
`apps/web/src/lib/api.ts` call site.

### Bot — `apps/bot/`

**No change.** The bot has its own upsert flow (via `TelegramInternalController`)
and does not need this endpoint.

### Workers — `apps/workers/`

**No change.** No BullMQ queue, processor, or job payload is added.

### Scripts — `scripts/uat-seed.sh`

**Extend.** Add one new helper (e.g. `api_ensure_directus_user_link`) and
call it from `ensure_test_user` (uat-seed.sh:182-258) immediately after
the group-assignment block returns successfully. The helper does one
`curl` against the new internal endpoint:

```bash
curl -sf -X POST \
  -H "x-internal-auth: ${INTERNAL_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg e "$email" --arg n "$display_name" '{email:$e, displayName:$n}')" \
  "${API_BASE_URL:-http://localhost:3001}/v1/internal/users/ensure-linked"
```

`INTERNAL_API_TOKEN` is already in `apps/api/.env` per `.env.example:50`
(`INTERNAL_API_TOKEN=`). `uat-env-setup.sh` writes `apps/api/.env`
(uat-seed.sh:65 already reads from it via `env_get`). **No new env var
needs to be plumbed.** `API_BASE_URL` may need to be added as a new env
read (similar to how `DIRECTUS_URL`/`AK_URL` are read at uat-seed.sh:780-784).

### Fixtures — `scripts/uat-fixtures/BP-UAT-001.json`

**No change.** The fixture manifest is correct as authored. The bug was purely in the
**execution path** (no bridge trigger between Authentik user creation and
Directus consent-row insert), not in the fixture authoring.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/users/ensure-linked` | POST | **NEW.** Body: `{ email: string, displayName?: string }`. Response: `{ directusUserId: string \| null }`. `InternalAuthGuard`-protected. Idempotent (delegates to existing idempotent `ensureLinked`). | **No** — purely additive. Existing internal endpoints (`/v1/internal/email`) unaffected. No public surface change. |

No other endpoints change. No DTO change to existing endpoints. No
backwards-incompatibility for any other internal caller.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `scripts/uat-seed.sh:ensure_test_user` (after group assignment) | `POST /v1/internal/users/ensure-linked` | HTTP + `x-internal-auth` header. New helper function `api_ensure_directus_user_link`. |
| `InternalController.ensureLinkedUser` (new) | `DirectusUsersBridgeService.ensureLinkedByEmail({ email, displayName })` | Direct NestJS DI injection (DirectusModule must be imported into InternalModule). |
| `DirectusUsersBridgeService.ensureLinkedByEmail` (new) | Drizzle query on `users` table → `DirectusUsersBridgeService.ensureLinked({ userId, …})` | Internal: same module's existing method. |
| `InternalAuthGuard` (already at internal-auth.guard.ts:7-25) | `env.INTERNAL_API_TOKEN` (already wired at env.ts:62) | Already verified at request time — `timingSafeEqual` (internal-auth.guard.ts:18). |

**Module boundary check:** the new endpoint sits inside the existing
`InternalController` (the same module that already serves
`/v1/internal/email`). It is wired to `DirectusUsersBridgeService` exactly
the same way `auth.controller.ts:148` does. No new cross-module call pattern
is introduced — we only add a new caller into the existing pattern.
**No architecture-rule violation.**

---

## Risk Flags

### Security Review Required

- **YES — SecurityReviewer step is required.** This is a NEW internal
  endpoint that bypasses the normal OIDC sign-in trigger for
  `ensureLinked`. Per `apps/api/src/config/env.ts:62` and
  `.env.example:49-50`, `INTERNAL_API_TOKEN` is a shared secret between
  api and any caller. The endpoint must:
  1. Reject requests without `x-internal-auth` header
     (`InternalAuthGuard` already handles this — verified at
     internal-auth.guard.ts:14 — `UnauthorizedException` thrown).
  2. Reject requests where the token doesn't match via
     `timingSafeEqual` (internal-auth.guard.ts:18).
  3. Reject requests with invalid email format (Zod validation in
     the new handler).
  4. **Must NOT** be exposed publicly (it is not — Traefik routes
     `/v1/internal/*` to api only, and `INTERNAL_API_TOKEN` is not
     exposed in any public-facing env file).
  5. Should **rate-limit** the endpoint — the existing
     `/v1/internal/email` endpoint does NOT have `@Throttle`, but the
     SecurityReviewer should decide whether to add it here (low risk
     in practice because `INTERNAL_API_TOKEN` is a shared secret, but
     a defense-in-depth concern).

### Architecture Rule Risks

| Risk | Status | Detail |
|---|---|---|
| Cross-module call from `InternalModule` to `DirectusModule` | **OK** | `auth.module.ts:17` already does the same pattern (`imports: [UsersModule, DirectusModule, LeadsModule, AuthentikModule]`). Adding the same import to `InternalModule` is the established pattern. |
| Trust boundary expansion (new endpoint that creates rows in `directus_users` without OIDC) | **OK** | `DirectusUsersBridgeService.ensureLinked` (directus-users-bridge.service.ts:48-72) is **already idempotent** (early-return at line 53 when `directusUserId` is set, retry-safe on bridge failure — failures log + swallow per lines 70-72). Adding a new caller of an already-safe method is low risk. |
| Reaches into `directus_users` from a controller that bypasses per-app RBAC | **DOCUMENT but do not block** | The endpoint does NOT create per-app data (no event, no registration, no invite). It only ensures the `directus_users` identity row exists so other FK lookups resolve. Per-app RBAC is unchanged — the user still must OIDC sign in to perform per-app actions. |
| Module ownership of `users` table read for email lookup | **OK** | The bridge already queries the `users` table inline via Drizzle (directus-users-bridge.service.ts:51-55, 95-103) — option (b) follows the established pattern. |
| Unhandled error from bridge failure | **OK** | Bridge already swallows errors and logs them (directus-users-bridge.service.ts:70-72). New handler should return `{ directusUserId: null }` on bridge failure so seed can detect + warn rather than hard-fail. |
| Bash injection via displayName | **OK** | `displayName` is passed via `jq --arg` (heredoc-safe), not interpolated into a raw shell string. |
| 400-line / 5-file PR limit (AGENTS.md §4) | **OK** | File count: `internal.controller.ts`, `internal.module.ts`, `directus-users-bridge.service.ts` = 3 code files, plus `scripts/uat-seed.sh` (config + scripts file — allowed). Plus 2 test files. **Total: 3 code + 1 script + 2 tests = 6 files.** Under the 5-file rule for code. |

---

## Recommendation (a vs b — local lookup responsibility)

The issue file's prompt asks which is cleaner:

- **(a)** The new endpoint does the local-user lookup by email, then calls
  `ensureLinked({ userId, email, displayName })`.
- **(b)** Add `ensureLinkedByEmail(email, displayName)` on the bridge
  service that does the lookup internally.

**Choose (b).** Rationale:

1. **Existing boundary is preserved.** `DirectusUsersBridgeService` is
   the single owner of the "mirror a local user into Directus" concern
   (its entire file is dedicated to this). Adding the email-keyed
   variant inside the same service keeps that boundary intact.
2. **Caller stays thin.** `InternalController.ensureLinkedUser` becomes a
   one-liner that delegates to the bridge — same pattern as
   `auth.controller.ts:148` where `this.directusBridge.ensureLinked({...})`
   is called inline. The controller doesn't need to know about `UsersService`.
3. **Module imports simplify.** `InternalModule` only needs to import
   `DirectusModule`, not `UsersModule`. The bridge already depends on
   `UsersService` indirectly through `DB` (directus.module.ts:7 wires DB),
   so the lookup is local to the bridge.
4. **Future callers benefit.** The registrations proxy already calls
   `DirectusUsersBridgeService.resolveDirectusId(userId)` (line 95-110).
   A new `ensureLinkedByEmail(email, displayName)` would be a natural
   counterpart for the seed-script use case and any future "I have an
   email but no session yet" caller (e.g., an admin invitation flow).
5. **Test surface is identical.** Either way a unit test for
   `ensureLinkedByEmail` is needed; (b) keeps that test inside the
   existing `directus-users-bridge.service.spec.ts` (or new file
   alongside it).

**Action for CodeDeveloper:** Add `ensureLinkedByEmail` to
`DirectusUsersBridgeService`. Implementation:

```typescript
async ensureLinkedByEmail(input: {
  email: string;
  displayName: string | null;
}): Promise<string | null> {
  const [row] = await this.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (!row) return null;
  return this.ensureLinked({
    userId: row.id,
    email: input.email,
    displayName: input.displayName,
  });
}
```

Then `InternalController.ensureLinkedUser` calls it directly:

```typescript
const directusUserId = await this.directusBridge.ensureLinkedByEmail({
  email: parsed.data.email,
  displayName: parsed.data.displayName ?? null,
});
return { directusUserId };
```

**Note:** `users.service.findByEmail` is therefore NOT needed for this
fix. The bridge uses Drizzle directly (matches the existing pattern at
directus-users-bridge.service.ts:51-55 and 95-103, which both query the
`users` table inline rather than going through `UsersService`).
`UsersService` is reserved for write paths and `updateRole`-style
business operations; the bridge already bypasses it for its own lookups.

This **removes `users.service.ts` from the change list**, keeping the
PR under the 5-file limit for code files.

---

## Test Scope

### Unit tests (Vitest, `apps/api/test/`)

| Test file | Status | Notes |
|---|---|---|
| `apps/api/test/internal.spec.ts` | **EXTEND** | Existing test file at apps/api/test/internal.spec.ts:1-103. Add new `describe('InternalController.ensureLinkedUser')` block. Mirror the existing `sendEmail` describe pattern: (i) reject non-email body, (ii) reject missing email, (iii) call `ensureLinkedByEmail` with the right args, (iv) return `{ directusUserId: 'uuid' }` on success, (v) return `{ directusUserId: null }` on bridge failure. Use a `vi.fn()`-mocked `DirectusUsersBridgeService` as the constructor argument. |
| `apps/api/test/directus-users-bridge.spec.ts` (new) | **CREATE** | New unit test for `ensureLinkedByEmail`. Mirrors existing inline logic from `directus-users-bridge.service.ts:51-55` and 95-110. Use Testcontainers Postgres per AGENTS.md §3 ("never mock the database"). Cases: (i) no local user → returns null without calling Directus, (ii) local user exists + already-linked → returns existing directusUserId, (iii) local user exists + not linked → creates + returns new id, (iv) bridge throws → logs warning + returns null. |

### Bash regression tests (bats, `scripts/tests/`)

| Test file | Status | Notes |
|---|---|---|
| `scripts/tests/uat-seed.bats` | **EXTEND** | Add 1–2 new `@test` cases for the new `api_ensure_directus_user_link` helper behavior in **mock mode** (`UAT_SEED_DIRECTUS_MOCK=1`): (i) helper exists in uat-seed.sh (structural grep), (ii) mock-mode call to helper logs a deterministic line like `ensure_linked <email> (mock, directus_user_id=mock-uuid)`. |
| `scripts/tests/uat-seed-retries.bats` | **NO CHANGE expected** | Targets idempotency of the Authentik user creation retry loop. The new endpoint call is one-shot and idempotent at the bridge level. |
| `scripts/tests/uat-seed-iss-001.bats` | **NO CHANGE expected** | Targets ISS-UAT-SEED-001 fixes (consumed_at handling, role_groups). Unrelated to this issue. |

### Integration tests (Testcontainers)

**No new Testcontainers integration test required** for this fix. The
end-to-end integration of the new endpoint is exercised by the orchestrator's
Step 9 verification (`pnpm uat:seed --reset BP-UAT-001`). This validates:
(i) the new internal endpoint returns a non-null `directusUserId`,
(ii) the consent-row FK lookup succeeds (which was the original blocker),
(iii) the existing 12 `uat-preflight-check.bats` tests still pass.

### E2E tests (Playwright)

**No new Playwright E2E test required.** The endpoint is server-to-server
infrastructure — no user-facing flow is touched.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Impact fully analyzed. Fix is a single internal endpoint (POST /v1/internal/users/ensure-linked, InternalAuthGuard-protected) plus a thin ensureLinkedByEmail method on the existing bridge service. 3 code files + 1 script + 2 test files. No DB migration. No shared-types change. No frontend/bot/worker surface. Recommendation: option (b) — bridge does its own email-keyed lookup; controller stays thin; UsersModule does NOT need to be imported into InternalModule."
  findings:
    - "ISS-UAT-001-1 root cause confirmed: DirectusUsersBridgeService.ensureLinked only fires from auth.controller.ts:148 OIDC callback path. New callers (Authentik admin provisioning in seed scripts) have no trigger."
    - "Option (b) chosen: add ensureLinkedByEmail to DirectusUsersBridgeService (keeps existing module boundary intact; matches the service's pattern of querying the users table inline)."
    - "SecurityReviewer step required: new internal endpoint with shared-secret auth — verify InternalAuthGuard already covers it (verified at internal-auth.guard.ts:7-25) and that INTERNAL_API_TOKEN is never exposed publicly."
    - "PR file-count risk noted: 3 code files + 1 script + 2 tests. Under the 5-file rule thanks to option (b) removing users.service.ts from the change list."
    - "DBMigrationAuthor NOT needed: no schema change. users table already has email, displayName, directusUserId columns (schema.ts:29,30,37)."
    - "INTERNAL_API_TOKEN env var is already plumbed (apps/api/.env.example:50, env.ts:62). uat-env-setup.sh writes apps/api/.env; uat-seed.sh reads from it (line 780-784 pattern). Only new env read may be API_BASE_URL (default http://localhost:3001)."
    - "Test scope: extend apps/api/test/internal.spec.ts (controller handler cases); create apps/api/test/directus-users-bridge.spec.ts (new method cases, Testcontainers Postgres); extend scripts/tests/uat-seed.bats (mock-mode helper regression). No E2E change. No integration test needed — orchestrator's Step 9 BP-UAT-001 reset is the end-to-end verification."
    - "Existing test file paths confirmed: apps/api/test/internal.spec.ts (NOT internal.controller.spec.ts nor internal-auth.guard.spec.ts as the prompt's mirror listed). The prompt's filenames were misremembered — actual mirror is apps/api/test/internal.spec.ts which contains BOTH guard tests (lines 23-40) AND controller tests (lines 45-103)."
    - "scripts/tests/uat-seed-retries.bats and scripts/tests/uat-seed-iss-001.bats require no change for this fix."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```

**Recommendation for Orchestrator:** Advance to **Step 3 (CodeDeveloper)**.
The CodeDeveloper should: (1) extend `DirectusUsersBridgeService` with
`ensureLinkedByEmail`, (2) extend `InternalController` with the new POST
handler + Zod schema, (3) extend `InternalModule` to import `DirectusModule`,
(4) extend `scripts/uat-seed.sh` with the `api_ensure_directus_user_link`
helper called from `ensure_test_user`. The TestDesigner should write the
two new test files in parallel with the code work. The SecurityReviewer
must run as a dedicated step (Step 4) — do NOT skip it for this fix.