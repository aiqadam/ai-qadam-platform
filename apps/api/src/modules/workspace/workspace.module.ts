import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { InteractionsModule } from '../interactions/interactions.module';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { TelegramModule } from '../telegram/telegram.module';
import { AnnounceController } from './announce.controller';
import { AnnounceService } from './announce.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { CohortsController } from './cohorts.controller';
import { CohortsService } from './cohorts.service';
import { CsatOperatorController, CsatPublicController } from './csat.controller';
import { CsatService } from './csat.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { EventBroadcastService } from './event-broadcast.service';
import { EventMatchesPostRegController } from './event-matches-post-reg.controller';
import { EventMatchesPostRegService } from './event-matches-post-reg.service';
import { EventMatchesController } from './event-matches.controller';
import { EventMatchesService } from './event-matches.service';
import { EventRemindersController } from './event-reminders.controller';
import { EventRemindersService } from './event-reminders.service';
import { EventSpeakerBriefsController } from './event-speaker-briefs.controller';
import { EventSpeakerBriefsService } from './event-speaker-briefs.service';
import { EventSpeakersController } from './event-speakers.controller';
import { EventSpeakersService } from './event-speakers.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { WorkspaceFormsController } from './forms.controller';
import { WorkspaceFormsService } from './forms.service';
import { InternalCronStatusController } from './internal-cron-status.controller';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
import { PostEventCronController } from './post-event-cron.controller';
import { PostEventCronService } from './post-event-cron.service';
import { SponsorDigestsController } from './sponsor-digests.controller';
import { SponsorDigestsService } from './sponsor-digests.service';
import { TgBroadcastsAnalyticsService } from './tg-broadcasts-analytics.service';
import { TgBroadcastsCronController } from './tg-broadcasts-cron.controller';
import { TgBroadcastsSenderService } from './tg-broadcasts-sender.service';
import { TgBroadcastsController } from './tg-broadcasts.controller';
import { TgBroadcastsService } from './tg-broadcasts.service';
import { TgSegmentsController } from './tg-segments.controller';
import { TgSegmentsService } from './tg-segments.service';

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
// F-S1.2 + F-S1.3 — CsatService anonymous response capture
// (POST /v1/feedback/csat, token-gated public) + operator surface
// (GET /v1/workspace/events/:id/csat). Response rows have no user_id;
// per-delivery responded_at handles idempotency.
// F-S1.5 — EventMatchesService cron entry at
// POST /v1/internal/event-matches/tick (InternalAuthGuard) dispatches
// "3 people you might want to meet" to opted-in attendees of events in
// T-7 window. Idempotent via event_announcements kind=member_match_t_minus_7.
// F-S1.1b — EventSpeakersService CRUD on event_speakers. Status flip to
// 'confirmed' fires speaker_added broadcast (idempotent per
// (event, kind='speaker_added', speaker) via the new event_announcements.speaker FK).
// F-S1.1c — PostEventCronService cron entry at
// POST /v1/internal/post-event/tick (InternalAuthGuard) dispatches
// speaker_thanks_with_referral_ask to confirmed speakers + next_event_teaser
// to attendees. Idempotent via events.post_event_processed.
// F-S1.4b — EventSpeakerBriefsService cron entry at
// POST /v1/internal/event-speaker-briefs/tick (InternalAuthGuard)
// dispatches one personal speaker_brief per (event, confirmed speaker)
// in the T-7 window. Idempotent via event_announcements with kind=
// reminder_t_minus_7_speaker + speaker FK (per-(event, speaker) tuple).
// F-S1.5b — EventMatchesPostRegService cron entry at
// POST /v1/internal/event-matches-post-reg/tick (InternalAuthGuard)
// dispatches T+3 post-registration member_match per opted-in registration
// when event is still > 7d out. Mutually exclusive with F-S1.5 T-7 per
// (user, event) via shared member_match_dispatches ledger.
// Per ADR-0033 Part 3: operators NEVER touch Directus admin; every
// operator workflow lives in /workspace/<concern> cabinets that proxy
// Directus via our API with our auth + audit layered on.

@Module({
  imports: [AuthentikModule, DirectusModule, AuthModule, InteractionsModule, TelegramModule],
  providers: [
    MembersService,
    CohortsService,
    AnnounceService,
    EventsService,
    ApprovalsService,
    EventBroadcastService,
    EventRemindersService,
    CsatService,
    EventMatchesService,
    EventSpeakersService,
    PostEventCronService,
    EventSpeakerBriefsService,
    EventMatchesPostRegService,
    DashboardService,
    PartnersService,
    SponsorDigestsService,
    TgBroadcastsService,
    TgSegmentsService,
    TgBroadcastsSenderService,
    TgBroadcastsAnalyticsService,
    WorkspaceFormsService,
    InternalAuthGuard,
  ],
  controllers: [
    MembersController,
    CohortsController,
    AnnounceController,
    EventsController,
    ApprovalsController,
    EventRemindersController,
    CsatPublicController,
    CsatOperatorController,
    EventMatchesController,
    EventSpeakersController,
    PostEventCronController,
    EventSpeakerBriefsController,
    EventMatchesPostRegController,
    DashboardController,
    PartnersController,
    SponsorDigestsController,
    TgBroadcastsController,
    TgSegmentsController,
    InternalCronStatusController,
    TgBroadcastsCronController,
    WorkspaceFormsController,
  ],
  exports: [
    MembersService,
    CohortsService,
    AnnounceService,
    EventsService,
    ApprovalsService,
    EventBroadcastService,
    EventRemindersService,
    CsatService,
    EventMatchesService,
    EventSpeakersService,
    PostEventCronService,
    EventSpeakerBriefsService,
    EventMatchesPostRegService,
  ],
})
export class WorkspaceModule {}
