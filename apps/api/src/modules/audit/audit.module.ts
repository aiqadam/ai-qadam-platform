import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { AdminAuditController, MeAccessLogController } from './audit-events.controller';
import { AuditEventsService } from './audit-events.service';

// F-S2.5 audit log. Service emit() landed in PR-b; list endpoints
// (F-S2.5-c) ship here. AuthModule + AuthentikModule needed for the
// SuperAdminGuard chain on /v1/admin/audit/events.

@Module({
  imports: [DirectusModule, AuthModule, AuthentikModule],
  providers: [AuditEventsService, SuperAdminGuard],
  controllers: [AdminAuditController, MeAccessLogController],
  exports: [AuditEventsService],
})
export class AuditModule {}
