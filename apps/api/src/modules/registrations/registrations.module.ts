import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { EventsModule } from '../events/events.module';
import { PointsModule } from '../points/points.module';
import { UsersModule } from '../users/users.module';
import { CheckinController } from './checkin.controller';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [AuthModule, EventsModule, EmailModule, UsersModule, PointsModule],
  providers: [{ provide: DB, useValue: db }, RegistrationsService],
  controllers: [RegistrationsController, CheckinController],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
