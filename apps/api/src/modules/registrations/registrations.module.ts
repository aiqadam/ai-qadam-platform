import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { EventsModule } from '../events/events.module';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [AuthModule, EventsModule, EmailModule],
  providers: [{ provide: DB, useValue: db }, RegistrationsService],
  controllers: [RegistrationsController],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
