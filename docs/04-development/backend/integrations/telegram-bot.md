# Telegram bot + outbound sender

The Telegram bot + outbound notifier lives in a **separate repository**:
[viktordrukker/aiqadam-telegram-bot](https://github.com/viktordrukker/aiqadam-telegram-bot)
(private). This page is a pointer + a quick "who-talks-to-whom" map.
Full integration reference is in the bot repo's
[docs/api-integration.md](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/api-integration.md).

## Why a separate repo

Per [ADR-0034](../../../adr/0034-telegram-bot-and-sender.md):

- Clear deployment boundary — one Coolify resource, one CI, one webhook.
- Language separation already exists (Python; the monorepo is pnpm).
- Smaller blast radius — a bot bug doesn't touch web/api builds.
- Secret isolation — bot token + service token live in their own
  Coolify env.

## How the rest of the platform talks to it

```
                                                           ┌─────────────────┐
   ┌────────────────┐    Interactions dispatcher           │  Redis Streams  │
   │  Your service  │ ─► POST /v1/interactions/dispatch ─► │ tg.dispatch.v1  │
   │  (Directus,    │    (allowedChannels: ['telegram'])   └────────┬────────┘
   │   Astro, ...)  │                                               │
   └────────────────┘                                               ▼
                                                          ┌──────────────────┐
                                                          │  notifier        │
                                                          │  (separate repo) │
                                                          │  → Telegram      │
                                                          └──────────────────┘
                                                                   │
                                                                   ▼
                                                          POST /v1/telegram/audit
                                                          (back to aiqadam API)
                                                          → tg_send_log
```

**You never call the bot directly.** Every outbound Telegram message
goes through the Interactions dispatcher
([`apps/api/src/modules/interactions`](../../../../apps/api/src/modules/interactions))
with `allowedChannels: ['telegram']`. The dispatcher's `TelegramAdapter`
(added in [#169](https://github.com/viktordrukker/aiqadam/pull/169))
publishes a versioned envelope to the outbox; the relay loop pumps to
Redis Streams; the notifier in the separate repo delivers.

## What lives where

| Concern | Repo / path |
|---|---|
| HTTP API (`/v1/interactions/dispatch`, `/v1/telegram/*`) | **aiqadam** — `apps/api/src/modules/{interactions,telegram}/` |
| Drizzle schema (`tg_link_challenges`, `tg_send_log`, `outbox`, `tg_config`) | **aiqadam** — `apps/api/src/modules/telegram/schema.ts` |
| OutboxPublisher + relay loop | **aiqadam** — `apps/api/src/modules/telegram/{outbox-publisher,outbox-relay}.service.ts` |
| Bot config (encrypted token + identity) | **aiqadam** — `apps/api/src/modules/telegram/tg-config.service.ts` (R2) |
| Admin endpoints (`/v1/telegram/admin/configure`, `/rotate-token`, `/status`) | **aiqadam** — `apps/api/src/modules/telegram/telegram-admin.controller.ts` (R2) |
| Status aggregator (getMe cache, outbox + send-log stats) | **aiqadam** — `apps/api/src/modules/telegram/telegram-admin.service.ts` (R2 PR-2) |
| Heartbeat reader (`bot:heartbeat`, `notifier:heartbeat`, XLEN, XPENDING) | **aiqadam** — `apps/api/src/modules/telegram/heartbeat-reader.service.ts` (R2 PR-2) |
| Member-link fields (`directus_users.telegram_*`) | **Directus** (operator-managed; not in code) |
| aiogram long-poll, inbound user flows (`/start`, `/link`, …) | **aiqadam-telegram-bot** — `src/aiqadam_telegram_bot/bot/` |
| Outbound send loop, per-chat rate-limit, audit posts | **aiqadam-telegram-bot** — `src/aiqadam_telegram_bot/notifier/` |
| Envelope schema (source of truth) | **aiqadam-telegram-bot** — [`docs/asyncapi.yaml`](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/asyncapi.yaml) |
| Heartbeat keys (`bot:heartbeat`, `notifier:heartbeat`, TTL 30s) | **Redis** (bot writes; aiqadam API reads via `/admin/status`, R2 PR-2) |

## Quick references

- **Architecture decisions**:
  [ADR-0034](../../../adr/0034-telegram-bot-and-sender.md) (this stack),
  [ADR-0033](../../../adr/0033-community-member-graph.md) (Directus
  canonicality),
  [ADR-0015](../../../adr/0015-bot-scope-and-web-authoring-split.md) (bot scope),
  [ADR-0026](../../../adr/0026-telegram-channel.md) (per-country channels).
- **Send-a-message recipe**: bot repo's
  [api-integration.md §3](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/api-integration.md#3-sending-a-telegram-message--the-common-case).
- **Envelope contract**:
  [api-integration.md §5](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/api-integration.md#5-the-envelope-reference)
  +
  [asyncapi.yaml](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/asyncapi.yaml).
- **Adding a new consumer or stream**:
  [api-integration.md §6–§7](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/api-integration.md#6-subscribing-as-a-new-consumer-analytics-mirror-etc).
- **Ops queries**:
  [api-integration.md §9](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/api-integration.md#9-operational-queries).
- **Deploy**:
  [bot repo `docs/deploy-coolify.md`](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/deploy-coolify.md).

## When to update this page

Almost never — it's a stable pointer. Updates are warranted only when:

- The bot repo URL changes (renamed, moved org).
- A new top-level surface is added (e.g. a second bot consuming a
  different stream).
- The "who-talks-to-whom" map above becomes wrong because a different
  integration pattern was adopted (e.g. webhook callbacks).

For everything else — fields added to the envelope, new endpoints, new
ops queries — update the bot repo's `api-integration.md` directly, not
this page.
