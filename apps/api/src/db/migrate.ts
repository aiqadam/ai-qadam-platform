import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../config/env';

// Applies all unapplied migrations under src/db/migrations/ to
// env.DATABASE_URL. Two consumers:
//
//   1. main.ts — called from bootstrap() before NestFactory.create so
//      a fresh container can't accept HTTP until migrations are
//      consistent. This is the prod path; previously a broken
//      Coolify pre_deployment_command attempted this from the OLD
//      container before image rebuild, missing new migrations
//      entirely. See main.ts for the rationale.
//
//   2. `node dist/db/migrate.js` — standalone CLI for ad-hoc ops use
//      (run migrations on a paused container, backfill a DB clone,
//      etc.). The `if (require.main === module)` block at the bottom
//      wires this up.
//
// Why drizzle-orm's migrate() and not `drizzle-kit migrate`:
//   - Prod image strips devDeps (incl. drizzle-kit). `npx drizzle-kit`
//     pulls a fresh copy whose version mismatches the prod drizzle-orm
//     and refuses to run.
//   - drizzle-orm itself ships migrate() as a runtime API. Already in
//     the prod image; no fetch, no version drift.
//
// Path resolution: compiled location is /app/dist/db/migrate.js, SQL
// at /app/src/db/migrations (the Dockerfile copies that path). The
// `../../src/db/migrations` resolves correctly from both compiled
// (/app/dist/db/) and source (apps/api/src/db/) layouts.

const MIGRATIONS_FOLDER = path.resolve(__dirname, '..', '..', 'src', 'db', 'migrations');

export async function runMigrations(): Promise<void> {
  // Single connection, short pool — one-shot. max:1 avoids holding
  // extra connections while migrations queue up.
  const client = postgres(env.DATABASE_URL, { max: 1 });
  try {
    const db = drizzle(client);
    // Idempotent: consults drizzle.__drizzle_migrations + skips
    // already-applied hashes. Safe on every container start.
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

// Standalone-CLI entrypoint. Triggered only when this module is run
// directly (`node dist/db/migrate.js`); skipped when imported by
// main.ts. Logs via console (not Nest Logger — Nest isn't booted in
// the CLI path).
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log(`[migrate] applied migrations from ${MIGRATIONS_FOLDER}`);
    })
    .catch((err) => {
      // Non-zero exit so CI / ops tooling sees the failure.
      // eslint-disable-next-line no-console
      console.error('[migrate] failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
