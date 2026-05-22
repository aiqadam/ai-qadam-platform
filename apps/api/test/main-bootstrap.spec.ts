import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Spawns the compiled dist/main.js against a fresh Postgres and
// asserts the module graph initializes without circular-dep crashes.
// This is the regression guard for the bug that crashed prod on
// 2026-05-22 (PR #187 → revert via #202): TelegramModule imported
// AuthModule, which combined with the existing
// AuthModule → LeadsModule → InteractionsModule → TelegramModule
// chain to produce an unresolvable cycle. Nest threw
// "UndefinedModuleException: The module at index [0] of the
// TelegramModule 'imports' array is undefined." at boot.
//
// What this test does NOT do: a full HTTP boot. The OIDC client in
// AuthService eagerly fetches its discovery doc at startup, which
// fails against a placeholder URL — and standing up a real OIDC IdP
// in Testcontainers is too heavy for a smoke. Instead we accept the
// fact that the process WILL crash on OIDC discovery, and verify
// that BEFORE the crash, Nest logged "TelegramModule dependencies
// initialized" (and "InteractionsModule dependencies initialized" —
// the OTHER module in the cycle). If Nest can't resolve the cycle,
// it throws BEFORE InstanceLoader logs anything telegram-shaped.

let pg: StartedPostgreSqlContainer | undefined;
let dbUrl = '';

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('platform_main_smoke')
    .withUsername('test')
    .withPassword('test')
    .start();
  dbUrl = pg.getConnectionUri();
}, 60_000);

afterAll(async () => {
  await pg?.stop();
});

interface BootResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function bootSubprocess(): Promise<BootResult> {
  const mainPath = path.resolve(__dirname, '..', 'dist', 'main.js');
  const proc = spawn('node', [mainPath], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // env Zod requires positive; pick a high port that's almost
      // certainly free — process will crash on OIDC discovery before
      // actually listen()ing, so the port choice is mostly cosmetic.
      PORT: String(35000 + Math.floor(Math.random() * 5000)),
      DATABASE_URL: dbUrl,
      REDIS_URL: 'redis://127.0.0.1:1/0', // unused at boot
      JWT_SIGNING_SECRET: 'test-jwt-signing-secret-at-least-32-chars-long-pad-pad',
      OIDC_ISSUER_URL: 'http://placeholder.invalid/oidc/',
      OIDC_CLIENT_ID: 'placeholder-client-id',
      OIDC_CLIENT_SECRET: 'placeholder-client-secret',
      OIDC_REDIRECT_URI: 'http://placeholder.invalid/v1/auth/callback',
      WEB_BASE_URL: 'http://placeholder.invalid',
      INTERNAL_API_TOKEN: 'test-internal-api-token-at-least-32-chars-long-pad-pad',
      DIRECTUS_URL: 'http://placeholder.invalid',
      DIRECTUS_TOKEN: 'test-directus-token-placeholder',
      AUTHENTIK_WEBHOOK_SECRET: 'test-authentik-webhook-secret-32+chars-padding-pad-pad',
      TG_CONFIG_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr?.on('data', (chunk) => {
    stderr += String(chunk);
  });

  // Wait for exit (process crashes on OIDC after the module graph
  // loads). Bound the wait so a real hang doesn't stall the suite.
  const exit = once(proc, 'exit') as Promise<[number | null, NodeJS.Signals | null]>;
  const timeout = new Promise<[null, null]>((resolve) =>
    setTimeout(() => {
      proc.kill('SIGTERM');
      resolve([null, null]);
    }, 30_000),
  );
  const [code] = await Promise.race([exit, timeout]);
  return { exitCode: code, stdout, stderr };
}

describe('dist/main.js bootstrap', () => {
  it('initializes TelegramModule + InteractionsModule without circular-dep crash', async () => {
    const result = await bootSubprocess();
    const combined = result.stdout + result.stderr;

    // The cycle would manifest as a Nest "UndefinedModuleException"
    // about TelegramModule before any InstanceLoader log lines. If
    // we see the InstanceLoader confirmation, the cycle is resolved.
    expect(combined).toMatch(/TelegramModule dependencies initialized/);
    expect(combined).toMatch(/InteractionsModule dependencies initialized/);

    // Regression-specific assertion: the error message that prod saw.
    expect(combined).not.toMatch(/Nest cannot create the TelegramModule instance.*undefined/s);
  }, 60_000);

  it('runs runMigrations() before NestFactory.create — verified by the migrations log line', async () => {
    // bootSubprocess is called twice across these two tests; that's
    // intentional. The first invocation already proved the cycle is
    // resolved; this one re-runs to assert the migrations side of
    // the bootstrap also fires (the SECOND piece of this PR).
    const result = await bootSubprocess();
    const combined = result.stdout + result.stderr;
    expect(combined).toMatch(/migrations applied/);
  }, 60_000);
});
