import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { AdminInvitesController } from './admin-invites.controller';
import { AdminInvitesService } from './admin-invites.service';
import { AuthentikModule } from './authentik.module';
import { OnboardingController } from './onboarding.controller';
import { SuperAdminGuard } from './super-admin.guard';

// F-S2.7 (ADR-0035). Two controllers in one module:
//   - AdminInvitesController (super-admin gated) — /v1/admin/invites/*
//   - OnboardingController (public, token-as-credential) — /v1/onboard/*
// Both share AdminInvitesService so the state machine lives in one
// place. The auth posture is on the controller, not the module.

@Module({
  imports: [DirectusModule, AuthModule, AuthentikModule, AuditModule],
  providers: [AdminInvitesService, SuperAdminGuard],
  controllers: [AdminInvitesController, OnboardingController],
  exports: [AdminInvitesService],
})
export class AdminInvitesModule {}
