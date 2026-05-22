import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
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

void bootstrap();
