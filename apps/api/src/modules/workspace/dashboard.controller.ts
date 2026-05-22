import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { type CountryCode, type CountryMetrics, DashboardService } from './dashboard.service';

// F-S2.4 — operator dashboard endpoints.
//   GET /v1/workspace/dashboard/country?c=uz&days=30  — single-country
//   GET /v1/workspace/dashboard/cross-country?days=30 — all 4 countries
// Both require AuthGuard (any signed-in operator). Per-role country
// scoping is enforced at the cabinet route layer once F-S2.2 write
// flag flips; until then, the API is read-only on country-scoped data
// so over-fetching has no privilege impact.

const VALID_COUNTRIES = new Set<CountryCode>(['uz', 'kz', 'tj', 'xx']);

@Controller('v1/workspace/dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('country')
  async country(@Query('c') c?: string, @Query('days') daysRaw?: string): Promise<CountryMetrics> {
    if (!c || !VALID_COUNTRIES.has(c as CountryCode)) {
      throw new BadRequestException('country_invalid');
    }
    const days = clampDays(daysRaw);
    return this.dashboard.countryMetrics(c as CountryCode, days);
  }

  @Get('cross-country')
  async crossCountry(@Query('days') daysRaw?: string): Promise<{ metrics: CountryMetrics[] }> {
    const days = clampDays(daysRaw);
    const metrics = await this.dashboard.crossCountryMetrics(days);
    return { metrics };
  }
}

function clampDays(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.max(n, 1), 365);
}
