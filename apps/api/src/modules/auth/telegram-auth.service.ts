import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { AuthentikClient } from '../admin-invites/authentik.client';

// FR-AUTH-002 — Telegram authentication service.
//
// Two flows:
//   1. Web Login Widget — browser posts signed widget fields; we verify
//      the HMAC, look up or create an Authentik user, mint a recovery
//      link, and hand the URL back to the controller for a 302 redirect.
//
//   2. Bot upsert — the bot (authenticated via InternalAuthGuard) sends a
//      Telegram user's ID/name; we look up or create a temporary Authentik
//      user so the bot can track the member before full registration.
//
// Security references: AGENTS.md §5, security.md, Telegram Login Widget docs.

// ── constants ────────────────────────────────────────────────────────────────

// Maximum age of a Login Widget auth_date before it is rejected (seconds).
// Telegram docs: verify within a reasonable window; 5 minutes is tight but
// correct for server-side verification where the payload is posted immediately.
// The impact-analysis noted 86 400 s (24 h) as an AC target; the prompt
// specifies 300 s. We use 300 s per the explicit implementation instruction.
const AUTH_DATE_MAX_AGE_SECONDS = 300;

// Synthetic email domain for temporary Telegram-only accounts.
const TELEGRAM_EMAIL_DOMAIN = 'telegram.local';

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Numeric string as Telegram sends it (up to 18 digits — bigint-safe as string).
const telegramIdSchema = z.string().regex(/^\d{1,19}$/, 'telegramId must be a numeric string');

// Full Login Widget payload schema. `hash` and `id` are required; other fields
// are optional (Telegram only sends fields the user has set on their account).
export const telegramWidgetPayloadSchema = z.object({
  id: telegramIdSchema,
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.coerce.number().int().positive(),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be 64 lower-case hex chars'),
  email: z.string().email().optional(),
});

export type TelegramWidgetPayload = z.infer<typeof telegramWidgetPayloadSchema>;

// Upsert-temp-user input schema (bot → internal endpoint).
export const upsertTempUserBodySchema = z.object({
  telegramId: telegramIdSchema,
  firstName: z.string().min(1).max(255),
  username: z.string().max(255).optional(),
});

export type UpsertTempUserBody = z.infer<typeof upsertTempUserBodySchema>;

// ── Result type ───────────────────────────────────────────────────────────────

export interface UpsertTempUserResult {
  authentikUserId: number;
  directusUserId: null;
  isNew: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TelegramAuthService {
  constructor(private readonly authentik: AuthentikClient) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  // Returns the raw TELEGRAM_BOT_TOKEN or throws 503 if unconfigured.
  private getBotToken(): string {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new ServiceUnavailableException('telegram_not_configured');
    }
    return token;
  }

  // Derives the HMAC signing key: SHA256(BOT_TOKEN) as a Buffer.
  // Per Telegram Login Widget docs: the secret key is NOT the raw token
  // but a SHA-256 hash of it.
  private deriveHmacKey(botToken: string): Buffer {
    return createHash('sha256').update(botToken).digest();
  }

  // Builds the data_check_string: sorted key=value lines (all fields except
  // `hash`), joined by newlines.
  private buildDataCheckString(payload: TelegramWidgetPayload): string {
    const { hash: _omit, ...rest } = payload;
    void _omit; // explicitly unused
    return Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('\n');
  }

  // ── public API ────────────────────────────────────────────────────────────

  // Verifies the Telegram Login Widget HMAC-SHA256 hash.
  // Throws UnauthorizedException on:
  //   - Invalid hash
  //   - auth_date older than AUTH_DATE_MAX_AGE_SECONDS
  verifyWidgetHash(payload: TelegramWidgetPayload): void {
    const botToken = this.getBotToken();
    const key = this.deriveHmacKey(botToken);
    const dataCheckString = this.buildDataCheckString(payload);

    const expected = createHmac('sha256', key).update(dataCheckString).digest('hex');

    // Timing-safe comparison — both buffers must be equal length.
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(payload.hash, 'hex');
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('telegram_hmac_invalid');
    }

    // Freshness check using server clock — not client-supplied time.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - payload.auth_date > AUTH_DATE_MAX_AGE_SECONDS) {
      throw new UnauthorizedException('telegram_auth_date_expired');
    }
  }

  // Full Login Widget exchange:
  //   1. Verify HMAC + freshness.
  //   2. Look up Authentik user by telegram_id.
  //   3. If not found and email present, try email match + patch telegram_id.
  //   4. If still not found, create new user.
  //   5. Mint Authentik recovery link and return it.
  async exchangeWidgetPayload(payload: TelegramWidgetPayload): Promise<string> {
    this.verifyWidgetHash(payload);

    const telegramId = payload.id;

    let user = await this.authentik.getUserByTelegramId(telegramId);

    if (!user && payload.email) {
      user = await this.authentik.getUserByEmail(payload.email);
      if (user) {
        // Merge telegram_id onto existing email-based account to prevent duplicates.
        const merged = { ...user.attributes, telegram_id: telegramId };
        await this.authentik.patchAttributes(user.pk, merged);
      }
    }

    if (!user) {
      user = await this.createTelegramUser(telegramId, payload.first_name, payload.username);
    }

    return this.authentik.createRecoveryLink(user.pk);
  }

  // Creates a full (non-temporary) Authentik user for a Login Widget sign-in
  // where the user did not previously exist.
  private async createTelegramUser(
    telegramId: string,
    firstName: string | undefined,
    username: string | undefined,
  ) {
    const syntheticEmail = `tg${telegramId}@${TELEGRAM_EMAIL_DOMAIN}`;
    const displayName = firstName ?? `tg${telegramId}`;
    const authentikUsername = username ?? `tg${telegramId}`;

    return this.authentik.createUser({
      email: syntheticEmail,
      username: authentikUsername,
      name: displayName,
      attributes: { telegram_id: telegramId },
    });
  }

  // Idempotent upsert for bot /start provisioning.
  // Looks up by telegram_id; creates with is_temporary=true if not found.
  // Returns authentikUserId + isNew flag. directusUserId is always null here
  // (bot drives country assignment separately after getting this response).
  async upsertTempUser(
    telegramId: string,
    firstName: string,
    username?: string,
  ): Promise<UpsertTempUserResult> {
    // Validate telegramId at service boundary as well (belt-and-suspenders
    // after controller Zod parse).
    telegramIdSchema.parse(telegramId);

    // Presence of bot token is required even for internal endpoint.
    this.getBotToken();

    const existing = await this.authentik.getUserByTelegramId(telegramId);
    if (existing) {
      return { authentikUserId: existing.pk, directusUserId: null, isNew: false };
    }

    const syntheticEmail = `tg${telegramId}@${TELEGRAM_EMAIL_DOMAIN}`;
    const authentikUsername = username ?? `tg${telegramId}`;

    const created = await this.authentik.createUser({
      email: syntheticEmail,
      username: authentikUsername,
      name: firstName,
      attributes: {
        telegram_id: telegramId,
        is_temporary: true,
      },
    });

    return { authentikUserId: created.pk, directusUserId: null, isNew: true };
  }
}
