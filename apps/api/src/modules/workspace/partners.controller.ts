import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { type PartnerDetail, type PartnerSummary, PartnersService } from './partners.service';

// F-S3.5 (ADR-0033 cabinet #4) — sponsor cabinet endpoints. Any
// signed-in operator can read for v1; per-partner sponsor_rep scoping
// rides on F-S2.2 RBAC sync flag flip + sponsor_rep group binding.

@Controller('v1/workspace/partners')
@UseGuards(AuthGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  async list(): Promise<{ partners: PartnerSummary[] }> {
    const partners = await this.partners.listSponsors();
    return { partners };
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string): Promise<PartnerDetail> {
    return this.partners.getPartner(slug);
  }
}
