import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { tgConfig } from '../src/modules/telegram/schema';
import { TelegramController } from '../src/modules/telegram/telegram.controller';
import { TelegramService } from '../src/modules/telegram/telegram.service';
import { type GetMeFn, TgConfigService } from '../src/modules/telegram/tg-config.service';

// Tests for GET /v1/telegram/admin/bot-token — the m2m endpoint the
// Python bot polls at boot to fetch the operator-configured BotFather
// token from tg_config (R2.5; replaces the legacy Coolify env path).
//
// 401 behaviour for missing/wrong bearer is covered exhaustively in
// telegram-auth-guard.spec; we don't re-cover the guard here.
//
// The response shape is contract-pinned against the bot's
// BotTokenResponse pydantic model in
// `src/aiqadam_telegram_bot/shared/aiqadam_client.py`. Renaming any
// of these fields breaks the bot's boot path.

const dbUrl = inject('TEST_DATABASE_URL');
const redisUrl = inject('TEST_REDIS_URL');

const client = postgres(dbUrl, { max: 4 });
const db = drizzle(client);
const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

afterAll(async () => {
  await client.end();
  await redis.quit();
});

const SAMPLE_TOKEN = '987654321:AABBCCDDeeFFggHHiiJJkkLLmmNNooPPqqRRssTTuu';

const makeGetMe = (impl: GetMeFn): GetMeFn => vi.fn(impl);

beforeEach(async () => {
  await db.delete(tgConfig);
});

function makeController(getMe: GetMeFn): {
  controller: TelegramController;
  config: TgConfigService;
} {
  const config = new TgConfigService(db, getMe, redis);
  // The bot-token endpoint never touches TelegramService — pass a stub
  // typed as the real class to satisfy DI without standing up its deps.
  const telegram = {} as unknown as TelegramService;
  const controller = new TelegramController(telegram, config);
  return { controller, config };
}

describe('TelegramController.getBotToken', () => {
  it('returns the decrypted token + bot identity for the global row', async () => {
    const getMe = makeGetMe(async () => ({ botId: 12345n, botUsername: 'aiqadam_bot' }));
    const { controller, config } = makeController(getMe);
    await config.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });

    const res = await controller.getBotToken({});

    // Contract-pinned field names (see header comment).
    expect(res).toEqual({
      bot_token: SAMPLE_TOKEN,
      bot_id: '12345',
      bot_username: 'aiqadam_bot',
    });
  });

  it('serializes bot_id as a string (bigint safety)', async () => {
    // Larger-than-MAX_SAFE_INTEGER bot ID — proves we round-trip via
    // string and don't silently lose precision on the wire.
    const bigId = 9999999999999999n;
    const getMe = makeGetMe(async () => ({ botId: bigId, botUsername: 'bigbot' }));
    const { controller, config } = makeController(getMe);
    await config.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });

    const res = await controller.getBotToken({});

    expect(typeof res.bot_id).toBe('string');
    expect(res.bot_id).toBe('9999999999999999');
  });

  it('returns 404 telegram_not_configured when no row exists', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);

    try {
      await controller.getBotToken({});
      throw new Error('expected NotFoundException');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const body = (err as NotFoundException).getResponse() as { error: string };
      // Exact body shape — the bot's BotNotConfigured handler checks
      // status === 404, but downstream operators grepping logs rely on
      // this string.
      expect(body.error).toBe('telegram_not_configured');
    }
    // getMe is not called for a read.
    expect(getMe).not.toHaveBeenCalled();
  });

  it('returns 404 telegram_not_configured when no row matches the requested tenant', async () => {
    const getMe = makeGetMe(async () => ({ botId: 12345n, botUsername: 'aiqadam_bot' }));
    const { controller, config } = makeController(getMe);
    // Global row exists, but the caller asks for tenant=uz.
    await config.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });

    await expect(controller.getBotToken({ tenant: 'uz' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a badly-formed tenant query', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);

    // Uppercase / digits / too long → schema-level rejection at 400.
    // This is intentionally not 404 — the bot only exit-loops on 404,
    // and a malformed query is a caller bug, not a "no row" state.
    await expect(controller.getBotToken({ tenant: 'NOT_OK' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
