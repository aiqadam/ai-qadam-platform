import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { AdminInvitesController } from './admin-invites.controller';
import { AdminInvitesService } from './admin-invites.service';
import { AuthentikModule } from './authentik.module';
import { OnboardingController } from './onboarding.controller';

// F-S2.7 (ADR-0035). Two controllers in one module:
//   - AdminInvitesController (super-admin gated) — /v1/admin/invites/*
//   - OnboardingController (public, token-as-credential) — /v1/onboard/*
// Both share AdminInvitesService so the state machine lives in one
// place. The auth posture is on the controller, not the module.
//
// SuperAdminGuard now lives in AuthentikModule (R2 PR-1) so it can be
// reused by Telegram + future admin surfaces without each importing
// AdminInvitesModule.
//
// F-S2.12 (2026-05-25) — dropped CloudflareRoutingClient, ResendAdminClient,
// OnboardingEmailRoutingService/Controller. Operators now get a DMS
// mailbox automatically via LDAP; the operator-driven CF/Resend
// forwarding flow is obsolete. See PR for full context.

@Module({
  imports: [DirectusModule, AuthModule, AuthentikModule, AuditModule],
  providers: [AdminInvitesService],
  controllers: [AdminInvitesController, OnboardingController],
  exports: [AdminInvitesService],
})
export class AdminInvitesModule {}
