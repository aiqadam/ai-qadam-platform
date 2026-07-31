---
code: FR-BOT-002
name: Bot member commands
status: Planned
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
- [ ] `/leaderboard` shows top 10 members; the caller's row is highlighted if they appear.
- [ ] `/upgrade` starts the email verification flow and sends the magic-link email.
- [ ] A temporary user is excluded from `/leaderboard` results.
- [ ] All commands respond within 3 seconds under normal conditions.

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
`Implemented` for a 5-of-10-command slice). `requirements-registry.md`'s
Status column is the accurate source for "work has started": `In Progress`
(set by PR 1, unchanged by this PR — matches the existing `FR-AUTH-002`
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
rendering is still within BP-UAT-010's existing domain and is
re-verified as part of that script's Step 13 re-run. See
`.copilot/tasks/completed/wf-20260801-feat-176/` (once archived) for full
detail.

**Planned follow-up PRs (queued, no workflow IDs assigned yet):**

| PR | Scope | Depends on |
|---|---|---|
| 4/6 | `/leaderboard` — top 10 for the user's country, temp-user exclusion, caller-row highlight | Independent of PR 2/3, but sequenced after for command-surface continuity |
| 5/6 | `/interests` — topic interest toggle buttons | Independent |
| 6/6 | `/upgrade` — email collection + magic-link (FR-AUTH-006 dependency) | FR-AUTH-006 |

Each PR should re-check this table and its own `business_process` linkage
before starting, per `requirement-development.md` Step 1 — do not
re-derive the sequence from scratch.
