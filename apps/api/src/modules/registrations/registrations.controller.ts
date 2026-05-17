import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import {
  RegistrationIneligibleError,
  RegistrationNotFoundError,
  RegistrationsDirectusService,
} from './registrations-directus.service';

// Sprint 4.5/2: every endpoint here is a thin proxy to Directus. Capacity
// enforcement, waitlist promotion, and confirmation / promotion emails
// happen as Directus flows — the API just orchestrates the REST calls.

type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

interface RegistrationResponse {
  id: string;
  eventId: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

interface MineResponse {
  registrations: Array<{
    id: string;
    status: Status;
    checkinCode: string;
    checkedInAt: string | null;
    event: {
      id: string;
      title: string;
      startsAt: string;
      endsAt: string;
      location: string | null;
    };
  }>;
}

@Controller('v1')
@UseGuards(AuthGuard)
export class RegistrationsController {
  constructor(private readonly registrations: RegistrationsDirectusService) {}

  @Post('events/:eventId/register')
  @HttpCode(HttpStatus.OK)
  async register(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Req() req: Request,
  ): Promise<RegistrationResponse> {
    const userId = requireUserId(req);
    const tenantCode = requireTenant(req);
    try {
      const row = await this.registrations.register({ userId, eventId, countryCode: tenantCode });
      return {
        id: row.id,
        eventId: row.eventId,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        cancelledAt: row.cancelledAt,
      };
    } catch (err) {
      if (err instanceof RegistrationNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof RegistrationIneligibleError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  @Delete('events/:eventId/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = requireUserId(req);
    const tenantCode = requireTenant(req);
    try {
      // Drives waitlist promotion + cancel/promotion emails via Directus
      // flows. We ignore the returned row — clients only need 204.
      await this.registrations.cancel({ userId, eventId, countryCode: tenantCode });
    } catch (err) {
      if (err instanceof RegistrationNotFoundError) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  @Get('registrations/mine')
  async mine(@Req() req: Request): Promise<MineResponse> {
    const userId = requireUserId(req);
    const tenantCode = requireTenant(req);
    const entries = await this.registrations.listMine({ userId, countryCode: tenantCode });
    return {
      registrations: entries.map((e) => ({
        id: e.registration.id,
        status: e.registration.status,
        checkinCode: e.registration.checkinCode,
        checkedInAt: e.registration.checkedInAt,
        event: e.event,
      })),
    };
  }
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}

function requireTenant(req: Request): string {
  if (!req.tenant) {
    throw new NotFoundException('tenant not resolved');
  }
  return req.tenant.code;
}
