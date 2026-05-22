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
    // Spec files write to the SAME Postgres container — parallel files race
    // each other's `beforeEach` cleanup (one suite deletes rows the other
    // is mid-test on). At Phase-1 scale (a few seconds total), serial files
    // is faster than building per-file schema isolation.
    fileParallelism: false,
    // The singleton `db` in src/db/index.ts validates DATABASE_URL at module
    // load. Tests construct their OWN Drizzle client from inject('TEST_DATABASE_URL')
    // and never use the singleton — this dummy just lets the import succeed.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://placeholder:placeholder@127.0.0.1:1/placeholder',
      JWT_SIGNING_SECRET: 'test-jwt-signing-secret-at-least-32-chars-long-pad-pad',
      OIDC_ISSUER_URL: 'http://placeholder.invalid/oidc/',
      OIDC_CLIENT_ID: 'placeholder-client-id',
      OIDC_CLIENT_SECRET: 'placeholder-client-secret',
      OIDC_REDIRECT_URI: 'http://placeholder.invalid/v1/auth/callback',
      WEB_BASE_URL: 'http://placeholder.invalid',
      INTERNAL_API_TOKEN: 'test-internal-api-token-at-least-32-chars-long-pad-pad',
      DIRECTUS_URL: 'http://placeholder.invalid',
      DIRECTUS_TOKEN: 'test-directus-token-placeholder',
      TELEGRAM_BOT_SERVICE_TOKEN: 'test-telegram-bot-service-token-at-least-32-chars-pad',
      AUTHENTIK_ADMIN_TOKEN: 'test-authentik-admin-token-placeholder',
      AUTHENTIK_WEBHOOK_SECRET: 'test-authentik-webhook-secret-32+chars-padding-pad-pad',
      // Deterministic 32-byte (64-hex) key for the tg_config encryption
      // tests. Reusing one key across the suite is fine — encryption
      // uses a fresh random IV per call, so deterministic key + fresh
      // IV doesn't compromise ciphertext indistinguishability.
      TG_CONFIG_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/dist/**', '**/migrations/**', '**/*.spec.ts', '**/*.config.ts'],
    },
  },
});
