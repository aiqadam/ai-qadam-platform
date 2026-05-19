import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../../config/env';
import { EmailService } from '../../email/email.service';
import { registrationCancelled } from '../../email/templates/registration-cancelled';
import { registrationConfirmed } from '../../email/templates/registration-confirmed';
import { registrationPromoted } from '../../email/templates/registration-promoted';
import { registrationWaitlisted } from '../../email/templates/registration-waitlisted';
import type { AdapterResult, ChannelAdapter, ResolvedRecipient } from '../interactions.types';

// Email channel adapter. Accepts two payload shapes (discriminated union):
//   1. { template: 'registration-confirmed'|..., data: {...} }
//      → renders via the existing template functions (same set
//        InternalController.sendEmail used). Sprint 5.5/5 — migrated from
//        /v1/internal/email so flows go through Interactions instead.
//   2. { subject, text, html? }
//      → raw send for ad-hoc dispatches (operator-composed messages, etc.)
//
// Templates own subject + text + html. Raw payloads supply them directly.

const TEMPLATE_NAMES = [
  'registration-confirmed',
  'registration-promoted',
  'registration-waitlisted',
  'registration-cancelled',
] as const;

const templateDataSchema = z.object({
  recipientName: z.string().optional(),
  eventTitle: z.string().min(1),
  eventStartsAt: z.string().datetime(),
  eventLocation: z.string().nullable().optional(),
});

const templatePayloadSchema = z.object({
  template: z.enum(TEMPLATE_NAMES),
  data: templateDataSchema,
});

const rawPayloadSchema = z.object({
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1).optional(),
});

const payloadSchema = z.union([templatePayloadSchema, rawPayloadSchema]);

@Injectable()
export class EmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  private readonly logger = new Logger(EmailAdapter.name);

  constructor(private readonly email: EmailService) {}

  async send(input: {
    recipient: ResolvedRecipient;
    intent: string;
    payload: Record<string, unknown>;
  }): Promise<AdapterResult> {
    if (!input.recipient.email) {
      return { state: 'failed', failureReason: 'recipient has no email' };
    }
    const parsed = payloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      return {
        state: 'failed',
        failureReason: `email payload invalid: ${parsed.error.message.slice(0, 200)}`,
      };
    }

    const message =
      'template' in parsed.data
        ? renderTemplate(parsed.data.template, input.recipient.email, parsed.data.data)
        : {
            to: input.recipient.email,
            subject: parsed.data.subject,
            text: parsed.data.text,
            html: parsed.data.html ?? `<pre>${escapeHtml(parsed.data.text)}</pre>`,
          };

    try {
      await this.email.send(message);
      return { state: 'sent' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`email adapter threw for intent=${input.intent}: ${reason}`);
      return { state: 'failed', failureReason: reason };
    }
  }
}

function renderTemplate(
  template: (typeof TEMPLATE_NAMES)[number],
  recipientEmail: string,
  data: z.infer<typeof templateDataSchema>,
) {
  const base = {
    recipientEmail,
    eventTitle: data.eventTitle,
    eventStartsAt: new Date(data.eventStartsAt),
    eventLocation: data.eventLocation ?? null,
    webBaseUrl: env.WEB_BASE_URL,
    ...(data.recipientName ? { recipientName: data.recipientName } : {}),
  };
  switch (template) {
    case 'registration-confirmed':
      return registrationConfirmed(base);
    case 'registration-promoted':
      return registrationPromoted(base);
    case 'registration-waitlisted':
      return registrationWaitlisted(base);
    case 'registration-cancelled':
      return registrationCancelled(base);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
