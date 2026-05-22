import { Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { type ApprovalsResult, ApprovalsService } from './approvals.service';

// F-S3.7 — operator approval queue API.
// AuthGuard-gated. Country scoping waits on ADR-0021 RBAC (Sprint 2.2).

@Controller('v1/workspace/approvals')
@UseGuards(AuthGuard)
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Get()
  async list(@Req() req: Request): Promise<ApprovalsResult> {
    if (!req.user) throw new UnauthorizedException('not signed in');
    return this.approvals.list();
  }
}
