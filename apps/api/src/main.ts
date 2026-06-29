import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';
import { runMigrations } from './db/migrate';
import { assertPortAvailable } from './lib/port-guard';

// Why migrations run here, not in Coolify's pre_deployment_command:
//
//   Coolify's pre_deployment_command runs in the OLD container BEFORE
//   the new image is built. New migrations that ship with a release
//   live in the NEW image's filesystem — the OLD container's
//   pre-deploy hook never sees them. (Verified on prod 2026-05-22:
//   migration 0013_tg_config.sql never applied despite a successful
//   pre-deploy run; pre-deploy reported "applied migrations" because
//   no NEW migrations existed in the OLD container's view.)
//
//   Worse, when the OLD container is crashlooping (as happened
//   downstream of the same incident), `docker exec` against it
//   fails — blocking every future deploy until pre_deployment_command
//   is cleared.
//
// Running migrate() here guarantees the NEW image's migrations are
// applied against the live DB before HTTP traffic is accepted. On
// failure the process exits non-zero → Coolify deploy fails → operator
// sees the failure surface immediately. No reliance on `docker exec`
// against a possibly-broken container.

async function bootstrap(): Promise<void> {
  await assertPortAvailable(env.PORT);
  Logger.log(`port-guard OK (port ${env.PORT})`, 'Bootstrap');
  await runMigrations();
  Logger.log('migrations applied', 'Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    // F-S2.2 RBAC webhook (ADR-0021 §5) verifies HMAC-SHA256 over the
    // raw request body. rawBody=true exposes the raw buffer via
    // `req.rawBody`; only the webhook guard reads it, other routes are
    // unaffected.
    rawBody: true,
  });
  app.use(cookieParser());
  await app.listen(env.PORT);
  Logger.log(`API listening on http://localhost:${env.PORT}`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // Force non-zero exit so Coolify treats a migration / boot failure
  // as a failed deploy rather than a healthy-but-broken container.
  // Without this the unhandled-rejection would still exit non-zero,
  // but the surface is muddier (no Bootstrap-tagged log line).
  Logger.error(
    `bootstrap failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    'Bootstrap',
  );
  process.exit(1);
});
