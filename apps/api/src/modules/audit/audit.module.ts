import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { AuditEventsService } from './audit-events.service';

// F-S2.5-b. Standalone module so RBAC sync (F-S2.2) and admin-invites
// can import AuditEventsService independently without pulling each
// other in.

@Module({
  imports: [DirectusModule],
  providers: [AuditEventsService],
  exports: [AuditEventsService],
})
export class AuditModule {}
