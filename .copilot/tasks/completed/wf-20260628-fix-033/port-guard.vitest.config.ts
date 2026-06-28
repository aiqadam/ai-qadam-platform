// Ad-hoc vitest config for wf-20260628-fix-033 — drops globalSetup so
// the port-guard spec can run without the pre-existing
// `__vite_ssr_exportName__ is not defined` vite-node ReferenceError
// that blocks the entire api test suite on this Windows machine.
//
// This file lives in the workflow scratch directory and is NOT part
// of the PR. Delete after the workflow finishes.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // globalSetup is intentionally omitted.
    fileParallelism: false,
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
      TG_CONFIG_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
});