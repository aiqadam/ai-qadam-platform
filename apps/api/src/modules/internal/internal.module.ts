import { Module } from '@nestjs/common';
import { DirectusModule } from '../directus/directus.module';
import { EmailModule } from '../email/email.module';
import { InternalController } from './internal.controller';

// DirectusModule is imported so InternalController can inject
// DirectusUsersBridgeService and expose POST /v1/internal/users/ensure-linked
// (ISS-UAT-001-1). DirectusUsersBridgeService is already exported from
// DirectusModule (see directus.module.ts).
@Module({
  imports: [EmailModule, DirectusModule],
  controllers: [InternalController],
})
export class InternalModule {}
