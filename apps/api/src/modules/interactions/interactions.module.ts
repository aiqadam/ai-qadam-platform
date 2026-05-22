import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CHANNEL_ADAPTERS } from './channels/adapter.tokens';
import { EmailAdapter } from './channels/email-adapter';
import { CrmAdapter, InAppAdapter } from './channels/stub-adapters';
import { TelegramAdapter } from './channels/telegram-adapter';
import { ConsentService } from './consent.service';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

// CHANNEL_ADAPTERS is a multi-provider array. Add new adapters to the
// `useFactory` list; InteractionsService receives them via the token.
//
// TelegramAdapter (A6) is real now — publishes to the outbox via
// OutboxPublisher, which the TelegramModule provides. Importing
// TelegramModule here doesn't create a cycle: TelegramModule itself
// only imports DirectusModule + EmailModule, never InteractionsModule.

@Module({
  imports: [DirectusModule, EmailModule, TelegramModule],
  providers: [
    InteractionsService,
    ConsentService,
    EmailAdapter,
    TelegramAdapter,
    InAppAdapter,
    CrmAdapter,
    {
      provide: CHANNEL_ADAPTERS,
      useFactory: (
        email: EmailAdapter,
        telegram: TelegramAdapter,
        inApp: InAppAdapter,
        crm: CrmAdapter,
      ) => [email, telegram, inApp, crm],
      inject: [EmailAdapter, TelegramAdapter, InAppAdapter, CrmAdapter],
    },
  ],
  controllers: [InteractionsController],
  exports: [InteractionsService],
})
export class InteractionsModule {}
