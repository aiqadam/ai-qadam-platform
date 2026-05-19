import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { CHANNEL_ADAPTERS } from './channels/adapter.tokens';
import { EmailAdapter } from './channels/email-adapter';
import { CrmAdapter, InAppAdapter, TelegramAdapter } from './channels/stub-adapters';
import { ConsentService } from './consent.service';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

// CHANNEL_ADAPTERS is a multi-provider array. Add new adapters to the
// `useFactory` list; InteractionsService receives them via the token.

@Module({
  imports: [DirectusModule, EmailModule],
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
