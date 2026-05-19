import { Module } from '@nestjs/common';
import './modules/tenants/tenant.types';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { InternalModule } from './modules/internal/internal.module';
import { PointsModule } from './modules/points/points.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    TenantsModule,
    UsersModule,
    AuthModule,
    RegistrationsModule,
    PointsModule,
    InternalModule,
    InteractionsModule,
    PreferencesModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
