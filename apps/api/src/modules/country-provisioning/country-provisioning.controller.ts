import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CountryProvisioningService, type ProvisioningState } from './country-provisioning.service';

// F-S4.1 + F-S4.2 — country provisioning admin endpoints.
//
// POST /v1/admin/countries/:code/provisioning/run
//   Triggers (or resumes) the state machine. Returns the persisted
//   state. Idempotent — safe to re-call.
//
// GET /v1/admin/countries/:code/provisioning
//   Read-only view of the state JSON + is_active flag. Returns 200
//   + null state when the country has never been provisioned.
//
// POST /v1/admin/countries/:code/activate
//   Go-live gate. Flips countries.is_active=true ONLY after every
//   provisioning step has succeeded. Refuses with 400 otherwise.
//   Idempotent.

@Controller('v1/admin/countries')
@UseGuards(AuthGuard, SuperAdminGuard)
export class CountryProvisioningController {
  constructor(private readonly provisioning: CountryProvisioningService) {}

  @Post(':code/provisioning/run')
  @HttpCode(HttpStatus.OK)
  async run(@Param('code') code: string): Promise<ProvisioningState> {
    return this.provisioning.run(code);
  }

  @Get(':code/provisioning')
  async get(
    @Param('code') code: string,
  ): Promise<{ state: ProvisioningState | null; is_active: boolean }> {
    return this.provisioning.getStateWithActive(code);
  }

  @Post(':code/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('code') code: string,
  ): Promise<{ state: ProvisioningState; is_active: boolean }> {
    return this.provisioning.activate(code);
  }
}
