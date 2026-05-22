import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { AdminInvitesController } from './admin-invites.controller';
import { AdminInvitesService } from './admin-invites.service';
import { AuthentikModule } from './authentik.module';
import { SuperAdminGuard } from './super-admin.guard';

// F-S2.7 (ADR-0035). Admin surface for operator invites. Public
// /v1/onboard/* endpoints land in OnboardingModule (PR-4) — kept
// separate so the auth posture (gated vs public) is visible at module
// granularity.

@Module({
  imports: [DirectusModule, AuthModule, AuthentikModule],
  providers: [AdminInvitesService, SuperAdminGuard],
  controllers: [AdminInvitesController],
  exports: [AdminInvitesService],
})
export class AdminInvitesModule {}
