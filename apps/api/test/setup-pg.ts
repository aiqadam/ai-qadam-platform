import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { GlobalSetupContext } from 'vitest/node';

// Vitest globalSetup. Starts ONE Postgres container + ONE Redis container
// for the entire test run, applies all Postgres migrations, exposes both
// connection URLs to tests via Vitest's `inject()` API. Per CLAUDE.md §4:
// "Use Testcontainers for tests that need Postgres/Redis — never mock
// the database."
//
// Images:
//   - postgres:16-alpine — plain (no pgvector). Faster pull on cold CI
//     (~85 MB vs ~470 MB for pgvector image). Switch when the first
//     vector-using test lands.
//   - redis:7-alpine — matches infrastructure/docker-compose.yml +
//     prod Coolify Redis version. Used by the outbox relay (A5) +
//     future Streams consumers.

declare module 'vitest' {
  export interface ProvidedContext {
    TEST_DATABASE_URL: string;
    TEST_REDIS_URL: string;
  }
}

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedTestContainer | undefined;

export async function setup({ provide }: GlobalSetupContext): Promise<() => Promise<void>> {
  pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('platform_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  redis = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withCommand(['redis-server', '--save', '', '--appendonly', 'no'])
    .start();

  const dbUrl = pg.getConnectionUri();
  const client = postgres(dbUrl, { max: 1 });
  try {
    const db = drizzle(client);
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, '../src/db/migrations'),
    });
  } finally {
    await client.end();
  }

  const redisHost = redis.getHost();
  const redisPort = redis.getMappedPort(6379);
  const redisUrl = `redis://${redisHost}:${redisPort}/0`;

  provide('TEST_DATABASE_URL', dbUrl);
  provide('TEST_REDIS_URL', redisUrl);

  return async () => {
    await Promise.allSettled([pg?.stop(), redis?.stop()]);
    pg = undefined;
    redis = undefined;
  };
}
