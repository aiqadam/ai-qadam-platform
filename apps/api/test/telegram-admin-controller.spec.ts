import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { HeartbeatReaderService } from '../src/modules/telegram/heartbeat-reader.service';
import { tgConfig } from '../src/modules/telegram/schema';
import { TelegramAdminController } from '../src/modules/telegram/telegram-admin.controller';
import { TelegramAdminService } from '../src/modules/telegram/telegram-admin.service';
import { type GetMeFn, TgConfigService } from '../src/modules/telegram/tg-config.service';

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
const ROTATED_TOKEN = '111222333:NEWNEWNEWNEWNEWNEWNEWNEWNEWNEWnew_ne';

const fakeUser = (id: string) =>
  ({ user: { sub: id, email: 'a@b.com', jti: 'j' } }) as unknown as import('express').Request;

const makeGetMe = (impl: GetMeFn): GetMeFn => vi.fn(impl);

beforeEach(async () => {
  await db.delete(tgConfig);
});

function makeController(getMe: GetMeFn): {
  controller: TelegramAdminController;
  config: TgConfigService;
} {
  const config = new TgConfigService(db, getMe);
  const hb = new HeartbeatReaderService(redis);
  const admin = new TelegramAdminService(db, config, hb, getMe);
  const controller = new TelegramAdminController(config, admin);
  return { controller, config };
}

describe('TelegramAdminController.rotateToken', () => {
  it('rotates the token on an existing tenant row and returns the new bot identity', async () => {
    const getMe = makeGetMe(async (t) => ({
      botId: t === SAMPLE_TOKEN ? 12345n : 67890n,
      botUsername: t === SAMPLE_TOKEN ? 'aiqadam_bot' : 'aiqadam_v2',
    }));
    const { controller, config } = makeController(getMe);
    const op = randomUUID();
    await config.configure({ tenant: null, botToken: SAMPLE_TOKEN, configuredBy: op });

    const res = await controller.rotateToken(fakeUser(op), { token: ROTATED_TOKEN });

    expect(res.bot_id).toBe('67890');
    expect(res.bot_username).toBe('aiqadam_v2');
    // Still one row (upsert semantics).
    const rows = await db.select().from(tgConfig);
    expect(rows).toHaveLength(1);
  });

  it('returns 404 telegram_not_configured when no row exists for the tenant', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);

    try {
      await controller.rotateToken(fakeUser(randomUUID()), { token: ROTATED_TOKEN });
      throw new Error('expected NotFoundException');
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundException);
      const body = (err as NotFoundException).getResponse() as { error: string };
      expect(body.error).toBe('telegram_not_configured');
    }
    // getMe should NOT have been called — we reject before validating.
    expect(getMe).not.toHaveBeenCalled();
  });

  it('rejects badly-shaped requests', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    await expect(controller.rotateToken(fakeUser(randomUUID()), {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects requests with no signed-in user (guard bypass guard)', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    await expect(
      controller.rotateToken({} as import('express').Request, { token: ROTATED_TOKEN }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

describe('TelegramAdminController.status', () => {
  it('returns the JSON shape contracted with the cabinet UI', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'aiqadam_bot' }));
    const { controller } = makeController(getMe);

    const status = await controller.status({});

    // Just sanity-check the surface shape — telegram-admin-status-service.spec
    // covers the per-field semantics in depth.
    expect(status).toHaveProperty('configured');
    expect(status).toHaveProperty('bot');
    expect(status).toHaveProperty('api_heartbeat');
    expect(status).toHaveProperty('bot_heartbeat');
    expect(status).toHaveProperty('notifier_heartbeat');
    expect(status).toHaveProperty('outbox');
    expect(status).toHaveProperty('send_log');
    expect(status).toHaveProperty('streams');
    expect(status.configured).toBe(false);
  });

  it('rejects badly-formed tenant query', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    await expect(controller.status({ tenant: 'NOT_ALLOWED' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
