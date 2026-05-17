import { Module } from '@nestjs/common';
import './modules/tenants/tenant.types';
import { HealthController } from './health/health.controller';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { InternalModule } from './modules/internal/internal.module';
import { PointsModule } from './modules/points/points.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    TenantsModule,
    UsersModule,
    AuthModule,
    EventsModule,
    RegistrationsModule,
    PointsModule,
    AdminModule,
    InternalModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
