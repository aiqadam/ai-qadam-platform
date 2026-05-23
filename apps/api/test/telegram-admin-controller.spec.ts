import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { HeartbeatReaderService } from '../src/modules/telegram/heartbeat-reader.service';
import { tgConfig, tgSendLog } from '../src/modules/telegram/schema';
import { TelegramAdminController } from '../src/modules/telegram/telegram-admin.controller';
import {
  RECENT_DELIVERIES_LIMIT,
  TelegramAdminService,
} from '../src/modules/telegram/telegram-admin.service';
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
  await db.delete(tgSendLog);
});

function makeController(getMe: GetMeFn): {
  controller: TelegramAdminController;
  config: TgConfigService;
} {
  const config = new TgConfigService(db, getMe, redis);
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

describe('TelegramAdminController.rotateServiceToken (R2 PR-3)', () => {
  it('mints a fresh 64-hex service token + persists encrypted + returns plaintext once', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'aiqadam_bot' }));
    const { controller, config } = makeController(getMe);
    const op = randomUUID();
    await config.configure({ tenant: null, botToken: SAMPLE_TOKEN, configuredBy: op });

    const res = await controller.rotateServiceToken(fakeUser(op), {});

    // 32 bytes hex = 64 chars
    expect(res.plaintext).toMatch(/^[0-9a-f]{64}$/);
    expect(res.tenant).toBeNull();
    expect(typeof res.rotated_at).toBe('string');

    // Round-trip: getServiceToken should now return the plaintext we
    // just issued (decrypted from the stored ciphertext).
    const decrypted = await config.getServiceToken(null);
    expect(decrypted).toBe(res.plaintext);

    // Audit columns persisted.
    const [row] = await db.select().from(tgConfig);
    expect(row?.serviceTokenRotatedBy).toBe(op);
    expect(row?.serviceTokenRotatedAt).toBeInstanceOf(Date);
  });

  it('returns 404 telegram_not_configured when no tg_config row exists', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);

    await expect(controller.rotateServiceToken(fakeUser(randomUUID()), {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('issues a different token each time (idempotent endpoint, fresh value)', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'aiqadam_bot' }));
    const { controller, config } = makeController(getMe);
    const op = randomUUID();
    await config.configure({ tenant: null, botToken: SAMPLE_TOKEN, configuredBy: op });

    const a = await controller.rotateServiceToken(fakeUser(op), {});
    const b = await controller.rotateServiceToken(fakeUser(op), {});

    expect(a.plaintext).not.toBe(b.plaintext);
  });

  it('rejects requests with no signed-in user', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    await expect(
      controller.rotateServiceToken({} as import('express').Request, {}),
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

describe('TelegramAdminController.recentDeliveries', () => {
  it('returns the 10 most-recent rows in DESC order with truncated detail', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    // Insert 12 rows with explicit createdAt so we can assert ordering
    // deterministically (defaultNow() would tie within the same ms).
    const envelopeId = randomUUID();
    const longDetail = 'x'.repeat(300);
    for (let i = 0; i < 12; i += 1) {
      await db.insert(tgSendLog).values({
        deliveryKey: `key-${i.toString().padStart(2, '0')}`,
        envelopeId,
        outcome: i % 2 === 0 ? 'sent' : 'blocked',
        // Older rows = lower index. Newest row (i=11) gets the most
        // recent timestamp so it sits at the top of the DESC sort.
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i, 0)),
        // Only the newest row gets the long-detail payload, so we can
        // assert truncation hits exactly one entry.
        detail: i === 11 ? longDetail : null,
      });
    }

    const res = await controller.recentDeliveries({});

    expect(res.rows).toHaveLength(RECENT_DELIVERIES_LIMIT);
    // Newest first.
    expect(res.rows[0]?.delivery_key).toBe('key-11');
    expect(res.rows[res.rows.length - 1]?.delivery_key).toBe('key-02');
    // Detail truncated with the ellipsis sentinel — full payload was
    // 300 chars; cap is 200, so truncated string is 201 chars (200 +
    // "…").
    const newest = res.rows[0];
    if (!newest) throw new Error('expected newest row');
    expect(newest.detail).not.toBeNull();
    expect(newest.detail).toMatch(/…$/);
    expect(newest.detail?.length).toBe(201);
    // Rows without a detail surface as null, not the literal "null".
    expect(res.rows[1]?.detail).toBeNull();
    // created_at is ISO-8601.
    expect(newest.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns an empty list when the table is empty', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    const res = await controller.recentDeliveries({});
    expect(res.rows).toEqual([]);
  });

  it('rejects badly-formed tenant query', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'x' }));
    const { controller } = makeController(getMe);
    await expect(controller.recentDeliveries({ tenant: 'NOT_OK' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
