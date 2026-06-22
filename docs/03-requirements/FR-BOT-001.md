---
code: FR-BOT-001
name: Telegram bot scaffold and deployment
status: Planned
module: Telegram Bot (BOT)
phase: Roadmap Sprint 6
---

## Description

The AI Qadam Telegram bot is a Python/aiogram service that serves as the primary mobile interface for community members. It handles inbound commands from members and operators, calling the NestJS API for all business logic. The bot stores only essential credentials; all state lives in the API.

## Users

Members, Organizers (via different command sets).

## Functional scope

1. **Tech stack** — Python 3.12, aiogram 3, ruff (linting), pytest, uv (package manager). Long-polling mode (no public FQDN required).
2. **Credentials (bot env only)** —
   - `TELEGRAM_BOT_TOKEN`
   - `INTERNAL_API_URL` (e.g., `https://uz.aiqadam.org/api`)
   - `INTERNAL_API_TOKEN` (shared secret for internal endpoints)
   - Bot stores ONLY `(telegram_id → directusUserId)` in a local SQLite for fast lookup on every command. No other state.
3. **Coolify stack** — New `aiqadam-bot` service in Coolify. No public FQDN (internal only; Telegram reaches it via outbound long-polling).
4. **Project structure** —
   ```
   apps/bot/
   ├── src/
   │   ├── handlers/       # command and callback handlers
   │   ├── services/       # API client, business logic wrappers
   │   ├── middlewares/    # auth, tenant resolution, rate limiting, logging
   │   ├── keyboards/      # inline keyboard builders
   │   ├── states/         # aiogram FSM states
   │   ├── locales/        # i18n strings (ru primary, en secondary)
   │   └── main.py
   ├── pyproject.toml
   └── tests/
   ```
5. **Middleware stack** — Every update passes through: rate-limit middleware (per `telegram_id`, 10 req/min), auth middleware (calls `POST /v1/internal/telegram/lookup` → resolves `directusUserId, isTemp, country`), tenant middleware (sets country from user's `country_preference`), logging middleware (structured JSON logs to stdout → Loki).
6. **Error handling** — Unhandled exceptions caught at the handler level; send user a generic "something went wrong" message and log full traceback to Loki.
7. **Smoke test** — Bot responds to `/start` (even for new users) with a static welcome message before full signup flow is wired.

## Acceptance criteria

- [ ] Bot deployed to Coolify and responds to `/start` with a welcome message within 3 seconds.
- [ ] Bot calls `POST /v1/internal/telegram/lookup` on every command and resolves the user context.
- [ ] Unknown commands receive a friendly "I don't know that command — try /help" response.
- [ ] Structured logs from the bot appear in Grafana/Loki.
- [ ] Sending 10+ rapid messages from one Telegram ID is rate-limited; the bot responds with "slow down" after the threshold.
- [ ] `DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`, and `TWENTY_API_TOKEN` are NOT present in the bot environment.

## Notes

- The bot is thin by design: no Directus token, no Authentik admin token, no CRM token. Everything is an API call to the NestJS API (D4 in `sprint-5-to-8-plan.md`).
- Outbound notifications (DMs pushed from the API) are handled by FR-NTF-004, not this service. This FR covers only the inbound command handling scaffold.
