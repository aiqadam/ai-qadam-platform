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
| `/me` | Shows the user's registrations (upcoming + recent), points total, streak, and account type (temp/full). Includes "Link Telegram to web" CTA if not linked. |
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
- [ ] `/me` correctly shows all active registrations with status badges.
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

**Planned follow-up PRs (queued, no workflow IDs assigned yet):**

| PR | Scope | Depends on |
|---|---|---|
| 3/6 | `/me` — registrations list, points/streak, account type, "Link Telegram to web" CTA | PR 2 (registration data to show) — done |
| 4/6 | `/leaderboard` — top 10 for the user's country, temp-user exclusion, caller-row highlight | Independent of PR 2/3, but sequenced after for command-surface continuity |
| 5/6 | `/interests` — topic interest toggle buttons | Independent |
| 6/6 | `/upgrade` — email collection + magic-link (FR-AUTH-006 dependency) | FR-AUTH-006 |

Each PR should re-check this table and its own `business_process` linkage
before starting, per `requirement-development.md` Step 1 — do not
re-derive the sequence from scratch.
