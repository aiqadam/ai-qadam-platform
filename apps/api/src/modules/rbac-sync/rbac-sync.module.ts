import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { AdminRbacController } from './admin-rbac.controller';
import { DirectusPolicyApplier } from './directus-policy-applier';
import { RbacSyncController } from './rbac-sync.controller';
import { RbacSyncService } from './rbac-sync.service';
import { RbacWebhookGuard } from './rbac-webhook.guard';

// F-S2.2 RBAC sync. Webhook intake (F-S2.2-b) + Directus apply
// (F-S2.2-c), Plausible deferred (F-S2.2-d), nightly poll (F-S2.2-f),
// admin UI (F-S2.2-g). Apply runs synchronously per ADR-0021 §5
// amendment 2026-05-22.

@Module({
  imports: [AuthentikModule, AuditModule, DirectusModule, AuthModule],
  providers: [
    RbacSyncService,
    RbacWebhookGuard,
    DirectusPolicyApplier,
    InternalAuthGuard,
    SuperAdminGuard,
  ],
  controllers: [RbacSyncController, AdminRbacController],
  exports: [RbacSyncService],
})
export class RbacSyncModule {}
