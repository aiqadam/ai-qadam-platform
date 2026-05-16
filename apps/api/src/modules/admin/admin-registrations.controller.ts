import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RegistrationsService } from '../registrations/registrations.service';

interface AdminRegistrationResponse {
  id: string;
  status: 'registered' | 'waitlisted' | 'cancelled' | 'attended';
  createdAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    handle: string | null;
  };
}

@Controller('v1/admin/events')
@UseGuards(AuthGuard, AdminGuard)
@Roles('country_admin', 'super_admin')
export class AdminRegistrationsController {
  constructor(private readonly registrations: RegistrationsService) {}

  @Get(':eventId/registrations')
  async listForEvent(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Req() req: Request,
  ): Promise<{ eventId: string; registrations: AdminRegistrationResponse[] }> {
    const tenant = req.tenant;
    if (!tenant) throw new NotFoundException('tenant not resolved');
    const rows = await this.registrations.listForEventAdmin({
      eventId,
      countryCode: tenant.code,
    });
    if (rows === null) throw new NotFoundException(`event ${eventId} not found`);
    return {
      eventId,
      registrations: rows.map((r) => ({
        id: r.registration.id,
        status: r.registration.status,
        createdAt: r.registration.createdAt.toISOString(),
        checkedInAt: r.registration.checkedInAt?.toISOString() ?? null,
        cancelledAt: r.registration.cancelledAt?.toISOString() ?? null,
        user: r.user,
      })),
    };
  }
}
