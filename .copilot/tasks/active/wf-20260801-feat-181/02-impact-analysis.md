# 02 — Impact Analysis: FR-AUTH-006

Agent: ImpactAnalyzer
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Validated Requirement

**FEAT-AUTH-6** — Temporary account upgrade (Telegram-only → full member). A
Telegram-only member (`attributes.is_temporary=true` in Authentik, no
`platform.users`/`directus_users` row yet) supplies a real email via
`POST /v1/internal/telegram/upgrade-temp`. Authentik's Email stage
(FR-AUTH-004 magic-link mechanism) verifies it; `AuthController.callback()`
gains a new upgrade branch that flips `is_temporary=false`, replaces the
Authentik user's email (same `pk`, never a second account), and creates the
member's first `platform.users`/`directus_users` rows via the existing
`upsertByAuthentikSubject`/`ensureLinked` machinery using the verified email.
"Retroactive points backfill" is corrected to mean "points accrue normally
from the moment of upgrade onward" — there is no pre-existing
`registrations`/`point_awards` data under a temp identity to reconcile (see
RequirementAnalyst's Analysis point 4). A new short-lived `upgrade_intents`
DB row (keyed by a random token) distinguishes an upgrade-completing
magic-link click from an ordinary sign-in, threaded through the existing
`next`-redirect machinery. 8 ACs, full mechanism in
`01-requirement-validation.md`.

## Affected Layers

### API (NestJS)

| File | Change | New/Modified |
|---|---|---|
| `apps/api/src/modules/auth/auth.controller.ts` | New `POST /v1/internal/telegram/upgrade-temp` route on `TelegramInternalController` (same file, ~line 565-764). New Zod body schema `upgradeTempBodySchema` (or defined in the service file per this codebase's convention — see telegram-auth.service.ts exporting its own body schemas that the controller imports). `AuthController.callback()` (~line 184-262) gains upgrade-branch logic inserted at the existing FR-AUTH-006 extension-seam comment (lines 212-219), before `upsertByAuthentikSubject()`. | Modified |
| `apps/api/src/modules/auth/telegram-auth.service.ts` OR a new sibling service (e.g. `apps/api/src/modules/auth/upgrade.service.ts`) | New orchestration logic for step 1(a-g): lookup by `telegram_id`, `is_temporary`/already-full checks, target-email collision check, mint `upgrade_intents` row, call `sendMagicLinkEmail`, encode token into `next`. **Recommendation: new sibling service** (`UpgradeService` or similar), not folded into `TelegramAuthService` — this logic is Authentik-attribute + email-verification orchestration, closer in shape to `MagicLinkService` than to `TelegramAuthService`'s bot-internal-endpoint surface. Mirrors the precedent RequirementAnalyst cited (magic-link kept as its own sibling service rather than folded into `auth.service.ts` or `telegram-auth.service.ts`). CodeDeveloper should confirm but this is a design recommendation, not a hard requirement. | New (service) |
| `apps/api/src/modules/auth/auth.service.ts` | Possibly extended: `callback()`'s upgrade branch needs to inspect/consume the `next` value the same way `completeAuthorization()` already surfaces it (auth.controller.ts:196) — no evidence a new method is strictly required here, since `next` is already returned to the controller; the token-shape check (`/auth/upgrade-complete?token=...`) and `upgrade_intents` lookup can live in the controller or the new upgrade service. Flag for CodeDeveloper to decide placement (controller vs. service) consistent with existing style — `callback()` already does moderate inline orchestration (leads conversion, directus bridge) directly in the controller. | Possibly modified |
| `apps/api/src/modules/admin-invites/authentik.client.ts` | New method, e.g. `setUserEmail(userPk: number, email: string): Promise<void>` — `PATCH /api/v3/core/users/{pk}/` with `{ email }`, following the exact pattern of `setUserGroups`/`disableUser`/`patchAttributes` (lines 196-215). | New method on existing file |
| `apps/api/src/modules/auth/refresh-token.schema.ts`-sibling: new `apps/api/src/modules/auth/upgrade-intent.schema.ts` | New Drizzle table `upgrade_intents` (see DB Changes Required below). | New file |
| `apps/api/src/db/schema/index.ts` | Add `export * from '../../modules/auth/upgrade-intent.schema';` alongside the existing `refresh-token.schema` re-export (line 11). | Modified |
| `apps/api/src/modules/auth/auth.module.ts` | Register the new service as a provider (if a new sibling service is added) — no new module imports anticipated (`AuthentikModule`, `DirectusModule` already imported). | Modified |

No changes to `apps/web`, `apps/bot`, `apps/workers`, or `packages/shared-types` — confirmed per task brief; the bot-side `/upgrade` command consuming this endpoint is FR-BOT-002 PR 6/6, a separate future workflow.

### DB Changes Required: **YES**

New table `upgrade_intents`, sibling to `refresh_tokens` (`apps/api/src/modules/auth/refresh-token.schema.ts`) — same module, same file-naming convention (`upgrade-intent.schema.ts`), same `platform` schema (implicit — this codebase's Drizzle tables are not schema-namespaced beyond the single `platform` Postgres database per `ARCHITECTURE.md`'s Data ownership table).

Proposed shape, matching `refreshTokens`' exact column/index idioms:

```typescript
export const upgradeIntents = pgTable(
  'upgrade_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SHA-256 hex of the random token, same "never store the raw
    // usable secret" posture as refreshTokens.tokenHash (refresh-token.schema.ts:23).
    // The raw token is what round-trips through the `next` URL param;
    // only its hash is persisted.
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    authentikUserPk: integer('authentik_user_pk').notNull(),
    telegramId: varchar('telegram_id', { length: 32 }).notNull(),
    targetEmail: varchar('target_email', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => ({
    // Fast lookup on callback: find the row by token hash.
    tokenIdx: index('upgrade_intents_token_idx').on(t.tokenHash),
    // "Does this temp user already have a pending upgrade?" check at
    // POST /upgrade-temp time (AC-1/AC-1b idempotency — re-issuing a
    // second /upgrade call while one is already pending should not
    // orphan the first token; CodeDeveloper decides overwrite-vs-reject,
    // this index just makes either implementable in one query).
    authentikUserPkIdx: index('upgrade_intents_authentik_user_pk_idx').on(t.authentikUserPk),
  }),
);
```

Notes for DBMigrationAuthor:
- `tokenHash` unique index is load-bearing (mirrors `refreshTokens.tokenHash`'s `.unique()` at line 23) — the callback-time lookup is a point lookup on this column.
- `authentikUserPk` is an **integer** (Authentik's `pk` is a plain int per `AuthentikUser.pk: number` in `authentik.client.ts:51`), NOT a uuid — do not copy `refreshTokens.userId`'s `uuid`+FK pattern verbatim; there is no FK possible here since Authentik users are not in `platform`'s Postgres database at all (cross-schema FK is architecturally impossible and also forbidden per `ARCHITECTURE.md`'s "Cross-schema queries are forbidden" rule — this table can only story Authentik's pk as a plain integer value, not a real foreign key).
- No `country_code` column — see Tenant-Scoping Risk Flag below; this table is confirmed NOT tenant-scoped.
- `expiresAt`: RequirementAnalyst's open question recommends matching FR-AUTH-004's observed ~29min `Tenant.default_token_duration`, capped at-or-below the underlying magic-link email's own lifetime (an upgrade_intents TTL longer than the email link's own life is dead code). CodeDeveloper's implementation call, not a schema concern.
- Migration file: DBMigrationAuthor generates it; per `.claude/CLAUDE.md`, the migration is **never auto-run** (`pnpm db:migrate` is user-run only).

### Shared Types

None. Confirmed per task brief and `auth.controller.ts`'s own header comment (line 66-69): `packages/shared-types` is an empty, unused placeholder in this codebase; every sibling endpoint (including this FR's new one) defines its Zod schema inline/in the owning service file, matching `upsertTempUserBodySchema`'s precedent.

### Frontend

None. No `apps/web` changes — the upgrade-complete redirect target (`/auth/upgrade-complete?token=...`, referenced in the mechanism's step 1(f)/2) is a `next` value threaded through Authentik's flow and consumed entirely server-side by `AuthController.callback()` before any browser-visible redirect happens; `callback()`'s final `res.redirect(this.auth.postLoginRedirectUrl(next))` (line 261) sends the browser to whatever `next` ultimately resolves to post-upgrade-branch-processing, but that's existing `postLoginRedirectUrl` machinery, unchanged by this FR. **Open question for CodeDeveloper** (not blocking ImpactAnalyzer's gate): confirm `sanitiseNext`/`postLoginRedirectUrl` correctly pass through a `next` value shaped like `/auth/upgrade-complete?token=<token>` without stripping the query string — `sanitiseNext` (auth.controller.ts:539-544) only checks the leading `/`/`//` prefix, so this should be safe, but the FR's step 1(f) implies a **new** Astro page/route `/auth/upgrade-complete` may need to exist as a *landing* page for the user's browser after the callback's final redirect (e.g. "Your account is now upgraded!" confirmation) — if so, that IS a `apps/web` change. **This is ambiguous in the current spec and worth flagging**: RequirementAnalyst's mechanism describes `next` purely as a token-carrier consumed server-side inside `callback()`, but doesn't specify what `next` resolves to for the browser's FINAL redirect after the upgrade branch runs. If no dedicated page is built, the browser lands on whatever generic post-login page `postLoginRedirectUrl` defaults to today — likely acceptable for this FR's API-only scope, but CodeDeveloper/TestDesigner should confirm this is intentional rather than an oversight, since a raw 404 on `/auth/upgrade-complete` would be a poor UX if any part of the mechanism actually navigates a real browser there mid-flow (as opposed to purely round-tripping through Authentik's redirect chain, where `next` never resolves to a page directly, only to a query-string value Authentik echoes back). Recommend CodeDeveloper resolve `next` to `postLoginRedirectUrl`'s existing default (e.g. `/me` or `/`) post-upgrade, not a new dedicated page, to keep this FR's scope to "API surface + callback logic" as stated — but this should be an explicit decision, not a silent default.

### Bot

None in this workflow (confirmed out of scope — FR-BOT-002 PR 6/6).

### Workers

None. No BullMQ queue/processor involvement — the magic-link email send is synchronous (Authentik's own native send via `recovery_email`), matching FR-AUTH-004's existing pattern (no queue involved there either).

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/internal/telegram/upgrade-temp` | POST | New route. Body `{ telegramId: string, email: string }`. Responses: `200 { ok: true }` (success), `404 { error: 'telegram_user_not_found' }`, `409 { error: 'not_a_temp_account' }`, `409 { error: 'email_already_in_use' }`. `InternalAuthGuard`-protected. | No (additive) |
| `/v1/auth/callback` | GET | Modified: new upgrade-branch logic inserted before `upsertByAuthentikSubject()`. Behavior is a no-op / falls through to existing behavior for every caller NOT carrying a valid, unexpired, unconsumed upgrade-intent token in `next` (AC-8) — i.e. every existing sign-in mechanism (password, Telegram widget, ordinary magic-link) is unaffected. | No (additive, gated) |

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| New `POST /upgrade-temp` handler (auth module, new/existing service) | `AuthentikClient.getUserByTelegramId` | Existing method, `apps/api/src/modules/admin-invites/authentik.client.ts:254` |
| New `POST /upgrade-temp` handler | `AuthentikClient.getUserByEmail` | Existing method, for the AC-7 email-collision check, `authentik.client.ts:126` |
| New `POST /upgrade-temp` handler | `AuthentikClient.sendMagicLinkEmail` | Existing method, `authentik.client.ts:335` — **Risk Flag, see below: target-email parameter question** |
| New `POST /upgrade-temp` handler | New Drizzle `upgrade_intents` insert | Direct DB write via injected `Db` (same DI pattern as `RefreshTokenService`) |
| `AuthController.callback()` upgrade branch | `AuthentikClient.patchAttributes` | Existing method, `authentik.client.ts:205` — merge-patch to preserve `telegram_id` while flipping `is_temporary` |
| `AuthController.callback()` upgrade branch | `AuthentikClient.setUserEmail` (NEW) | New method to be added, same PATCH pattern as `setUserGroups`/`disableUser` |
| `AuthController.callback()` upgrade branch | `upgrade_intents` row lookup + `consumedAt` update | Direct DB read/write |
| `AuthController.callback()` (unchanged, existing call site) | `UsersService.upsertByAuthentikSubject` | Existing, `users.service.ts:61` — this FR's branch must ensure the corrected/verified email is passed here, not the pre-verification synthetic one from the id_token |
| `AuthController.callback()` (unchanged, existing call site) | `DirectusUsersBridgeService.ensureLinked` | Existing, `directus-users-bridge.service.ts:54` — creates the member's first `directus_users` row using `user.email` off the just-upserted `platform.users` row; this is what satisfies AC-6 for free per RequirementAnalyst's Architectural Feasibility finding |

No NEW cross-module edges into `PointsModule`, `RegistrationsModule`, or any other module — confirmed by RequirementAnalyst's trace (Analysis point 4): `PointsDirectusService.leaderboard()`/`totalForUser()` require zero code changes since neither method filters on `is_temporary` today.

## Risk Flags

### Security Review Required

0. **RESOLVED by the Orchestrator via live source inspection of the running Authentik container (2026-08-01, `docker exec aiqadam-authentik-server`), before CodeDeveloper started — this supersedes Risk Flag #1 below with a definitive answer instead of an open question.** Read `/authentik/core/api/users.py`'s actual `recovery_email` action (Authentik 2024.12.3, the exact version this stack runs) directly inside the container:
   ```python
   def recovery_email(self, request: Request, pk: int) -> Response:
       for_user: User = self.get_object()
       ...
       message = TemplateEmailMessage(
           subject=_(email_stage.subject),
           to=[(for_user.name, for_user.email)],   # <-- hardcoded, no override param anywhere
           ...
       )
   ```
   **Confirmed definitively: `recovery_email` has NO target-email override of any kind — it always sends to `for_user.email`, the user's CURRENT on-file email at call time.** There is no query param, no body param, no alternate Authentik primitive that sends to an arbitrary address. Design (c) from Risk Flag #1's three options is therefore the ONLY viable path: **the Authentik user's `email` field must be patched to the target address BEFORE calling `sendMagicLinkEmail`**, not after verification.
   
   **Second finding, which changes the atomicity risk profile materially:** also queried Authentik's actual Django model via `python -c "... User._meta.get_field('email').unique"` inside the container — **`unique: False`**. Authentik does **not** enforce email uniqueness at its own data layer at all. This means: (a) the AC-7 collision check (`getUserByEmail` returning first-match) is a purely application-level, non-atomic guard — Authentik itself will silently accept a PATCH that creates a duplicate email across two Authentik users, so our own check-then-patch is the only thing preventing it, not a DB constraint backstop as originally hoped; (b) this actually SIMPLIFIES the "atomic email replace" concern from the FR's own Notes in one sense (patching early can never 409 against Authentik's own constraint, since none exists) while SHARPENING it in another (nothing stops a second concurrent `/upgrade-temp` call for a different temp user targeting the same email from both succeeding at the Authentik layer — the only real backstop is `platform.users.email`'s `.unique()` Postgres constraint at `upsertByAuthentikSubject()` time, which is downstream, after BOTH temp users' Authentik records could already have been mutated to the same email).
   
   **Revised mechanism CodeDeveloper must implement** (supersedes RequirementAnalyst's step 1(e)/2 ordering where the email patch happened at `callback()` time): patch the Authentik user's email to the target address as part of `/upgrade-temp` request handling itself (step 1), immediately after the AC-7 collision check and immediately before minting the `upgrade_intents` row + calling `sendMagicLinkEmail` — NOT deferred to `callback()`. `is_temporary` stays `true` throughout this window (the account is not yet a full member — only its email-of-record changed, which is safe since a temp account has no dependent reads keyed on its email besides the recovery-link send itself, confirmed by RequirementAnalyst's Analysis point 4 finding that no `registrations`/`points` code path is reachable by a temp user at all). `callback()`'s upgrade branch (step 2) then only needs to flip `is_temporary=false` and consume the `upgrade_intents` row — the email is already correct on the Authentik user by the time `callback()` runs, since `completeAuthorization()` will read it fresh off the verified id_token. **This removes the "never mixed state" risk AC-2 worried about for the email-vs-is_temporary ordering** (there's only one mutation left in the callback branch, not two), at the cost of a new, narrower window: between the `/upgrade-temp` email patch and the user actually clicking the link (up to the token's TTL), the temp user's Authentik email-of-record is the NEW address but `is_temporary` is still `true` — this is an acceptable, intentional transient state (nothing reads a temp user's email for any other purpose during this window), but CodeDeveloper/TestDesigner should have a regression test asserting a SECOND, DIFFERENT temp user cannot simultaneously claim the same target email while the first user's verification is still pending (re-run the `getUserByEmail` collision check defensively even here, since Authentik's own lack of a unique constraint means two concurrent `/upgrade-temp` calls for the same email could otherwise both "succeed" at the Authentik layer, each silently overwriting the other's PATCH).

1. **`sendMagicLinkEmail` target-email uncertainty (carried forward from RequirementAnalyst, restated here as the single highest-priority open risk for this workflow) — SEE FINDING #0 ABOVE, NOW RESOLVED.** Retained below for the historical reasoning trail; do not re-investigate, the question above is answered definitively from Authentik's actual source. `AuthentikClient.sendMagicLinkEmail(userPk, emailStageUuid, brandDomain)` (authentik.client.ts:335-342) calls `POST /api/v3/core/users/{userPk}/recovery_email/?email_stage=<uuid>` — **this endpoint takes no explicit target-email body/query parameter at all**; it is documented (and was live-verified for a DIFFERENT question, per the file's own CORRECTION comment at lines 299-323) to email whatever is on the Authentik user's **current on-file `email` attribute**. For this FR's step 1(e), the temp user's on-file email at send time is still the synthetic `tg<id>@telegram.local` — NOT the new target email the member just supplied. **If this assumption is correct as read, `sendMagicLinkEmail` as it exists today CANNOT be used unmodified for this FR** — it would either email the synthetic address (which the member cannot read) or require the target email to be written to the Authentik user's `email` field BEFORE verification (which would violate AC-2's "never leaves the user in a mixed state" atomicity requirement and also risk colliding with Authentik's own unique-email constraint against the check done in step 1(c), since the check-then-patch race window would now span the entire email-verification wait, not one synchronous PATCH). CodeDeveloper must live-verify (same "curl the real API" discipline that caught FR-AUTH-004's own two prior wrong assumptions, both documented in this very file's comments) whether: (a) Authentik's `recovery_email` endpoint has an undocumented/optional target-email override param, (b) a different Authentik primitive (e.g. its email-stage stage-flow can be invoked with an explicit recipient independent of the user's on-file email), or (c) the design must change to a temporary-email-patch-then-verify-then-final-patch shape (which reopens the atomicity question this FR's Notes explicitly wanted to avoid). This is not a security-severity finding in the CVE sense, but it is a **build-blocking design-correctness risk** that must be resolved before CodeDeveloper writes the orchestration logic, not discovered mid-implementation — recommend Orchestrator schedule an explicit Authentik-API spike (mirroring `02b-authentik-spike-findings.md` from the FR-AUTH-004 workflow, referenced in `magic-link.service.ts`'s own header comment) as a gating step before or at the start of CodeDeveloper's pass.

2. **Email-collision check race window (TOCTOU), addressed but worth restating for SecurityReviewer's attention.** Step 1(c)'s check-then-mint-intent design has a check (`getUserByEmail`) separated in time from the eventual PATCH (in `callback()`, potentially minutes later after the member clicks the email link). Between the check and the patch, a different actor could register the target email through an unrelated path (e.g. `POST /v1/auth/register`, or another `/upgrade-temp` call for a different temp user targeting the same email). **Mitigating factor confirmed by this analysis**: `platform.users.email` has a `.unique()` constraint (users/schema.ts:29) and Authentik's own user model almost certainly enforces email uniqueness at its data layer too (implied by `getUserByEmail` returning at most one result everywhere in this codebase) — so the WORST case of a missed race is a hard PATCH failure (Authentik 400/409) at `callback()` time, not a silent data-integrity violation. CodeDeveloper must handle that failure path explicitly (AC-2's "never leaves the user in a mixed state" requirement means the `is_temporary` flip and the email patch must either both succeed or the code must not have applied the `is_temporary` flip yet when the email patch fails — ordering matters: patch email FIRST, since a failed email patch is recoverable with zero side effects, whereas flipping `is_temporary` first and then failing the email patch would leave a full-member-flagged user with no email correction, silently breaking the "same PATCH, never mixed state" AC). **Recommend CodeDeveloper re-check email availability immediately before the callback-time PATCH** (not just at the original `/upgrade-temp` request), even though this doubles the `getUserByEmail` call — the check is cheap and the alternative is a confusing failure mode for the member re-attempting later with the SAME already-used email and getting a generic 500 instead of a clean re-triggered AC-7 error.

3. **`InternalAuthGuard` posture is correct and requires no new work** — the new `/upgrade-temp` route sits on the existing `TelegramInternalController` which is already guard-wrapped at the class level (`@UseGuards(InternalAuthGuard)`, auth.controller.ts:566). No additional security work needed here; noted only for SecurityReviewer's completeness checklist.

4. **Anti-enumeration consistency.** Per the mechanism's step 1(g), the SUCCESS response is `{ ok: true }` (anti-enumeration, matching FR-AUTH-004's magic-link posture) — but AC-7 (email-already-in-use) IS specific/distinguishable by design, per RequirementAnalyst's explicit call-out that this differs from magic-link's uniform response. SecurityReviewer should confirm this asymmetry is intentional and acceptable: unlike `/v1/auth/magic-link` (fully public, unauthenticated, anyone can probe any email), `/v1/internal/telegram/upgrade-temp` is `InternalAuthGuard`-protected (bot-only caller, not directly public), which substantially changes the enumeration threat model — a leaked "this email is taken" signal here is only reachable by a compromised or malicious bot-tier caller, not the general public. This is very likely fine but is exactly the kind of asymmetry SecurityReviewer's pass should explicitly bless rather than silently accept.

### Architecture Rule Risks

None found that block this FR — confirmed no cross-schema queries, no module-boundary violations (all new code is within the Auth module's existing ownership), no circular-dependency introductions (no new module imports into `AuthModule` are needed; `AuthentikModule` and `DirectusModule` are already imported per `auth.module.ts` lines 66-70).

One **design-consistency note, not a rule violation**: the new `upgrade_intents` table stores `authentikUserPk` (an Authentik integer pk) directly, which is a slightly different pattern than `refreshTokens.userId` (a `platform.users` UUID FK) — this is correct and unavoidable given a temp user has no `platform.users` row to reference at all (that's the entire premise of this FR), but CodeDeveloper/TestDesigner should not treat `refreshTokens` as a literal copy-paste template beyond the column/index *style* — the FK relationship itself does not carry over.

### Tenant-Scoping

**Confirmed NOT tenant-scoped, and this is correct.** `upgrade_intents` has no `country_code` column in the proposed design. Verified via `platform.users` schema (`apps/api/src/modules/users/schema.ts`) — the `users` table itself has no `country_code` column either (country/tenant resolution for a member happens elsewhere, likely via the `directus_users` row or a separate country-assignment step referenced in `telegram-auth.service.ts`'s `upsertTempUser` doc comment: "bot drives country assignment separately after getting this response"). A Telegram user's country is not resolved until well after the Authentik-level identity exists, and definitely not at `/upgrade-temp` request time (which only knows `telegramId` + the target `email`) — so gating this table by tenant is not just unnecessary but would be actively wrong (there is no tenant value available to store). This matches `ARCHITECTURE.md`'s §"Multi-tenancy implementation" point 5: "Some data is global (users, badges, languages, tags) — no `country_code`." `upgrade_intents` belongs in that same global-data bucket.

## Test Scope

### Unit

- New Zod body schema (`upgradeTempBodySchema` or equivalent) — valid/invalid `telegramId`/`email` shapes, mirroring existing `upsertTempUserBodySchema`/`magicLinkRequestSchema` test patterns.
- New orchestration service logic (whichever service ends up owning step 1a-g): mock `AuthentikClient` + the DB layer — cover the 404 (`telegram_user_not_found`), 409 (`not_a_temp_account`), 409 (`email_already_in_use`), and success paths as independent unit cases.
- `AuthentikClient.setUserEmail` (new method) — thin PATCH wrapper, unit-testable the same way `setUserGroups`/`disableUser` presumably are (or aren't — check existing coverage for those two methods as the precedent to match, not exceed).
- `callback()`'s upgrade-branch decision logic (token present+valid vs. absent vs. expired vs. consumed vs. wrong-user) — AC-2 and AC-8 are both fundamentally branch-selection unit tests, ideally isolated from the full OIDC round-trip.

### Integration (Testcontainers)

- `upgrade_intents` table CRUD via the real Postgres Testcontainer — insert, token-hash lookup, `consumedAt` update, expiry-boundary query (matches this codebase's existing `refresh_tokens`/`jti_revocations` integration-test precedent — TestDesigner should locate and mirror whichever spec file currently covers `refresh-token.service.ts` for the exact harness pattern).
- `AuthController.callback()`'s branching integration test: seed a temp Authentik user + a valid `upgrade_intents` row (against a real/mocked Authentik — see E2E note below for how much of this needs to be live vs. stubbed) and assert the full sequence: `is_temporary` flip, email patch, `upgrade_intents.consumedAt` set, `platform.users`/`directus_users` rows created with the CORRECT (verified) email, not the synthetic one. This is the single most important integration test in this FR — it's the one place all the moving pieces (Authentik state, DB writes, cross-service calls) actually intersect.
- AC-8's fall-through case: expired/consumed token → assert zero `is_temporary`/email mutation AND that ordinary sign-in still completes successfully (i.e., the fall-through doesn't accidentally short-circuit or error the whole callback).
- Race/collision case from Risk Flag #2 above: seed a colliding email between the `/upgrade-temp` check and the `callback()` PATCH; assert a clean, recoverable failure (not a corrupted mixed state, not an unhandled exception).

### E2E (Playwright)

Not owned by this ImpactAnalyzer pass in detail (per task instructions) — flagging as **required** for TestDesigner/Orchestrator to plan: a genuine end-to-end live verification against real Authentik + Directus (not just Testcontainers-mocked) is needed to resolve the Risk Flag #1 `sendMagicLinkEmail` target-email question empirically, and to confirm the full magic-link-click → callback → upgraded-account round trip actually works against the live local Authentik instance, matching the discipline FR-AUTH-004's own workflow used (`02b-authentik-spike-findings.md`, `07-test-results.md`'s CRITICAL FINDING). This live verification belongs at Orchestrator's Step 8 infra pre-flight / Step 13, not planned in exhaustive detail here.

## Gate Result

```yaml
gate: ImpactAnalyzer
status: passed
reason: >
  Impact is fully scoped within the Auth module. One new Drizzle table
  (upgrade_intents, sibling to refresh_tokens) is required -- confirmed
  DBMigrationAuthor is needed next. One new API endpoint (POST
  /v1/internal/telegram/upgrade-temp) and one modified existing method
  (AuthController.callback()) constitute the full API surface change,
  both additive/non-breaking to every existing caller. A new
  AuthentikClient.setUserEmail method and a new sibling orchestration
  service (recommended, not mandated) are the only other net-new code
  units. No packages/shared-types, apps/web, apps/bot, or apps/workers
  changes are required for this workflow's scope. No architecture-rule
  violations found: no cross-schema queries, no module-boundary
  breaches, no new circular-dependency risk. Tenant-scoping confirmed
  correctly absent (upgrade_intents belongs in the same global-data
  bucket as platform.users, per ARCHITECTURE.md's multi-tenancy
  section). The single highest-priority open risk carried forward AND
  sharpened here: AuthentikClient.sendMagicLinkEmail's underlying
  Authentik endpoint (POST .../recovery_email/) has NO target-email
  parameter in its confirmed contract -- it emails whatever is on the
  user's CURRENT on-file email, which at send time is still the
  synthetic tg<id>@telegram.local, not the member's newly-supplied
  target email. This is now flagged as build-blocking, not merely
  worth-noting -- CodeDeveloper (or a dedicated pre-implementation
  spike) must live-verify Authentik's actual behavior before this FR's
  core send-path can be implemented as designed; if the assumption
  holds, the mechanism's step 1(e) needs a redesign (an alternative
  Authentik primitive, or an accepted, carefully-ordered temporary
  email-patch-before-verification with the atomicity/race trade-offs
  documented in Risk Flag #2). A second, lower-severity race-window
  risk (email-collision check-then-later-PATCH TOCTOU) is well-
  mitigated by existing unique constraints but needs explicit
  re-check-immediately-before-PATCH handling and PATCH-ordering
  discipline (email before is_temporary flip) to fully satisfy AC-2's
  "never leaves the user in a mixed state" requirement. A frontend
  ambiguity (what apps/web page, if any, `next` ultimately resolves to
  post-upgrade) is flagged as needing an explicit CodeDeveloper
  decision but does not block this gate since the requirement's stated
  scope is API-surface-only.
next_agent: DBMigrationAuthor
```
