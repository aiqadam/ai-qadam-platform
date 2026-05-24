import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { DirectusClient } from '../directus/directus.client';
import { EmailService } from '../email/email.service';

// aiqadam#344 — user feedback inbox. Bot users send free-form questions /
// bug reports / event suggestions via POST /v1/telegram/feedback; we
// persist to Directus + email the operator-configured recipient. The
// persistence is for the future /workspace/feedback cabinet (out of
// scope here); the email is the operator's inbox today.
//
// ADR-0037 layer triage:
//   - Customer (bot /feedback button)
//   - Operational (Directus row + email to operator)
//   - No engineering touch

// ─── Wire shape (matches bot's pydantic) ────────────────────────────────────

export const FEEDBACK_CATEGORIES = ['question', 'bug', 'event_suggestion', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

// `| undefined` on optional fields so the strict-mode
// exactOptionalPropertyTypes lets us pass through zod's parsed body
// (which uses the same shape) without per-key narrowing.
export interface FeedbackInput {
  tg_user_id: bigint;
  tg_username?: string | null | undefined;
  category: FeedbackCategory;
  message: string;
  context?: { event_id?: string | undefined; registration_id?: string | undefined } | undefined;
  correlation_id?: string | undefined;
}

export interface FeedbackResult {
  feedback_id: string;
  submitted_at: string;
}

// ─── Limits ──────────────────────────────────────────────────────────────────

// Max message length matches the bot's free-text input cap. Anything longer
// almost certainly isn't a single coherent feedback item; 4000 chars ≈
// 600-700 words, plenty for a detailed bug report.
export const MAX_MESSAGE_LENGTH = 4000;

// Rate limit: at most N submissions per tg_user_id per rolling 1h window.
// Protects the operator inbox from a single noisy / abusive user without
// blocking legitimate burst feedback (e.g. a smoke session that surfaces
// 3-4 issues in 10 minutes).
export const RATE_LIMIT_PER_HOUR = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;

// ─── Internal Directus shapes ────────────────────────────────────────────────

interface DirectusMemberLookupRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  country: string | null;
}

@Injectable()
export class TelegramFeedbackService {
  private readonly logger = new Logger(TelegramFeedbackService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly email: EmailService,
  ) {}

  async submit(input: FeedbackInput): Promise<FeedbackResult> {
    if (input.message.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException({
        error: 'message_too_long',
        max: MAX_MESSAGE_LENGTH,
      });
    }
    if (input.message.trim().length === 0) {
      throw new BadRequestException({ error: 'message_empty' });
    }

    await this.assertUnderRateLimit(input.tg_user_id);

    // Resolve linked member (optional — anonymous TG users can still file).
    // The lookup matches the canonical column per #332.
    const member = await this.findLinkedMember(input.tg_user_id);

    const created = await this.directus.post<{ data: { id: string; date_created: string } }>(
      '/items/feedback',
      {
        telegram_user_id: input.tg_user_id.toString(),
        telegram_username: input.tg_username ?? null,
        member: member?.id ?? null,
        category: input.category,
        message: input.message,
        context: input.context ?? null,
        correlation_id: input.correlation_id ?? null,
      },
    );

    // Fire-and-forget email. EmailService logs+swallows its own errors;
    // a failed send doesn't roll back the persisted feedback row.
    void this.sendOperatorEmail(input, member, created.data.id).catch((err) => {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Operator email failed for feedback=${created.data.id}: ${reason}`);
    });

    return {
      feedback_id: created.data.id,
      submitted_at: created.data.date_created,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async assertUnderRateLimit(tgUserId: bigint): Promise<void> {
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const query = [
      `filter[telegram_user_id][_eq]=${encodeURIComponent(tgUserId.toString())}`,
      `filter[date_created][_gte]=${encodeURIComponent(since)}`,
      'aggregate[count]=*',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/feedback?${query}`,
      );
      const raw = res.data[0]?.count;
      const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw ?? 0);
      if (Number.isFinite(n) && n >= RATE_LIMIT_PER_HOUR) {
        throw new HttpException(
          { error: 'rate_limited', limit: RATE_LIMIT_PER_HOUR, window_ms: RATE_WINDOW_MS },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      // Re-throw 429s. Any other failure (Directus down etc.) we let
      // through — better to accept a possibly-over-limit submission than
      // to lose feedback because the count query failed.
      if (err instanceof HttpException) throw err;
      this.logger.warn(
        `Rate-limit check failed for tg=${tgUserId}; allowing through: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
    }
  }

  private async findLinkedMember(tgUserId: bigint): Promise<DirectusMemberLookupRow | null> {
    const query = [
      `filter[telegram_user_id][_eq]=${encodeURIComponent(tgUserId.toString())}`,
      'fields=id,first_name,last_name,email,country',
      'limit=1',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: DirectusMemberLookupRow[] }>(`/users?${query}`);
      return res.data[0] ?? null;
    } catch (err) {
      // Member lookup is best-effort. Anonymous feedback still ships.
      this.logger.warn(
        `Member lookup failed for tg=${tgUserId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      return null;
    }
  }

  private async sendOperatorEmail(
    input: FeedbackInput,
    member: DirectusMemberLookupRow | null,
    feedbackId: string,
  ): Promise<void> {
    const senderLine = formatSenderLine(input, member);
    const contextLines = formatContextLines(input, member, feedbackId);
    const subject = formatSubject(input.category, input.message);

    const text = [
      senderLine,
      `Category: ${input.category}`,
      '',
      input.message,
      '',
      '---',
      ...contextLines,
    ].join('\n');

    const html = [
      `<p>${escapeHtml(senderLine)}<br/><b>Category:</b> ${escapeHtml(input.category)}</p>`,
      `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(input.message)}</pre>`,
      '<hr/>',
      `<p style="color:#666;font-size:0.9em">${contextLines.map(escapeHtml).join('<br/>')}</p>`,
    ].join('\n');

    await this.email.send({
      to: env.FEEDBACK_RECIPIENT_EMAIL,
      subject,
      text,
      html,
    });
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function formatSubject(category: FeedbackCategory, message: string): string {
  const SUBJECT_PREVIEW = 80;
  const single = message.replace(/\s+/g, ' ').trim();
  const preview =
    single.length <= SUBJECT_PREVIEW ? single : `${single.slice(0, SUBJECT_PREVIEW - 1)}…`;
  return `[Bot Feedback / ${category}] ${preview}`;
}

export function formatSenderLine(
  input: FeedbackInput,
  member: { first_name?: string | null; last_name?: string | null; email?: string | null } | null,
): string {
  const handle = input.tg_username ? `@${input.tg_username}` : '(no username)';
  const name = formatMemberDisplayName(member) ?? 'unlinked TG user';
  return `From: ${handle} (${name}, tg_user_id ${input.tg_user_id})`;
}

export function formatContextLines(
  input: FeedbackInput,
  member: { email?: string | null; country?: string | null } | null,
  feedbackId: string,
): string[] {
  const out: string[] = [`Feedback ID: ${feedbackId}`];
  if (member?.email) out.push(`Sender email: ${member.email}`);
  if (member?.country) out.push(`Tenant: ${member.country}`);
  if (input.context?.event_id) out.push(`Event: ${input.context.event_id}`);
  if (input.context?.registration_id) out.push(`Registration: ${input.context.registration_id}`);
  if (input.correlation_id) out.push(`Correlation: ${input.correlation_id}`);
  return out;
}

function formatMemberDisplayName(
  member: { first_name?: string | null; last_name?: string | null } | null,
): string | null {
  if (!member) return null;
  const first = member.first_name?.trim() ?? '';
  const last = member.last_name?.trim() ?? '';
  const joined = [first, last].filter((s) => s.length > 0).join(' ');
  return joined || null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
