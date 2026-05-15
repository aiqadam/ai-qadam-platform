import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    // 60s — Testcontainers cold-pulls the Postgres image on first CI run.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    globalSetup: ['./test/setup-pg.ts'],
    // The singleton `db` in src/db/index.ts validates DATABASE_URL at module
    // load. Tests construct their OWN Drizzle client from inject('TEST_DATABASE_URL')
    // and never use the singleton — this dummy just lets the import succeed.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://placeholder:placeholder@127.0.0.1:1/placeholder',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/dist/**', '**/migrations/**', '**/*.spec.ts', '**/*.config.ts'],
    },
  },
});
