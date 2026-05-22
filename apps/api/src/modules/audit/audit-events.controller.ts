import { Controller, Get, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import {
  type AuditEventSummary,
  AuditEventsService,
  type AuditSeverity,
} from './audit-events.service';

// F-S2.5-c — split endpoints:
//   GET /v1/admin/audit/events     — super-admin, full payload + actor
//   GET /v1/me/access-log          — member, own events only, redacted

const VALID_SEVERITIES = new Set<AuditSeverity>(['info', 'high', 'critical']);
const VALID_COUNTRIES = new Set(['uz', 'kz', 'tj', 'xx']);

@Controller('v1/admin/audit')
@UseGuards(AuthGuard, SuperAdminGuard)
export class AdminAuditController {
  constructor(private readonly audit: AuditEventsService) {}

  @Get('events')
  async list(
    @Query('severity') severity?: string,
    @Query('event_prefix') eventPrefix?: string,
    @Query('country') country?: string,
    @Query('limit') limit?: string,
  ): Promise<{ events: AuditEventSummary[] }> {
    const sev =
      severity && VALID_SEVERITIES.has(severity as AuditSeverity)
        ? (severity as AuditSeverity)
        : undefined;
    const cc =
      country && VALID_COUNTRIES.has(country) ? (country as 'uz' | 'kz' | 'tj' | 'xx') : undefined;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const events = await this.audit.list({
      ...(sev ? { severity: sev } : {}),
      ...(eventPrefix ? { eventPrefix } : {}),
      ...(cc ? { country: cc } : {}),
      ...(parsedLimit && Number.isFinite(parsedLimit) ? { limit: parsedLimit } : {}),
    });
    return { events };
  }
}

@Controller('v1/me/access-log')
@UseGuards(AuthGuard)
export class MeAccessLogController {
  constructor(private readonly audit: AuditEventsService) {}

  @Get()
  async list(@Req() req: Request): Promise<{
    events: Awaited<ReturnType<AuditEventsService['listForMe']>>;
  }> {
    if (!req.user) throw new UnauthorizedException('no claims attached');
    const events = await this.audit.listForMe(req.user.sub, 50);
    return { events };
  }
}
