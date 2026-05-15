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
