# Step 3 — Code Summary

**Workflow:** wf-20260704-fix-085
**Issue:** ISS-UAT-BRIDGE-001 (blocker, api/directus-bridge)
**Branch:** `fix/ISS-UAT-BRIDGE-001-bridge-no-local-row-fallback` (base `698c8d9`)
**Timestamp:** 2026-07-04
**Agent:** CodeDeveloper

---

## Requirement Implemented

[ISS-UAT-BRIDGE-001](.copilot/issues/ISS-UAT-BRIDGE-001.md) Option A: relax the
public contract of `DirectusUsersBridgeService.ensureLinkedByEmail` so the
bridge no longer short-circuits with `null` when no `platform.users` row
exists. The method now:

1. **Local-row path** (unchanged): if a `platform.users` row exists for the
   email, delegate to `ensureLinked` so idempotency, link-back-write, and
   swallow semantics stay identical to the userId-keyed path.
2. **No-local-row path** (new): call the existing private `findOrCreate`
   directly — the Directus mirror can be created from just an email +
   displayName. The link-back write into `platform.users` is skipped
   because there is no row to update. Directus failures on this branch
   are logged with `warn` and swallowed, matching `ensureLinked`'s pattern
   at `:67-72`.

This unblocks the `scripts/uat-seed.sh` `reset_domain_fixture` path: freshly
seeded Authentik fixtures (`uat-member-c@aiqadam.test`, `uat-member-nc@aiqadam.test`)
exist in Authentik but never in `platform.users` (no OIDC sign-in has
fired), so today `ensureLinkedByEmail` returns `null` and the
`member_consents.member` FK lookup fails. After the fix the bridge creates
the Directus mirror and returns its id, letting the consent-row reset
proceed.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| [apps/api/src/modules/directus/directus-users-bridge.service.ts](apps/api/src/modules/directus/directus-users-bridge.service.ts) | modify | Rewrote body of `ensureLinkedByEmail` (`:125-167`) per the Option A sketch: local-row fast path delegates to `ensureLinked`; no-local-row path calls private `findOrCreate` with swallow-and-warn. Updated JSDoc block to document the new two-branch contract. No new imports, no signature change. |
| [apps/api/test/directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts) | modify | Rewrote the first `ensureLinkedByEmail` test case (old `:215-239`, now `:215-249`) to assert the new contract: no-local-row + no-Directus-row → `get` fires, `post /users` fires with `{ provider: 'authentik', external_identifier: email, status: 'active' }`, returns the new id, **no link-back write** (`db.select().from(users).where(eq(users.email, …))` returns zero rows). Three existing tests (`:251-313`) unchanged. Appended three new tests (`:315-376`) covering no-local-row + backfill (mismatched provider), no-local-row + GET throws, no-local-row + POST throws. |

## Key Design Decisions

- **Option A over Option B** (per issue file): the bridge owns the right
  abstraction ("ensure the Directus mirror exists"). Option B would have
  pushed seed-flow state into `platform.users` from bash, which couples
  bash to the Drizzle schema. Option A is one file, one method,
  ~15 lines.
- **Reuse the existing private `findOrCreate`** instead of duplicating its
  GET/POST logic into `ensureLinkedByEmail`. `findOrCreate` already does
  the email-keyed Directus lookup, the POST with `provider: 'authentik'`,
  and the backfill call to `maybeBackfill`. Calling it directly on the
  no-local-row branch means the no-local-row path automatically inherits
  the existing backfill semantics (e.g., the third new test asserts
  `patch /users/<id>` with `{ provider, external_identifier }`).
- **Skip the link-back write** (no `db.update(users).set({...})` on the
  no-local-row branch): there is no local row, so there is nothing to
  update. This matches the "best-effort" framing of the issue file.
- **Swallow-and-warn on Directus failure** mirrors the existing
  `ensureLinked` pattern at `:67-72`: same log prefix
  `[directus-bridge]`, same `err instanceof Error ? err.message : 'unknown'`
  coercion. The controller at
  [internal.controller.ts:113](apps/api/src/modules/internal/internal.controller.ts#L113)
  already treats `null` as a soft warning (response shape
  `{ directusUserId: string | null }`), so no caller-side change is needed.
- **No string-literal extraction** (`'authentik'`, `'active'`, `'/users'`):
  these live inside `findOrCreate`, not in the rewritten method. Keeping
  the rewritten method's literals identical to the existing pattern at
  `:71` preserves consistency with the rest of the file.
- **Tests use the existing `makeBridge` / `FakeDirectus` / `seedUser`
  helpers** (no shared-helper extraction): keeps the diff small per
  AGENTS.md §4. Testcontainers Postgres is unchanged (per AGENTS.md §3:
  "never mock the database").

## Architecture Rule Compliance

| Rule (AGENTS.md / architecture.md) | Status | Evidence |
|---|---|---|
| Typed I/O, no `any`, Zod at boundaries | **OK.** Bridge signature unchanged: `{ email: string; displayName: string \| null } → Promise<string \| null>`. Input validation is the controller's responsibility (Zod at [internal.controller.ts:54-58](apps/api/src/modules/internal/internal.controller.ts#L54-L58)); service trusts its inputs. | `:159-167` of the rewritten file. |
| Custom typed errors | **OK / unchanged.** `findOrCreate` already throws `DirectusError` (re-exported at the bottom of the file). The new try/catch branch narrows with `err instanceof Error`. | `:174-181`. |
| All promises awaited | **OK.** `await this.findOrCreate(...)`, `await this.db.select(...).limit(1)`. | `:163-166, 172`. |
| Drizzle-only queries; parameterized | **OK.** Only `db.select({ id: users.id }).from(users).where(eq(users.email, …))`. No raw SQL. | `:163-166`. |
| Tenant scoping | **OK / unchanged.** `platform.users` is global (no `country_code` column per [schema.ts:13-29](apps/api/src/modules/users/schema.ts#L13-L29)). Directus writes also operate on the global `directus_users` collection. No new cross-tenant flow introduced. | Impact report §"Multi-tenant boundary". |
| Cross-module boundary | **OK.** Bridge stays inside `DirectusModule`; the controller wiring at [internal.controller.ts:35](apps/api/src/modules/internal/internal.controller.ts#L35) is unchanged. No new module imports, no circular-import risk. | Impact report §"Affected Modules / Layers". |
| Auth at controller level | **OK / unchanged.** `InternalAuthGuard` class-level guard at [internal.controller.ts:39-40](apps/api/src/modules/internal/internal.module.ts) pre-existing. Service does not enforce auth. | Pre-existing. |
| Rate limiting | **OK / unchanged.** Internal endpoint is not public; per-impact-report, the missing `@Throttle` is a **pre-existing** observation tracked separately (not introduced by this fix). | Pre-existing. |
| No secrets in logs | **OK.** Warn log emits only the email + `err.message`. No tokens, no passwords, no full request bodies. Matches existing `:71` pattern. | `:176-180`. |
| Small PR rule (≤400 lines, ≤5 code files) | **OK.** 2 files modified; production diff is ~25 lines net (old body removed, new body + comment added); test diff adds ~70 lines (1 rewrite + 3 new tests). | See Files Changed. |
| Zero warnings policy (`strict: true`) | **OK.** `pnpm --filter @aiqadam/api typecheck` clean. | Validation below. |

## Formatter Check

```bash
$ pnpm biome check --apply apps/api/src/modules/directus/directus-users-bridge.service.ts apps/api/test/directus-users-bridge.spec.ts
Checked 2 files in 8ms. No fixes applied.
```

Two changed files are biome-clean (no fixes applied, no warnings). The
`pnpm --filter @aiqadam/api lint` run surfaces 4 pre-existing warnings in
files I did not touch (`db/migrate.ts:57`, `telegram-tg-config-service.spec.ts:187`,
`telegram-auth-guard.spec.ts:100`, `telegram-preferences-service.spec.ts:191`)
— all stale `biome-ignore` suppressions, all unrelated to this fix. Per the
task constraint "Do NOT touch any file other than the two listed", those
are out of scope here.

## Validation

```bash
$ pnpm --filter @aiqadam/api typecheck
> tsc --noEmit
(no output → success)

$ pnpm --filter @aiqadam/api lint
Checked 290 files in 97ms. No fixes applied.
Found 4 warnings.   ← all pre-existing, in unrelated files

$ pnpm biome check apps/api/src/modules/directus/directus-users-bridge.service.ts apps/api/test/directus-users-bridge.spec.ts
Checked 2 files in 5ms. No fixes applied.   ← my two files: zero warnings, zero fixes
```

`pnpm vitest` is intentionally **not** run here per the task constraint;
that is the TestRunner's job at Step 8 (which is what
[.copilot/agents/code-developer.md](.copilot/agents/code-developer.md) calls
"the TestRunner's job" in its validation checklist).

## Known Limitations

- **Audit-hole tradeoff** (already documented in the issue file): before
  this fix, `ensureLinkedByEmail({email})` was a strict
  read-no-side-effect when no local row existed — a security audit could
  lean on that to assert "the bridge cannot create a Directus row for a
  user that doesn't exist locally." The fix **removes that property**.
  Mitigations are unchanged from the impact report: the endpoint is
  `InternalAuthGuard`-protected (`INTERNAL_API_TOKEN`, shared secret,
  gitignored), so the no-local-row-create capability is not reachable
  from public callers. The SecurityReviewer step (Step 5) is required to
  re-state this tradeoff.
- **`first_name` authority drift** (pre-existing, not introduced): when
  the no-local-row branch creates a Directus row, `first_name` is set
  from `displayName ?? null` (`:87`). A later admin-invitation flow with
  a different displayName will not re-PATCH `first_name` (the existing
  `maybeBackfill` only patches `provider` and `external_identifier`).
  Out of scope for this fix.
- **Test 1 wording** (intentional): the rewrite drops the literal phrase
  "returns null when no local user exists" because the new contract
  returns an id, not null. The replacement name — *"creates the Directus
  row and returns the id when no local user exists (no link-back write)"*
  — preserves the original test's intent (no local row → bridge
  behavior) while documenting the new outcome. Suggested for TestDesigner
  review at Step 7 if the test-naming convention prefers the original
  phrase preserved in any form.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Option A of ISS-UAT-BRIDGE-001 implemented. Single-method rewrite
    in apps/api/src/modules/directus/directus-users-bridge.service.ts
    (ensureLinkedByEmail + JSDoc), ~25 net production lines plus 1 test
    rewrite and 3 new tests in apps/api/test/directus-users-bridge.spec.ts.
    No DB migration, no schema change, no cross-module wiring, no
    controller change, no shared-types change, no new dependencies.
    Local-row path delegates to ensureLinked (idempotency + link-back
    preserved); no-local-row path calls findOrCreate directly with
    swallow-and-warn. Typecheck clean, biome clean on the two changed
    files, 4 pre-existing biome warnings in unrelated files (out of
    scope per task constraint). TestRunner step (8) and SecurityReviewer
    step (5) still required.
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```