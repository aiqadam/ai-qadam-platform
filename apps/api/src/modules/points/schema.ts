import {
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { countries } from '../../db/schema/tenants';
import { users } from '../users/schema';

// Per GLOSSARY.md: gamification awards points for participation. PR #17 ships
// the single source 'event_attended'; future sources (talk_given, mentor_match,
// etc.) extend the enum.
//
// Schema is event-sourced — one row per award, not a balance column on the
// user. Lets us explain exactly why someone has N points + retroactively
// adjust without a migration. Aggregate at query time.

export const pointSource = pgEnum('point_source', ['event_attended']);

export const pointAwards = pgTable(
  'point_awards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    countryCode: varchar('country_code', { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: 'restrict' }),
    source: pointSource('source').notNull(),
    // Foreign-row pointer: for 'event_attended', this is registrations.id.
    // Kept as a plain uuid (not a hard FK) because future sources will point
    // at different tables.
    sourceRef: uuid('source_ref').notNull(),
    points: integer('points').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency: any (user, source, source_ref) triple can only award once.
    sourceUnique: unique('point_awards_source_unique').on(t.userId, t.source, t.sourceRef),
    // Hot path: leaderboard for a tenant.
    countryUserIdx: index('point_awards_country_user_idx').on(t.countryCode, t.userId),
  }),
);

export type PointAward = typeof pointAwards.$inferSelect;
export type NewPointAward = typeof pointAwards.$inferInsert;

// Public award amounts. Centralised so we can grep/adjust later without
// hunting through service code.
export const POINTS_FOR_EVENT_ATTENDED = 10;
