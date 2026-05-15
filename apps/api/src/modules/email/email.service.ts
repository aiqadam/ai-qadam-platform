import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { env } from '../../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Thin wrapper around the Resend SDK. Two reasons it exists rather than the
// callers calling Resend directly:
//   1. Centralised on/off switch via SEND_EMAILS — the test suite + CI have
//      it false; only dev with a real key + prod actually transmit.
//   2. Single place to add the BullMQ queue when async sending matters
//      (we're sync for now; one Resend call adds ~150ms to register, fine
//      for a meetup-scale platform).
//
// Failures are LOGGED, NOT THROWN. A registration must succeed even if the
// email backend is having a bad day.

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;

  constructor() {
    this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  }

  async send(message: EmailMessage): Promise<void> {
    if (!env.SEND_EMAILS) {
      this.logger.debug(
        `[email skipped: SEND_EMAILS=false] to=${message.to} subject=${message.subject}`,
      );
      return;
    }
    if (!this.resend) {
      this.logger.warn(
        `[email skipped: RESEND_API_KEY not set] to=${message.to} subject=${message.subject}`,
      );
      return;
    }
    try {
      const { error } = await this.resend.emails.send({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      if (error) {
        this.logger.error(`Resend rejected email to=${message.to}: ${error.message}`);
        return;
      }
      this.logger.log(`Email sent to=${message.to} subject=${message.subject}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Resend threw on email to=${message.to}: ${reason}`);
    }
  }
}
