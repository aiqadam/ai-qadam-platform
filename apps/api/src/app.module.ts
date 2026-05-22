import { Module } from '@nestjs/common';
import './modules/tenants/tenant.types';
import { HealthController } from './health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { EulaModule } from './modules/eula/eula.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { InternalModule } from './modules/internal/internal.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MeProfileModule } from './modules/me-profile/me-profile.module';
import { PointsModule } from './modules/points/points.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

@Module({
  imports: [
    TenantsModule,
    UsersModule,
    AuthModule,
    EulaModule,
    RegistrationsModule,
    PointsModule,
    InternalModule,
    InteractionsModule,
    PreferencesModule,
    TelegramModule,
    WorkspaceModule,
    LeadsModule,
    MeProfileModule,
    ReferralsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
