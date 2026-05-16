import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Per ARCHITECTURE.md §"Module boundaries" rule 4: each module owns its
// schema next to the module code. Re-exported via src/db/schema/index.ts.
//
// `authentikSubject` is the OIDC `sub` claim — the only stable identifier
// across email changes, password rotations, etc. (See ADR-0016 §"Subject
// mode: Based on the User's hashed ID".) Email is denormalized here so
// non-auth code (event registrations, notifications) doesn't need to hit
// Authentik for every read.

// `handle` is the public profile slug (lowercase alphanumerics + underscore,
// up to 64 chars). Nullable for safety with existing rows; migration 0008
// backfills from the email prefix. New users get a derived handle from
// users.service.ensureHandle on first /auth/me.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authentikSubject: varchar('authentik_subject', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  handle: varchar('handle', { length: 64 }).unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
