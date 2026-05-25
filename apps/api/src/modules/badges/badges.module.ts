import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { BadgeAwarderService } from './badge-awarder.service';
import { BadgesInternalController } from './badges-internal.controller';
import { BadgesController } from './badges.controller';

@Module({
  imports: [AuthModule, DirectusModule, EmailModule],
  controllers: [BadgesController, BadgesInternalController],
  providers: [BadgeAwarderService],
  exports: [BadgeAwarderService],
})
export class BadgesModule {}
