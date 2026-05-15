import {
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
import { env } from '../../config/env';
import { AuthGuard } from '../auth/auth.guard';
import { EmailService } from '../email/email.service';
import { registrationCancelled } from '../email/templates/registration-cancelled';
import { registrationConfirmed } from '../email/templates/registration-confirmed';
import { registrationPromoted } from '../email/templates/registration-promoted';
import { EventsService } from '../events/events.service';
import { UsersService } from '../users/users.service';
import { RegistrationsService } from './registrations.service';

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
  constructor(
    private readonly registrations: RegistrationsService,
    private readonly events: EventsService,
    private readonly users: UsersService,
    private readonly email: EmailService,
  ) {}

  @Post('events/:eventId/register')
  @HttpCode(HttpStatus.OK)
  async register(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Req() req: Request,
  ): Promise<RegistrationResponse> {
    const userId = requireUserId(req);
    const tenantCode = requireTenant(req);
    const recipientEmail = requireEmail(req);

    const row = await this.registrations.register({ userId, eventId, countryCode: tenantCode });

    // Fire-and-forget email — never block the response on Resend latency,
    // never fail the registration if email throws (EmailService catches).
    void this.events.findByIdForTenant({ id: eventId, countryCode: tenantCode }).then((event) => {
      if (!event) return;
      return this.email.send(
        registrationConfirmed({
          recipientEmail,
          eventTitle: event.title,
          eventStartsAt: event.startsAt,
          eventLocation: event.location,
          webBaseUrl: env.WEB_BASE_URL,
        }),
      );
    });

    return {
      id: row.id,
      eventId: row.eventId,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    };
  }

  @Delete('events/:eventId/register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @Param('eventId', new ParseUUIDPipe()) eventId: string,
    @Req() req: Request,
  ): Promise<void> {
    const userId = requireUserId(req);
    const tenantCode = requireTenant(req);
    const recipientEmail = requireEmail(req);

    const result = await this.registrations.cancel({
      userId,
      eventId,
      countryCode: tenantCode,
    });

    if (result.cancelled?.cancelledAt) {
      // Only fire the cancel email when this call actually flipped a row —
      // re-cancel of an already-cancelled row gets no email (avoids spam).
      void this.events.findByIdForTenant({ id: eventId, countryCode: tenantCode }).then((event) => {
        if (!event) return;
        return this.email.send(
          registrationCancelled({
            recipientEmail,
            eventTitle: event.title,
            webBaseUrl: env.WEB_BASE_URL,
          }),
        );
      });
    }

    if (result.promoted) {
      // Someone got off the waitlist — tell them.
      void this.firePromotionEmail({
        promotedUserId: result.promoted.userId,
        eventId,
        countryCode: tenantCode,
      });
    }
  }

  private async firePromotionEmail(input: {
    promotedUserId: string;
    eventId: string;
    countryCode: string;
  }): Promise<void> {
    const [promotedUser, event] = await Promise.all([
      this.users.findById(input.promotedUserId),
      this.events.findByIdForTenant({ id: input.eventId, countryCode: input.countryCode }),
    ]);
    if (!promotedUser || !event) return;
    await this.email.send(
      registrationPromoted({
        recipientEmail: promotedUser.email,
        ...(promotedUser.displayName ? { recipientName: promotedUser.displayName } : {}),
        eventTitle: event.title,
        eventStartsAt: event.startsAt,
        eventLocation: event.location,
        webBaseUrl: env.WEB_BASE_URL,
      }),
    );
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
        event: {
          id: e.event.id,
          title: e.event.title,
          startsAt: e.event.startsAt.toISOString(),
          endsAt: e.event.endsAt.toISOString(),
          location: e.event.location,
        },
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

function requireEmail(req: Request): string {
  if (!req.user?.email) {
    throw new UnauthorizedException('claims missing email');
  }
  return req.user.email;
}
