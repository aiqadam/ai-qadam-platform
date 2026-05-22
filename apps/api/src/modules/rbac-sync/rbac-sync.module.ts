import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuditModule } from '../audit/audit.module';
import { DirectusModule } from '../directus/directus.module';
import { DirectusPolicyApplier } from './directus-policy-applier';
import { RbacSyncController } from './rbac-sync.controller';
import { RbacSyncService } from './rbac-sync.service';
import { RbacWebhookGuard } from './rbac-webhook.guard';

// F-S2.2 RBAC sync. Webhook intake (F-S2.2-b) + per-engine apply
// (F-S2.2-c Directus, F-S2.2-d Plausible). Apply runs synchronously
// inside the webhook handler per the ADR-0021 §5 amendment 2026-05-22
// (BullMQ deferred until scale forces it).

@Module({
  imports: [AuthentikModule, AuditModule, DirectusModule],
  providers: [RbacSyncService, RbacWebhookGuard, DirectusPolicyApplier],
  controllers: [RbacSyncController],
  exports: [RbacSyncService],
})
export class RbacSyncModule {}
