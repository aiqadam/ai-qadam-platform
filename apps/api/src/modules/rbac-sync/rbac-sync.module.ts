import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuditModule } from '../audit/audit.module';
import { DirectusModule } from '../directus/directus.module';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { DirectusPolicyApplier } from './directus-policy-applier';
import { RbacSyncController } from './rbac-sync.controller';
import { RbacSyncService } from './rbac-sync.service';
import { RbacWebhookGuard } from './rbac-webhook.guard';

// F-S2.2 RBAC sync. Webhook intake (F-S2.2-b) + Directus apply
// (F-S2.2-c), Plausible deferred (F-S2.2-d), nightly poll (F-S2.2-f).
// Apply runs synchronously per the ADR-0021 §5 amendment 2026-05-22.

@Module({
  imports: [AuthentikModule, AuditModule, DirectusModule],
  providers: [RbacSyncService, RbacWebhookGuard, DirectusPolicyApplier, InternalAuthGuard],
  controllers: [RbacSyncController],
  exports: [RbacSyncService],
})
export class RbacSyncModule {}
