# Step 1 — Requirement Validation

**Workflow:** wf-20260801-feat-176
**Requirement:** FR-BOT-002 PR 3/6 — `/me`

## Scope confirmed

Per `docs/03-requirements/FR-BOT-002.md`'s functional-scope table and
Implementation-progress table (PR 1/6 and PR 2/6 already shipped and
merged — `wf-20260731-feat-174`, `wf-20260801-feat-175`):

> `/me` — Shows the user's registrations (upcoming + recent), points
> total, streak, and account type (temp/full). Includes "Link Telegram to
> web" CTA if not linked.

AC under test (from FR-BOT-002.md's Acceptance criteria list): "`/me`
correctly shows all active registrations with status badges." No AC tests
streak. No AC tests the "Link Telegram to web" CTA's presence/absence
logic in either direction.

## Data-source findings (re-confirmed live against the actual code, not re-derived from memory)

1. **Registrations** — `RegistrationsDirectusService.listMine({userId,
   countryCode})` (`apps/api/src/modules/registrations/registrations-directus.service.ts:219`)
   is directly reusable. Returns every non-cancelled registration for the
   user, tenant-scoped, each row carrying `status` ('registered' |
   'waitlisted' | 'attended') plus embedded event summary (id, title,
   startsAt, endsAt, location). Same service the existing `GET
   /v1/registrations/mine` web endpoint already calls
   (`registrations.controller.ts:127`). Requires the platform `userId`,
   obtained via `DirectusUsersBridgeService.resolveUserIdFromDirectusId()`
   — already built in PR 2, reused unchanged.

2. **Points total** — `PointsDirectusService.leaderboard()`
   (`apps/api/src/modules/points/points-directus.service.ts:72`)
   aggregates `point_awards` via a Directus `aggregate[sum]=points`
   query grouped by `user`, then joins `platform.users` for display
   fields. There is no existing single-user variant. Plan: add
   `PointsDirectusService.totalForUser(directusUserId, countryCode)` —
   the same `/items/point_awards` aggregate endpoint, scoped by
   `filter[user][_eq]=<directusUserId>` instead of `groupBy: 'user'` +
   `limit`, still filtered by `filter[country][_eq]` for tenant
   consistency with `leaderboard()`'s own filter. Reuses the identical
   Directus aggregate primitive `leaderboard()` already relies on — no
   new points-calculation business rule is introduced, only a narrower
   filter. `window` parameter is NOT exposed to the bot (out of scope
   for a lifetime "points total" figure on a snapshot dashboard;
   `leaderboard()`'s `window` param defaults to `'all'` and `/me` uses
   that default only).

3. **Streak — confirmed absent, confirmed out of scope for this PR.**
   Repo-wide search for "streak" (case-insensitive) across
   `apps/api/src`, `apps/bot/src`, Directus collection definitions
   (`infrastructure/directus/`), and `docs/` turns up **zero** hits
   outside FR-BOT-002.md's own functional-scope table and this PR's
   history. No column, no view, no aggregation, no ADR, no product
   decision defines what a "streak" would mean here (consecutive events
   attended? consecutive weeks active? consecutive logins?) — all three
   are materially different features with different data requirements,
   and picking one silently would be inventing product behavior, which
   AGENTS.md §14 places outside a CodeDeveloper's authority ("design
   choices with real product-behavior consequences" are explicitly
   *not* in the "decide and proceed" bucket the rest of §14 grants).
   FR-BOT-002's own AC list does not test a streak value. **Decision:
   omit streak from `/me`'s rendered output in this PR** (option (a) from
   the task brief) — documented here, in the FR's progress note (Step 9),
   and as a named follow-up gap (not a fabricated number, not a silent
   drop). See "Follow-up: streak definition" below.

4. **Account type (temp/full)** — already resolved. The bot's own
   `AuthMiddleware` (`apps/bot/src/middlewares/auth.py`) calls `POST
   /v1/internal/telegram/lookup` on every update and attaches
   `UserContext.is_temp` to `data["user_context"]` before the handler
   runs (confirmed live in `_resolve()`, mirrors `TelegramAuthService
   .lookupUser()`'s own `isTemp` field, sourced from Authentik's
   `attributes.is_temporary`). No new API call is needed for this field —
   `/me`'s handler reads `user_context.is_temp` directly, same pattern
   `cancel.py`/`event_detail.py` already use for `user_context
   .directus_user_id`/`.country`.

5. **"Link Telegram to web" CTA** — investigated the only "linked"
   concept that exists anywhere in this codebase:
   `directus_users.telegram_user_id` / `telegram_linked_at` /
   `telegram_opted_out_at` (ADR-0033, read/written by the OLD
   `apps/api/src/modules/telegram/` module — `telegram.controller.ts`,
   `telegram-me.service.ts`). ADR-0034 (2026-07-31 update) confirms this
   old module predates and is architecturally superseded by the new
   `aiqadam-telegram-bot` submodule (FR-BOT-001/002's actual bot):
   the new bot's identity model is Authentik-attribute-based
   (`is_temporary` flag, resolved via `TelegramAuthService.lookupUser`),
   entirely independent of `directus_users.telegram_user_id`. These are
   two different, non-interoperating auth surfaces built at different
   times for different bot architectures — the old module's
   `link/start`/`link/confirm` HTTP routes are not called by the new
   bot and were correctly excluded per the task brief's own instruction
   ("do not call its HTTP routes, just look at what 'linked' means
   data-wise"). Reading `directus_users.telegram_user_id` from the new
   bot's `/me` would require conflating these two systems (does a row
   written by the OLD bot's link flow mean anything for a user who has
   never touched that flow? No clear answer exists, and no AC tests
   this). **Decision: no queryable "is linked" signal exists for the new
   bot's identity model without disproportionate new plumbing (a new
   column/flow tying Authentik temp-user identity to a "web account"
   concept, which is exactly what PR 6/6's `/upgrade` flow is scoped to
   build).** `/me` shows a generic, always-present "Link account on web"
   CTA that is harmless regardless of link state (same posture as
   showing "coming soon" labels for unimplemented commands in `/help` —
   informational, not gated on unavailable data), phrased to reference
   `/upgrade` (PR 6/6) without implementing that flow. This is option
   "something else" from the task brief's menu — closest in spirit to
   the streak decision (don't fabricate a computed boolean from data
   that doesn't reliably mean what it would need to mean) but the CTA
   itself is cheap/harmless to always show, unlike a fabricated streak
   number.

## Business-Process linkage re-check

`FR-BOT-002.md`'s `business_process` frontmatter is currently
`[BP-UAT-010]` (event registration flow), set by PR 2. Cross-referenced
`docs/02-business-processes/uat/registry.md` for a better-fitting code:

- `BP-UAT-003` (Member self-service profile) — read its full spec. Covers
  `/me/profile` web page: core fields, skills, interests, employments,
  consent toggles. Zero overlap with what `/me` in the bot shows
  (registrations, points, account type) — different data, different
  surface, no shared AC. Not a fit.
- `BP-UAT-012` (Points engine and leaderboard) — never run, no spec
  authored (`—` in the Spec column), and titled around the leaderboard
  surface (PR 4/6's scope), not a single-user points readout embedded in
  a registrations dashboard.

Neither is a clean fit. Per `protocol.md`'s "Business-Process Linkage"
section ("do not invent a link... a missing BP-UAT script is itself a
finding for `ISS-UAT-COV-*`-style follow-up, not a blocker") and the task
brief's explicit instruction not to force a link that doesn't fit:
**`business_process` stays `[BP-UAT-010]`, unchanged.** `/me`'s
registrations-list surface is still within BP-UAT-010's domain (it
renders the same registration rows BP-UAT-010 already creates/cancels,
now with Cancel-button affordance per the task brief), so Step 13 will
re-verify `/me`'s registration rendering as part of the existing
BP-UAT-010 re-run rather than a new script. No new `BP-UAT-NNN` code is
minted.

## Follow-up: streak definition (recorded, not silently dropped)

No issue is filed for this — FR-BOT-002.md's Implementation progress
note (Step 9) records the gap explicitly with a pointer back to this
file, which is the honest-disclosure mechanism the task brief asked for.
A dedicated streak feature (if the product wants one) needs its own
requirement pass to define what "streak" means (attendance-based?
activity-based? time-windowed?) before any agent should compute or
display a number under that name. This is a genuine "what to build"
product question (AGENTS.md §13), not a "how to build it" implementation
detail — surfaced, not resolved, here.

## Scope for this PR

**API:** `GET /v1/internal/telegram/me` — new route on the existing
`TelegramInternalController` (`apps/api/src/modules/auth/auth.controller.ts`),
`InternalAuthGuard`-protected, Zod-validated query
(`directusUserId`, `country`). Aggregates:
- `registrations`: from `RegistrationsDirectusService.listMine()`
- `pointsTotal`: from new `PointsDirectusService.totalForUser()`
- (account type and link-CTA are NOT part of this response — both are
  resolved bot-side from data already on `UserContext`, per findings 4
  and 5 above; no server round-trip needed for either)

**Bot:** `/me` command handler. Renders:
- Registrations list with status badges (registered / waitlisted /
  attended — matching `RegistrationsDirectusService`'s own `Status`
  union; `cancelled` rows are excluded server-side by `listMine`'s own
  filter, so the bot never has to render a cancelled badge). Each row
  gets a Cancel inline button reusing `/cancel <N>`'s existing API call
  (`event_detail.py`'s own comment flagged this as deferred to PR 3: "a
  Cancel button here is deferred to PR 3's /me registration list").
- Points total.
- Account type: a plain "temporary account" nudge-to-upgrade line when
  `user_context.is_temp` is true (FR-BOT-002 Notes: "the `/me` command
  shows a nudge to upgrade" for temp users), nothing extra for full
  accounts.
- Generic "Link account on web" CTA line (always shown, per finding 5).

## Out of scope (unchanged from task brief)

`/leaderboard`, `/interests`, `/upgrade`'s actual flow, `/start`
refinements. Streak (documented gap, not built).

## Gate Result

gate_result:
  status: passed
  summary: "FR-BOT-002 PR 3/6 (/me) scope validated: registrations + points aggregation is buildable by reuse, streak is a genuine out-of-scope product gap (documented, not built), account type needs no new API call, link-CTA resolved as a generic always-shown line rather than querying an unrelated legacy auth surface. business_process stays [BP-UAT-010] — no better-fitting BP-UAT code exists."
  findings:
    - "Registrations: RegistrationsDirectusService.listMine() directly reusable, no new business logic."
    - "Points total: PointsDirectusService needs one new method (totalForUser), same aggregate primitive as leaderboard(), no new calculation rule."
    - "Streak: zero references anywhere in the codebase; no AC tests it; omitted and documented as a product-scope gap per AGENTS.md §13/§14, not fabricated."
    - "Account type: already on the bot's own UserContext.is_temp via AuthMiddleware — zero new API surface needed."
    - "Link CTA: no queryable 'is linked' signal exists for the new bot's Authentik-based identity model; the only 'linked' concept in the repo (directus_users.telegram_user_id) belongs to a superseded, unrelated auth surface (ADR-0034 2026-07-31 update) and conflating them would be incorrect, not just extra plumbing. Resolved as a generic always-shown CTA line."
    - "business_process cross-checked against BP-UAT-003 and BP-UAT-012 in docs/02-business-processes/uat/registry.md; neither is a clean fit; left as [BP-UAT-010] unchanged, no new code invented."
