import { Module } from '@nestjs/common';
import './modules/tenants/tenant.types';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { EventsModule } from './modules/events/events.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [TenantsModule, UsersModule, AuthModule, EventsModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
