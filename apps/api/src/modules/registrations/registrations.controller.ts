import {
  BadRequestException,
  Body,
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
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  RegistrationConsentRequiredError,
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
    @Body() body: unknown,
  ): Promise<RegistrationResponse> {
    const userId = requireUserId(req);
    const tenantCode = requireTenant(req);
    const acceptance = parseAcceptance(body, req);
    const attribution = parseAttribution(body);
    try {
      const row = await this.registrations.register({
        userId,
        eventId,
        countryCode: tenantCode,
        ...(acceptance ? { acceptance } : {}),
        ...(attribution.referredBy ? { referredBy: attribution.referredBy } : {}),
        ...(attribution.acquisitionSource
          ? { acquisitionSource: attribution.acquisitionSource }
          : {}),
      });
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
      if (err instanceof RegistrationConsentRequiredError) {
        throw new BadRequestException(err.message);
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

// Acceptance is optional on the request body. When present, also enrich
// it with IP + user agent from the request — these are part of the
// non-repudiation record we store on eula_acceptances.
const acceptanceSchema = z.object({
  acceptance: z
    .object({
      eulaId: z.string().uuid(),
      consentedIntents: z.array(z.string().min(1)).min(1),
    })
    .optional(),
});

function parseAcceptance(
  body: unknown,
  req: Request,
):
  | {
      eulaId: string;
      consentedIntents: string[];
      ipAddress: string | null;
      userAgent: string | null;
    }
  | undefined {
  if (body == null) return undefined;
  const parsed = acceptanceSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  if (!parsed.data.acceptance) return undefined;
  return {
    eulaId: parsed.data.acceptance.eulaId,
    consentedIntents: parsed.data.acceptance.consentedIntents,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

function requireTenant(req: Request): string {
  if (!req.tenant) {
    throw new NotFoundException('tenant not resolved');
  }
  return req.tenant.code;
}

// F-S3.9 — referral + UTM attribution captured into the request body by
// the client (cookie-resolved via the public POST /v1/referrals/resolve
// flow). Both fields are optional + permissive (the client controls them,
// so server-side just stores what it's given, except for self-referral
// guard inside the service).
const attributionSchema = z.object({
  referredBy: z.string().uuid().optional(),
  acquisitionSource: z.record(z.string(), z.unknown()).optional(),
});

function parseAttribution(body: unknown): {
  referredBy?: string;
  acquisitionSource?: Record<string, unknown>;
} {
  if (body == null) return {};
  const parsed = attributionSchema.safeParse(body);
  if (!parsed.success) return {};
  return {
    ...(parsed.data.referredBy ? { referredBy: parsed.data.referredBy } : {}),
    ...(parsed.data.acquisitionSource ? { acquisitionSource: parsed.data.acquisitionSource } : {}),
  };
}
