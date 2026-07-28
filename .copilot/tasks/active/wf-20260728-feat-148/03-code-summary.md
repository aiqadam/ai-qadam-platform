# CodeDeveloper — Implementation Summary for FR-ADM-010

**Workflow:** wf-20260728-feat-148
**Agent:** CodeDeveloper

---

## Requirement Implemented

FR-ADM-010 — Platform admin bootstrap (no manual scripts). On every API
boot, if the Authentik group `aiqadam-super-admin` has zero members, the
new `AdminBootstrapService` creates exactly one seeded admin user directly
in Authentik via the existing `AuthentikClient`, assigns it to
`aiqadam-super-admin`, and attempts to force a password change on next
login via an Authentik user attribute. If the group already has ≥1
member, every subsequent boot is a no-op. No Postgres writes — the seeded
identity lives only in Authentik, per ADR-0021 §1. Implements the design
already worked out in `01-requirement-validation.md` and
`02-impact-analysis.md`; no deviation from the recommended plan (see Key
Design Decisions for the two areas that required judgment calls the prior
steps explicitly left open).

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` | New | `AdminBootstrapService implements OnModuleInit`. Checks `aiqadam-super-admin` membership count via `resolveGroupNames()`; if 0, creates the seeded user (recovering from a duplicate-email 4xx by falling back to `getUserByEmail()` rather than crash-looping), assigns the group, and patches the forced-password-change attribute. Degrades gracefully (WARN + skip) when `AuthentikClient.isConfigured()` is false or `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` is unset; all other Authentik failures propagate (crash boot loudly). |
| `apps/api/src/modules/admin-invites/authentik.client.ts` | Modified | Extracted `SUPER_ADMIN_GROUP = 'aiqadam-super-admin'` as an exported constant (previously duplicated privately in `super-admin.guard.ts`). Single source of truth now; natural shared home for FR-ADM-011's forward-compat needs per the impact analysis. |
| `apps/api/src/modules/admin-invites/super-admin.guard.ts` | Modified | Now imports `SUPER_ADMIN_GROUP` from `authentik.client.ts` instead of declaring its own private copy. No behavior change. |
| `apps/api/src/modules/admin-invites/admin-invites.module.ts` | Modified | Registered `AdminBootstrapService` in `providers`. No new `imports` needed (`AuthentikModule` already imported and exports `AuthentikClient`). No new module created — kept inside the existing `admin-invites` module boundary per the impact analysis's explicit recommendation. |
| `apps/api/src/config/env.ts` | Modified | Added `ADMIN_BOOTSTRAP_EMAIL` (optional, `.email()`-validated, defaults to `admin@aiqadam.org` — not a secret) and `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` (optional, `.min(12)`, no default — a genuine new secret, not covered by CLAUDE.md's dev/test `.env` exception). |
| `apps/api/.env.example` | Modified | Documented both new vars with a comment block matching the `AUTHENTIK_ADMIN_TOKEN` block's style. `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD=` left blank — no real value invented or committed. |
| `docs/04-development/architecture/auth-architecture.md` | Modified | New §9.5 "Platform-admin bootstrap (FR-ADM-010)" documenting the mechanism, the credential format/location (not a live value), the idempotency design, and an explicit, prominent flag that the forced-password-change attribute is unverified against live Authentik and that BP-UAT-020 is the follow-up verification point. Added a pointer row in §10's code-location table. |

No DB/migration, shared-types, frontend, bot, or worker changes — matches the impact analysis's scoping exactly.

---

## Key Design Decisions

1. **Bootstrap trigger: `OnModuleInit`, not an internal endpoint.**
   Adopted RequirementAnalyst's recommended default. Runs automatically
   on every boot including local `pnpm dev`, needs no new guard/route,
   and precedent already exists (`OutboxRelayService` in `TelegramModule`).

2. **Idempotency check keyed on group membership count, not seeded-email
   existence.** Implemented exactly as ImpactAnalyzer's risk flag
   specified: `resolveGroupNames(['aiqadam-super-admin'])[0]?.users.length ?? 0`.
   This closes the partial-failure gap (RequirementAnalyst's suggested
   AC-6) without a separate acceptance criterion — a `createUser()`
   success followed by a `setUserGroups()` failure leaves the group
   count at 0, so the next boot retries the full sequence rather than
   silently treating the orphaned user as "already bootstrapped."

3. **Duplicate-email recovery path.** `createOrRecoverSeedUser()` catches
   `AuthentikError` with a 4xx status from `createUser()` (mirroring the
   existing `authentik-client.spec.ts` "throws AuthentikError on 4xx" /
   `admin-invites-service.spec.ts` "maps Authentik 4xx... to 409" test
   pattern) and falls back to `getUserByEmail()` to recover the orphaned
   user, then continues the group-assignment + password-change-attribute
   steps on it. A 4xx with no matching existing user (an unexpected
   state) rethrows rather than silently no-op'ing.

4. **Failure propagation: let `OnModuleInit` throw and crash boot, except
   for the two explicitly-optional-config cases.** `AuthentikClient.isConfigured()`
   false and `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` unset both degrade
   gracefully (WARN + return) — same pattern as `AUTHENTIK_ADMIN_TOKEN`
   being unset elsewhere in this codebase. Every other failure (Authentik
   5xx, missing `aiqadam-super-admin` group, unexpected 4xx with no
   recoverable user) is logged at ERROR/thrown and propagates. I
   evaluated `main-bootstrap.spec.ts` as the "boot crashes loudly on
   an unrecoverable startup dependency failure" precedent the task brief
   pointed to — that test documents the OIDC-discovery-failure-crashes-boot
   behavior (a *different* eager-fetch-at-construction failure, not
   `OnModuleInit` specifically), but it establishes the same house style:
   unrecoverable boot-time infra failures are allowed to crash the
   process rather than being silently swallowed. I did not find a test
   that exercises `OnModuleInit` throwing specifically, so this is a
   reasoned extension of the established pattern, not a literally-verified
   precedent — flagging that distinction rather than overclaiming it.

5. **Forced-password-change mechanism: `patchAttributes()` with
   `ak_login_password_change_required`.** Used the existing
   `patchAttributes()` method (no new `AuthentikClient` method needed, as
   ImpactAnalyzer predicted). Per the task brief's explicit instruction,
   this is **NOT verified against a live Authentik instance** — no
   Testcontainers-Authentik double exists in this repo (confirmed by
   ImpactAnalyzer's Test Scope section) and I have no live Authentik
   instance available in this environment to verify against either. The
   attribute key is documented in a code comment on
   `FORCE_PASSWORD_CHANGE_ATTRIBUTE` (and mirrored in
   `auth-architecture.md` §9.5) as an unverified best-guess with an
   explicit fallback path (a provisioned password-expiry policy) if
   `BP-UAT-020` finds it wrong. I did not claim live verification
   anywhere in code or docs, per the task brief's explicit instruction
   not to.

6. **`ADMIN_BOOTSTRAP_EMAIL` as an env var, not a code constant.** Chose
   the env-var option ImpactAnalyzer flagged as CodeDeveloper's call —
   consistent with how `EMAIL_FROM` (a similarly non-secret, fixed
   identifier) is already handled in `env.ts`, and it keeps AC-5's
   "documented identically... across deployment configs" requirement
   satisfiable without a code deploy if the value ever needs to change.

7. **No audit-event emission added.** ImpactAnalyzer flagged
   `AuditEventsService.emit()` as a "low-cost, matches house style"
   optional strengthening, not a requirement. I left it out to keep the
   change minimal and in-scope — the FR's ACs don't require it, and
   `AuditEventsService` in this module is currently wired for
   request-time flows with an `actorId` (a human caller); a boot-time
   system action has no natural actor, which would need a design
   decision this FR doesn't ask for. Noting as a Known Limitation below
   rather than silently adding scope.

---

## Architecture Rule Compliance

- **Module boundaries:** `AdminBootstrapService` calls `AuthentikClient`
  via the existing exported provider from `AuthentikModule` (already
  imported into `AdminInvitesModule`). No direct reach into another
  module's entities/repositories, no new module, no circular import.
- **Tenant scoping / cross-schema queries:** N/A — no Postgres access at
  all in this flow; confirmed no Drizzle import, no `sql` tag, no schema
  touch.
- **Zod at boundaries:** The two new env vars are Zod-validated in
  `env.ts` (`.email()`, `.min(12)`, `.optional()`) — process env is an
  external-input boundary per `AGENTS.md`/`standards.md`.
- **No `any`:** Confirmed — `createOrRecoverSeedUser()`'s catch block
  types the error as `unknown` implicitly via `catch (err)` and narrows
  with `instanceof AuthentikError` / `instanceof Error`, matching the
  existing pattern elsewhere in this module.
- **No magic strings:** `SUPER_ADMIN_GROUP`, `FORCE_PASSWORD_CHANGE_ATTRIBUTE`,
  `BOOTSTRAP_USERNAME`, `BOOTSTRAP_DISPLAY_NAME` are all named constants.
- **Functions ≤60 lines:** `onModuleInit` (22 lines), `hasSuperAdminMember`
  (4 lines), `seedAdmin` (23 lines), `createOrRecoverSeedUser` (27 lines)
  — all well under the limit.
- **At least one assertion/validation per function:** `onModuleInit`
  validates `isConfigured()` and the password env var before proceeding;
  `seedAdmin` asserts the group was resolved (`if (!groupPk) throw`);
  `createOrRecoverSeedUser` asserts a recovered user exists before
  returning it.
- **Auth guard at controller level:** N/A — no new HTTP endpoint added
  (confirmed: zero new routes, matching the impact analysis's baseline).
- **Custom typed errors:** Reuses the existing `AuthentikError`; the one
  new `throw new Error(...)` (missing-group case) is an unrecoverable
  provisioning-config error with no natural typed-error class in this
  module's existing vocabulary — consistent with letting `OnModuleInit`
  crash boot loudly for this class of failure, per Key Design Decision 4.

---

## Formatter Check

- `pnpm --filter api typecheck` — **clean**, no errors.
- `pnpm --filter api lint` (`biome check .`) — **clean**: "Checked 296
  files in 96ms. No fixes applied."
- `pnpm --filter api build` (`nest build`) — **clean**, no errors.
- `pnpm biome check --write` on all 5 changed TS files — **no fixes
  applied**, confirming the code was already formatted per Biome's rules
  on first write.
- Existing test suites re-run to confirm no regression:
  `test/authentik-client.spec.ts` + `test/admin-invites-service.spec.ts`
  — 31/31 passed. `test/main-bootstrap.spec.ts` (full Nest module-graph
  boot smoke test) — 2/2 passed, confirming `AdminBootstrapService`'s
  addition to `AdminInvitesModule`'s providers doesn't break DI
  resolution or introduce a circular dependency.

No Python/bot changes — ruff/mypy not applicable to this workflow.

---

## Known Limitations

1. **Forced-password-change mechanism is unverified against live
   Authentik**, by design/necessity (see Key Design Decision 5). This is
   the single largest open risk in this implementation and is
   prominently flagged in three places: the code comment on
   `FORCE_PASSWORD_CHANGE_ATTRIBUTE`, `auth-architecture.md` §9.5, and
   this summary. `BP-UAT-020` must run against a real Authentik instance
   before this can be considered confirmed-working; until then, AC-1/AC-3
   are implemented-but-not-empirically-verified.
2. **No unit tests authored** — per this workflow's explicit scope,
   TestDesigner owns test authoring in a later step. I ran the existing
   suite to confirm no regression but wrote no new spec file.
3. **No audit-event emission** for the bootstrap action (see Key Design
   Decision 7) — an optional strengthening ImpactAnalyzer flagged as
   nice-to-have, not required by any AC. Could be added later without
   any architectural change if desired.
4. **RBAC-sync propagation timing unconfirmed** — ImpactAnalyzer flagged
   (not a blocker) that it's unverified whether creating the seeded user
   via `createUser()` + `setUserGroups()` fires the same Authentik
   notification `RbacSyncService` listens to, or whether the seeded
   account only appears in Directus/Plausible after the next nightly
   poll. Not addressed in this implementation — same reconciliation path
   every other Authentik-created account already goes through; flagging
   forward per the impact analysis's own note.
5. **`OnModuleInit`-throws-and-crashes-boot precedent is a reasoned
   extension, not a literally-matching existing test** (see Key Design
   Decision 4) — worth SecurityReviewer/QualityGate double-checking that
   this is the desired behavior for a provisioning-config error (missing
   `aiqadam-super-admin` group) rather than a softer degrade.

---

## Gate Result

```yaml
gate_result:
  agent: code-developer
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    Implemented FR-ADM-010 exactly per the impact analysis's plan: new
    AdminBootstrapService (OnModuleInit) in the existing admin-invites
    module, idempotency keyed on aiqadam-super-admin group membership
    count (not seeded-email existence) per the risk-flag recommendation,
    duplicate-email recovery path for the partial-failure edge case,
    graceful degradation when AuthentikClient is unconfigured or
    ADMIN_BOOTSTRAP_DEFAULT_PASSWORD is unset, and a shared SUPER_ADMIN_GROUP
    constant extracted from super-admin.guard.ts into authentik.client.ts.
    Two new env vars added (ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_DEFAULT_PASSWORD)
    with no real secret value invented or committed anywhere. auth-architecture.md
    §9.5 documents the mechanism per AC-5, explicitly flagging the forced-
    password-change attribute as unverified against live Authentik and
    naming BP-UAT-020 as the follow-up verification point, matching the
    task brief's explicit honesty-in-comments requirement. typecheck,
    lint, and build all pass clean; existing test suites (31 unit tests +
    2 boot-smoke tests) pass with no regression. No new tests authored
    (TestDesigner's scope). No DB/shared-types/frontend/bot/worker changes,
    matching the impact analysis's scoping.
  files_changed:
    - apps/api/src/modules/admin-invites/admin-bootstrap.service.ts
    - apps/api/src/modules/admin-invites/authentik.client.ts
    - apps/api/src/modules/admin-invites/super-admin.guard.ts
    - apps/api/src/modules/admin-invites/admin-invites.module.ts
    - apps/api/src/config/env.ts
    - apps/api/.env.example
    - docs/04-development/architecture/auth-architecture.md
  typecheck: passed
  lint: passed
  build: passed
  formatter_check: clean
  existing_tests: "31/31 unit + 2/2 boot-smoke passed, no regression"
  architecture_rule_violations: none
  known_limitations:
    - "Forced-password-change Authentik attribute is unverified against a live instance — BP-UAT-020 is the designated follow-up verification point, documented in code comment + auth-architecture.md §9.5."
    - "No audit-event emission for the bootstrap action (optional strengthening, not required by any AC)."
    - "RBAC-sync propagation timing for the seeded account is unconfirmed (pre-existing ImpactAnalyzer flag, not new to this implementation)."
  next_agent: security-reviewer
```
