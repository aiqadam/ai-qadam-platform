import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuditModule } from '../audit/audit.module';
import { DirectusModule } from '../directus/directus.module';
import { RbacSyncController } from './rbac-sync.controller';
import { RbacSyncService } from './rbac-sync.service';
import { RbacWebhookGuard } from './rbac-webhook.guard';

// F-S2.2 RBAC sync. v1 (this module) ships the webhook intake + the
// dry-run compute path. Apply-side engines (Directus + Plausible) land
// in F-S2.2-d/e via the BullMQ worker (F-S2.2-c).

@Module({
  imports: [AuthentikModule, AuditModule, DirectusModule],
  providers: [RbacSyncService, RbacWebhookGuard],
  controllers: [RbacSyncController],
  exports: [RbacSyncService],
})
export class RbacSyncModule {}
