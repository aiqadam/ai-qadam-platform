# ADR-0034: Telegram bot + outbound sender — separate repo, ESB-ready contract

## Status
Proposed, 2026-05-21

> Drafted by Claude Code in conversation on 2026-05-21 after the user asked
> for a plan to build the Telegram bot + sender. The scaffold repo
> already exists at `/home/drukker/aiqadam-telegram-bot/` (commit `f2eee50`,
> not yet pushed to GitHub) — this ADR codifies the architectural decisions
> that scaffold encodes, for PM acceptance via the
> [decision-batch process](../decision-batch-process.md).

## Context

### What's already decided

- [ADR-0015](./0015-bot-scope-and-web-authoring-split.md) — bot is first-class
  for member flows + organizer-runtime; web is first-class for authoring.
- [ADR-0026](./0026-telegram-channel.md) — per-country channels (`@aiqadam_uz`
  etc.) for broadcast announcements; country leads post manually.
- [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) — every operator-facing
  tool SSO via Authentik OR embed in workspace; no auth islands.
- [ADR-0033](./0033-community-member-graph.md) — community-as-platform; member
  graph in Directus is canonical; no sales CRM.
- [community-platform-roadmap.md §Sprint 5.5](../community-platform-roadmap.md):
  bot v0 (account-link only, "4 PRs").
- [PRs #67–#87](https://github.com/viktordrukker/aiqadam/pulls?q=is%3Apr+is%3Amerged+%2367+OR+%2387)
  shipped: Interactions primitive + dispatcher + EmailAdapter +
  ConsentService + `/me/preferences`.

### What needs deciding

1. **Where the bot/notifier code lives.** Inside the aiqadam monorepo
   (existing empty `apps/bot/`, `apps/workers/`) or a separate repo?
2. **How NestJS talks to it.** Sync HTTP only? Async message bus only?
   Both?
3. **Whether the bot has its own DB.** TGBlaster bot-stack does
   (SQLite); Directus-canonical principle (ADR-0033) suggests no.
4. **How "AI Qadam Telegram account" is divided.** One process / two?
   One bot account / multiple? One token / per-tenant?
5. **What OSS we adopt vs build.** Novu? Apprise? Botpress? Custom?
6. **How robust the wiring is from day one.** Point-to-point HTTP? Or
   ESB-ready (contract-first, versioned envelopes, outbox pattern)?

### Audit of options for question 5 (OSS scan)

| Candidate | License | Verdict |
|---|---|---|
| **Novu** | MIT (Node) | Defer. Mature; but adoption deletes the shipped Interactions module + adds an auth-island admin UI. Revisit when push + SMS + complex template DSL at scale becomes the bottleneck. |
| **Apprise** | BSD-2 | Pass. Single-recipient library, no queue/audience/scheduling — duplicates work we've done. |
| **Knock.app** | proprietary SaaS | Out — paid; free tier deprecated. |
| **ntfy.sh / Gotify** | MIT/Apache | Wrong shape — server→device push, not member broadcast. |
| **AlertManager** | Apache | Wrong shape — ops alerts. |
| **Botpress / Rasa** | AGPL/Apache | Pass. NLU framework over-scope; AGPL needs explicit approval per [CLAUDE.md §9](../../.claude/CLAUDE.md). |
| **aiogram 3** | MIT (Python) | **Adopt.** Already named in [ARCHITECTURE.md](../../.claude/ARCHITECTURE.md). |
| **viktordrukker/tgblaster bot-stack** | MIT | **Crib from, don't import.** Reference for flood/retry, FSM, QR deeplink, schema-versioned reg forms, broadcaster idempotency. |

## Decision

### Q1 — Separate repo: `viktordrukker/aiqadam-telegram-bot`

A new GitHub repo, private, with its own Coolify resource. Reasons:

- **Clear deployment boundary.** One container resource, one CI, one
  Coolify webhook. Bot redeploys never touch web/api.
- **Language separation already exists.** Python; the monorepo is pnpm.
  Cross-monorepo tooling has limited value here.
- **Smaller blast radius.** A bot bug doesn't risk the web build.
- **Secret isolation.** Bot token + service token live in their own
  Coolify env, not co-mingled with the API's secrets.
- **Reversible.** If we want a monorepo later, we vendor it back.

`apps/bot/` and `apps/workers/` in the aiqadam monorepo become **unused
stubs to be removed** in a follow-up cleanup PR (or kept as `.gitkeep`
markers for a Phase ζ Python-in-monorepo decision).

### Q2 + Q6 — ESB-ready: sync HTTP **and** async Streams, contract-first

Two surfaces, deliberately split:

| Surface | Protocol | Direction | When used |
|---|---|---|---|
| **OpenAPI** (REST + JSON, service-token auth) | HTTPS | bot → API | User-facing flows that need a synchronous answer (link/start, link/confirm, opt-out, list events, submit registration, check-in by token). |
| **AsyncAPI 3.0** (Redis Streams, versioned envelopes) | Streams | API → notifier | Outbound notifications. Producer (NestJS) writes to outbox in same Postgres tx as state change; relay loop XADDs to `tg.dispatch.v1`; notifier XREADGROUPs as consumer group `notifier`. |

The envelope (lives in `aiqadam-telegram-bot/src/.../contracts/envelope.py`,
mirrored in `apps/api/src/modules/telegram/contracts/dispatch.v1.ts`):

```
{
  "schema": "tg.dispatch.v1",        # lock + version
  "id": "<uuid4>",                   # idempotency key
  "occurred_at": "<rfc3339>",
  "correlation_id": "<uuid4>",       # traces the original API call
  "causation_id": "<uuid4 | null>",
  "producer": "aiqadam-api",
  "meta": { "tenant": "uz", "trace_id": "..." },
  "payload": { ...kind/target/template/delivery_key... }
}
```

Versioning rule: additive fields in the payload are backwards-compatible
(consumers ignore unknowns). Breaking changes require a new stream name
(`tg.dispatch.v2`); producer dual-writes during migration; v1 retires.

### Q3 — Bot owns NO business state

The bot/notifier own:
- Their own Redis (FSM + consumer-group cursors). Separate from AI Qadam
  Redis to avoid coupling local dev cycles.
- Their own ENV (BOT_TOKEN, AIQADAM_SERVICE_TOKEN, REDIS_URL,
  DISPATCH_STREAMS).

They do NOT own:
- Postgres (zero direct connections).
- Member graph (Directus canonical per ADR-0033).
- Templates (NestJS Interactions renders before publish).
- Audience selection (NestJS picks recipients server-side).
- The send-log (NestJS writes the canonical row via POST /v1/telegram/audit).

This makes the bot a **stateless, restartable, scalable consumer**, and
keeps ADR-0033's "Directus is canonical" promise.

### Q4 — Two processes, one bot token, one bot account

Process split:
- `bot` container: aiogram long-poll. Inbound only. Handles `/start`,
  `/events`, `/link`, registration FSM, QR check-in, `/stop`.
- `notifier` container: Streams consumer. Outbound only. No `get_updates`
  call. Sends DMs + channel posts.

Reasons: long-poll and high-throughput send loops compete for the
asyncio event loop. Splitting lets each be scaled, restarted, and tuned
independently. Telegram permits multiple processes on one bot token
provided **only one** does `get_updates` — the notifier never polls.

One bot account (`@aiqadam_bot`), not per-tenant. Tenant is resolved
per-update via `GET /v1/telegram/members/by-tg/:id` returning
`member.tenant`. Per-tenant bots would multiply operator burden + bot
discovery friction (which @ do I add?) for no upside.

### Q5 — Build (thin) using aiogram + crib from bot-stack

Build our own thin code on the OSS we already chose. ~9 small PRs across
S5.5 + ADR-0015 follow-up; hard parts (flood loop, retry, idempotent
send-log) copy-ported from `viktordrukker/tgblaster` bot-stack (MIT).

## Component layout

```
viktordrukker/aiqadam-telegram-bot/   (NEW REPO, private, Coolify)
├── src/aiqadam_telegram_bot/
│   ├── contracts/           # envelopes + payload schemas (source of truth)
│   ├── shared/              # config, logging, redis pool, aiqadam HTTP client
│   ├── bot/                 # aiogram long-poll, handlers, FSM flows
│   └── notifier/            # Streams consumer, rate limit, sender, DLQ
├── docs/architecture.md     # sync vs async, deeplinks, failure matrix
├── docs/asyncapi.yaml       # AsyncAPI 3.0 spec for tg.dispatch.v1
├── docs/deploy-coolify.md   # ops runbook
├── Dockerfile               # multi-stage; one image, two CMDs
├── docker-compose.yml       # local dev; prod uses Coolify env
├── pyproject.toml           # aiogram 3, httpx, pydantic, redis, structlog
└── .github/workflows/ci.yml # ruff + mypy + pytest + GHCR push

viktordrukker/aiqadam  (THIS REPO)
└── apps/api/src/modules/telegram/  (TO BUILD)
    ├── telegram.module.ts
    ├── telegram.controller.ts          # OpenAPI endpoints
    ├── telegram.service.ts
    ├── outbox-relay.service.ts         # outbox → Streams pump
    ├── adapters/telegram.adapter.ts    # Interactions dispatcher adapter
    ├── contracts/dispatch.v1.ts        # Zod mirror of pydantic envelope
    └── schema.ts                       # Drizzle: tg_send_log, outbox, etc.
```

## NestJS-side endpoints (the sync surface) — to build in this repo

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/v1/telegram/link/start` | Bot calls. Issue 6-digit code, email it (via existing EmailAdapter), return `challenge_id`. |
| `POST` | `/v1/telegram/link/confirm` | Bot calls. Verify code + tg_user_id, write `directus_users.telegram_user_id`. |
| `POST` | `/v1/telegram/opt-out` | Bot calls. Set `telegram_opted_out_at`. |
| `POST` | `/v1/telegram/audit` | Notifier calls after every send. Idempotent on `delivery_key`. |
| `POST` | `/v1/telegram/registrations` | Bot calls. Member registers for an event via bot. |
| `POST` | `/v1/telegram/checkin/:token` | Bot calls. QR-deeplink check-in. |
| `GET` | `/v1/telegram/events` | Bot calls. Open events, tenant-filterable. |
| `GET` | `/v1/telegram/members/by-tg/:id` | Bot calls. Resolve TG user → member. |

All authenticate via `Authorization: Bearer <service-token>` issued by
Authentik m2m client `aiqadam-telegram-bot`. Scopes:
`telegram:read`, `telegram:write:audit`, `telegram:write:link`,
`telegram:write:opt-out`, `telegram:write:registration`,
`telegram:write:checkin`.

## Outbox pattern (the async surface) — to build in this repo

```typescript
// apps/api/src/modules/telegram/outbox-relay.service.ts
async function publishLoop() {
  while (!stopping) {
    const rows = await db.transaction(async tx => {
      const pending = await tx
        .select().from(outbox)
        .where(isNull(outbox.publishedAt))
        .for("update", { skipLocked: true })
        .limit(100);
      // XADD each to Redis Streams
      for (const row of pending) {
        await redis.xadd(row.stream, "*", "envelope", JSON.stringify(row.payload));
        await tx.update(outbox)
          .set({ publishedAt: new Date() })
          .where(eq(outbox.envelopeId, row.envelopeId));
      }
      return pending;
    });
    if (rows.length === 0) await sleep(500);
  }
}
```

State changes that schedule sends call:

```typescript
await db.transaction(async tx => {
  await tx.insert(registrations).values(...);
  await tx.insert(outbox).values({
    envelopeId, stream: "tg.dispatch.v1",
    payload: { schema: "tg.dispatch.v1", id: envelopeId, ... }
  });
});  // atomic; relay picks up on next tick
```

## Sequenced PR plan

### Phase Bot-A — S5.5 scope (account-link only)

In the **new repo**:

| # | Title | Lines | Files |
|---|---|---|---|
| 1 | (this scaffold) | (already committed) | (already committed) |
| 2 | `feat(bot): wire /start deeplinks (checkin/invite)` | ~150 | 2 |

In the **aiqadam repo**:

| # | Title | Lines | Files |
|---|---|---|---|
| A1 | `feat(api): telegram module skeleton + service-token auth` | ~250 | 4 |
| A2 | `feat(api): link/start + link/confirm endpoints + 6-digit code lifecycle` | ~400 | 5 |
| A3 | `feat(db): directus_users.telegram_* columns + tg_link_challenges table` | ~150 | 3 |
| A4 | `feat(api): /v1/telegram/audit + tg_send_log table (UNIQUE delivery_key)` | ~250 | 4 |
| A5 | `feat(api): outbox table + relay service + integration test` | ~400 | 5 |
| A6 | `feat(api): TelegramAdapter for Interactions dispatcher` | ~250 | 4 |

**S5.5 exit gate:**
- `@aiqadam_bot` deployed on Coolify.
- Manual test: `/start` → `/link` → email arrives via existing
  EmailAdapter → user enters code → confirm.
- A new test event is created → registered member receives a Telegram
  DM via the notifier (no duplicate on forced notifier restart).

### Phase Bot-B — full member-bot per ADR-0015

(Sized in [community-platform-roadmap.md](../community-platform-roadmap.md) §Phase ζ; not in S5.5.)

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Bot token leak | Coolify env only; rotate via `@BotFather` `/revoke`; publish `bot:reload_requested` to Redis with `time.time()` for in-flight restart |
| Account-link impersonation | 6-digit code, 5-min TTL, single-use, server verifies same tg_user_id on start + confirm |
| Notifier crash mid-broadcast | XAUTOCLAIM resurrects PEL entries; dedupe SET NX prevents re-send; AI Qadam `tg_send_log` UNIQUE(delivery_key) double-checks |
| Schema drift between pydantic + Zod | Both repos' CI parses the AsyncAPI yaml; failing build catches mismatch |
| BullMQ ↔ Streams confusion | BullMQ stays for internal NestJS jobs; Streams is for cross-language / cross-service. Documented in this ADR + the new repo's architecture.md. |
| Multi-tenancy leak via bot | Bot never queries Postgres directly; NestJS enforces tenant scoping per endpoint; pen-test on S5.5 exit |
| Auth-island regression | No Streamlit admin. Operator UI lives in `/workspace/announce` + future cabinets per ADR-0032. |
| Two notifier replicas → race | Single replica initially; XAUTOCLAIM + dedupe SET NX make scale-out safe later; out of scope for S5.5 |

## What this ADR forbids

- ❌ Telethon / MTProto user-account sending. Pinned NO per ADR-0033
  (community-as-platform, not bulk-CRM) + Telegram ToS risk.
- ❌ Streamlit admin UI on a separate port. Violates ADR-0032.
- ❌ Bot writing to Postgres directly. Violates ADR-0033 canonical-graph
  principle.
- ❌ Bot owning its own member/subscriber table. Same reason.
- ❌ Per-tenant bot accounts. Multiplies friction; tenant lives on
  `directus_users.country`.
- ❌ Novu adoption. Defer until push + SMS + complex templates need it.

## Consequences

- ✅ Bot deploys independently of aiqadam web/api. Smaller blast radius.
- ✅ ESB-ready: contract-first, versioned, replayable, language-neutral.
  Adding a second consumer (analytics pipeline, Discord mirror, etc.)
  is a new consumer-group on the same stream.
- ✅ NestJS Interactions dispatcher gains a TelegramAdapter; templates
  stay server-side.
- ✅ `apps/bot/` and `apps/workers/` stubs become removable.
- ⚠️ Two repos to maintain. Cross-repo PRs needed for envelope schema
  changes (rare — schema is locked at v1).
- ⚠️ NestJS-side build (six PRs) is the long pole. The new repo can't
  fully test against prod until A1–A6 ship.
- 📝 Bot is currently a Python anomaly in a TypeScript stack. Acceptable
  because aiogram + Python has no TS-side equivalent at this maturity.

## Addendum 2026-05-22 (R2): encryption-at-rest for tg_config

R2 (PR-1) introduces a new `tg_config` table to replace the
`TELEGRAM_BOT_SERVICE_TOKEN` env-only path with an operator-configurable
row, populated via `POST /v1/telegram/admin/configure` (super-admin
only) from the workspace cabinet (R3). The BotFather token stored in
that row is encrypted at rest.

**Algorithm**: AES-256-GCM via Node's `node:crypto` (no new dependency).

**Key handling**: 32-byte symmetric key in `TG_CONFIG_ENCRYPTION_KEY`
(hex-encoded). The key is per-environment, never reused; generation:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The key is **optional in dev** (configure/rotate/status return 503
`telegram_config_key_missing` when unset, but the existing
env-fallback /v1/telegram/* surface keeps working) and **required in
prod**. Coolify is the source of truth.

**Wire format**: `version(1) | iv(12) | tag(16) | ciphertext(N)` in a
single `bytea` column. The version byte reserves room for an algorithm
swap without schema churn; decrypt refuses unknown versions.

**Why not Vault/KMS**: out of scope for Phase 1 (zero-recurring-spend
filter per `docs/business-process-gaps.md`). Adopting a managed KMS
becomes load-bearing when (a) we run more than one secret of this
class, OR (b) per-tenant encryption keys are needed (currently NULL =
global default per §Q4).

**Key rotation**: documented at `docs/runbooks/telegram-token-rotation.md`
(stub in PR-1; full procedure with R5). Out of scope for R2.

**What this addendum does NOT change** from the original ADR: the
service token (bot ↔ API `Authorization: Bearer`) is still env-driven
in PR-1; PR-2 will introduce a DB column for it alongside the rotate
endpoint.

## References

- [ADR-0015](./0015-bot-scope-and-web-authoring-split.md) — bot scope split
- [ADR-0026](./0026-telegram-channel.md) — per-country channels
- [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) — no auth islands
- [ADR-0033](./0033-community-member-graph.md) — community-as-platform
- [community-platform-roadmap.md §Sprint 5.5](../community-platform-roadmap.md)
- [decision-batch-process](../decision-batch-process.md) — how this gets accepted
- AsyncAPI 3.0 spec: published in the new repo at `docs/asyncapi.yaml`
- `viktordrukker/tgblaster` — MIT reference for bot-stack patterns
- AsyncAPI: https://www.asyncapi.com/docs
- Redis Streams: https://redis.io/docs/data-types/streams/
- Outbox pattern: https://microservices.io/patterns/data/transactional-outbox.html
