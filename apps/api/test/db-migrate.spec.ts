import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);

// Verifies the compiled migrate script (dist/db/migrate.js) actually
// applies migrations against a fresh Postgres. This is the script
// Coolify's pre_deployment_command runs in prod, so a regression here
// = a broken deploy pipeline.
//
// We don't mock anything — spawn the script as a subprocess with
// DATABASE_URL set to a clean Testcontainers Postgres (a different
// container from the suite-wide one; this one starts empty so we can
// assert the script applied all migrations to it).

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let pg: StartedPostgreSqlContainer | undefined;
let dbUrl = '';

beforeAll(async () => {
  // 60s cap on cold pull — matches setup-pg.ts hookTimeout policy.
  pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('platform_migrate_test')
    .withUsername('test')
    .withPassword('test')
    .start();
  dbUrl = pg.getConnectionUri();
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

const scriptPath = path.resolve(__dirname, '..', 'dist', 'db', 'migrate.js');

describe('dist/db/migrate.js', () => {
  it('applies all migrations to a fresh DB and exits 0', async () => {
    const { stdout, stderr } = await execFileP('node', [scriptPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: dbUrl,
      },
      timeout: 30_000,
    });
    expect(stdout + stderr).toMatch(/applied migrations from/);

    // Verify a few canonical tables exist that early migrations create.
    const client = postgres(dbUrl, { max: 1 });
    try {
      const _db = drizzle(client);
      const tables = await client`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `;
      const names = tables.map((r) => r.tablename);
      // Spot-check tables from multiple migrations to confirm the
      // script ran the journal end-to-end.
      expect(names).toContain('users');
      expect(names).toContain('outbox');
      expect(names).toContain('tg_link_challenges');
    } finally {
      await client.end();
    }
  });

  it('is idempotent: re-running on an up-to-date DB exits 0 without errors', async () => {
    const { stdout, stderr } = await execFileP('node', [scriptPath], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: dbUrl,
      },
      timeout: 30_000,
    });
    expect(stdout + stderr).toMatch(/applied migrations from/);
    // No exception thrown ⇒ exit code 0. execFile rejects on non-zero.
  });
});
