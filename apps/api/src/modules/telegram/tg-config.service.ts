import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';
import { env } from '../../config/env';
import { DB, type Db } from '../../db';
import { type NewTgConfigRow, type TgConfigRow, tgConfig } from './schema';
import { decryptToken, encryptToken, parseEncryptionKey } from './token-crypto';

// R2 (ADR-0034) — owns the lifecycle of the tg_config row:
//   - load(tenant): decrypt + return current config OR null if absent.
//   - upsert(tenant, token, configuredBy): validate token via Telegram
//     getMe, encrypt, write the row.
//   - getServiceToken(tenant): used by TelegramAuthGuard. Falls back to
//     env.TELEGRAM_BOT_SERVICE_TOKEN when no row exists, so existing
//     dev/CI envs keep working.
//
// Note: the BotFather token (what we encrypt) and the SERVICE token
// (what the bot puts in Authorization: Bearer) are DIFFERENT secrets.
// Today the workspace cabinet will configure both in one form; the
// service token is generated server-side and returned to the operator
// to paste into the bot's Coolify env. That generation step lands in
// R2 PR-2 (rotate-token endpoint reuses the same logic).
//
// For now this PR ships JUST the configure flow (validates the
// BotFather token + persists bot identity). The service-token side
// stays on the env fallback until PR-2 wires the DB column for it.

export class TelegramConfigKeyMissingError extends HttpException {
  constructor() {
    super({ error: 'telegram_config_key_missing' }, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export interface TgGetMeResult {
  botId: bigint;
  botUsername: string;
}

export interface ConfigureInput {
  tenant: string | null;
  botToken: string;
  configuredBy: string; // uuid of the operator
}

export interface PublicConfig {
  tenant: string | null;
  botId: bigint;
  botUsername: string;
  configuredAt: Date;
  configuredBy: string;
}

// Pluggable so tests can inject a fake without monkey-patching globals.
// Real implementation hits api.telegram.org via fetch.
export type GetMeFn = (botToken: string) => Promise<TgGetMeResult>;

export const TG_GET_ME: unique symbol = Symbol('TG_GET_ME');

@Injectable()
export class TgConfigService {
  private readonly logger = new Logger(TgConfigService.name);
  // Lazy: resolves once on first use so a missing key throws a 503 on
  // the affected route instead of crashing the app at boot.
  private cachedKey: Buffer | undefined;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TG_GET_ME) private readonly getMe: GetMeFn,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  async load(tenant: string | null): Promise<PublicConfig | null> {
    const row = await this.findRow(tenant);
    if (!row) return null;
    return rowToPublic(row);
  }

  async configure(input: ConfigureInput): Promise<PublicConfig> {
    const key = this.resolveKey();
    // Cheap shape check before we burn an external call — BotFather
    // tokens look like `123456789:AABBCC-DD_EEffgg...`. We reject the
    // obviously-malformed up front; getMe catches everything else.
    if (!isBotFatherTokenShape(input.botToken)) {
      throw new BadRequestException('invalid_token_format');
    }
    const me = await this.callGetMeOrThrow(input.botToken);
    const encrypted = encryptToken(input.botToken, key);
    const row = await this.upsertRow({
      tenant: input.tenant,
      encryptedToken: encrypted,
      botId: me.botId,
      botUsername: me.botUsername,
      configuredBy: input.configuredBy,
    });
    return rowToPublic(row);
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private resolveKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    if (!env.TG_CONFIG_ENCRYPTION_KEY) {
      throw new TelegramConfigKeyMissingError();
    }
    this.cachedKey = parseEncryptionKey(env.TG_CONFIG_ENCRYPTION_KEY);
    return this.cachedKey;
  }

  private async callGetMeOrThrow(botToken: string): Promise<TgGetMeResult> {
    try {
      return await this.getMe(botToken);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`tg-config getMe failed: ${reason}`);
      // Surface as 400 so the cabinet UI shows it next to the token field.
      throw new BadRequestException({ error: 'getme_failed', detail: reason });
    }
  }

  private async findRow(tenant: string | null): Promise<TgConfigRow | undefined> {
    const where = tenant === null ? isNull(tgConfig.tenant) : eq(tgConfig.tenant, tenant);
    const [row] = await this.db.select().from(tgConfig).where(where).limit(1);
    return row;
  }

  private async upsertRow(
    values: Omit<NewTgConfigRow, 'id' | 'configuredAt'>,
  ): Promise<TgConfigRow> {
    // Postgres doesn't allow ON CONFLICT on expression unique indexes
    // (the coalesce(tenant, '*') one) — emulate upsert by select-then-
    // insert-or-update inside a single transaction. The expression index
    // still enforces the invariant if a race occurs (second INSERT fails).
    // Coerce undefined → null so the where-clause narrowing for `eq()`
    // gets a definite `string` after the null check (Drizzle's insert
    // type is `string | null | undefined` for nullable columns).
    const tenant: string | null = values.tenant ?? null;
    return this.db.transaction(async (tx) => {
      const where = tenant === null ? isNull(tgConfig.tenant) : eq(tgConfig.tenant, tenant);
      const [existing] = await tx.select().from(tgConfig).where(where).limit(1);
      const now = new Date();
      if (existing) {
        const [updated] = await tx
          .update(tgConfig)
          .set({
            encryptedToken: values.encryptedToken,
            botId: values.botId,
            botUsername: values.botUsername,
            configuredAt: now,
            configuredBy: values.configuredBy,
          })
          .where(eq(tgConfig.id, existing.id))
          .returning();
        if (!updated) throw new Error('tg_config update returned no row');
        return updated;
      }
      const [inserted] = await tx
        .insert(tgConfig)
        .values({ ...values, configuredAt: now })
        .returning();
      if (!inserted) throw new Error('tg_config insert returned no row');
      return inserted;
    });
  }

  // Exposed for the status endpoint (PR-2): returns the plaintext token
  // so the API can verify it still works (getMe) without forcing the
  // operator to re-paste. Internal-only — never returned over the wire.
  async readPlaintextToken(tenant: string | null): Promise<string | null> {
    const row = await this.findRow(tenant);
    if (!row) return null;
    const key = this.resolveKey();
    return decryptToken(row.encryptedToken, key);
  }

  // Returns metadata + plaintext token in one read. Used by the bot-token
  // endpoint (the bot fetches both at boot to start polling). Kept
  // separate from readPlaintextToken so callers don't pay a second DB
  // round-trip when they need bot identity alongside the secret.
  async loadWithDecryptedToken(
    tenant: string | null,
  ): Promise<(PublicConfig & { decryptedToken: string }) | null> {
    const row = await this.findRow(tenant);
    if (!row) return null;
    const key = this.resolveKey();
    return { ...rowToPublic(row), decryptedToken: decryptToken(row.encryptedToken, key) };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// BotFather tokens are `<bot_id>:<35+ chars of [A-Za-z0-9_-]>`. The
// authoritative format isn't documented but has been stable for years.
// We're permissive on length (>=35) to forward-compatibly accept tokens
// that grow; restrictive on character class to catch fat-finger pastes.
export function isBotFatherTokenShape(token: string): boolean {
  return /^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(token.trim());
}

function rowToPublic(row: TgConfigRow): PublicConfig {
  return {
    tenant: row.tenant,
    botId: row.botId,
    botUsername: row.botUsername,
    configuredAt: row.configuredAt,
    configuredBy: row.configuredBy,
  };
}

// ─── Real getMe (Telegram HTTP) ──────────────────────────────────────────────
//
// Provider factory wired in telegram.module.ts. Kept as a free function
// so tests can swap it for a fake.

export const realGetMe: GetMeFn = async (botToken) => {
  const url = `https://api.telegram.org/bot${botToken}/getMe`;
  const ctrl = new AbortController();
  // 10s — Telegram's getMe typically responds <300ms; a long timeout
  // covers slow networks without making the cabinet feel hung.
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      // Telegram returns 401/404 on bad tokens with JSON like
      // {"ok":false,"error_code":401,"description":"Unauthorized"}.
      throw new Error(`telegram_${res.status}: ${text.slice(0, 200)}`);
    }
    const body = (await res.json()) as {
      ok: boolean;
      result?: { id: number; username?: string; is_bot?: boolean };
      description?: string;
    };
    if (!body.ok || !body.result || !body.result.is_bot || !body.result.username) {
      throw new Error(`telegram_bad_response: ${body.description ?? 'no description'}`);
    }
    return {
      botId: BigInt(body.result.id),
      botUsername: body.result.username,
    };
  } finally {
    clearTimeout(timer);
  }
};
