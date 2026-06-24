import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthModule } from '../auth/auth.module';
import { BadgesModule } from '../badges/badges.module';
import { DirectusModule } from '../directus/directus.module';
import { EulaModule } from '../eula/eula.module';
import { CheckinEventsController } from './checkin-events.controller';
import { CheckinController } from './checkin.controller';
import { RegistrationCheckinController } from './registration-checkin.controller';
import { RegistrationsDirectusService } from './registrations-directus.service';
import { RegistrationsController } from './registrations.controller';

// Sprint 4.5/2: registrations + check-in now backed by Directus
// (RegistrationsDirectusService). The Drizzle-backed RegistrationsService
// + its supporting service modules (EventsModule, EmailModule, PointsModule,
// UsersModule) were retired here — capacity/promotion/checkin/email all
// happen as Directus flows now.
// FR-MIG-021: added RegistrationCheckinController with event validation.

@Module({
  imports: [AuthModule, DirectusModule, EulaModule, BadgesModule],
  providers: [{ provide: DB, useValue: db }, RegistrationsDirectusService],
  controllers: [
    RegistrationsController,
    CheckinController,
    RegistrationCheckinController,
    CheckinEventsController,
  ],
})
export class RegistrationsModule {}
