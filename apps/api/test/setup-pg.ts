import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { GlobalSetupContext } from 'vitest/node';

// Vitest globalSetup. Starts ONE Postgres container for the entire test run,
// applies all migrations, exposes the connection URL to tests via Vitest's
// `inject()` API. Per CLAUDE.md §4: "Use Testcontainers for tests that need
// Postgres/Redis — never mock the database."
//
// Image: plain postgres:16-alpine, not pgvector/pgvector:pg16. Faster pull on
// cold CI (~85 MB vs ~470 MB) and no PR-7a code uses vector ops. Switch to
// the pgvector image when the first vector-using test lands.

declare module 'vitest' {
  export interface ProvidedContext {
    TEST_DATABASE_URL: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('platform_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, '../src/db/migrations'),
    });
  } finally {
    await client.end();
  }

  provide('TEST_DATABASE_URL', url);

  return async () => {
    await container?.stop();
    container = undefined;
  };
}
