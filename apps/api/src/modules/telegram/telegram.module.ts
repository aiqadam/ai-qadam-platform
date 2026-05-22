import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { TelegramController, TelegramPublicController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [DirectusModule, EmailModule],
  controllers: [TelegramPublicController, TelegramController],
  providers: [{ provide: DB, useValue: db }, TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
