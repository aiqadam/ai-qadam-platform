import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../config/env';

// One-shot CLI: applies all unapplied migrations under
// src/db/migrations/ to env.DATABASE_URL, then exits.
//
// Why this instead of `npx drizzle-kit migrate`:
//   - The prod image strips devDeps (incl. drizzle-kit). `npx
//     drizzle-kit` fetches a fresh copy that mismatches the prod
//     drizzle-orm version and refuses to run ("Please install latest
//     version of drizzle-orm" — verified on prod 2026-05-22).
//   - drizzle-orm itself ships a `migrate()` helper as part of its
//     runtime API. It's already in the prod image (it's a runtime
//     dep). No fetch, no version drift.
//
// Coolify pre_deployment_command wires this in:
//
//   cd /app && node dist/db/migrate.js
//
// Path resolution: the Dockerfile copies the SQL + journal into
// /app/src/db/migrations. We resolve relative to __dirname so this
// works regardless of CWD (dist/db/ → ../../src/db/migrations).

async function main(): Promise<void> {
  // Compiled location is /app/dist/db/migrate.js → SQL lives at
  // /app/src/db/migrations. The Dockerfile already copies that path.
  const migrationsFolder = path.resolve(__dirname, '..', '..', 'src', 'db', 'migrations');
  // Single connection, short pool — we're a one-shot script. max:1
  // avoids holding extra connections while migrations queue up.
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(client);
    // drizzle-orm's migrate is idempotent: it consults the
    // drizzle.__drizzle_migrations table and skips already-applied
    // hashes. Safe to run on every deploy.
    await migrate(db, { migrationsFolder });
    // eslint-disable-next-line no-console
    console.log(`[migrate] applied migrations from ${migrationsFolder}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // Non-zero exit so the deploy halts cleanly. Coolify's
  // pre_deployment_command treats any non-zero exit as a fatal stop.
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
