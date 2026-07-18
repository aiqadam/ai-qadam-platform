# Step 2 — Impact Analysis: ISS-USR-REG-001

> Output for: `.copilot/tasks/active/wf-20260718-fix-122/02-impact-analysis.md`
> Agent: ImpactAnalyzer
> Workflow: wf-20260718-fix-122

---

## Validated Requirement

**ISS-USR-REG-001** — Implement AI-Qadam-branded self-registration. A visitor
lands on a custom (not Authentik-hosted) sign-up page, submits email +
password + country, and the platform provisions a full member account:
Authentik user created with a password set, assigned to the `aiqadam-member`
Authentik group (role: member), and a country selection written to their
Directus member row. Per the issue's pre-clarified scope (GitHub #28, three
binding decisions):

1. "Chapter" = the existing country tenant selector — no new entity.
2. "Subscribed user" = full member (`aiqadam-member` group), not a new
   subscription tier.
3. UI = a custom AI-Qadam-branded page, not a redirect to Authentik's
   generic hosted form.

---

## Affected Layers

### API (NestJS)

| Layer | Module | Change |
|---|---|---|
| Controller | `apps/api/src/modules/auth/auth.controller.ts` | Add `POST /v1/auth/register` to the existing `AuthController` (same controller as `login`/`callback`/`telegram/exchange` — do not create a new module; `AuthModule` already imports everything needed: `AuthentikModule`, `UsersModule`, `DirectusModule`). |
| Service | New: `apps/api/src/modules/auth/registration.service.ts` (or a method block added to `auth.service.ts` — see recommendation below) | Orchestrates: duplicate-email check → `AuthentikClient.createUser()` → `AuthentikClient.setPassword()` → resolve+assign `aiqadam-member` group → write country to the Directus member row → (optionally) auto-establish a session. |
| Dependency | `apps/api/src/modules/admin-invites/authentik.client.ts` | No changes needed — `createUser`, `setPassword`, `resolveGroupNames`, `setUserGroups` all already exist and are exactly the right shape. `AuthentikModule` must be imported into `AuthModule` if not already (**it already is**, `auth.module.ts:3,17`). |
| Dependency | `apps/api/src/modules/directus/directus-users-bridge.service.ts` and/or `directus.client.ts` | Country write happens on the Directus `directus_users` row (`country` field — see DB Changes section), not on `platform.users`. `DirectusModule` is already imported into `AuthModule` (`auth.module.ts:17`). |
| Recommendation | — | **Add a new `RegistrationService`** rather than growing `AuthService` or `TelegramAuthService` further — registration has a distinct failure-handling shape (partial-Authentik-provisioning rollback, duplicate-email 202-style response) that doesn't belong mixed into the OIDC flow class. Register it as a provider in `auth.module.ts`, matching how `TelegramAuthService` is already sited in the same module. |

### DB Changes Required

**No local Postgres schema change to `platform.users`.** Reasoning (read `apps/api/src/modules/users/schema.ts` in full, all 45 lines):

- The `users` table (`apps/api/src/modules/users/schema.ts:26-41`) has exactly: `id`, `authentikSubject`, `email`, `displayName`, `handle`, `role` (enum, default `'member'`), `directusUserId`, `createdAt`, `updatedAt`, `lastLoginAt`. **There is no `is_temporary` column and never has been** — that flag exists only as an Authentik `attributes.is_temporary` value (`telegram-auth.service.ts:213`), never mirrored locally. The issue's scope decision phrase "`is_temporary: false`" is accurate as an *outcome* (the registration flow simply never sets that Authentik attribute) but is not a local column to write.
- `role` **is** a local column, but per `auth.service.ts:335` and `auth.controller.ts:330-336`, the *authoritative* role/permission signal is the `groups[]` claim decoded from the Authentik `id_token` at every `/refresh` — not the `platform.users.role` column. That column is set once at row-insert time (`users.service.ts` `upsertByAuthentikSubject`, defaults to `'member'` via the Drizzle column default) and only otherwise changed via the admin `updateRole()` method (`users.service.ts:114-124`, presumably admin-triggered). **The self-registration flow does not touch this column at all** — it doesn't even create the `platform.users` row. That row is created lazily by `UsersService.upsertByAuthentikSubject`, called only from `AuthController.callback` (`auth.controller.ts:156-160`) — i.e. on the user's first actual OIDC sign-in, which happens automatically right after registration hands back a session (see Cross-Module Calls below) or on their next manual sign-in. **This confirms the prior research's point 2 exactly**: the new endpoint does not itself write `platform.users`; the column defaults (`role: 'member'`) already produce the right outcome once that row is eventually created.
- `country_preference`: **zero grep matches for `country_preference` as an identifier anywhere in `.ts`/schema/migration files** (confirmed: `Grep` across `apps/` returned only doc/task-file matches — `docs/03-requirements/FR-AUTH-002.md`, `sprint-5-to-8-plan.md`, `FR-NTF-005.md`, `FR-GAM-004.md`, `FR-BOT-001.md` — all prose, zero code). The **actual live field** performing this role is `directus_users.country` (verified in `apps/api/src/modules/telegram/telegram-preferences.service.ts:75,204-230`, which reads `row.country` and falls back through a country→timezone map). **Correction to the prior research's framing**: FR-AUTH-002.md's own text (line 24) says "persisted to `directus_users.country_preference`" but the field that was actually implemented is named `country`, not `country_preference` — this is a stale/aspirational name in the FR doc, not a real column anyone should introduce now. The new registration endpoint should write to the same `directus_users.country` field the bot flow uses, for consistency (one source of truth for a member's country, whichever entry path they used).
- The `platform` schema's `users` table has **no `country_code` column** either (by design — `architecture.md:195`: "Some data is global (users, badges, languages, tags) — no `country_code`"). Confirms country is a Directus-side concern here, not a `platform.users` migration.

**Verdict: No.** Step 3 (DBMigrationAuthor) is **skipped**. No Drizzle schema file changes, no migration files.

The one nuance for CodeDeveloper: writing `directus_users.country` requires a Directus user row to exist first. `DirectusUsersBridgeService.ensureLinkedByEmail()` (`directus-users-bridge.service.ts:139-164`) already handles the "no local `platform.users` row yet" case — it's built for exactly this (used today by UAT seed / admin-invite flows that provision Authentik+Directus before any OIDC sign-in has happened). The registration service should call `ensureLinkedByEmail({ email, displayName })` to get/create the `directus_users` row, then `directus.patch('/users/<id>', { country })`. `CountriesService` (`apps/api/src/modules/countries/countries.service.ts`) is the right place to validate the submitted country code is one of the platform's real tenant codes — but note `CountriesService` itself doesn't expose a "list of valid codes" cheaply for request-time validation; the cheapest correct validator is the same fixed literal set already duplicated in `dashboard.controller.ts:13` and `audit-events.controller.ts:16`: `new Set(['uz','kz','tj','xx'])`. CodeDeveloper should keep using that pattern (a third duplication) rather than introducing a new abstraction — consistent with how the codebase already does this twice.

### Shared Types

**None needed.** Confirmed `packages/shared-types` has no `src/` directory at all — it is an **empty placeholder** (`packages/shared-types/.gitkeep` is the only file). The architecture doc's claim that this package is "the source of truth" for DTOs (`architecture.md:150`, `:94`) does not match current reality: every sibling endpoint (`leads.controller.ts`, `telegram-auth.service.ts`, `telegram.controller.ts`) defines its Zod request schema **inline in the controller/service file**, not in a shared package. The new `POST /v1/auth/register` body schema should follow that same established (if architecture-doc-diverging) convention — a local `z.object({...})` in `auth.controller.ts` or `registration.service.ts`, mirroring `createSchema` in `leads.controller.ts:29-38`. This divergence from `architecture.md` is pre-existing across the whole codebase, not something this workflow introduces or needs to fix.

### Frontend (apps/web-next)

| File | Change | Pattern to mirror |
|---|---|---|
| `apps/web-next/src/pages/auth/sign-up.astro` | **new** | Currently **no sign-up page exists at all** (confirmed: only `sign-in.astro` and `signed-out.astro` under `apps/web-next/src/pages/auth/`). Unlike `sign-in.astro` (26 lines, pure SSR redirect, `prerender = false`), this page needs actual markup — it hosts the form island. Should still be `prerender = false` if it needs to read `?next=` or redirect an already-signed-in visitor. |
| A new form island, e.g. `apps/web-next/src/blocks/customer/SignUpForm.tsx` | **new** | **Confirmed location and pattern**: `apps/web-next/src/blocks/customer/LeadCaptureForm.tsx` (242 lines) is the right sibling to mirror — same directory (`blocks/customer/`), same shape (`Phase = 'idle' \| 'submitting' \| 'success' \| 'error'`, `useState<FormState>`, honeypot hidden field, `apiClient<T>()` from `@/lib/api-client` — **not raw fetch**, per the file's own comment "ADR-0038 §Locks #2: uses apiClient (not raw fetch)" and the `arch-ignore: no-api-import-in-blocks` marker). The new form additionally needs: a password field (with a client-side strength/length hint, not just an email field), a country `<select>` (populate from the same fixed list used elsewhere — there's no live "GET valid countries" public endpoint today; `CountriesService`/`countries.controller.ts` reads are `@UseGuards(AuthGuard)`-protected per its own comment "Reads are open to any signed-in operator" — so an anonymous sign-up page **cannot** call it; the country list must be a small hardcoded client-side array, same three-plus-`xx` set used server-side), and error-state handling for a duplicate-email response distinct from a generic error (see Security section — response shape must not leak which case occurred). |
| `apps/web-next/src/blocks/customer/index.ts` | modify | Export the new form component from the barrel, same as `LeadCaptureForm` presumably already is. |
| `apps/web-next/src/lib/api-client.ts` | likely no change | `apiClient<T>()` is already generic/reusable for any endpoint; the new form just calls it with `/v1/auth/register`. Confirm no auth-header injection logic in `api-client.ts` would incorrectly attach a stale bearer token to an anonymous POST — CodeDeveloper should check this file directly (not read in this pass; flagged for CodeDeveloper, not blocking ImpactAnalyzer's conclusion since `LeadCaptureForm` already proves anonymous POSTs work through this client). |

Also worth flagging: `apps/web-next/src/pages/index.astro` and `apps/web/src/pages/index.astro` both reference `LeadCaptureForm` today as the homepage funnel. This workflow does **not** touch those — the new sign-up page is a separate, additional entry point (likely linked from nav / `sign-in.astro` as a "Don't have an account? Sign up" link), not a replacement for the lead funnel.

### Bot

**None.** Confirmed — this issue is explicitly a web surface (issue title: "web-next/auth (registration)"). FR-AUTH-002's bot-side `/start` temp-account flow is unrelated and untouched.

### Workers

**None.** No BullMQ queue involvement — Authentik provisioning is synchronous request/response (same pattern as `admin-invites` consume flow, `admin-invites.service.ts:349-421`, which does the create+setPassword+setUserGroups sequence inline in the request handler, not via a queue).

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/auth/register` | POST | **New.** Public (no `AuthGuard`), rate-limited, accepts `{ email, password, country, honeypot? }`, creates an Authentik user + password + `aiqadam-member` group assignment + Directus `country` write. Response: success acknowledgement (shape TBD by CodeDeveloper — likely either `{ accepted: true }` matching `leads.controller.ts`'s 202 pattern, or a redirect into the existing `/v1/auth/login` flow so the browser immediately gets a session — see Cross-Module Calls). | No — purely additive. |

No existing endpoint's contract changes.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| New `RegistrationService` (auth module) | `AuthentikClient.getUserByEmail()` | Duplicate-check before create — direct DI, `AuthentikModule` already imported into `AuthModule`. |
| New `RegistrationService` | `AuthentikClient.createUser()` | Provision the Authentik user (no password yet — same two-call pattern as `TelegramAuthService.createTelegramUser` and `scripts/uat-seed.sh` fixture provisioning). |
| New `RegistrationService` | `AuthentikClient.setPassword()` | Second call, sets the submitted password. **Partial-failure risk — see Risk Flags.** |
| New `RegistrationService` | `AuthentikClient.resolveGroupNames(['aiqadam-member'])` + `AuthentikClient.setUserGroups()` | Assigns the baseline member group. **Confirmed this is NOT automatic** — Authentik does not auto-assign `aiqadam-member` on user creation; every existing provisioning path (`admin-invites.service.ts:387-395`, `scripts/uat-seed.sh` `ensure_test_user`) explicitly resolves + assigns group names via these two calls. The comment at `rbac-sync/group-mapping.ts:5` ("aiqadam-member (default for every Authentik user)") describes the *intended steady state*, not an Authentik platform default — every code path that creates a user is individually responsible for assigning it. |
| New `RegistrationService` | `DirectusUsersBridgeService.ensureLinkedByEmail()` | Get-or-create the `directus_users` row from just email+displayName (no `platform.users` row exists yet at this point) — this method exists specifically for pre-OIDC-sign-in provisioning callers (its own doc comment names "UAT seed scripts, future admin invitation flows" as the intended callers; self-registration is the same shape). |
| New `RegistrationService` | `DirectusClient.patch('/users/<id>', { country })` | Write the submitted country onto the Directus member row, same field `TelegramPreferencesService` reads (`country`). Either via a new small method on `DirectusUsersBridgeService`/`CountriesService`, or a direct `DirectusClient.patch()` call — CodeDeveloper's call, not architecturally significant either way since `DirectusModule` is already available. |
| `RegistrationService` (optional, UX decision for CodeDeveloper/RequirementAnalyst-level, not architecturally blocking) | `AuthService.mintSession()` / redirect into `/v1/auth/login` | To avoid forcing the brand-new member to immediately re-enter their password on a second screen, the endpoint could either (a) redirect the browser through the existing `/v1/auth/login` → Authentik → `/v1/auth/callback` dance (which is what actually creates the `platform.users` row, per the DB Changes section), or (b) mint a session directly via `AuthService.mintSession()` — but that path currently expects an `idToken`/`groups` sourced from a real OIDC exchange, and skipping OIDC entirely to hand-mint a session would bypass the `platform.users` row creation and the `groups` claim sourcing that `mintSession` expects. **Recommendation for CodeDeveloper: redirect through `/v1/auth/login` after registration succeeds** (same pattern `TelegramAuthService.exchangeWidgetPayload` uses — it provisions the Authentik user then returns a recovery-link URL for the controller to redirect through, rather than hand-minting a session). This keeps `platform.users` row creation, `directusUserId` linking, and group-claim sourcing on the single already-correct code path (`AuthController.callback`) instead of duplicating that logic. Flagged as a design decision, not mandated — but strongly recommended for consistency and to avoid a second, divergent session-minting code path. |

---

## Risk Flags

### Security Review Required — yes, flag for SecurityReviewer (not resolved here)

1. **Unauthenticated endpoint that creates real, non-temporary accounts.** Needs the standard layered defenses already established for `/v1/leads` and `/v1/auth/telegram/exchange`:
   - Rate limiting: sibling public endpoints use `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })` (5/15min) for auth-adjacent endpoints (`auth.controller.ts:367-368`) — `security.md:169` codifies "Auth endpoints: stricter — 5 attempts per 15 minutes per IP" as the documented policy. Registration should use the same 5/15min throttle, not the default global 60/60s (`app.module.ts:37`, `RATE_LIMIT_MAX`/`RATE_LIMIT_TTL_MS`).
   - Honeypot anti-spam: `leads.controller.ts:53` pattern — silently accept-and-drop when a hidden field is filled, rather than erroring (keeps bot behavior indistinguishable from success).
   - CAPTCHA: not used anywhere else in this codebase currently (`leads.controller.ts`'s own comment says "Future: IP rate-limit guard" — meaning even leads doesn't have CAPTCHA); SecurityReviewer should decide whether registration (which is higher-value than a lead capture) needs it or whether rate-limit + honeypot is the accepted bar, consistent with existing precedent.
2. **Password strength validation.** No shared password-strength validator exists yet. The only precedent is `admin-invites.service.ts:353`: `if (input.password.length < 12) throw new BadRequestException('password_too_short')` — a bare length check, no complexity rules. `security.md` doesn't specify a password policy beyond delegating hashing to Authentik (argon2id). SecurityReviewer should confirm whether length-only (matching existing precedent) is acceptable for self-registration or whether it should be stricter since this is a public, non-invited path.
3. **Duplicate-email handling must not leak which emails exist.** `AuthentikClient.getUserByEmail()` is the mechanism to check, but the response to the caller must not have a distinguishable shape/timing for "email already registered" vs "registration succeeded" — `leads.controller.ts` and `leads.service.ts` establish this exact precedent already (`leads.service.ts:60-72`: existing-member and already-verified cases both still return a 2xx-shaped result, never a distinguishing error). SecurityReviewer must confirm the new endpoint's duplicate-email branch follows the same non-leaking response shape (e.g., generic "check your email" style success, or at minimum identical status code + timing-insensitive body across both branches) rather than a distinguishing 409.
4. **Partial-failure handling in the create→setPassword→setUserGroups sequence.** This is a **new failure mode not fully solved by existing precedent**: if `createUser()` succeeds but `setPassword()` throws (Authentik 5xx, network blip), the result is an orphaned passwordless Authentik user with that email permanently occupying `getUserByEmail()` — every future registration attempt with the same email will now see "already exists" and be stuck, and the user has no path to a password (no invite token, no recovery flow triggered). None of the three existing create+setPassword call sites (`admin-invites` onboarding-consume, `scripts/uat-seed.sh`, this proposed new flow) handle this class of failure with a rollback/cleanup — `admin-invites.service.ts` doesn't need to, because its `createUser` happens at *invite* time (an admin action, low volume, operator can retry/investigate) not at public self-service time. **This is new risk surface specific to this issue and must be explicitly designed by CodeDeveloper + reviewed by SecurityReviewer** — options include: (a) call `AuthentikClient.disableUser()` or a delete-equivalent on `setPassword` failure to roll back, (b) on retry, detect the passwordless-orphan case via `getUserByEmail()` + attempt `setPassword` again instead of erroring as duplicate, or (c) mint the recovery-link fallback (`AuthentikClient.createRecoveryLink`, already used by the Telegram flow) so even a partial failure leaves the user a path to set a password via email. No existing code makes this decision today — it needs to be made in this workflow.

### Architecture Rule Risks

- None that block progress. The endpoint fits cleanly inside the existing `AuthModule` (module boundary rules satisfied — no new module needed, no cross-module entity reach-through: all Authentik/Directus access goes through the existing `AuthentikClient`/`DirectusClient`/`DirectusUsersBridgeService` service interfaces).
- One **documentation-reality gap** worth noting (not blocking, but DocWriter should be aware): `architecture.md:150` and `:94` describe `packages/shared-types` as the DTO source of truth, but it is empty and unused platform-wide — this issue's new Zod schema will, correctly, follow the actual established convention (inline schemas) rather than the documented-but-unfollowed one. Not this workflow's job to fix the architecture doc, but CodeDeveloper should not be flagged for "violating" `architecture.md` by putting the schema inline — that's consistent with 100% of existing sibling endpoints.
- `FR-AUTH-001.md` states "Platform does not host a custom registration form" — this issue's own local issue file (`ISS-USR-REG-001.md`, "Why this is not a duplicate" section) already documents that this issue explicitly supersedes that constraint. DocWriter's Step 9 task will need to update `FR-AUTH-001.md` (or add a new `FR-AUTH-00X.md`) to reflect the new reality — flagged for the Step 9 doc-update agent, not a blocker here.

---

## Test Scope

This workflow has real product code (NestJS controller + service + Astro page + React form island) — unlike the prior UAT-tooling-only workflow referenced in the task context, this should score meaningfully on TestStrategist's Test Tier Decision Rubric:

- **New public API endpoint** — rubric weight noted as "+2, at minimum" per the task brief; likely more given the auth/account-creation sensitivity (comparable to `/v1/auth/telegram/exchange`, which is itself a security-relevant public endpoint).
- **Unit tests expected:**
  - `RegistrationService` — duplicate-email branch, successful-creation branch, group-assignment call shape, country-write call shape, password-length validation, honeypot short-circuit. Mirror `admin-invites-service.spec.ts` / `admin-invites-onboarding.spec.ts` mocking style (`setUserGroups`, `resolveGroupNames` mocked as `vi.fn()`).
  - New Zod request schema — valid/invalid email, password length boundary, country enum boundary, honeypot present.
  - Frontend form component — phase transitions (`idle`→`submitting`→`success`/`error`), duplicate-email error message rendering, following `LeadCaptureForm.test.ts` as the direct pattern (already exists at `apps/web-next/src/blocks/customer/LeadCaptureForm.test.ts`).
- **Integration tests (Testcontainers) expected**, per TestStrategist's rubric for endpoints touching real external services: this endpoint's whole point is driving Authentik's admin API + Directus — `admin-invites-onboarding.spec.ts` and `authentik-client.spec.ts` are the direct precedent for how AuthentikClient calls get integration-tested in this repo (worth TestStrategist reading both in full before designing).
- **E2E (Playwright) candidate:** a full sign-up-to-signed-in-session flow is exactly the kind of flow `apps/e2e/` smoke-tests elsewhere (c.f. `lead-form-within-fold.spec.ts` for the adjacent lead-capture form) — TestStrategist should decide whether this ships in the same PR or is deferred, given the local Authentik dependency such a test requires (per `AGENTS.md` §6.1 / `.claude/CLAUDE.md` "Production-readiness and infra obligations" — if ACs require live Authentik and the local stack doesn't have it running, Orchestrator must bring it up, not defer silently).

Not designing the actual test cases here — that's TestStrategist's (Step 5) and TestDesigner's (Step 6) job.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Impact fully analyzed. New POST /v1/auth/register on the existing AuthController/AuthModule; new RegistrationService; no DB migration needed (no local country_preference or is_temporary column — Authentik attributes.is_temporary is simply never set, and country lands on directus_users.country, the same field TelegramPreferencesService already uses); new sign-up.astro + SignUpForm.tsx frontend mirroring LeadCaptureForm. Four security-relevant risks flagged for SecurityReviewer, the most novel being partial-failure handling in the create-user+set-password sequence (an orphaned passwordless Authentik user), which has no existing precedent/solution in the codebase and must be designed in this workflow."
  findings:
    - "CORRECTION to prior research: country_preference is not an implemented field anywhere (zero code matches) — the real Directus field already in use for this purpose is directus_users.country (confirmed via telegram-preferences.service.ts). FR-AUTH-002.md's prose name is stale/aspirational; new code should target `country`, not introduce a `country_preference` column or field."
    - "CONFIRMED: platform.users has no is_temporary column and never has — that flag only ever exists as an Authentik attributes.is_temporary value, set explicitly by the Telegram temp-user path and simply never set by this new flow. No local schema implication."
    - "CONFIRMED: aiqadam-member is not auto-assigned by Authentik on user creation — every existing provisioning path (admin-invites consume, uat-seed.sh) explicitly calls resolveGroupNames + setUserGroups to assign it, and the new registration flow must do the same two-call sequence."
    - "CONFIRMED: packages/shared-types is an empty placeholder (.gitkeep only) — the architecture doc's 'source of truth' claim doesn't match reality; every sibling endpoint defines its Zod schema inline, and the new endpoint should follow that actual convention, not the documented one."
    - "NEW RISK not covered by any existing precedent: partial failure between AuthentikClient.createUser() and setPassword() leaves an orphaned passwordless account that blocks all future registration attempts with that email and gives the user no recovery path. Existing create+setPassword call sites (admin-invites, uat-seed.sh) don't need to solve this because they're low-volume operator/admin-invoked flows, not public self-service. CodeDeveloper must design a mitigation (rollback, retry-detects-orphan, or recovery-link fallback) and SecurityReviewer must review the choice."
    - "DB Changes Required: No. Step 3 (DBMigrationAuthor) is skipped for this workflow."
    - "LeadCaptureForm.tsx confirmed at apps/web-next/src/blocks/customer/LeadCaptureForm.tsx (242 lines) — correct pattern to mirror for the new SignUpForm, including its apiClient-not-raw-fetch rule (ADR-0038 §Locks #2) and honeypot anti-spam field."
    - "Recommend (not mandated): after successful provisioning, redirect the browser through the existing /v1/auth/login → Authentik → /v1/auth/callback flow rather than hand-minting a session, so platform.users row creation / directusUserId linking / groups-claim sourcing stay on the single already-correct callback code path instead of a second divergent one."
```
