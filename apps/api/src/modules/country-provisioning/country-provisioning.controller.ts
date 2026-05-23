import { Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CountryProvisioningService, type ProvisioningState } from './country-provisioning.service';

// F-S4.1 — country provisioning admin endpoints.
//
// POST /v1/admin/countries/:code/provisioning/run
//   Triggers (or resumes) the state machine. Returns the persisted
//   state. Idempotent — safe to re-call.
//
// GET /v1/admin/countries/:code/provisioning
//   Read-only view of the state JSON. Returns 200 + null when the
//   country has never been provisioned (legacy / pre-wizard).

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
  async get(@Param('code') code: string): Promise<{ state: ProvisioningState | null }> {
    return { state: await this.provisioning.getState(code) };
  }
}
