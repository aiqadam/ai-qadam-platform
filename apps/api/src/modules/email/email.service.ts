import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { env } from '../../config/env';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// Named constants for log prefixes — satisfies AGENTS.md §1.3 (no magic strings).
const LOG_SKIPPED_DISABLED = '[email skipped: SEND_EMAILS=false]';
const LOG_SKIPPED_NO_TRANSPORT = '[email skipped: no transport configured]';
const LOG_SENT_SMTP = '[email sent via smtp]';
const LOG_SENT_RESEND = '[email sent via resend]';

// Thin wrapper around email transports. Three reasons it exists rather than
// callers dispatching directly:
//   1. Centralised on/off switch via SEND_EMAILS — CI has it false.
//   2. Transport priority: SMTP (Mailpit in dev/UAT) beats Resend so local
//      runs never need a real Resend key.
//   3. Single place to add BullMQ async sending when that matters.
//
// Failures are LOGGED, NOT THROWN — a registration must succeed even if the
// email backend is having a bad day.

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly transporter: Transporter | null;

  constructor() {
    this.resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
    this.transporter = env.SMTP_HOST
      ? createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: false })
      : null;
  }

  /** Returns which transport is active — used by /health/email. */
  getProvider(): 'smtp' | 'resend' | 'none' {
    if (this.transporter !== null) return 'smtp';
    if (this.resend !== null) return 'resend';
    return 'none';
  }

  /**
   * Returns the email-sending mode — used by /health/email and the UAT
   * pre-flight. Three states:
   *   - 'disabled'   → SEND_EMAILS=false (no transport used, by design).
   *   - 'production' → SEND_EMAILS=true + NODE_ENV=production.
   *   - 'uat'        → SEND_EMAILS=true + NODE_ENV in {development, test}.
   *
   * Pure read of env.* — no constructor side effects, idempotent across
   * repeated calls on the same instance.
   */
  getMode(): 'production' | 'uat' | 'disabled' {
    if (!env.SEND_EMAILS) return 'disabled';
    if (env.NODE_ENV === 'production') return 'production';
    return 'uat';
  }

  async send(message: EmailMessage): Promise<void> {
    if (!env.SEND_EMAILS) {
      this.logger.debug(
        `${LOG_SKIPPED_DISABLED} to=${message.to} subject=${message.subject}`,
      );
      return;
    }
    if (this.transporter !== null) {
      await this.sendViaSMTP(message);
      return;
    }
    if (this.resend !== null) {
      await this.sendViaResend(message);
      return;
    }
    this.logger.warn(
      `${LOG_SKIPPED_NO_TRANSPORT} to=${message.to} subject=${message.subject}`,
    );
  }

  private async sendViaSMTP(message: EmailMessage): Promise<void> {
    // transporter is non-null: checked by caller before dispatch.
    const t = this.transporter;
    if (!t) return;
    try {
      await t.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.log(`${LOG_SENT_SMTP} to=${message.to} subject=${message.subject}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`SMTP error to=${message.to}: ${reason}`);
    }
  }

  private async sendViaResend(message: EmailMessage): Promise<void> {
    // resend is non-null: checked by caller before dispatch.
    const r = this.resend;
    if (!r) return;
    try {
      const { error } = await r.emails.send({
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
      this.logger.log(`${LOG_SENT_RESEND} to=${message.to} subject=${message.subject}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Resend threw on email to=${message.to}: ${reason}`);
    }
  }
}
