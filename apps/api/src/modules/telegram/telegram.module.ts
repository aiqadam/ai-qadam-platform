import { Module, forwardRef } from '@nestjs/common';
import Redis from 'ioredis';
import { env } from '../../config/env';
import { DB, db } from '../../db';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { HeartbeatReaderService } from './heartbeat-reader.service';
import { OutboxPublisher } from './outbox-publisher.service';
import { OutboxRelayService } from './outbox-relay.service';
import { TelegramAdminController } from './telegram-admin.controller';
import { TelegramAdminService } from './telegram-admin.service';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { TelegramCheckinService } from './telegram-checkin.service';
import { TelegramEventsService } from './telegram-events.service';
import { TelegramMeService } from './telegram-me.service';
import { TelegramProfileDefaultsService } from './telegram-profile-defaults.service';
import { TelegramRegistrationSchemaService } from './telegram-registration-schema.service';
import { TelegramRegistrationsService } from './telegram-registrations.service';
import { TelegramController, TelegramPublicController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TELEGRAM_REDIS } from './telegram.tokens';
import { TG_GET_ME, TgConfigService, realGetMe } from './tg-config.service';

// Owns the lifecycle of ONE Redis connection for telegram-side traffic
// (outbox relay publishing to Streams). Other modules with Redis needs
// (e.g. JtiRevocationService) keep their own connections — we don't
// share, because mixing concerns on one connection makes failure modes
// hard to reason about.
//
// ─── Circular-dep gotcha (regression from the first R2 PR-1 attempt) ────────
//
// Importing AuthModule directly here creates an unresolvable cycle:
//
//   AuthModule → LeadsModule → InteractionsModule → TelegramModule → AuthModule
//
// AuthModule needs LeadsModule for the lead-to-member upgrade in the
// OIDC callback; LeadsModule needs InteractionsModule to dispatch the
// welcome email; InteractionsModule needs TelegramModule for the
// channel adapter; and TelegramModule (this file) needs AuthModule
// for AuthGuard on the admin surface.
//
// The first attempt (PR #187, reverted via #202) imported AuthModule
// without forwardRef and crashed the API at boot with
// "UndefinedModuleException: The module at index [0] of the
// TelegramModule 'imports' array is undefined."
//
// `forwardRef` defers AuthModule resolution until Nest has finished
// the first pass over the module graph, which breaks the cycle.
// AuthModule on the other side does NOT need a matching forwardRef
// because it imports LeadsModule, not TelegramModule.
//
// The cleaner long-term fix is to extract AuthGuard + JwtService +
// JtiRevocationService into a smaller `AuthCoreModule` that has zero
// LeadsModule deps. That's a follow-up refactor; forwardRef is the
// surgical fix for unblocking R2.

@Module({
  // AuthentikModule provides SuperAdminGuard (live Authentik group
  // check) — the admin controller composes AuthGuard + SuperAdminGuard.
  // AuthModule is wrapped in forwardRef per the comment above.
  imports: [forwardRef(() => AuthModule), AuthentikModule, DirectusModule, EmailModule],
  controllers: [TelegramPublicController, TelegramController, TelegramAdminController],
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
    // Telegram getMe is swappable in tests. Production uses the real
    // HTTP call to api.telegram.org; specs inject a fake via the same
    // token.
    { provide: TG_GET_ME, useValue: realGetMe },
    TelegramService,
    TelegramEventsService,
    TelegramRegistrationSchemaService,
    TelegramRegistrationsService,
    TelegramMeService,
    TelegramProfileDefaultsService,
    TelegramCheckinService,
    TgConfigService,
    HeartbeatReaderService,
    TelegramAdminService,
    OutboxPublisher,
    OutboxRelayService,
    // R2 PR-3 — Nest needs the guard in providers so DI can inject
    // TgConfigService. Pre-PR-3 the guard had no constructor deps and
    // was instantiated by class-reference at @UseGuards sites.
    TelegramAuthGuard,
  ],
  // Export DB so consumers of OutboxPublisher (e.g. TelegramAdapter in
  // InteractionsModule) can also inject the same DB token for the tx
  // they pass to OutboxPublisher.publish.
  exports: [TelegramService, TgConfigService, OutboxPublisher, DB],
})
export class TelegramModule {}
