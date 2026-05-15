import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';

// Single shared Postgres connection pool. Per STANDARDS.md Part I rule 4:
// "No singletons except for shared infrastructure (Drizzle client, Redis client)."
//
// Schemas live next to the modules that own them; they're combined in
// src/db/schema/index.ts and re-exported there for drizzle-kit to read.
const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
});

export const db = drizzle(queryClient);
export type Db = typeof db;

// NestJS DI token for the Drizzle client. Modules that write to the DB take
// a `Db` via constructor injection (provided as `db` in production, swappable
// for a Testcontainers-backed instance in tests). Read-only services that
// load a cache once at boot may import `db` directly (see TenantsService).
export const DB = Symbol('DB');
