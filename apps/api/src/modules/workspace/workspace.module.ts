import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { AnnounceController } from './announce.controller';
import { AnnounceService } from './announce.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { EventBroadcastService } from './event-broadcast.service';
import { EventRemindersController } from './event-reminders.controller';
import { EventRemindersService } from './event-reminders.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

// F-S3.2 — workspace cabinet #1: member directory + cohort builder.
// F-S3.3 — workspace cabinet #2: announcement composer (cohort →
// dispatcher).
// F-S3.4 — workspace cabinet #3: event control panel (event metadata +
// registration counts + followup checklist).
// F-S3.7 — workspace cabinet #4: operator approval queue (empty shell
// v1; sources plug in as F-S3.5 / F-S4.x / dispatcher-flag land).
// F-S1.1a — EventBroadcastService dispatches event_announce on the
// draft → published transition (idempotent via event_announcements).
// F-S1.4 — EventRemindersService cron entry at
// POST /v1/internal/event-reminders/tick (InternalAuthGuard) dispatches
// T-2 and T-3h reminders to registered attendees. Idempotent via
// event_announcements kind=reminder_t_minus_2/_3h.
// Per ADR-0033 Part 3: operators NEVER touch Directus admin; every
// operator workflow lives in /workspace/<concern> cabinets that proxy
// Directus via our API with our auth + audit layered on.

@Module({
  imports: [DirectusModule, AuthModule, InteractionsModule],
  providers: [
    MembersService,
    CohortsService,
    AnnounceService,
    EventsService,
    ApprovalsService,
    EventBroadcastService,
    EventRemindersService,
    InternalAuthGuard,
  ],
  controllers: [
    MembersController,
    CohortsController,
    AnnounceController,
    EventsController,
    ApprovalsController,
    EventRemindersController,
  ],
  exports: [
    MembersService,
    CohortsService,
    AnnounceService,
    EventsService,
    ApprovalsService,
    EventBroadcastService,
    EventRemindersService,
  ],
})
export class WorkspaceModule {}
