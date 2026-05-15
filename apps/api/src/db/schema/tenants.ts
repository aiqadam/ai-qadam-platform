import { boolean, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

// Per ARCHITECTURE.md §"Multi-tenancy implementation":
//   "All tenant-scoped tables have country_code column (varchar(2), indexed)."
// This is the canonical countries table; every other tenant-scoped table FKs
// to countries.code via its own country_code column.
//
// 'global' is intentionally NOT a row here. The middleware translates a
// missing-or-not-found tenant header into a 4xx (or, for a future global
// subdomain, into req.tenant=null which only super_admin endpoints accept).

export const countries = pgTable('countries', {
  // ISO 3166-1 alpha-2, lowercase. Phase 1: uz / kz / tj.
  code: varchar('code', { length: 2 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  nameRu: varchar('name_ru', { length: 100 }).notNull(),
  tz: varchar('tz', { length: 64 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;
