import { defineConfig } from 'vitest/config';

// Minimal vitest config for running pure unit tests that do NOT need
// Postgres/Redis (Testcontainers). Used by ISS-UAT-013-9 regression run.
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: [
      'test/leads-service.spec.ts',
      'test/auth-logout-doc-coverage.spec.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // No globalSetup — leads-service spec uses fully-mocked Directus client
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
      TG_CONFIG_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
});
