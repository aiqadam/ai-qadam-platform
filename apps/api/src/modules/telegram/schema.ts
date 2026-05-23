import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Telegram-side platform tables per ADR-0034. The canonical member-link
// fields (telegram_user_id / telegram_linked_at / telegram_opted_out_at)
// live on `directus_users` in Directus per ADR-0033 — those are NOT in
// this file. The API reads/writes them via DirectusClient.
//
// What lives HERE (the API's `platform` Postgres):
//   - tg_link_challenges — transient OTP storage for the bot's /link FSM
//   - tg_send_log — idempotent audit of outbound dispatches
//   - outbox — relay backbone for at-least-once Streams publishing
//
// Telegram user IDs are 64-bit signed integers (post-2024 they exceed
// Number.MAX_SAFE_INTEGER for some accounts) — use bigint with mode:'bigint'.

// ─── Link challenges (transient OTP for /link FSM) ──────────────────────────
//
// One row per `link_start` call. The 6-digit code is stored hashed; the
// raw code never lands in the DB. The row is consumed on first successful
// `link_confirm` (or invalidated by `attempts >= 5` to throttle brute
// force). A periodic cleanup job purges expired+consumed rows.
//
// Why bigint for tg_user_id: TG IDs can exceed 2^53; using `varchar` is
// the alternative pattern, but bigint preserves natural sort + saves
// space and indexes cheaper.
export const tgLinkChallenges = pgTable(
  'tg_link_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tgUserId: bigint('tg_user_id', { mode: 'bigint' }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    // sha256 of the 6-digit code. Comparison is constant-time at the
    // service layer.
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Lookup-by-tg-user for rate-limit + active-challenge queries.
    // `expires_at` second so the planner can use this for "active
    // challenges for this user" without a separate sort step.
    byTgUser: index('tg_link_challenges_tg_user_idx').on(t.tgUserId, t.expiresAt),
  }),
);

export type TgLinkChallenge = typeof tgLinkChallenges.$inferSelect;
export type NewTgLinkChallenge = typeof tgLinkChallenges.$inferInsert;

// ─── Send log (idempotent audit for the notifier) ───────────────────────────
//
// The notifier POSTs to /v1/telegram/audit after every send attempt
// (success or terminal failure). `delivery_key` is the producer-supplied
// idempotency key (ADR-0034 §"ESB contract"). UNIQUE on it makes replays
// safe: re-delivery of the same envelope finds an existing row and is
// rejected at this layer too, belt-and-braces with the notifier's Redis
// dedupe.
//
// `envelope_id` is the UUID of the originating envelope (= outbox.envelope_id).
export const tgSendLog = pgTable('tg_send_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryKey: varchar('delivery_key', { length: 128 }).notNull().unique(),
  envelopeId: uuid('envelope_id').notNull(),
  // 'sent' | 'opted_out' | 'blocked' | 'bad_request' | 'retry' |
  // 'expired' | 'unknown_error'. Free-form to allow new outcomes
  // without schema churn; the service-layer enum guards what we accept.
  outcome: varchar('outcome', { length: 32 }).notNull(),
  detail: text('detail'),
  // Telegram-side message_id (also bigint for safety).
  messageId: bigint('message_id', { mode: 'bigint' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TgSendLog = typeof tgSendLog.$inferSelect;
export type NewTgSendLog = typeof tgSendLog.$inferInsert;

// ─── Outbox (event-relay backbone for at-least-once Streams publishing) ─────
//
// Written in the SAME tx as the state change it accompanies (registration
// created, broadcast scheduled, etc.). A separate relay loop SELECTs
// unpublished rows FOR UPDATE SKIP LOCKED, XADDs to Redis Streams, then
// UPDATEs published_at.
//
// `envelope_id` is the PK so producers can dedupe at insert time (ON
// CONFLICT DO NOTHING). `stream` is the target Redis Stream name —
// today only 'tg.dispatch.v1', but the table is generic (other streams
// can ride the same relay).
//
// `payload` is the full envelope JSON the relay will XADD verbatim under
// the 'envelope' field. The relay does NO rendering — that happens in
// the service that wrote the outbox row.
export const outbox = pgTable(
  'outbox',
  {
    envelopeId: uuid('envelope_id').primaryKey(),
    stream: varchar('stream', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // Number of XADD attempts. The relay retries on Redis errors; this
    // counts those. After max_retries (config), the row stays unpublished
    // and operator review is required (alert via Plausible ops events).
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => ({
    // Partial-index-style: most queries are "WHERE published_at IS NULL
    // ORDER BY created_at". A two-column index handles both predicates.
    unpublished: index('outbox_unpublished_idx').on(t.publishedAt, t.createdAt),
  }),
);

export type OutboxRow = typeof outbox.$inferSelect;
export type NewOutboxRow = typeof outbox.$inferInsert;

// ─── Telegram bot configuration (R2: encrypted token + bot identity) ────────
//
// One row per tenant; `tenant=NULL` is the global default that applies
// when no tenant-specific row exists. ADR-0034 picks "one bot account
// for all tenants" (§Q4), so in practice we ship a single global row —
// the per-tenant column is here so the schema doesn't need a migration
// the day we revisit that decision.
//
// `encrypted_token` stores the BotFather token encrypted at rest via
// AES-256-GCM (see token-crypto.ts). The encryption key is supplied by
// env (TG_CONFIG_ENCRYPTION_KEY); rotating the key is an ops procedure
// documented in docs/runbooks/telegram-token-rotation.md (TODO with R5).
//
// Why a `bytea` blob instead of a varchar of base64:
//   - AES-GCM output is binary; bytea avoids an extra encode/decode pass.
//   - Postgres compresses bytea when the row enters TOAST storage —
//     marginal but free.
//
// `bot_id` + `bot_username` are captured from Telegram's `getMe` at
// configure time. They're denormalized here so the /status endpoint can
// render them without calling Telegram on every poll.

// Drizzle doesn't ship a typed bytea helper out of the box; the customType
// wrapper turns the column into a `Buffer` at the JS boundary. Driver
// (postgres-js) handles the actual bytea ↔ Buffer marshalling.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const tgConfig = pgTable(
  'tg_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // NULL → global default. NOT NULL → tenant-scoped (uz/kz/tj/xx etc.).
    // tenants table lives in src/db/schema/tenants.ts; we don't FK here
    // because tg_config exists in degraded states (operator pre-creates
    // an entry before the tenants table is fully populated for new
    // markets).
    tenant: varchar('tenant', { length: 8 }),
    encryptedToken: bytea('encrypted_token').notNull(),
    // R2 PR-3 — bot ↔ API service token (`Authorization: Bearer`),
    // AES-256-GCM encrypted with the same TG_CONFIG_ENCRYPTION_KEY as
    // encrypted_token. Nullable so existing rows configured pre-R2-PR-3
    // keep working: TelegramAuthGuard reads from this column first, then
    // falls back to env.TELEGRAM_BOT_SERVICE_TOKEN. After an operator
    // rotates via the cabinet, DB takes over and the env becomes
    // deprecated for that tenant (a Plausible ops event fires on every
    // env fallback so we know when prod has fully cut over).
    encryptedServiceToken: bytea('encrypted_service_token'),
    serviceTokenRotatedAt: timestamp('service_token_rotated_at', { withTimezone: true }),
    serviceTokenRotatedBy: uuid('service_token_rotated_by'),
    botId: bigint('bot_id', { mode: 'bigint' }).notNull(),
    botUsername: varchar('bot_username', { length: 64 }).notNull(),
    configuredAt: timestamp('configured_at', { withTimezone: true }).notNull().defaultNow(),
    // FK omitted on purpose: users may be deleted (GDPR) while their
    // historic config-record audit trail remains. The uuid is stored for
    // forensics; UI joins lazily.
    configuredBy: uuid('configured_by').notNull(),
  },
  (t) => ({
    // Postgres treats two NULLs as distinct — so a plain UNIQUE(tenant)
    // wouldn't reject two NULL-tenant rows. Coalesce to '*' inside a
    // unique expression index to make the "one global row" invariant
    // hold. (Postgres 15+ supports `UNIQUE NULLS NOT DISTINCT`; we
    // target a wider version range with the expression form.)
    oneRowPerTenant: uniqueIndex('tg_config_tenant_unique_idx').on(sql`coalesce(${t.tenant}, '*')`),
  }),
);

export type TgConfigRow = typeof tgConfig.$inferSelect;
export type NewTgConfigRow = typeof tgConfig.$inferInsert;

// Drizzle's `sql` import keeps tsc happy if migrations reference raw SQL
// — currently unused but exported for future use without a fresh import.
export { sql };
