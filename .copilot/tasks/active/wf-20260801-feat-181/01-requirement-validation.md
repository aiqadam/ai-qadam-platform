# 01 — Requirement Validation: FR-AUTH-006

Agent: RequirementAnalyst
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Raw Input

`docs/03-requirements/FR-AUTH-006.md` (status: Planned, module: Auth, phase: Roadmap
Sprint 6, github_issue #139), full text as of this validation:

> A member who signed up via the Telegram bot has a "temporary" account: they can
> register for events but cannot appear on the leaderboard or edit their profile.
> When they verify an email address, the account is upgraded to a full member
> account, gamification unlocks, and past attended events retroactively award
> points.

Functional scope (6 items) and 7 draft ACs as originally written — see git history
for the pre-validation text. Key claims requiring verification: (1) temp users "can
register for events" today, (2) `GamificationService.queries all registrations where
status=checked_in`, (3) a Twenty CRM contact sync step.

Orchestrator-supplied context (six numbered points covering the extension seam,
prior art, FR-AUTH-004 status, the new route, the already-used-email error path, and
BP-UAT linkage) is treated as established fact per instructions and is incorporated
below rather than re-derived; where I re-verified it against the actual code I note
agreement or correction explicitly.

## Analysis

### Completeness Issues Found

1. **`GamificationService` does not exist.** Confirmed via repo-wide grep
   (`grep -r "GamificationService|class.*Gamification" apps/`) — zero matches. The
   FR-GAM-001 spec (`docs/03-requirements/FR-GAM-001.md`, status: **Shipped**) also
   describes this class plus an `activities` table and `users.points_total`
   denormalized column, none of which exist. What actually shipped for FR-GAM-001 is
   a Directus-flow-based architecture: `infrastructure/directus/flows-bootstrap.sh`'s
   `reg-checkin-points` flow (an `items.update` action hook on `registrations`,
   firing when `status` transitions to `attended`) writes rows directly to a
   `point_awards` Directus collection, no application-layer service in the loop at
   all. `PointsDirectusService` (`apps/api/src/modules/points/points-directus.service.ts`)
   only *reads* `point_awards` (`leaderboard()`, `totalForUser()`) plus one
   special-case writer (`awardFirstJoinPoints()`, unrelated to check-in). FR-GAM-001's
   spec text is stale relative to what shipped; FR-AUTH-006 inherited that staleness
   by referencing a class name that was never built. **This requirement will
   implement the retroactive-award write path as a new method on
   `PointsDirectusService`** (or a sibling service in the same module), not on any
   `GamificationService`.

2. **`status=checked_in` does not exist.** Confirmed via
   `registrations-directus.service.ts` line 21:
   `export type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended'`.
   The check-in flow's terminal status is `'attended'`. FR-AUTH-006's Functional
   scope item 5 and AC-3 ("past attended events") both need `checked_in` corrected
   to `attended` — the AC text itself already colloquially says "attended events" (a
   minor internal inconsistency between item 5's code-flavored `status=checked_in`
   and the AC's plain-English "attended events"; both are now aligned to `attended`).

3. **Twenty CRM sync (Functional scope item 6 / AC-6) targets a retired system.**
   Confirmed via `docs/adr/0033-community-member-graph.md` (Accepted 2026-05-20):
   "Twenty CRM is dropped. Coolify service deletion + Twenty workstream (Sprint C5
   area) closed. Member relationship management lives in the graph [Directus]." Also
   confirmed via `flows-bootstrap.sh` lines 46-51, which documents a one-shot cleanup
   block that DELETEs the three former CRM-sync flows
   (`crm-contact-sync`/`crm-activity-on-create`/`crm-activity-on-update`) by
   deterministic UUID. Zero references to Twenty in `apps/api/src`. **Reinterpretation
   (not a silent drop):** per ADR-0033 Part 1, `directus_users` (aliased `members` in
   the ADR's target schema) IS the modern member-relationship record — there is no
   separate CRM object to sync into. AC-6's intent — "the external record of this
   member reflects their real email, not the synthetic placeholder, once upgraded" —
   is fully satisfied by patching the *same* `directus_users` row this requirement
   already has to touch for the email replacement (see Formalized Requirement step
   4 below). CodeDeveloper must NOT build any Twenty API integration. This is stated
   explicitly so the AC is neither silently dropped nor causes wasted work
   resurrecting a deliberately retired system.

4. **Core architectural premise — "temp users can register for events" — is false
   as currently built, and this is the crux of the whole requirement.** Traced the
   full write path:
   - `RegistrationsDirectusService.register()` (browser path, called from
     `registrations.controller.ts`) and `TelegramAuthService.registerViaTelegram()`
     (bot path) BOTH call `requireDirectusUserId(userId)` /
     `requirePlatformUserId(directusUserId)` before any registration insert.
   - `requireDirectusUserId` (registrations-directus.service.ts:673-679) calls
     `DirectusUsersBridgeService.resolveDirectusId(userId)`, which requires an
     existing row in **`platform.users`** (the Drizzle-backed `users` table) with a
     non-null `directusUserId` — or throws `RegistrationIneligibleError`.
   - `requirePlatformUserId` (telegram-auth.service.ts:837-843) calls
     `DirectusUsersBridgeService.resolveUserIdFromDirectusId(directusUserId)`, which
     requires the REVERSE: a `platform.users` row already linked to a given
     `directus_users.id`. The bot only ever has a `directusUserId` to pass in
     because `TelegramAuthService.lookupUser()` resolved one moments earlier by
     matching the Authentik user's email against `directus_users` — and a temp
     user's email is the synthetic `tg<id>@telegram.local`, which no
     `directus_users` row was ever created with (nothing creates one for temp
     users at `/start` time — `upsertTempUser`'s own `UpsertTempUserResult` hardcodes
     `directusUserId: null`).
   - The ONLY code path that creates a `platform.users` row is
     `UsersService.upsertByAuthentikSubject()` (users.service.ts:61), called
     exclusively from `AuthController.callback()` — i.e. only after a **completed
     OIDC session**. A pure-Telegram temp user, interacting only through the bot,
     never completes an OIDC session and therefore never gets a `platform.users`
     row, never gets a `directus_users` row (that's created by
     `DirectusUsersBridgeService.ensureLinked()`, called from the same `callback()`
     right after), and therefore **cannot satisfy either bridge lookup**, on either
     the browser or the bot registration path.
   - **Conclusion: a temp (Telegram-only, not-yet-upgraded) user cannot register
     for an event through any code path that exists today.** `registerViaTelegram`
     404s with `telegram_user_not_found` for them (via `requirePlatformUserId`), and
     the browser path is unreachable since they have no web session at all (temp
     users are Authentik-only; without a completed OIDC callback there is no
     `aiqadam-refresh` cookie to authenticate a browser call in the first place).
   - This directly falsifies the requirement's own "Description" sentence ("they can
     register for events but cannot appear on the leaderboard") and Functional scope
     item 1's identical claim. It is either a stale aspiration from before
     FR-BOT-002's bridge-lookup design was finalized, or a genuine product gap that
     this FR was never meant to close (registration-for-temp-users is not in this
     FR's AC list either).

   **What this means for "retroactive points backfill" (Functional scope item 5,
   AC-3):** the `handoff.yaml` notes for this workflow assert "the
   `reg-checkin-points` flow ... fires for ANY user's check-in including temp
   users — so temp users MAY already have point_awards rows before upgrade." **This
   premise is incorrect and I am correcting it here.** The flow fires on
   `registrations.items.update` — it requires a pre-existing `registrations` row to
   update. Per the trace above, a temp user can never have a `registrations` row
   (the insert itself is gated by the bridge lookup, upstream of any check-in). So
   there is no scenario today where a temp user has a `point_awards` row before
   upgrading. "Retroactive backfill" over `point_awards` rows that were skipped by
   the flow is therefore **not a coherent operation for the current architecture** —
   there is nothing to backfill from, because temp users cannot accrue the
   underlying `registrations`/`point_awards` rows in the first place while still
   temporary.

   Two honest paths forward, and I am picking (b) as the formalized scope:

   (a) *Treat this as a prerequisite gap and expand scope* to also let temp users
   register for events (e.g. `upsertTempUser` or a new bot-side path also creates a
   `platform.users` + `directus_users` row eagerly, using the synthetic email, so
   registrations/check-ins CAN accrue while still temporary, then "backfill"
   becomes meaningful: re-attributing the points that already exist under the
   synthetic-email identity). This is a substantially larger, architecturally
   invasive change (touches the bridge's "one real email per user" assumption,
   duplicate-account risk if the same person later also signs up via web with their
   real email) that no AC in this FR asks for and no sibling FR provisions for
   either. Rejected as out of scope for this FR.

   (b) **Formalize "retroactive backfill" as: any registrations/check-ins the
   member accrued get correctly counted starting the moment they become a full
   member — because that is the FIRST moment a `platform.users`/`directus_users`
   row (and therefore any `registrations`/`point_awards` row) can exist for them at
   all.** Concretely: there is no separate backfill *write* operation required,
   because there is no pre-existing `point_awards` data orphaned under the temp
   identity to reconcile — the upgrade IS the event that first makes the member
   eligible to register/attend/earn at all. AC-3 ("after upgrade, points from past
   attended events appear on the leaderboard") is satisfied vacuously-but-honestly:
   there are no "past attended events" possible for a genuinely temp-only user, so
   the AC's real, testable content collapses to "the newly-created
   `platform.users`/`directus_users` row correctly surfaces on `leaderboard()`/
   `totalForUser()` going forward" — which is already true by construction once the
   bridge row exists, per `PointsDirectusService`'s existing query shape (keyed on
   `directus_users.id`, no `is_temporary` filter anywhere in that service). I am
   revising AC-3 accordingly (see Acceptance Criteria draft below) rather than
   building dead backfill-query code against a table that structurally cannot have
   qualifying rows. **This is the single most important finding in this
   validation** and directly contradicts the handoff.yaml's stated premise —
   flagging it explicitly per the task instructions.

   Caveat / residual risk worth CodeDeveloper's attention: if a temp user WAS
   somehow able to accrue a `registrations`/`point_awards` row under some path not
   found in this review (e.g. an operator manually creating one via Directus
   admin, or a future change loosens the bridge gate), those rows would already be
   keyed to whatever `directus_users` row existed at the time — the upgrade flow's
   email-replace step (Formalized Requirement step 4) mutates that SAME row in
   place (not a new row), so any such pre-existing rows carry forward correctly
   with zero extra code. This is a nice invariant of the "mutate in place" design
   and is worth stating in the Formalized Requirement so CodeDeveloper doesn't
   accidentally break it by creating a fresh Directus user instead of patching the
   existing one.

5. **Upgrade-vs-ordinary-magic-link distinguishing mechanism is unspecified in the
   raw FR and must be designed here.** FR-AUTH-004's `MagicLinkService.requestMagicLink(email)`
   looks up/creates an Authentik user BY THE TARGET EMAIL and sends a magic link
   scoped to Authentik's `magic-link-login` flow. It has no concept of "this send is
   completing an upgrade for an existing OTHER (temp) Authentik user." FR-AUTH-006's
   flow is materially different in shape: the temp user already has an Authentik
   `pk` (found by `telegram_id`), and the NEW email is not yet attached to that `pk`
   — it's a third value supplied at `/upgrade` time. Sending a magic link to that new
   email using the ordinary `requestMagicLink(email)` path would either (a) find no
   existing Authentik user for that email and create an unrelated SECOND Authentik
   user, orphaning the upgrade, or (b) if the email happens to coincide with an
   existing account, sign the caller into the WRONG identity. Neither is correct.
   **Design decision (see Formalized Requirement step 3 for the precise mechanism):
   a short-lived, single-use upgrade-intent record (DB row) keyed by a random token,
   storing `{ authentikUserPk, targetEmail, telegramId, expiresAt }`, minted by the
   new `POST /v1/internal/telegram/upgrade-temp` endpoint and threaded through
   Authentik's Email stage via the flow's `?next=` / state parameter so
   `AuthController.callback()` can recognize "this callback is completing an
   upgrade" and branch accordingly** — the minimum-viable mechanism that doesn't
   require a second Authentik flow or a schema change to Authentik itself. Full
   design in Formalized Requirement.

6. **Request-body shape for `POST /v1/internal/telegram/upgrade-temp`.** FR text says
   `{ telegram_id }` only; AC-1 requires the member to "provide" an email. Resolved:
   the endpoint takes `{ telegramId, email }` — the bot collects the email in one bot
   turn (free-text reply to the `/upgrade` prompt) and sends both fields in a single
   call, matching the sibling `upsert-temp-user` route's single-round-trip shape and
   avoiding a second internal endpoint / stateful bot-side wizard for this PR's
   scope. This decision is binding for the future FR-BOT-002 PR 6/6 bot-side
   `/upgrade` handler (out of scope here, but must match this contract exactly).

7. **Already-used-email error path.** FR-AUTH-005 (Telegram account linking,
   status: Planned, unimplemented) must not be referenced as a working alternative.
   AC-7 is revised to describe a structured error response instructing the user to
   pick a different email, without promising a linking flow that doesn't exist yet
   (see Acceptance Criteria draft, AC-7).

### Conflicts with Existing Features

- None found that block this FR. FR-AUTH-004 (magic-link, prerequisite) is Shipped/
  Implemented and its own AC list explicitly reserves the `is_temporary=false` +
  retroactive-points item for this FR (see FR-AUTH-004.md's AC list, unchecked item
  + Notes: "Depends on FR-AUTH-006... this FR only leaves the extension seam
  FR-AUTH-006 needs").
- FR-AUTH-005 (account linking) is a sibling, not a dependency — no overlap in
  written scope, only touched tangentially by AC-7's error copy (point 7 above).
- FR-GAM-001 (points, Shipped) is referenced by Functional scope item 5 but, per
  point 1 above, the *actual* shipped implementation (Directus flow +
  `PointsDirectusService`) differs from FR-GAM-001's own spec text
  (`GamificationService`, `activities` table). This FR does not need to reconcile
  FR-GAM-001's spec drift — that is a separate, pre-existing documentation debt not
  caused by or in scope for this workflow. Noted here only so CodeDeveloper doesn't
  waste time trying to locate a non-existent `GamificationService`.

### Architectural Feasibility

- **Extension seam is live and correctly placed.** `AuthController.callback()`
  (auth.controller.ts:184-262) is confirmed as the single funnel every auth
  mechanism converges on post-Authentik-session (verified by reading the full
  method — no parallel session-issuance path exists). The FR-AUTH-006 comment block
  at lines 212-219 correctly identifies this as the insertion point. This
  requirement's core logic (branch on `is_temporary`, flip it false, replace email,
  no-op-safe retroactive-award check) belongs here, guarded so it only activates
  when the resolved Authentik user's `attributes.is_temporary === true` AND the
  callback is carrying a valid upgrade-intent token (see point 5 above — this
  prevents an ordinary temp-user password/Telegram-widget sign-in, which does NOT
  go through the upgrade flow, from accidentally triggering email-replacement
  logic it has no target email for).
- **`AuthentikClient.patchAttributes`** (authentik.client.ts:205-209) exists and
  does a full-replace PATCH of `attributes` — callers must merge-then-pass (already
  true for every existing caller, e.g. `exchangeWidgetPayload`'s telegram_id merge).
  Flipping `is_temporary` to `false` must merge with the existing `attributes`
  object (preserving `telegram_id`), not overwrite it.
- **No dedicated "replace email" method exists** on `AuthentikClient`. Per
  `setUserGroups`/`disableUser`'s established pattern (`PATCH /api/v3/core/users/{pk}/`
  with a partial body), a new `AuthentikClient.setUserEmail(pk, email)` method
  (or folding it into a generic `updateUser(pk, partial)`) is a small, in-pattern
  addition. Atomicity concern from the FR's own Notes ("must be atomic to avoid
  constraint violations") is addressed by: (1) checking for an existing Authentik
  user with the target email FIRST (reject before mutating anything if found — this
  IS the AC-7 already-used-email path), (2) only then issuing the single PATCH.
  There is no multi-step Authentik-side transaction to worry about — one PATCH
  either succeeds or fails atomically at the Authentik API layer itself.
- **Directus-side email replacement**: the `directus_users` row created by
  `DirectusUsersBridgeService.ensureLinked()` (fired from `callback()` right after
  `upsertByAuthentikSubject()`) will already carry the NEW real email on its very
  first creation, because `ensureLinked` runs AFTER this FR's `is_temporary`/email
  logic in the callback and reads `user.email` off the just-upserted `platform.users`
  row — so as long as this FR's logic mutates the email in Authentik AND passes the
  corrected email through to `upsertByAuthentikSubject` in the SAME callback
  invocation (not a separate round trip), no separate "patch the Directus row"
  step is needed — `ensureLinked`'s existing `findOrCreate`/`maybeBackfill` path
  handles it for free. This is a materially simpler design than a bespoke Directus
  PATCH and should be CodeDeveloper's default approach; call this out explicitly
  since it's non-obvious from reading the FR text alone.
- **No inviolable architecture rule is violated.** Single monorepo, no cross-schema
  query, module boundaries (Auth module owns this) all respected. The upgrade-intent
  token storage is a new, small addition to the existing Drizzle `platform` schema
  (a new table, sibling to `refresh_tokens`/`jti_revocations`), consistent with
  existing patterns for short-lived flow state.
- **`is_temporary`/`isTemp` footprint is narrow** — confirmed via grep, appears only
  in `auth.controller.ts` and `telegram-auth.service.ts`. No `registrations` or
  `points` module code branches on it today, consistent with point 4's finding that
  temp users never reach those code paths at all.

## Formalized Requirement

**FEAT-AUTH-6** — Temporary account upgrade (Telegram-only → full member)

A Telegram-only member (`attributes.is_temporary=true` in Authentik, no
`platform.users`/`directus_users` row yet) can supply a real email address via the
bot's `/upgrade` command (bot-side implementation is FR-BOT-002 PR 6/6, NOT in this
workflow's scope — this workflow ships only the API surface + callback logic the
bot command will call). Completing email verification via Authentik's magic-link
Email stage (FR-AUTH-004) flips the account to full-member status: `is_temporary`
is cleared, the synthetic `tg<id>@telegram.local` email is replaced with the real
one on the SAME Authentik user record (same `pk` — never a second account), and the
member's very first `platform.users`/`directus_users` rows are created at this
moment (not before — see Analysis point 4), which is what makes them eligible to
register for events, appear on the leaderboard, and edit their profile from that
point forward.

Cross-refs: depends on FR-AUTH-004 (Implemented) for the Email-stage magic-link
mechanism; supersedes/corrects FR-GAM-001's stale `GamificationService`/`activities`
references (no code change to FR-GAM-001 needed — see Analysis point 1); does not
depend on or build any part of FR-AUTH-005 (Planned, unimplemented) beyond
referencing it descriptively in an error message; is a prerequisite for the future
FR-BOT-002 PR 6/6 bot-side `/upgrade` command (out of scope here).

### Step-by-step mechanism

1. **`POST /v1/internal/telegram/upgrade-temp`** — new route on the existing
   `TelegramInternalController` (`@Controller('v1/internal/telegram')`,
   `InternalAuthGuard`-protected), same file/pattern as sibling
   `upsert-temp-user`/`lookup`/etc. routes.
   - Body: `{ telegramId: string, email: string }` (Zod schema, mirrors
     `upsertTempUserBodySchema`'s `telegramId` field + `emailField(200)` from
     `lib/email-schema.ts`, matching `registerSchema`'s own email validation).
   - Logic:
     a. Look up the Authentik user by `telegram_id` (`AuthentikClient.getUserByTelegramId`,
        already exists). 404 (`{ error: 'telegram_user_not_found' }`, matching
        `lookupUser`'s convention) if none.
     b. If `attributes.is_temporary !== true`, this is not a temp account — reject
        with a 409 (`{ error: 'not_a_temp_account' }`) rather than silently
        proceeding; this is a genuinely new user-facing case (calling `/upgrade`
        twice, or on an already-full account) with no prior-art error shape to
        copy, so define it here.
     c. Check for an existing Authentik user with the target `email` (excluding the
        caller's own temp user — always true since the temp user's email is the
        synthetic one). If found → AC-7 path: reject with a structured error (see
        Acceptance Criteria AC-7) WITHOUT mutating anything.
     d. Mint an upgrade-intent row: `{ token (random, e.g. 32-byte base64url),
        authentikUserPk, telegramId, targetEmail, createdAt, expiresAt (short TTL —
        match FR-AUTH-004's magic-link TTL class, e.g. 30 min), consumedAt (null) }`
        in a new small Drizzle table (e.g. `upgrade_intents`), sibling to
        `refresh_tokens`.
     e. Call `AuthentikClient.sendMagicLinkEmail(...)` — SAME primitive
        FR-AUTH-004's `MagicLinkService` uses — but targeting the EXISTING temp
        user's `pk` (not creating/looking-up-by the new email, since the new email
        isn't attached to any Authentik user yet and must not be, until
        verification succeeds). This requires sending the magic link to an email
        ADDRESS that differs from the Authentik user's CURRENT email-of-record —
        confirm during implementation that Authentik's `recovery_email` endpoint
        accepts an explicit target email parameter (or send via a different
        Authentik primitive if it strictly emails the user's on-file address only;
        CodeDeveloper must verify this against the real Authentik API, same
        "live-verify before trusting the docs" discipline FR-AUTH-004's own Notes
        demonstrate was necessary for its TTL assumption).
     f. Encode the upgrade-intent `token` into the flow's redirect/state so it
        round-trips back to `AuthController.callback()` — the minimum-viable
        mechanism: pass it as the `next` query param value on the login flow (e.g.
        `next=/auth/upgrade-complete?token=<token>`), reusing the EXISTING
        `next`-carrying machinery in `auth.controller.ts`/`auth.service.ts`
        (`sanitiseNext`, the flow cookie's `next` field) rather than inventing a
        second state-passing channel. `callback()` already extracts `next` from
        `completeAuthorization()`'s return value (auth.controller.ts:196) — this FR
        adds a check: if `next` matches the `/auth/upgrade-complete?token=...`
        shape, look up the token in `upgrade_intents`, and only if a valid, unexpired,
        unconsumed row exists AND its `authentikUserPk` matches the just-authenticated
        `sub`, proceed with the upgrade branch below. Any mismatch (expired,
        consumed, wrong user) falls through to ordinary sign-in behavior — never a
        hard error, since an ordinary sign-in must not be describable as broken by
        upgrade-token edge cases.
     g. Response: `{ ok: true }` (matching FR-AUTH-004's anti-enumeration posture —
        do not leak whether telegram_id/email combination is valid via response
        shape beyond the already-established AC-3/AC-7 error cases, which ARE
        allowed to be specific per this FR's own ACs).

2. **`AuthController.callback()` upgrade branch** — inserted at the existing
   extension-seam comment (lines 212-219), BEFORE `upsertByAuthentikSubject()`:
   - If step 1(f)'s token check succeeds: merge-patch Authentik attributes to set
     `is_temporary: false` (preserving `telegram_id`), patch the Authentik user's
     `email` to the verified target email (new `AuthentikClient.setUserEmail` or
     equivalent), mark the `upgrade_intents` row `consumedAt = now()`, and use the
     NEW email (not the `email` value `completeAuthorization()` returned, which
     will still be the pre-verification synthetic one from the id_token minted
     before this patch) when calling `upsertByAuthentikSubject()` immediately
     below — this is what makes `platform.users`/`directus_users` come into
     existence with the correct real email on their FIRST row, per Analysis'
     Architectural Feasibility note on `ensureLinked` ordering.
   - If no valid upgrade token: existing behavior, completely unchanged (this is
     the ordinary sign-in path for every other user/mechanism).

3. **Retroactive points backfill**: per Analysis point 4(b), no separate write
   operation. `PointsDirectusService.leaderboard()`/`totalForUser()` already key
   purely off `directus_users.id` with no `is_temporary` filter — once the
   `directus_users` row exists (created in step 2 via `ensureLinked`), any FUTURE
   registrations/check-ins correctly accrue points with zero additional code. The
   only thing this FR must verify (TestDesigner/CodeDeveloper) is that a
   just-upgraded user's FIRST post-upgrade registration/check-in flows through
   normally — no special-casing needed since `is_temporary` isn't referenced
   anywhere in the registrations/points modules.

4. **CRM-sync AC (AC-6) reinterpretation**: satisfied by step 2's Directus email
   patch alone (via `ensureLinked`, or an explicit `directus.patch('/users/{id}',
   {email: ...})` if a `directus_users` row already exists at upgrade time from
   some other path — defensive, low-probability case). No Twenty API integration.

## Acceptance Criteria (draft)

- **AC-1**: Given a temp Telegram-only user (`is_temporary=true`, no
  `platform.users` row), when the bot (or a direct API caller, for this FR's
  testing purposes) calls `POST /v1/internal/telegram/upgrade-temp` with
  `{ telegramId, email }` for an email not already in use, then the response is
  `{ ok: true }` and the user receives a magic-link email at the supplied address
  within 60 seconds (same SLA as FR-AUTH-004 AC-1).

- **AC-2**: Given a valid, unexpired upgrade-intent token was issued by AC-1, when
  the user clicks the magic link and completes the Authentik Email-stage flow, then
  `AuthController.callback()` sets `attributes.is_temporary=false` on the Authentik
  user (preserving `attributes.telegram_id`) and replaces the Authentik user's email
  with the verified target address, in a single PATCH request that never leaves the
  user in a mixed state (old email + is_temporary=false, or new email +
  is_temporary=true).

- **AC-3** (revised from the raw FR's "past attended events retroactively award
  points" — see Analysis point 4 for why the literal claim is architecturally
  incoherent): Given the upgrade in AC-2 has completed, when the member registers
  for and is checked into any event AFTER upgrading, then their points correctly
  accrue via the existing `reg-checkin-points` Directus flow and appear on
  `leaderboard()`/`totalForUser()` — i.e., no `is_temporary`-related gate blocks a
  freshly-upgraded member from earning/appearing normally. (There is no
  "past attended events" case to test for a genuinely temp-only user, per Analysis
  point 4 — TestDesigner should not attempt to seed pre-upgrade attendance for a
  temp user, since that state is not reachable through any existing write path.)

- **AC-4**: Given the upgrade in AC-2 has completed, when the member signs in on
  the web and visits `/me` (or equivalent profile-edit surface), then they can edit
  their profile — this is a consequence of now having a `platform.users` +
  `directus_users` row (profile-edit endpoints already gate on an authenticated
  session backed by those rows; no `is_temporary` check exists there to remove,
  since profile-edit was simply unreachable before for lack of a session at all).

- **AC-5**: Given the upgrade in AC-2 has completed and the member subsequently
  earns points (AC-3), when the per-country leaderboard is queried, then the member
  appears in it, subject to the existing `appear_on_public_leaderboard` opt-out
  default-on behavior already implemented in `PointsDirectusService.leaderboard()`
  (unchanged by this FR).

- **AC-6** (CRM-sync, reinterpreted): Given the upgrade in AC-2 has completed, when
  the member's Directus (`directus_users`) row is created or updated during the
  callback, then it carries the real, verified email — not the synthetic
  `tg<id>@telegram.local` placeholder — satisfying the "member record reflects
  reality" intent of the original AC without any Twenty CRM integration (Twenty is
  retired per ADR-0033; there is no external CRM record to sync).

- **AC-7** (revised — do not imply FR-AUTH-005 is a working feature): Given a temp
  user calls `POST /v1/internal/telegram/upgrade-temp` with an email already
  belonging to another Authentik user, when the API processes the request, then it
  returns a 409 with a structured body (e.g. `{ error: 'email_already_in_use' }`)
  and the bot-side copy (future FR-BOT-002 PR 6/6, not built here) is expected to
  render a message instructing the user to try a different email — WITHOUT
  promising Telegram-account-linking as an alternative, since FR-AUTH-005 is
  unimplemented (`status: Planned`). No mutation occurs on this path (existing temp
  account is untouched, no upgrade-intent token is issued).

- **AC-8** (new — not in the raw FR, added because Analysis point 5 identified it as
  necessary for correctness): Given an upgrade-intent token has expired or was
  already consumed, when its magic link is clicked, then `callback()` falls through
  to ordinary sign-in behavior for that Authentik user (no `is_temporary` mutation,
  no email replacement) rather than erroring — an expired/reused upgrade link must
  never brick the user's ability to sign in at all via that same link (Authentik's
  own single-use FlowToken semantics already prevent the underlying magic-link
  click from being replayed for SESSION purposes; this AC is specifically about the
  upgrade-branch's OWN token being separately expired/consumed without corrupting
  session issuance).

## Gate Result

```yaml
gate: RequirementAnalyst
status: passed
reason: >
  FR-AUTH-006 is specific, testable, non-conflicting, and architecturally
  feasible once corrected. Three stale-spec issues found and resolved in the
  formalized requirement: (1) GamificationService does not exist -- shipped
  points architecture is a Directus flow + PointsDirectusService, no
  application-layer award service; (2) status=checked_in does not exist --
  the real terminal status is 'attended'; (3) Twenty CRM is retired per
  ADR-0033 -- AC-6 is reinterpreted as the Directus directus_users email
  patch, not a Twenty sync. The core architectural crux -- whether temp
  users can register for events / have any point_awards to retroactively
  backfill -- was resolved by tracing every registration write path
  (RegistrationsDirectusService.register, TelegramAuthService.
  registerViaTelegram/cancelViaTelegram) to their shared
  DirectusUsersBridgeService gate, which requires a platform.users row that
  ONLY AuthController.callback() creates (i.e. only after a completed OIDC
  session). A temp, Telegram-only user never completes one, so they cannot
  accrue any registrations/point_awards rows before upgrading -- this
  CORRECTS the workflow's own handoff.yaml notes, which assumed the
  reg-checkin-points flow could fire for temp users pre-upgrade. AC-3 is
  revised accordingly: "retroactive backfill" resolves to "points accrue
  correctly starting immediately after upgrade, with zero special-case
  code," not a backfill query against nonexistent historical data. The
  upgrade-vs-ordinary-magic-link distinguishing mechanism is fully
  specified: a short-lived upgrade_intents DB row keyed by a token threaded
  through the existing `next`-redirect machinery already used by
  auth.controller.ts/auth.service.ts, requiring no new Authentik-side flow
  and no parallel session-issuance path. business_process is intentionally
  left unset (see note below) -- BP-UAT-009 does not fit this FR's actual
  mechanism (account-state mutation + email replace + points), and forcing
  a link would misrepresent UAT coverage.
next_agent: ImpactAnalyzer
open_questions:
  - "AuthentikClient.sendMagicLinkEmail's exact parameter contract needs a
    live check: can it target an email address that differs from the
    Authentik user's CURRENT email-of-record (required for step 1(e) --
    sending to the NEW email before it's attached to the user), or does it
    strictly email the on-file address? FR-AUTH-004's own Notes document a
    precedent for API-behavior assumptions being wrong until live-verified
    (the token-TTL source turned out to be Tenant.default_token_duration,
    not EmailStage.token_expiry) -- CodeDeveloper must repeat that
    live-verification discipline here rather than trust either this
    analysis or the raw FR's assumption."
  - "Exact TTL for the upgrade_intents token is left as an implementation
    choice (recommended: match FR-AUTH-004's observed ~29min Authentik
    Tenant.default_token_duration, since the email itself is minted via the
    same underlying Authentik mechanism and will already carry that
    session-level TTL -- an independently shorter upgrade_intents-table TTL
    is a legitimate additional tightening but must not be LONGER than the
    email's own link lifetime, since a token that outlives its email link is
    inert dead code)."
```
