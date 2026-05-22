import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  CountriesService,
  type CountryProfilePatch,
  type CountryRow,
  countryProfilePatchSchema,
} from './countries.service';

// F-S4.5 — country profile read + edit cabinet endpoint.
// GET requires AuthGuard only (operators all see profiles).
// PATCH requires SuperAdminGuard (tenant config edits).

@Controller('v1/workspace/countries')
@UseGuards(AuthGuard)
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  async list(): Promise<{ countries: CountryRow[] }> {
    return { countries: await this.countries.list() };
  }

  @Get(':code')
  async get(@Param('code') code: string): Promise<CountryRow> {
    return this.countries.get(code);
  }
}

@Controller('v1/admin/countries')
@UseGuards(AuthGuard, SuperAdminGuard)
export class AdminCountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Patch(':code')
  async patch(@Param('code') code: string, @Body() body: unknown): Promise<CountryRow> {
    const parsed = countryProfilePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((i) => i.message).join('; '));
    }
    return this.countries.patch(code, parsed.data as CountryProfilePatch);
  }
}
