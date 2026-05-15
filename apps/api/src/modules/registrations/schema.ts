import { index, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { events } from '../events/schema';
import { users } from '../users/schema';

// Per GLOSSARY.md: a Registration is a User's commitment to attend an Event.
// Lifecycle: registered → cancelled (user cancels) or → attended (organizer
// marks at check-in, PR #16). For PR #13 only registered/cancelled exist.

export const registrationStatus = pgEnum('registration_status', [
  'registered',
  'waitlisted',
  'cancelled',
  'attended',
]);

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: registrationStatus('status').notNull().default('registered'),
    // Unique unguessable code printed on the user's QR. Knowing it is proof
    // of physical possession of the ticket — see PR #16 docs for the trust
    // model. Generated server-side at insert time; never re-rolled.
    checkinCode: uuid('checkin_code').notNull().defaultRandom().unique(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One row per (event, user) pair — toggling cancel/re-register flips the
    // status of the existing row, never creates duplicates.
    eventUserUnique: unique('registrations_event_user_unique').on(t.eventId, t.userId),
    // Hot path: list a user's active registrations (for /me, "my events").
    userActiveIdx: index('registrations_user_status_idx').on(t.userId, t.status),
    // Hot path: list registrations for an event (capacity check in PR #15).
    eventStatusIdx: index('registrations_event_status_idx').on(t.eventId, t.status),
  }),
);

export type Registration = typeof registrations.$inferSelect;
export type NewRegistration = typeof registrations.$inferInsert;
