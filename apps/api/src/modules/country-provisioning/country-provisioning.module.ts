import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { CountryProvisioningController } from './country-provisioning.controller';
import { CountryProvisioningService } from './country-provisioning.service';

// F-S4.1 — country provisioning state machine.
//
// AuthentikModule exports SuperAdminGuard (R2 PR-1 refactor — guard
// lives there so any module can reuse it without importing
// AdminInvitesModule).

@Module({
  imports: [DirectusModule, AuthModule, AuthentikModule],
  providers: [CountryProvisioningService],
  controllers: [CountryProvisioningController],
  exports: [CountryProvisioningService],
})
export class CountryProvisioningModule {}
