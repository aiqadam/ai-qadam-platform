import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Short-lived, single-use upgrade records that distinguish an
// upgrade-completing magic-link click from an ordinary sign-in, per
// FR-AUTH-006.
//
// A Telegram-only member (Authentik `attributes.is_temporary=true`, no
// `platform.users` row yet) supplies a real email via
// POST /v1/internal/telegram/upgrade-temp. That handler (`UpgradeService.
// requestUpgrade()`) mints a row here, PATCHes the target email directly
// onto the Authentik user (Finding #0 — `sendMagicLinkEmail` always
// targets the user's CURRENT on-file email, so it must be correct before
// the send, not after verification), then sends an Authentik magic-link
// email.
//
// CORRECTION (supersedes this file's original design comment — see
// `upgrade.service.ts`'s module doc and `03-code-summary.md` /
// `02-impact-analysis.md` Finding #0 in wf-20260801-feat-181 for the full
// trace): the original design sketched threading `tokenHash` through the
// OIDC `next` query param so `AuthController.callback()` could look the
// row up by token. This does NOT survive contact with how Authentik's
// magic-link email URL is actually generated — neither `sendMagicLinkEmail`
// (→ `recovery_email`) nor `createRecoveryLink` (→ `recovery`) accept ANY
// caller-supplied redirect/state/next parameter; the emailed link's target
// flow is resolved entirely server-side from the request's `Host` header
// (Brand routing), so there is no channel to round-trip a token through at
// all. **The shipped mechanism correlates by `authentikUserPk` instead**:
// `UpgradeService.resolvePendingUpgrade(email)` resolves the verified
// email `callback()` just received to an Authentik pk (`getUserByEmail`)
// and looks up the most recent live (unexpired, unconsumed) row here for
// that pk via `upgrade_intents_authentik_user_pk_idx`. The fact that this
// specific Authentik user just completed Authentik's own verified
// email-stage flow IS the proof of intent.
//
// `tokenHash` is therefore VESTIGIAL for correlation in the shipped
// design — still populated on every insert (the column is `NOT NULL
// UNIQUE`, and a real hashed value costs nothing and preserves a
// forward-compatible audit trail), but never read back to find a row.
// Like `refreshTokens.tokenHash`, it stores only the SHA-256 hex (64
// chars) of a random value — never a usable secret at rest.
//
// `authentikUserPk` is Authentik's own integer `pk` — NOT a `platform.users`
// uuid, and NOT a foreign key. A temp user has no `platform.users` row to
// reference (that's the entire premise of this table), and Authentik users
// live outside this Postgres database entirely, so a real FK is both
// unavailable and architecturally impossible (cross-schema queries are
// forbidden). This is a deliberate divergence from `refreshTokens.userId`'s
// uuid+FK pattern, not an oversight.
//
// Not tenant-scoped: a Telegram user's country isn't resolved until well
// after upgrade, and `platform.users` itself has no `country_code` column
// either. Same global-data bucket as `refreshTokens`.
//
// `consumedAt` null = not yet used. A token is valid iff consumedAt IS NULL
// AND expiresAt > now().

export const upgradeIntents = pgTable(
  'upgrade_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    authentikUserPk: integer('authentik_user_pk').notNull(),
    telegramId: varchar('telegram_id', { length: 32 }).notNull(),
    targetEmail: varchar('target_email', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => ({
    // Fast point-lookup at callback time: find the row by token hash.
    tokenIdx: index('upgrade_intents_token_idx').on(t.tokenHash),
    // Idempotency check at POST /upgrade-temp time: does this temp user
    // already have a pending upgrade?
    authentikUserPkIdx: index('upgrade_intents_authentik_user_pk_idx').on(t.authentikUserPk),
  }),
);

export type UpgradeIntent = typeof upgradeIntents.$inferSelect;
export type NewUpgradeIntent = typeof upgradeIntents.$inferInsert;
