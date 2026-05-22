import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import Redis from 'ioredis';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { OutboxPublisher } from '../src/modules/telegram/outbox-publisher.service';
import { OutboxRelayService } from '../src/modules/telegram/outbox-relay.service';
import { outbox } from '../src/modules/telegram/schema';

const dbUrl = inject('TEST_DATABASE_URL');
const redisUrl = inject('TEST_REDIS_URL');

const client = postgres(dbUrl, { max: 4 });
const db = drizzle(client);
const redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 3 });

afterAll(async () => {
  await client.end();
  await redis.quit();
});

const STREAM = 'tg.dispatch.v1';

beforeEach(async () => {
  await db.delete(outbox);
  // Wipe the test stream so XLEN starts at 0 each test.
  await redis.del(STREAM);
});

function makeRelay(): OutboxRelayService {
  return new OutboxRelayService(db, redis);
}

describe('OutboxPublisher.publish', () => {
  it('inserts an envelope inside the caller-supplied transaction', async () => {
    const publisher = new OutboxPublisher(db);
    const envelopeId = randomUUID();
    const ok = await db.transaction(async (tx) =>
      publisher.publish(tx, {
        envelopeId,
        stream: STREAM,
        payload: { schema: 'tg.dispatch.v1', id: envelopeId },
      }),
    );
    expect(ok).toBe(true);
    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ envelopeId, stream: STREAM, publishedAt: null });
  });

  it('returns false on duplicate envelope_id (idempotent producer retry)', async () => {
    const publisher = new OutboxPublisher(db);
    const envelopeId = randomUUID();
    const payload = { schema: 'tg.dispatch.v1', id: envelopeId };

    const first = await db.transaction(async (tx) =>
      publisher.publish(tx, { envelopeId, stream: STREAM, payload }),
    );
    const second = await db.transaction(async (tx) =>
      publisher.publish(tx, { envelopeId, stream: STREAM, payload }),
    );
    expect(first).toBe(true);
    expect(second).toBe(false);

    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(1);
  });
});

describe('OutboxRelayService.runOnce — happy path', () => {
  it('publishes pending rows to the Redis Stream and stamps published_at', async () => {
    const publisher = new OutboxPublisher(db);
    const envelopeId = randomUUID();
    const payload = {
      schema: 'tg.dispatch.v1',
      id: envelopeId,
      occurred_at: '2026-05-22T10:00:00Z',
      correlation_id: randomUUID(),
      producer: 'aiqadam-api',
      meta: { tenant: 'uz' },
      payload: { kind: 'dm', target: { chat_id: 12345 } },
    };
    await db.transaction(async (tx) =>
      publisher.publish(tx, { envelopeId, stream: STREAM, payload }),
    );

    const relay = makeRelay();
    const n = await relay.runOnce();
    expect(n).toBe(1);

    // The row got stamped.
    const rows = await db.select().from(outbox);
    expect(rows[0]?.publishedAt).toBeTruthy();
    expect(rows[0]?.attempts).toBe(1);

    // The stream actually has the entry.
    const len = await redis.xlen(STREAM);
    expect(len).toBe(1);

    // The entry payload is the JSON-serialized envelope under field 'envelope'.
    const entries = await redis.xrange(STREAM, '-', '+');
    expect(entries).toHaveLength(1);
    const [, fields] = entries[0] ?? [];
    expect(fields).toBeDefined();
    // fields is a flat [k,v,k,v,...] array. Find 'envelope'.
    const idx = fields?.indexOf('envelope') ?? -1;
    expect(idx).toBeGreaterThanOrEqual(0);
    const wire = fields?.[idx + 1] ?? '';
    const parsed = JSON.parse(wire);
    expect(parsed).toMatchObject({
      schema: 'tg.dispatch.v1',
      id: envelopeId,
      producer: 'aiqadam-api',
    });
  });

  it('returns 0 on an empty outbox without touching the stream', async () => {
    const relay = makeRelay();
    const n = await relay.runOnce();
    expect(n).toBe(0);
    expect(await redis.xlen(STREAM)).toBe(0);
  });

  it('only publishes unpublished rows — re-running does not double-send', async () => {
    const publisher = new OutboxPublisher(db);
    const envelopeId = randomUUID();
    await db.transaction(async (tx) =>
      publisher.publish(tx, {
        envelopeId,
        stream: STREAM,
        payload: { schema: 'tg.dispatch.v1', id: envelopeId },
      }),
    );
    const relay = makeRelay();
    await relay.runOnce();
    await relay.runOnce();
    expect(await redis.xlen(STREAM)).toBe(1);
  });

  it('publishes multiple pending rows in createdAt order', async () => {
    const publisher = new OutboxPublisher(db);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of ids) {
      await db.transaction(async (tx) =>
        publisher.publish(tx, {
          envelopeId: id,
          stream: STREAM,
          payload: { schema: 'tg.dispatch.v1', id },
        }),
      );
    }
    const relay = makeRelay();
    const n = await relay.runOnce();
    expect(n).toBe(3);
    expect(await redis.xlen(STREAM)).toBe(3);

    // Order on the stream should match insertion order.
    const entries = await redis.xrange(STREAM, '-', '+');
    const wireIds = entries.map(([, fields]) => {
      const idx = fields.indexOf('envelope');
      return idx >= 0 ? JSON.parse(fields[idx + 1] ?? '').id : null;
    });
    expect(wireIds).toEqual(ids);
  });
});

describe('OutboxRelayService — failure modes', () => {
  it('survives an XADD failure: row stays unpublished, attempts++, last_error set', async () => {
    const publisher = new OutboxPublisher(db);
    const envelopeId = randomUUID();
    await db.transaction(async (tx) =>
      publisher.publish(tx, {
        envelopeId,
        stream: STREAM,
        payload: { schema: 'tg.dispatch.v1', id: envelopeId },
      }),
    );
    // Construct a relay with a broken Redis client whose xadd throws.
    // We don't want to actually disconnect the shared client (would
    // poison other tests) — pass a stub.
    const stubRedis = {
      xadd: () => Promise.reject(new Error('simulated XADD failure')),
      on: () => undefined,
    } as unknown as Redis;
    const relay = new OutboxRelayService(db, stubRedis);
    const n = await relay.runOnce();
    expect(n).toBe(0); // nothing published

    const [row] = await db.select().from(outbox);
    expect(row?.publishedAt).toBeNull();
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain('simulated XADD failure');
  });
});

describe('OutboxRelayService.pendingCount', () => {
  it('counts unpublished rows', async () => {
    const publisher = new OutboxPublisher(db);
    const relay = makeRelay();
    expect(await relay.pendingCount()).toBe(0);

    await db.transaction(async (tx) =>
      publisher.publish(tx, {
        envelopeId: randomUUID(),
        stream: STREAM,
        payload: {},
      }),
    );
    expect(await relay.pendingCount()).toBe(1);

    await relay.runOnce();
    expect(await relay.pendingCount()).toBe(0);
  });
});
