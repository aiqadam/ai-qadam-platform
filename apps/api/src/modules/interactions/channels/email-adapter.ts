import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { EmailService } from '../../email/email.service';
import type { AdapterResult, ChannelAdapter, ResolvedRecipient } from '../interactions.types';

// Email channel adapter. Payload schema: { subject, text, html? }.
// HTML defaults to a wrapped <pre> of text — callers concerned about
// presentation should pass html explicitly.
//
// Sprint 5.5/4 keeps this raw; 5.5/5 migrates the existing template-based
// emails (registration-confirmed, etc.) so the payload becomes
// { template: 'registration-confirmed', data: {...} } and a small renderer
// resolves it here. For now: subject + text are required.

const payloadSchema = z.object({
  subject: z.string().min(1),
  text: z.string().min(1),
  html: z.string().min(1).optional(),
});

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
      return {
        state: 'failed',
        failureReason: 'recipient has no email',
      };
    }
    const parsed = payloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      return {
        state: 'failed',
        failureReason: `email payload invalid: ${parsed.error.message.slice(0, 200)}`,
      };
    }
    const { subject, text, html } = parsed.data;
    try {
      await this.email.send({
        to: input.recipient.email,
        subject,
        text,
        html: html ?? `<pre>${escapeHtml(text)}</pre>`,
      });
      return { state: 'sent' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`email adapter threw for intent=${input.intent}: ${reason}`);
      return { state: 'failed', failureReason: reason };
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
