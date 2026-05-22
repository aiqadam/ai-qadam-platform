import { Module } from '@nestjs/common';
import { AuthentikClient } from './authentik.client';

// Standalone module so other features (admin-invites controller in
// PR-3, future RBAC sync in F-S2.2) can import it without pulling the
// rest of admin-invites in.

@Module({
  providers: [AuthentikClient],
  exports: [AuthentikClient],
})
export class AuthentikModule {}
