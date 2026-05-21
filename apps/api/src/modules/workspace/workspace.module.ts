import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

// F-S3.2 — workspace cabinet #1: member directory + cohort builder.
// Per ADR-0033 Part 3: operators NEVER touch Directus admin; every
// operator workflow lives in /workspace/<concern> cabinets that proxy
// Directus via our API with our auth + audit layered on.

@Module({
  imports: [DirectusModule, AuthModule],
  providers: [MembersService, CohortsService],
  controllers: [MembersController, CohortsController],
  exports: [MembersService, CohortsService],
})
export class WorkspaceModule {}
