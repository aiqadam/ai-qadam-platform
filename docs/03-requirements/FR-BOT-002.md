---
code: FR-BOT-002
name: Bot member commands
status: Implemented
module: Telegram Bot (BOT)
phase: Roadmap Sprint 6
github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/140
business_process: [BP-UAT-010]
---

## Description

The bot exposes a set of commands covering the full member journey: discovering events, registering, managing their account, viewing the leaderboard, managing interests, and upgrading a temporary account. All commands call the NestJS API; the bot renders responses from API data.

## Users

Members (including temporary Telegram-only accounts).

## Functional scope

| Command | Description |
|---|---|
| `/start` | Welcome message + country selection (for new users) + interest selection. Creates temp account via FR-AUTH-002. |
| `/events` | Lists upcoming events for the user's country. Paginated if > 5 events. Each event shows title, date, registration count. |
| `/event <N>` | Shows full detail for event N (title, date, venue, description, capacity). Inline buttons: Register / I'm going (if already registered). |
| `/register <N>` | Registers the user for event N. Calls `POST /v1/internal/telegram/register` → proxies to `RegistrationsDirectusService.register()` (same service `POST /v1/events/:id/register` uses). Returns confirmation with the event title — **not** a QR deep-link; confirmed during PR 2/6 that no QR/deep-link field exists anywhere in the real registration response or the live web UI (see `BP-UAT-010.md`'s own Notes — a prior doc revision assumed a QR-code UI that was never built). This row corrects that stale wording. |
| `/cancel <N>` | Cancels registration for event N. Calls `DELETE /v1/internal/telegram/register` → proxies to `RegistrationsDirectusService.cancel()`. |
| `/me` | Shows the user's active registrations (with status badges + a Cancel button per row) and points total. Streak and account type (temp/full) — see "Implementation progress" below: streak is not built (documented scope gap, no such concept exists anywhere in this codebase), and account type is resolved bot-side from the existing `is_temp` flag rather than via this row's original "shows account type" wording implying a new API field. Shows a generic "Link account on web" CTA (not conditioned on a real link-state signal — see progress note). |
| `/leaderboard` | Shows top 10 members for the user's country. Temp users excluded. Highlights the calling user's position if they appear. |
| `/interests` | Shows current topic interests as toggle buttons. Tapping a topic adds or removes it. |
| `/upgrade` | Prompts for email to start the temp-account upgrade flow (FR-AUTH-006). Sends a magic-link. |
| `/help` | Lists all available commands with one-line descriptions. |

**Command implementation requirements:**
1. **Inline keyboards** — All multi-choice responses use aiogram inline keyboard markup.
2. **Pagination** — `/events` uses "Next page →" / "← Previous page" inline buttons with offset-based pagination.
3. **Language** — All bot messages in Russian (primary). English strings available via `locales/en.json` for users with `locale=en`.
4. **Error states** — Each command handles: API unavailable (retry message), user not found (redirect to `/start`), event not found (error message), already registered (idempotent message).
5. **Temporary account limits** — Temp users can use all commands except `/leaderboard` (excluded from results). The `/me` command shows a nudge to upgrade.

## Acceptance criteria

- [x] `/events` returns the correct list of upcoming events for the user's country.
- [x] `/register 5` registers the user for event 5; they receive a confirmation message with the event title.
- [x] Registering for a fully-booked event returns a waitlist confirmation.
- [x] `/cancel 5` cancels the user's registration and triggers waitlist promotion.
- [x] `/me` correctly shows all active registrations with status badges.
- [x] `/leaderboard` shows top 10 members; the caller's row is highlighted if they appear.
- [x] `/upgrade` starts the email verification flow and sends the magic-link email.
- [x] A temporary user is excluded from `/leaderboard` results.
- [ ] All commands respond within 3 seconds under normal conditions. **Not independently measured across the full 10-command set** — see "Implementation progress" PR 6/6 entry's honesty disclosure below. Individual commands have never shown latency concerns in live verification (typical local-stack response times observed informally across PRs 1-6 were well under 1s), but no dedicated timing harness or measurement pass has ever been run. Left unchecked rather than claiming a measurement that was never actually taken.

## Notes

- State machine (aiogram FSM) is used only for multi-step flows like `/start` (country selection → interest selection) and `/upgrade` (email collection).
- The bot registers commands with BotFather via `set_my_commands` on startup.
- All API calls use the `INTERNAL_API_TOKEN` shared secret header. The
  header name on the wire is `x-internal-auth` (see
  `InternalAuthGuard`) — this Notes section previously said
  `X-Internal-Token`; corrected here to match the actual implemented
  header name, confirmed against `internal-auth.guard.ts` and every
  route under `v1/internal/*`.

## Implementation progress

This FR ships across a planned 6-PR sequence. Status below reflects what
has actually landed; do not infer completeness from the `status:`
frontmatter alone (kept at `Planned` — see rationale in this workflow's
`01-requirement-validation.md` — the repo's FR frontmatter enum has no
literal "in progress" value, and this PR intentionally does not claim
`Implemented` while PR 6/6 (`/upgrade`) remains unshipped). `requirements-registry.md`'s
Status column is the accurate source for "work has started": `In Progress`
(set by PR 1, unchanged through PR 5 — matches the existing `FR-AUTH-002`
precedent for a multi-PR FR).

**PR 1/6 — shipped:** `/help`, `/events`, `/event <N>` — read-only,
lowest-risk slice. API: `GET /v1/internal/telegram/events`,
`GET /v1/internal/telegram/events/:id` (both `InternalAuthGuard`-protected,
Zod-validated). Bot: three new handlers, first real inline keyboards
(pagination + Register/"I'm going" placeholder — actual registration was
PR 2), BotFather command registration extended (excluding `/event`, which
takes a required argument). See `.copilot/tasks/completed/wf-20260731-feat-174/`
for full detail.

**PR 2/6 (this PR) — shipped:** `/register <N>`, `/cancel <N>` —
registration + cancellation. API: `POST /v1/internal/telegram/register`,
`DELETE /v1/internal/telegram/register` (both `InternalAuthGuard`-protected,
Zod-validated), reusing `RegistrationsDirectusService` directly (no
duplicated capacity/waitlist logic — that stays Directus-flow-owned).
Added a reverse `directusUserId` -> platform `users.id` lookup to
`DirectusUsersBridgeService` (didn't exist before; every prior consumer
went the other direction). Bot: PR 1's placeholder Register button now
performs a real registration; new `/register <N>` command and `/cancel <N>`
handler, two distinct confirmation messages (normal vs. waitlist) keyed
off the service's own `status` field. `business_process` frontmatter
above set to `[BP-UAT-010]` by this PR (was `[]`) — confirmed against
`docs/02-business-processes/uat/registry.md`. QR-deep-link wording in the
functional-scope table above corrected (was stale — see that row's own
note). EULA/`RegistrationConsentRequiredError` is not collected by the bot
in this PR — a plain fallback message points to the web instead, since no
mature consent-prompt UI exists anywhere in this codebase yet to mirror
(see `01-requirement-validation.md`'s finding). One pre-existing bug
(`ISS-BOT-REG-001` — a Directus 403 wasn't mapped to
`RegistrationNotFoundError`, only 404 was, causing an unhandled 500 for a
genuinely nonexistent event id) was found live during verification and
fixed in the same PR, with regression tests. See
`.copilot/tasks/completed/wf-20260801-feat-175/` (once archived) for full
detail.

**PR 3/6 (this PR) — shipped:** `/me` — active registrations (with status
badges + a Cancel button per row) and lifetime points total. API: new
`GET /v1/internal/telegram/me` (`InternalAuthGuard`-protected,
Zod-validated), aggregating `RegistrationsDirectusService.listMine()`
(PR 2's registration path, reused unchanged) and a new
`PointsDirectusService.totalForUser()` — a single-user variant of the
existing `leaderboard()` aggregate query (same Directus primitive, no new
points-calculation rule, just a narrower filter). Bot: new `/me` command
handler + `keyboards/me.py`'s per-registration Cancel button (reusing PR
2's `cancel_registration` call — no new cancellation logic, only a new
trigger surface), added to `BOT_COMMANDS`.

Two scope decisions made explicit rather than silently resolved:

- **Streak is NOT built.** No streak concept, column, view, or
  calculation exists anywhere in this codebase (API, bot, Directus
  collections, or docs) — confirmed by a targeted search across all four.
  None of FR-BOT-002's ACs test a streak value, and inventing a
  scoring/streak definition (consecutive events attended? consecutive
  active weeks? something else?) is a genuine product decision with
  real user-facing consequences, not an implementation micro-decision —
  outside a CodeDeveloper's authority per `AGENTS.md` §14. `/me` simply
  omits it. A future PR can add a real streak feature once the product
  defines what "streak" means here; until then this is a documented gap,
  not a silently dropped promise or a fabricated number. See
  `wf-20260801-feat-176/01-requirement-validation.md` finding 3 for the
  full reasoning, and `test_render_me_never_mentions_streak` in
  `apps/bot/tests/test_me_command.py` for the regression guard against
  silently reintroducing a placeholder later.
- **Account type needs no new API field.** The bot's own `AuthMiddleware`
  already attaches `user_context.is_temp` on every update (resolved via
  the existing `TelegramAuthService.lookupUser`/`isTemp` path, unchanged
  since FR-BOT-001) — `/me` reads it directly rather than round-tripping
  through a new API response field. Temp accounts see an upgrade nudge;
  full accounts don't.
- **"Link Telegram to web" CTA is a generic, always-shown line, not a
  computed boolean.** The only "linked" concept anywhere in this repo
  (`directus_users.telegram_user_id`/`telegram_linked_at`, ADR-0033) is
  owned by the OLD, superseded `apps/api/src/modules/telegram/` module —
  a different auth surface predating ADR-0034's aiogram-submodule bot
  architecture, with no relationship to this bot's Authentik-attribute-
  based identity model. Reading that column from the new bot's `/me`
  would conflate two unrelated auth systems for a nicety no AC tests.
  `/me` instead always shows a static CTA line pointing at `/upgrade`
  (PR 6/6's scope) — harmless regardless of actual link state, same
  posture `/help`'s "(coming soon)" labels already use for
  not-yet-built commands.

`business_process` frontmatter stays `[BP-UAT-010]` — cross-checked
against `docs/02-business-processes/uat/registry.md`'s `BP-UAT-003`
(member self-service profile — covers the unrelated `/me/profile` web
page, zero overlap) and `BP-UAT-012` (points/leaderboard — never run, no
spec, titled around PR 4/6's leaderboard surface, not a single-user
readout); neither is a clean fit, so no new code was invented per
`protocol.md`'s "don't force a link" guidance. `/me`'s registration
rendering is still within BP-UAT-010's existing domain — **Step 13
post-merge re-verification ran for real** (direct HTTP verification
against the merged `main` commit `767ec06`, same format PR 2 established,
not a spawned Playwright subworkflow): registered `uat-member@example.com`
for `UAT Open Event (UZ)` via the internal register route, confirmed
`/me` immediately reflected it (registration id + status matched the real
Directus row exactly, `pointsTotal` incremented 135→140 from the real
`point_awards` register-time award), cancelled via the exact route `/me`'s
new Cancel button calls, confirmed `/me` correctly excluded it afterward
(cross-referenced against the Directus row's `status: cancelled` +
`cancelled_at`), and confirmed idempotent re-cancel returns
`not_registered` without erroring. No new issues found; all 8
stakeholders of `BP-UAT-010` (`FR-BOT-002`, `FR-EVT-004`,
`ISS-BRIDGE-STALE-001`, `ISS-EVT-004-1`, `ISS-EVT-005-1`,
`ISS-UAT-010-1`, `ISS-UAT-010-2`, `ISS-UAT-SEED-003`) synced to
Project-board status `agent-verified`. Did **not** close GitHub issue
`#140` (`FR-BOT-002`'s own tracking issue) — same judgement call PR 2
already made and documented: issue #140 tracks the entire 10-command FR,
and this PR ships only command 6 of 10 (4 remain); closing it now would
misrepresent unimplemented commands as done. See
`.copilot/tasks/completed/wf-20260801-feat-176/` for full detail.

**PR 4/6 (this PR) — shipped:** `/leaderboard` — top 10 members for the
user's country, temp-user exclusion, caller-row highlight if present.
API: new `GET /v1/internal/telegram/leaderboard`
(`InternalAuthGuard`-protected, Zod-validated), reusing
`PointsDirectusService.leaderboard()` and
`DirectusUsersBridgeService.resolveUserIdFromDirectusId()` (both PR
2/3-era services) completely unchanged — no new Directus query, no new
DB migration. The response narrows the underlying `LeaderboardEntry`
shape down to `{ displayName, points, isCaller }` per row, dropping
`email`/`handle`/`userId` before it leaves the API boundary (PII
narrowing flagged at impact analysis, confirmed by a dedicated test that
the actual returned object has no such fields, not just a type-level
check). `isCaller` is resolved server-side by comparing the caller's
resolved `platform.users.id` against each entry's — the bot never learns
another user's identifier. Unlike `/me`'s `getMeSummary` (which 404s on
an unresolvable caller identity), `/leaderboard` degrades to "no row
highlighted" instead of failing the whole request, since the ranked list
is still valid content either way. Bot: new `/leaderboard` command
handler + `render_leaderboard()`, reusing the same `<b>...</b>` HTML bold
convention `/me`/`/event` already established for emphasis (no new
markup mechanism); no pagination (the FR AC only ever asks for "top
10"). `/help`'s `help.leaderboard` line lost its "(coming soon)"/"(скоро)"
suffix, matching the exact pattern PR 2/3 established for their own
commands.

**Temp-user exclusion needed no new filtering code — confirmed by
reading the query AND by live verification, not just trusted from an
earlier research pass.** `leaderboard()`'s aggregate is
`GET /items/point_awards?...&groupBy=user`; it enumerates `point_awards`
rows, and a temp (Authentik-only) user has never earned one, so they
cannot appear. Live-verified end-to-end against the real local stack:
seeded a genuine temp user via the real `upsert-temp-user` endpoint
(response confirmed `directusUserId: null` — no Directus footprint at
all) alongside a genuine new Directus member with a real 250-point
`point_awards` row and a `platform.users` bridge row; called the real
`/leaderboard` endpoint and confirmed the full member appeared
(`isCaller: true`, ranked #1) while the temp user was absent, then
cross-referenced directly against Directus (`GET /items/point_awards`,
`GET /users`) showing zero rows for the temp identity. All seed fixtures
cleaned up afterward, endpoint output confirmed back to baseline. See
`.copilot/tasks/completed/wf-20260801-feat-177/` (once archived) for
full detail, including an incidental finding: the pre-existing "orphan
aggregate row" drop in `leaderboard()` (unmodified by this PR) is
actually broader than temp-user exclusion alone — it excludes ANY
`point_awards` row lacking a `platform.users` bridge row, a safe,
intentional superset rather than a gap.

**`business_process` linkage:** checked `BP-UAT-012` ("Points engine and
leaderboard") — a clean topical name match, but its registry row shows
`Process Ref: —, Status: —, Last Run: —` (never run, no spec authored).
Not force-linked per `protocol.md`'s "don't force a link" guidance — this
workflow's own Step 13 would have nothing live to re-verify against.
`FR-BOT-002.md`'s frontmatter `business_process` stays `[BP-UAT-010]`
unchanged (still correct for this FR's PR 2/3 registration-surface
commands; the field represents the FR as a whole, not per-PR surfaces).
This is a legitimate, recorded gap, not a silent omission — a future
`BP-UAT-012` authoring effort would need to cover both this command and
the pre-existing web leaderboard surface `PointsDirectusService.leaderboard()`
already serves.

**PR 5/6 (this PR) — shipped:** `/interests` — view and toggle topic
interests as `[x]`/`[ ]` inline-keyboard buttons, tapping a topic adds or
removes it with an in-place re-render. API: new `GET
/v1/internal/telegram/interests` and `POST
/v1/internal/telegram/interests/toggle` (both `InternalAuthGuard`-protected,
Zod-validated) on `TelegramInternalController`, proxying through the
existing `MeProfileService.listInterests`/`addInterest`/`removeInterest` —
the same service and `member_interests` collection the web `/me/profile`
cabinet already uses (F-S3.6b, ADR-0033 cabinet #5) — no new DB migration,
no competing write path. The candidate topic list is a duplicated 7-slug
constant (`INTEREST_TOPICS` in `telegram-auth.service.ts`), not an import
of `TelegramEventTopicsService`: that service is confirmed not present in
`TelegramModule`'s `exports` array, so it cannot be injected elsewhere
regardless of the module-cycle question, and duplicating a small,
operator-curated static list mirrors the exact precedent PR 1/6 already
set for `TelegramEventsService`'s own event-topic duplication.

Module wiring required two changes, one anticipated and one found live
during implementation. `AuthModule` now imports `MeProfileModule` wrapped
in `forwardRef(() => MeProfileModule)`, matching the existing
`forwardRef(() => RegistrationsModule)` treatment — needed because
`MeProfileModule` already imports `AuthModule`, the same
`AuthModule <-> X <-> AuthModule` cycle shape hit twice before in this
codebase. **Unanticipated by impact-analysis:** a full-suite run
(`main-bootstrap.spec.ts`, which boots the real Nest app) then failed with
`UndefinedModuleException` at `MeProfileModule`'s own import of
`AuthModule` — Nest's scanner reaches `AuthModule` via a second,
pre-existing path (`AuthModule -> LeadsModule -> InteractionsModule ->
TelegramModule -> AuthModule`) before it reaches `MeProfileModule`'s
forwardRef-wrapped side, so the *other* side's plain import resolves to
`undefined` mid-scan. Fix: `me-profile.module.ts`'s own `AuthModule`
import also needed wrapping in `forwardRef(() => AuthModule)` — both
sides of the new edge, not just the one introducing it. This is the exact
failure mode `registrations.module.ts`'s own header comment already
documented for the `RegistrationsModule` edge, so the fix follows an
established, proven pattern rather than being novel; it's a genuinely
interesting finding worth flagging prominently here, the same way PR 2's
`ISS-BOT-REG-001` bug-found-during-verification got its own callout,
because it means **any future module that both imports `AuthModule` and
is imported back into it must forwardRef both sides**, not just the side
adding the new edge — the existing `main-bootstrap.spec.ts` live DI boot
check is what catches this class of gap, and any new bidirectional edge on
this module graph should keep relying on it rather than a visual read of
the two files in isolation.

The `intent` field (`member_interests` rows require `learn | practice |
mentor | discuss`, not just a bare topic) is scope-narrowed, documented
explicitly rather than silently resolved, same posture as PR 3's streak
gap: the bot hardcodes `intent='learn'` for every topic it adds via
`/interests`, and toggle-off removes only the `'learn'`-intent row for
that topic, never touching other-intent rows a member may have set via
the web `/me/profile` cabinet (which allows the same topic under multiple
intents simultaneously). **AC-7 is the regression guard for this
decision** — it exercises a member with both a bot-created `learn` row and
a web-created `mentor` row for the same topic, toggling off via the bot,
and asserts only the `learn` row is removed.

**`business_process` linkage:** confirmed adjacency, not force-linked.
`docs/02-business-processes/uat/BP-UAT-003.md` ("Member self-service
profile") AC-3 and its Steps 006-008 exercise the identical
`MeProfileService.listInterests`/`addInterest` and the identical
`member_interests` collection this PR's API routes proxy — a real,
topically precise fit for "interests" as a resource, correcting an earlier
research pass in this workflow that had claimed zero overlap. However,
`BP-UAT-003` as currently authored and registered is web-only
(`environment: http://localhost:4321`, every step a browser action against
`/me/profile`) with zero bot-surface or `InternalAuthGuard` steps — the
identical resource reached via a different, untested channel. Retrofitting
bot steps into `BP-UAT-003` is out of this PR's scope. `FR-BOT-002.md`'s
frontmatter `business_process` stays `[BP-UAT-010]` unchanged (the field
represents the FR as a whole; BP-UAT-010 already covers this FR's dominant
registration-flow ACs). Recorded here as a **documented adjacency, not a
gap** — same treatment PR 4 gave the `BP-UAT-012` finding — and flagged as
a candidate follow-up for a future BusinessAnalyst-authored BP-UAT-003
revision adding bot-surface steps, not actioned in this PR.

Verification: apps/api full-suite run twice, 1470/1471 Vitest tests
passing both times (the single failure, `test/users.spec.ts`'s
clock-ordering assertion, is a pre-existing flake unrelated to this PR —
independently re-verified this workflow via `git stash` to fail identically
on unmodified `main`); this PR's own 3 new/modified spec files, 41/41
passing in isolation. apps/bot: 146/146 pytest tests passing (up from 137
pre-PR). typecheck, biome, ruff check, and ruff format all clean. Code is
implemented and tested on the feature branch; not yet merged to `main` as
of this doc update (matches PR 1-4's own precedent of writing this progress
entry before their own merge).

**PR 6/6 (this PR, final) — shipped:** `/upgrade` — email collection via a
short aiogram FSM (`UpgradeStates.awaiting_email`, the first real content
in `states/`, which had been a stub since FR-BOT-001), calling the
already-shipped `POST /v1/internal/telegram/upgrade-temp` (FR-AUTH-006).
No `apps/api/` changes were needed — the endpoint's contract (confirmed by
reading `auth.controller.ts`/`upgrade.service.ts` directly, not assumed
from the original task brief) matched exactly: `{telegramId, email} ->
200 {ok:true} / 404 telegram_user_not_found / 409 not_a_temp_account / 409
email_already_in_use`.

Design decisions, documented explicitly:

- **`is_temp` short-circuit, no wasted API call for full accounts** —
  `user_context.is_temp` (already resolved by `AuthMiddleware` on every
  update, same field `/me` already reads) lets a full-account user's
  `/upgrade` short-circuit to an "already a member" message without
  touching the network, following `/me`'s exact precedent for reading this
  field. The API's own `not_a_temp_account` 409 remains as a defensive
  fallback for the race where the account is upgraded between this
  client-side check and the request landing.
- **Client-side email-format regex is a UX nicety, not a security
  boundary** — rejects obviously malformed input before a wasted round
  trip; the API's own Zod `emailField` on `upgradeTempBodySchema` remains
  the authoritative validation, unchanged by this PR.
- **`email_already_in_use` messaging does not reference Telegram-account
  linking** — FR-AUTH-005 is `status: Planned`, unbuilt; the message
  instead offers "use a different email, or sign in on the web with that
  email" (a real option today via FR-AUTH-004's magic-link sign-in),
  matching FR-AUTH-006's own AC-7 constraint.
- **TTL wording: "about 30 minutes,"** matching `upgrade.service.ts`'s
  real `UPGRADE_INTENT_TTL_MS` comment ("~29 min observed for
  FR-AUTH-004"), not FR-AUTH-004's own stale "15 min" AC text —
  regression-tested (`test_upgrade_email_reply_sends_expected_payload_and_shows_success_message`
  asserts "15" is absent from the rendered success message).
- **No new keyboard/inline-button UI** — `/upgrade`'s FSM is text-only
  (prompt, then a plain-text email reply); no AC implies a multi-choice
  interface for this flow.

`/help`'s `help.upgrade` line lost its "(скоро)"/"(coming soon)" suffix —
**all 10 FR-BOT-002 commands are now implemented**, and
`test_help_no_longer_marks_upgrade_as_coming_soon` additionally asserts
the full `/help` output no longer contains any "coming soon" marker
anywhere. `main.py`'s `BOT_COMMANDS` gained `/upgrade` (no argument — the
email is collected via FSM reply, not a command argument, so it belongs
in BotFather's menu like `/me`/`/leaderboard`/`/interests`).

Verification: apps/bot 165/165 pytest passing (19 net new tests across
`test_upgrade_handler.py`/`test_api_client_upgrade.py`, plus updates to
`test_main_wiring.py`/`test_help_handler.py`), ruff format+check clean.
apps/api 1528/1529 (the 1 failure is the same pre-existing `test/users.spec.ts`
clock-ordering flake PR 5/6 already documented, independently
re-confirmed against a zero-diff `apps/api/` for this branch). Live
bot-side integration verification performed against the real local API
(not mocked): `telegram_user_not_found` (404), success including a real
Mailpit magic-link email delivery, and `email_already_in_use` (409,
including confirmation of no-mutation-on-this-path) were all reproduced
live with real seeded Authentik fixtures, cleaned up afterward with a
zero-residue re-query. `not_a_temp_account` (409) was **not** re-derived
live — a deliberate, disclosed scoping decision: producing it requires a
full magic-link click-through + OIDC round trip, the exact mechanism
`FR-AUTH-006`'s own workflow already live-verified 10 times (including
documenting a real Authentik cross-Brand cookie-scoping gotcha); this
response case is the bot's defensive fallback path (not its primary
guard), and is independently covered by both `apps/api/test/upgrade-service.spec.ts`'s
existing test (re-confirmed passing this session) and the bot's own unit
test. See `.copilot/tasks/completed/wf-20260801-feat-182/` (once
archived) for full detail.

**Honesty disclosure — AC-9 ("all commands respond within 3 seconds"):**
this has never been measured with a dedicated timing harness across the
full 10-command set, in this PR or any prior one. Individual commands
have shown no latency concerns in ad hoc live verification throughout
PRs 1-6 (informally, well under 1 second against the local stack), but
"never seen a problem" is not the same claim as "measured and confirmed."
AC-9 is left unchecked rather than marked satisfied on an assumption. A
dedicated timing/load-test pass would need its own scoped workflow if
this becomes a real requirement (e.g. before a production rollout) —
not queued as a specific follow-up ID here, since no failure or user
report currently motivates one; noted as an honest gap per AGENTS.md §9.

**FR-BOT-002 reaches terminal status with this PR.** All 10 commands in
the functional-scope table (`/start`, `/events`, `/event <N>`,
`/register <N>`, `/cancel <N>`, `/me`, `/leaderboard`, `/interests`,
`/upgrade`, `/help`) are implemented and merged. Frontmatter `status`
flips `Planned` -> `Implemented`; `requirements-registry.md`'s Status
column flips `In Progress` -> `Shipped`. 8 of 9 ACs are `[x]` verified;
AC-9 stays `[ ]` per the honesty disclosure above — this is a genuine,
disclosed gap, not a blocker to terminal status (no AC requires 100%
completion to ship; AGENTS.md §6.1 requires disclosure, not perfection).

Each PR in this now-complete sequence: PR 1/6
(`.copilot/tasks/completed/wf-20260731-feat-174/`), PR 2/6
(`wf-20260801-feat-175/`), PR 3/6 (`wf-20260801-feat-176/`), PR 4/6
(`wf-20260801-feat-177/`), PR 5/6 (`wf-20260801-feat-178/`), PR 6/6
(`wf-20260801-feat-182/`, once archived).
