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
import { EmailService } from '../email/email.service';
import { registrationCancelled } from '../email/templates/registration-cancelled';
import { registrationConfirmed } from '../email/templates/registration-confirmed';
import { registrationPromoted } from '../email/templates/registration-promoted';
import { InternalAuthGuard } from './internal-auth.guard';

const TEMPLATE_NAMES = [
  'registration-confirmed',
  'registration-promoted',
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

@Controller('v1/internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(private readonly emails: EmailService) {}

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
          : registrationCancelled(base);

    await this.emails.send(message);
    return { accepted: true };
  }
}
