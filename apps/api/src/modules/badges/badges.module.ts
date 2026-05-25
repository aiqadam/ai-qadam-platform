import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { BadgeAwarderService } from './badge-awarder.service';

@Module({
  imports: [DirectusModule],
  providers: [BadgeAwarderService],
  exports: [BadgeAwarderService],
})
export class BadgesModule {}
