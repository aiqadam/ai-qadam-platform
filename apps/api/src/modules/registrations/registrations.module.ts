import { Module, forwardRef } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthModule } from '../auth/auth.module';
import { BadgesModule } from '../badges/badges.module';
import { DirectusModule } from '../directus/directus.module';
import { EulaModule } from '../eula/eula.module';
import { CheckinEventsController } from './checkin-events.controller';
import { CheckinController } from './checkin.controller';
import { EventRegistrationCountController } from './event-registration-count.controller';
import { RegistrationCheckinController } from './registration-checkin.controller';
import { RegistrationsDirectusService } from './registrations-directus.service';
import { RegistrationsController } from './registrations.controller';

// Sprint 4.5/2: registrations + check-in now backed by Directus
// (RegistrationsDirectusService). The Drizzle-backed RegistrationsService
// + its supporting service modules (EventsModule, EmailModule, PointsModule,
// UsersModule) were retired here — capacity/promotion/checkin/email all
// happen as Directus flows now.
// FR-MIG-021: added RegistrationCheckinController with event validation.
//
// FEAT-BOT-2 (FR-BOT-002 PR 2/6): AuthModule now also imports THIS module
// (to reuse RegistrationsDirectusService for the bot's /register, /cancel
// internal routes) — see auth.module.ts's own comment. This module's own
// import of AuthModule (below, for AuthGuard) turned out to ALSO need
// forwardRef, not just AuthModule's new edge: the live boot trace showed
// Nest's scanner reaching AuthModule via a second pre-existing path
// (AuthModule -> LeadsModule -> InteractionsModule -> TelegramModule ->
// AuthModule, the exact cycle already documented in telegram.module.ts)
// before it reaches this module's forwardRef-wrapped import of
// RegistrationsModule — so BOTH edges of the new AuthModule <->
// RegistrationsModule cycle need forwardRef, not just one side. Confirmed
// via `pnpm --filter api dev` boot trace (UndefinedModuleException at
// RegistrationsModule imports[0]) before this fix; typecheck alone did not
// catch it, since Nest's module graph is resolved at runtime, not by tsc.
@Module({
  imports: [forwardRef(() => AuthModule), DirectusModule, EulaModule, BadgesModule],
  providers: [{ provide: DB, useValue: db }, RegistrationsDirectusService],
  controllers: [
    RegistrationsController,
    CheckinController,
    RegistrationCheckinController,
    CheckinEventsController,
    EventRegistrationCountController,
  ],
  // Exported so AuthModule's TelegramAuthService can inject it directly
  // (FR-BOT-002 PR 2/6) — previously nothing outside this module needed
  // RegistrationsDirectusService, so it was never exported.
  exports: [RegistrationsDirectusService],
})
export class RegistrationsModule {}
