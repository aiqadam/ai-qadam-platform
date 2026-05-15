import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { countries } from '../../db/schema/tenants';

// Per ARCHITECTURE.md §"Multi-tenancy implementation": tenant-scoped tables
// have country_code varchar(2) FK to countries.code, indexed.
// Per GLOSSARY.md: an Event is a single dated gathering — meetup / workshop /
// hackathon / conference / online. Status lifecycle is draft → published →
// cancelled (or → past, derived from endsAt).

export const eventFormat = pgEnum('event_format', [
  'meetup',
  'workshop',
  'hackathon',
  'conference',
  'online',
]);

export const eventStatus = pgEnum('event_status', ['draft', 'published', 'cancelled']);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    countryCode: varchar('country_code', { length: 2 })
      .notNull()
      .references(() => countries.code, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    format: eventFormat('format').notNull(),
    status: eventStatus('status').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    // null = unlimited capacity. Registration logic lands in PR #13.
    capacity: integer('capacity'),
    // null = online or unspecified. Free-text venue for now; structured
    // address is a later concern.
    location: varchar('location', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    countryIdx: index('events_country_idx').on(t.countryCode),
    // Hot path: list upcoming published events for a tenant ordered by date.
    countryStartsAtIdx: index('events_country_starts_at_idx').on(t.countryCode, t.startsAt),
    // Helper: filter by status (skip drafts/cancelled in public list).
    statusIdx: index('events_status_idx').on(t.status),
  }),
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

// Marker re-export so the file isn't dead-code-eliminated when only types are
// used downstream. drizzle-kit needs the table object visible from the schema
// barrel.
export const __eventSchemaMarker = sql`select 1`;
