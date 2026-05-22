import { Module } from '@nestjs/common';
import { AuthentikClient } from './authentik.client';
import { SuperAdminGuard } from './super-admin.guard';

// Standalone module so other features (admin-invites controller in
// PR-3, future RBAC sync in F-S2.2, the Telegram R2 admin surface)
// can import it without pulling the rest of admin-invites in.
//
// Exports both AuthentikClient (for callers that need raw API access)
// and SuperAdminGuard (the canonical super-admin gate that uses live
// Authentik group membership per ADR-0035 §"No role caching in JWT").
// Any new controller protecting /v1/admin/* or equivalent should import
// this module and apply @UseGuards(AuthGuard, SuperAdminGuard).

@Module({
  providers: [AuthentikClient, SuperAdminGuard],
  exports: [AuthentikClient, SuperAdminGuard],
})
export class AuthentikModule {}
