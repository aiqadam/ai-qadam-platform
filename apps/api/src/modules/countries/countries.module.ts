import { Module } from '@nestjs/common';
import { AuthentikModule } from '../admin-invites/authentik.module';
import { AuthModule } from '../auth/auth.module';
import { DirectusModule } from '../directus/directus.module';
import { AdminCountriesController, CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';

// F-S4.5 — country profile module.
//
// GET /v1/workspace/countries           — list (any signed-in operator)
// GET /v1/workspace/countries/:code     — single country profile
// PATCH /v1/admin/countries/:code       — super-admin only
//
// AuthentikModule exports SuperAdminGuard (per R2 PR-1 refactor — the
// guard lives there so any module can re-use it without importing
// AdminInvitesModule).

@Module({
  imports: [DirectusModule, AuthModule, AuthentikModule],
  providers: [CountriesService],
  controllers: [CountriesController, AdminCountriesController],
  exports: [CountriesService],
})
export class CountriesModule {}
