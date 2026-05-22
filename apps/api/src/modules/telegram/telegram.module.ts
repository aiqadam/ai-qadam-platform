import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { DB, db } from '../../db';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { OutboxPublisher } from './outbox-publisher.service';
import { OutboxRelayService } from './outbox-relay.service';
import { TelegramController, TelegramPublicController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TELEGRAM_REDIS } from './telegram.tokens';

// Owns the lifecycle of ONE Redis connection for telegram-side traffic
// (outbox relay publishing to Streams). Other modules with Redis needs
// (e.g. JtiRevocationService) keep their own connections — we don't
// share, because mixing concerns on one connection makes failure modes
// hard to reason about.

@Module({
  imports: [DirectusModule, EmailModule],
  controllers: [TelegramPublicController, TelegramController],
  providers: [
    { provide: DB, useValue: db },
    {
      provide: TELEGRAM_REDIS,
      useFactory: (): Redis =>
        new Redis(env.REDIS_URL, {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        }),
    },
    TelegramService,
    OutboxPublisher,
    OutboxRelayService,
  ],
  // Export DB so consumers of OutboxPublisher (e.g. TelegramAdapter in
  // InteractionsModule) can also inject the same DB token for the tx
  // they pass to OutboxPublisher.publish.
  exports: [TelegramService, OutboxPublisher, DB],
})
export class TelegramModule {}
