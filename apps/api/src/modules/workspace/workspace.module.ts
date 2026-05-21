import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { AnnounceController } from './announce.controller';
import { AnnounceService } from './announce.service';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

// F-S3.2 — workspace cabinet #1: member directory + cohort builder.
// F-S3.3 — workspace cabinet #2: announcement composer (cohort →
// dispatcher).
// Per ADR-0033 Part 3: operators NEVER touch Directus admin; every
// operator workflow lives in /workspace/<concern> cabinets that proxy
// Directus via our API with our auth + audit layered on.

@Module({
  imports: [DirectusModule, AuthModule, InteractionsModule],
  providers: [MembersService, CohortsService, AnnounceService],
  controllers: [MembersController, CohortsController, AnnounceController],
  exports: [MembersService, CohortsService, AnnounceService],
})
export class WorkspaceModule {}
