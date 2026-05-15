import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  app.use(cookieParser());
  await app.listen(env.PORT);
  Logger.log(`API listening on http://localhost:${env.PORT}`, 'Bootstrap');
}

void bootstrap();
