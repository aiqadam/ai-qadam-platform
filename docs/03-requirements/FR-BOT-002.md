---
code: FR-BOT-002
name: Bot member commands
status: Planned
module: Telegram Bot (BOT)
phase: Roadmap Sprint 6
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
| `/register <N>` | Registers the user for event N. Calls `POST /v1/internal/telegram/register` → proxies to `POST /v1/events/:id/register`. Returns confirmation with QR deep-link. |
| `/cancel <N>` | Cancels registration for event N. Calls `DELETE /v1/events/:id/register`. |
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

- [ ] `/events` returns the correct list of upcoming events for the user's country.
- [ ] `/register 5` registers the user for event 5; they receive a confirmation message with the event title.
- [ ] Registering for a fully-booked event returns a waitlist confirmation.
- [ ] `/cancel 5` cancels the user's registration and triggers waitlist promotion.
- [ ] `/me` correctly shows all active registrations with status badges.
- [ ] `/leaderboard` shows top 10 members; the caller's row is highlighted if they appear.
- [ ] `/upgrade` starts the email verification flow and sends the magic-link email.
- [ ] A temporary user is excluded from `/leaderboard` results.
- [ ] All commands respond within 3 seconds under normal conditions.

## Notes

- State machine (aiogram FSM) is used only for multi-step flows like `/start` (country selection → interest selection) and `/upgrade` (email collection).
- The bot registers commands with BotFather via `set_my_commands` on startup.
- All API calls use the `INTERNAL_API_TOKEN` shared secret header `X-Internal-Token`.
