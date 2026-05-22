import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { tgConfig } from '../src/modules/telegram/schema';
import { type GetMeFn, TgConfigService } from '../src/modules/telegram/tg-config.service';
import { decryptToken, parseEncryptionKey } from '../src/modules/telegram/token-crypto';

const dbUrl = inject('TEST_DATABASE_URL');

const client = postgres(dbUrl, { max: 4 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

const KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const SAMPLE_TOKEN = '987654321:AABBCCDDeeFFggHHiiJJkkLLmmNNooPPqqRRssTTuu';

const makeGetMe = (impl: GetMeFn): GetMeFn => vi.fn(impl);

beforeEach(async () => {
  await db.delete(tgConfig);
});

describe('TgConfigService.configure — happy path', () => {
  it('validates the token via getMe, encrypts it, and inserts a global row', async () => {
    const getMe = makeGetMe(async () => ({ botId: 12345n, botUsername: 'aiqadam_bot' }));
    const svc = new TgConfigService(db, getMe);

    const result = await svc.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: randomUUID(),
    });

    expect(result.botId).toBe(12345n);
    expect(result.botUsername).toBe('aiqadam_bot');
    expect(result.tenant).toBeNull();
    expect(getMe).toHaveBeenCalledWith(SAMPLE_TOKEN);

    // The row exists in the DB, and the encrypted_token decrypts back
    // to the original — not stored plaintext anywhere.
    const rows = await db.select().from(tgConfig);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error('expected row');
    expect(row.tenant).toBeNull();
    const key = parseEncryptionKey(KEY_HEX);
    expect(decryptToken(row.encryptedToken, key)).toBe(SAMPLE_TOKEN);
  });

  it('upserts on re-configure: same tenant → row replaced, configured_at bumps', async () => {
    const getMe = makeGetMe(async (t) => ({
      botId: t === SAMPLE_TOKEN ? 12345n : 67890n,
      botUsername: t === SAMPLE_TOKEN ? 'aiqadam_bot' : 'aiqadam_v2',
    }));
    const svc = new TgConfigService(db, getMe);
    const userA = randomUUID();
    const userB = randomUUID();

    const first = await svc.configure({
      tenant: null,
      botToken: SAMPLE_TOKEN,
      configuredBy: userA,
    });
    // Sleep a tick so configured_at differs.
    await new Promise((r) => setTimeout(r, 5));
    const secondToken = '111222333:NEWNEWNEWNEWNEWNEWNEWNEWNEWNEWnew_ne';
    const second = await svc.configure({
      tenant: null,
      botToken: secondToken,
      configuredBy: userB,
    });

    expect(second.configuredBy).toBe(userB);
    expect(second.botUsername).toBe('aiqadam_v2');
    expect(second.configuredAt.getTime()).toBeGreaterThan(first.configuredAt.getTime());

    const rows = await db.select().from(tgConfig);
    expect(rows).toHaveLength(1); // unique on coalesce(tenant, '*')
  });

  it('allows distinct rows for different tenants', async () => {
    const getMe = makeGetMe(async () => ({ botId: 1n, botUsername: 'bot' }));
    const svc = new TgConfigService(db, getMe);
    const by = randomUUID();
    await svc.configure({ tenant: null, botToken: SAMPLE_TOKEN, configuredBy: by });
    await svc.configure({ tenant: 'uz', botToken: SAMPLE_TOKEN, configuredBy: by });
    await svc.configure({ tenant: 'kz', botToken: SAMPLE_TOKEN, configuredBy: by });
    const rows = await db.select().from(tgConfig);
    const tenants = rows.map((r) => r.tenant);
    // Order is non-deterministic; check membership.
    expect(tenants).toHaveLength(3);
    expect(new Set(tenants)).toEqual(new Set([null, 'uz', 'kz']));
  });
});

describe('TgConfigService.configure — bad input', () => {
  it('rejects a malformed BotFather token without calling getMe', async () => {
    const getMe = makeGetMe(async () => {
      throw new Error('should not be called');
    });
    const svc = new TgConfigService(db, getMe);

    await expect(
      svc.configure({
        tenant: null,
        botToken: 'not-a-bot-token',
        configuredBy: randomUUID(),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(getMe).not.toHaveBeenCalled();
    // Nothing written.
    expect(await db.select().from(tgConfig)).toHaveLength(0);
  });

  it('rejects when getMe throws (e.g. Telegram returns 401)', async () => {
    const getMe = makeGetMe(async () => {
      throw new Error('telegram_401: Unauthorized');
    });
    const svc = new TgConfigService(db, getMe);
    try {
      await svc.configure({
        tenant: null,
        botToken: SAMPLE_TOKEN,
        configuredBy: randomUUID(),
      });
      throw new Error('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as Record<string, unknown>;
      expect(body.error).toBe('getme_failed');
      expect(String(body.detail)).toContain('telegram_401');
    }
    expect(await db.select().from(tgConfig)).toHaveLength(0);
  });
});

describe('TgConfigService.load + readPlaintextToken', () => {
  it('returns null when no row exists for the tenant', async () => {
    const svc = new TgConfigService(
      db,
      makeGetMe(async () => ({ botId: 1n, botUsername: 'bot' })),
    );
    expect(await svc.load(null)).toBeNull();
    expect(await svc.readPlaintextToken(null)).toBeNull();
  });

  it('returns the public shape after configure', async () => {
    const svc = new TgConfigService(
      db,
      makeGetMe(async () => ({ botId: 42n, botUsername: 'aiqadam_bot' })),
    );
    const by = randomUUID();
    await svc.configure({ tenant: null, botToken: SAMPLE_TOKEN, configuredBy: by });
    const loaded = await svc.load(null);
    expect(loaded).toMatchObject({
      botId: 42n,
      botUsername: 'aiqadam_bot',
      tenant: null,
      configuredBy: by,
    });
    expect(await svc.readPlaintextToken(null)).toBe(SAMPLE_TOKEN);
  });
});

describe('TgConfigService — key missing', () => {
  it('throws telegram_config_key_missing (503) when env key is unset', async () => {
    // Scrub the env var, reset the env module + service module so the
    // service reads the new env state. The error class compared by
    // identity won't match across re-imports — compare on status + body
    // instead, which is what the wire contract guarantees.
    const stashed = process.env.TG_CONFIG_ENCRYPTION_KEY;
    // biome-ignore lint/performance/noDelete: needed to truly unset process.env entry
    delete process.env.TG_CONFIG_ENCRYPTION_KEY;
    try {
      vi.resetModules();
      const mod = await import('../src/modules/telegram/tg-config.service');
      const svc = new mod.TgConfigService(
        db,
        makeGetMe(async () => ({ botId: 1n, botUsername: 'bot' })),
      );
      try {
        await svc.configure({
          tenant: null,
          botToken: SAMPLE_TOKEN,
          configuredBy: randomUUID(),
        });
        throw new Error('expected configure to throw');
      } catch (err) {
        // HttpException-shaped: getStatus() + getResponse()
        const httpErr = err as { getStatus?: () => number; getResponse?: () => unknown };
        expect(typeof httpErr.getStatus).toBe('function');
        expect(httpErr.getStatus?.()).toBe(503);
        expect(httpErr.getResponse?.()).toEqual({ error: 'telegram_config_key_missing' });
      }
    } finally {
      if (stashed !== undefined) {
        process.env.TG_CONFIG_ENCRYPTION_KEY = stashed;
      }
    }
  });
});
