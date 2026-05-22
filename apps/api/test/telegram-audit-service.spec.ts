import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import type { EmailService } from '../src/modules/email/email.service';
import { tgSendLog } from '../src/modules/telegram/schema';
import { TelegramService } from '../src/modules/telegram/telegram.service';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

function makeService(): TelegramService {
  const fakeDirectus = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as DirectusClient;
  const fakeEmails = { send: vi.fn() } as unknown as EmailService;
  return new TelegramService(db, fakeDirectus, fakeEmails);
}

beforeEach(async () => {
  await db.delete(tgSendLog);
});

describe('TelegramService.recordSendAudit', () => {
  it('inserts a first audit for an unseen delivery_key', async () => {
    const service = makeService();
    const envelopeId = randomUUID();
    const result = await service.recordSendAudit({
      deliveryKey: 'interaction-1:member-7',
      envelopeId,
      outcome: 'sent',
      detail: null,
      messageId: 9001n,
    });
    expect(result).toEqual({
      accepted: true,
      inserted: true,
      existingOutcome: null,
    });

    const rows = await db.select().from(tgSendLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deliveryKey: 'interaction-1:member-7',
      envelopeId,
      outcome: 'sent',
      messageId: 9001n,
    });
  });

  it('is idempotent on replay — same delivery_key, same outcome', async () => {
    const service = makeService();
    const key = 'broadcast-9:member-3';
    const envelopeId = randomUUID();
    await service.recordSendAudit({
      deliveryKey: key,
      envelopeId,
      outcome: 'sent',
      detail: null,
      messageId: 100n,
    });
    const replay = await service.recordSendAudit({
      deliveryKey: key,
      envelopeId,
      outcome: 'sent',
      detail: null,
      messageId: 100n,
    });
    expect(replay).toEqual({
      accepted: true,
      inserted: false,
      existingOutcome: 'sent',
    });
    const rows = await db.select().from(tgSendLog);
    expect(rows).toHaveLength(1);
  });

  it('first-audit-wins when a replay has a different outcome', async () => {
    const service = makeService();
    const key = 'broadcast-9:member-4';
    // First: a transient retry outcome was recorded.
    await service.recordSendAudit({
      deliveryKey: key,
      envelopeId: randomUUID(),
      outcome: 'retry',
      detail: 'retry_after=30',
      messageId: null,
    });
    // Then the notifier (or its replacement) recovered + delivered.
    // The audit endpoint must not overwrite the original — the
    // notifier handles divergence by reading existingOutcome.
    const replay = await service.recordSendAudit({
      deliveryKey: key,
      envelopeId: randomUUID(),
      outcome: 'sent',
      detail: null,
      messageId: 200n,
    });
    expect(replay).toEqual({
      accepted: true,
      inserted: false,
      existingOutcome: 'retry',
    });
    const rows = await db.select().from(tgSendLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('retry'); // unchanged
  });

  it('persists detail on terminal failure outcomes', async () => {
    const service = makeService();
    await service.recordSendAudit({
      deliveryKey: 'broadcast-9:member-5',
      envelopeId: randomUUID(),
      outcome: 'blocked',
      detail: 'Forbidden: bot was blocked by the user',
      messageId: null,
    });
    const [row] = await db.select().from(tgSendLog);
    expect(row?.outcome).toBe('blocked');
    expect(row?.detail).toContain('blocked by the user');
    expect(row?.messageId).toBeNull();
  });

  it('round-trips a bigint message_id', async () => {
    const service = makeService();
    // Realistic large Telegram message_id.
    const big = 1234567890123456n;
    await service.recordSendAudit({
      deliveryKey: 'broadcast-9:member-6',
      envelopeId: randomUUID(),
      outcome: 'sent',
      detail: null,
      messageId: big,
    });
    const [row] = await db.select().from(tgSendLog);
    expect(row?.messageId).toBe(big);
  });
});
