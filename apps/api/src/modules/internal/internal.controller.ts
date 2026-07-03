import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { EmailService } from '../email/email.service';
import { registrationCancelled } from '../email/templates/registration-cancelled';
import { registrationConfirmed } from '../email/templates/registration-confirmed';
import { registrationPromoted } from '../email/templates/registration-promoted';
import { registrationWaitlisted } from '../email/templates/registration-waitlisted';
import { InternalAuthGuard } from './internal-auth.guard';

const TEMPLATE_NAMES = [
  'registration-confirmed',
  'registration-promoted',
  'registration-waitlisted',
  'registration-cancelled',
] as const;

const baseDataSchema = z.object({
  recipientName: z.string().optional(),
  eventTitle: z.string().min(1),
  eventStartsAt: z.string().datetime(),
  eventLocation: z.string().nullable().optional(),
});

const requestSchema = z.object({
  template: z.enum(TEMPLATE_NAMES),
  to: z.string().email(),
  data: baseDataSchema,
});

// ISS-UAT-001-1 — body schema for POST /v1/internal/users/ensure-linked.
// `displayName` is optional: callers that don't have it on hand (the
// Authentik admin user-creation path doesn't surface a display_name back
// to the seed) can omit it; the bridge passes `null` to Directus which
// treats first_name as nullable.
const ensureLinkedSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255).nullable().optional(),
});

interface EnsureLinkedResponse {
  // null when either (a) no local `users` row exists for the email yet,
  // or (b) the bridge failed internally (logs + swallows). The seed
  // consumer treats both as "warn, but continue" — a missing local row
  // means the user hasn't been seen yet (next sign-in creates it), and
  // a bridge failure is retried on the next sign-in too.
  directusUserId: string | null;
}

@Controller('v1/internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly emails: EmailService,
    private readonly directusBridge: DirectusUsersBridgeService,
  ) {}

  @Post('email')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendEmail(@Body() body: unknown): Promise<{ accepted: true }> {
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { template, to, data } = parsed.data;
    const base = {
      recipientEmail: to,
      eventTitle: data.eventTitle,
      eventStartsAt: new Date(data.eventStartsAt),
      eventLocation: data.eventLocation ?? null,
      webBaseUrl: env.WEB_BASE_URL,
      ...(data.recipientName ? { recipientName: data.recipientName } : {}),
    };

    const message =
      template === 'registration-confirmed'
        ? registrationConfirmed(base)
        : template === 'registration-promoted'
          ? registrationPromoted(base)
          : template === 'registration-waitlisted'
            ? registrationWaitlisted(base)
            : registrationCancelled(base);

    await this.emails.send(message);
    return { accepted: true };
  }

  // ISS-UAT-001-1 — trigger the DirectusUsersBridge for a user that has
  // not yet signed in via OIDC. Used by scripts/uat-seed.sh after
  // Authentik user + group provisioning so newly-added identity
  // fixtures are mirrored into Directus before the consent-row FK
  // lookup runs. Mirrors the inline pattern at
  // auth.controller.ts:148 — controller stays thin, bridge does the
  // work. Always returns 200 with `{ directusUserId: string | null }`
  // so the seed caller can detect the "no local user yet" case
  // explicitly instead of misinterpreting an HTTP 5xx.
  @Post('users/ensure-linked')
  @HttpCode(HttpStatus.OK)
  async ensureLinkedUser(@Body() body: unknown): Promise<EnsureLinkedResponse> {
    const parsed = ensureLinkedSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const directusUserId = await this.directusBridge.ensureLinkedByEmail({
      email: parsed.data.email,
      displayName: parsed.data.displayName ?? null,
    });
    return { directusUserId };
  }
}
