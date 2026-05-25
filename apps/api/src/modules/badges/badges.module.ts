import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { BadgeAwarderService } from './badge-awarder.service';
import { BadgesController } from './badges.controller';

@Module({
  imports: [AuthModule, DirectusModule],
  controllers: [BadgesController],
  providers: [BadgeAwarderService],
  exports: [BadgeAwarderService],
})
export class BadgesModule {}
