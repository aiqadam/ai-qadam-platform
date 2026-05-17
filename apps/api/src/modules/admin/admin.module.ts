import { Module } from '@nestjs/common';
import { DB, db } from '../../db';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { UsersModule } from '../users/users.module';
import { AdminEventsController } from './admin-events.controller';
import { AdminRegistrationsController } from './admin-registrations.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, UsersModule, EventsModule, RegistrationsModule],
  controllers: [
    AdminController,
    AdminEventsController,
    AdminRegistrationsController,
    AdminUsersController,
  ],
  providers: [{ provide: DB, useValue: db }, AdminService],
})
export class AdminModule {}
