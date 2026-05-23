import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../users/schema';

// Server-issued opaque refresh tokens per ADR-0016.
//
// What the client gets is a 256-bit random base64url string. We store only the
// SHA-256 hex (64 chars) — even a DB dump never exposes a usable token.
//
// `familyId` groups all tokens in a rotation chain. On replay (a previously-
// used token re-presented), the entire family is revoked: the legitimate
// session terminates and the attacker holding the stolen copy gets nothing.
//
// `usedAt` null = active. `revokedAt` null = not revoked. A token is valid iff
// usedAt IS NULL AND revokedAt IS NULL AND expiresAt > now().

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    familyId: uuid('family_id').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Authentik-issued OIDC id_token captured at /callback. Carried
    // forward unchanged on each rotation. Used as `id_token_hint` for
    // OIDC RP-Initiated Logout (end_session_endpoint) so /sign-out
    // terminates the Authentik IdP session — kills SSO across every
    // Authentik-protected app (workspace, Directus, Gatus). Nullable
    // for rows created before this column existed; sign-out falls back
    // to local-only revoke when missing.
    idToken: text('id_token'),
  },
  (t) => ({
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
    familyIdx: index('refresh_tokens_family_idx').on(t.familyId),
  }),
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
