import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import './modules/tenants/tenant.types';
import { HealthController } from './health/health.controller';
import { ObserveThrottlerGuard } from './lib/observe-throttler.guard';
import { AdminInvitesModule } from './modules/admin-invites/admin-invites.module';
import { AuthModule } from './modules/auth/auth.module';
import { CountriesModule } from './modules/countries/countries.module';
import { CountryProvisioningModule } from './modules/country-provisioning/country-provisioning.module';
import { EulaModule } from './modules/eula/eula.module';
import { EventQuestionsModule } from './modules/event-questions/event-questions.module';
import { InteractionsModule } from './modules/interactions/interactions.module';
import { InternalCronModule } from './modules/internal-cron/internal-cron.module';
import { InternalModule } from './modules/internal/internal.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MeProfileModule } from './modules/me-profile/me-profile.module';
import { PointsModule } from './modules/points/points.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { RbacSyncModule } from './modules/rbac-sync/rbac-sync.module';
import { ReferralsModule } from './modules/referrals/referrals.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { WorkspaceModule } from './modules/workspace/workspace.module';

// Hardening C1 — default global rate-limit window. ttl is milliseconds
// (throttler v6). Per-route overrides arrive in phase 2 via @Throttle.
const RATE_LIMIT_TTL_MS = 60_000;
const RATE_LIMIT_MAX = 60;

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: RATE_LIMIT_TTL_MS, limit: RATE_LIMIT_MAX }]),
    InternalCronModule,
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
    AdminInvitesModule,
    RbacSyncModule,
    CountriesModule,
    CountryProvisioningModule,
    EventQuestionsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ObserveThrottlerGuard }],
})
export class AppModule {}
