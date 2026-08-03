import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { DB, type Db } from '../../../db';
import { OutboxPublisher } from '../../telegram/outbox-publisher.service';
import type { AdapterResult, ChannelAdapter, ResolvedRecipient } from '../interactions.types';
import { sanitizeTelegramHtml } from './telegram-html-sanitizer';

// Telegram channel adapter per ADR-0034 §"NestJS-side endpoints" +
// §"Outbox pattern". Builds a tg.dispatch.v1 envelope and publishes
// it to the outbox; the relay loop (A5) XADDs to Redis Streams; the
// notifier in viktordrukker/aiqadam-telegram-bot consumes and sends.
//
// "sent" semantics
//   This adapter returns state='sent' when the envelope has been durably
//   written to the outbox. That's not the same as Telegram having
//   delivered the message — the notifier does that asynchronously and
//   audits via POST /v1/telegram/audit (A4). Operator-visible delivery
//   state lives in tg_send_log keyed on delivery_key. We pick 'sent'
//   over 'queued' because the interactions table doesn't have a queued
//   state today and we don't want to expand DELIVERY_STATES until we
//   need to. Trade-off documented here.
//
// Outbox tx boundary
//   The state change emitting this envelope is upstream in Directus
//   (the interaction + delivery rows), not in our Postgres. So the
//   classic transactional-outbox guarantee (state-and-envelope-in-one-tx)
//   doesn't fully apply across the two databases. We still get at-least
//   -once delivery + dedupe from the outbox + notifier-side Redis SET NX
//   + tg_send_log UNIQUE. Documented honestly so future readers don't
//   over-trust the property.

// Telegram inline keyboard button — matches the Bot API's InlineKeyboardButton
// URL-button shape (a subset; we only need the url variant today).
//
// Bounds (security review MAJOR-1, wf-20260803-feat-197 retry 1): Telegram
// doesn't hard-cap button label/URL length in its public docs, but 64 chars
// is the widely-observed practical rendering limit for an inline button's
// label before Telegram truncates it client-side, and 2048 is the
// conventional practical URL-length ceiling (matches most browsers/servers'
// own limits) — both chosen so an oversized value fails fast here with a
// clear adapter-level error instead of reaching the outbox jsonb column and
// only failing later, opaquely, at the Telegram Bot API layer.
const inlineButtonSchema = z.object({
  text: z.string().min(1).max(64),
  url: z.string().min(1).max(2048).url(),
});

// Rows of buttons (a 2D array), matching Telegram's inline_keyboard shape.
// Telegram has no documented hard cap on rows/columns, but a small,
// reasonable bound on both dimensions is a cheap guard consistent with
// security.md's "every field has a max length" rule — 10 rows x 10
// buttons-per-row comfortably covers every real use case (today's callers
// use a single row, single button) while still rejecting pathological input.
const inlineButtonsSchema = z.array(z.array(inlineButtonSchema).max(10)).max(10);

// Payload shape over the dispatcher wire. Accepts a minimum-viable set;
// extend when new template needs arise. parse_mode defaults to 'None' so
// raw user text doesn't surprise-render as MarkdownV2.
const payloadSchema = z.object({
  text: z.string().min(1).max(4096),
  parse_mode: z.enum(['MarkdownV2', 'HTML', 'None']).default('None'),
  disable_web_page_preview: z.boolean().default(true),
  // Optional — AC-2 requires omitted stays backward-compatible (envelope
  // defaults to null downstream, same as before this field existed).
  inline_buttons: inlineButtonsSchema.optional(),
});

const TELEGRAM_STREAM = 'tg.dispatch.v1';

@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  readonly channel = 'telegram' as const;
  private readonly logger = new Logger(TelegramAdapter.name);

  constructor(
    private readonly outbox: OutboxPublisher,
    @Inject(DB) private readonly db: Db,
  ) {}

  async send(input: {
    recipient: ResolvedRecipient;
    intent: string;
    payload: Record<string, unknown>;
  }): Promise<AdapterResult> {
    const policy = this.checkPolicy(input.recipient);
    if (policy.skip) {
      return { state: 'skipped_policy', failureReason: policy.reason };
    }
    const parsed = payloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      return {
        state: 'failed',
        failureReason: `telegram payload invalid: ${parsed.error.message.slice(0, 200)}`,
      };
    }

    // Telegram-safe HTML enforcement (FR-NTF-004 §3): strip any tag
    // outside the allowlist before the envelope is built, so every
    // caller (current and future) gets this guarantee uniformly rather
    // than relying on each caller to sanitize its own text. This is a
    // defense-in-depth backstop, not an escaping mechanism — callers
    // remain responsible for HTML-escaping user-controlled data (event
    // titles, names) before interpolating it into their own text.
    const sanitizedText = sanitizeTelegramHtml(parsed.data.text);

    // chat_id is the recipient's tg_user_id. Bigint over the wire as a
    // string; Telegram Bot API accepts the integer.
    const chatId = Number.parseInt(input.recipient.telegramUserId ?? '', 10);
    if (!Number.isFinite(chatId) || chatId === 0) {
      // Shouldn't happen given the policy check above, but fail-safe.
      return { state: 'failed', failureReason: 'invalid telegram chat_id' };
    }

    const envelopeId = randomUUID();
    const correlationId = randomUUID();
    const envelope = {
      schema: TELEGRAM_STREAM,
      id: envelopeId,
      occurred_at: new Date().toISOString(),
      correlation_id: correlationId,
      causation_id: null,
      producer: 'aiqadam-api',
      meta: { tenant: input.recipient.tenant },
      payload: {
        kind: 'dm' as const,
        target: {
          chat_id: chatId,
          member_id: input.recipient.userId,
          tenant: input.recipient.tenant,
        },
        template: {
          text: sanitizedText,
          parse_mode: parsed.data.parse_mode,
          disable_web_page_preview: parsed.data.disable_web_page_preview,
          media_url: null,
          media_kind: null,
          inline_buttons: parsed.data.inline_buttons ?? null,
        },
        // delivery_key — UNIQUE in tg_send_log (A3). 1:1 with envelopeId
        // is the simplest choice; producer retries (in this same flow)
        // are prevented by envelopeId being a fresh UUID per call.
        delivery_key: envelopeId,
        max_retries: 5,
        expires_at: null,
      },
    };

    try {
      await this.db.transaction(async (tx) => {
        await this.outbox.publish(tx, {
          envelopeId,
          stream: TELEGRAM_STREAM,
          payload: envelope,
        });
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`outbox publish failed for ${envelopeId}: ${reason}`);
      return { state: 'failed', failureReason: `outbox publish failed: ${reason.slice(0, 200)}` };
    }

    this.logger.debug(
      `enqueued telegram dispatch envelope=${envelopeId} chat_id=${chatId} intent=${input.intent}`,
    );
    return { state: 'sent' };
  }

  private checkPolicy(
    recipient: ResolvedRecipient,
  ): { skip: true; reason: string } | { skip: false } {
    if (!recipient.telegramUserId) {
      return { skip: true, reason: 'recipient has no linked telegram account' };
    }
    if (recipient.telegramOptedOutAt) {
      return { skip: true, reason: 'recipient opted out of telegram broadcasts' };
    }
    if (!recipient.tenant) {
      // Tenant-less members shouldn't receive broadcasts — flag honestly.
      return { skip: true, reason: 'recipient has no tenant' };
    }
    return { skip: false };
  }
}
