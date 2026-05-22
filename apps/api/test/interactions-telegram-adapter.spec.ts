import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { TelegramAdapter } from '../src/modules/interactions/channels/telegram-adapter';
import type { ResolvedRecipient } from '../src/modules/interactions/interactions.types';
import { OutboxPublisher } from '../src/modules/telegram/outbox-publisher.service';
import { outbox } from '../src/modules/telegram/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

function recipient(overrides: Partial<ResolvedRecipient> = {}): ResolvedRecipient {
  return {
    userId: randomUUID(),
    email: 'alice@example.com',
    telegramUserId: '12345',
    telegramOptedOutAt: null,
    tenant: 'uz',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete(outbox);
});

describe('TelegramAdapter — policy gates', () => {
  it('skips when recipient has no telegram_user_id linked', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient({ telegramUserId: null }),
      intent: 'event_announce',
      payload: { text: 'hi' },
    });
    expect(res.state).toBe('skipped_policy');
    expect(res.failureReason).toMatch(/no linked telegram/i);
    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(0);
  });

  it('skips when recipient is opted out', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient({ telegramOptedOutAt: '2026-05-01T00:00:00Z' }),
      intent: 'event_announce',
      payload: { text: 'hi' },
    });
    expect(res.state).toBe('skipped_policy');
    expect(res.failureReason).toMatch(/opted out/i);
    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(0);
  });

  it('skips when recipient has no tenant', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient({ tenant: null }),
      intent: 'event_announce',
      payload: { text: 'hi' },
    });
    expect(res.state).toBe('skipped_policy');
    expect(res.failureReason).toMatch(/no tenant/i);
  });
});

describe('TelegramAdapter — payload validation', () => {
  it('fails on empty text', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: '' },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/payload invalid/i);
  });

  it('fails on text over Telegram max length', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'x'.repeat(4097) },
    });
    expect(res.state).toBe('failed');
  });

  it('fails on a bad parse_mode value', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', parse_mode: 'BBcode' },
    });
    expect(res.state).toBe('failed');
  });
});

describe('TelegramAdapter — happy path', () => {
  it('publishes a well-formed envelope to the outbox', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const rec = recipient({ tenant: 'kz' });
    const res = await adapter.send({
      recipient: rec,
      intent: 'event_announce',
      payload: { text: 'AI Drinks KZ on Friday', parse_mode: 'None' },
    });
    expect(res.state).toBe('sent');

    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.stream).toBe('tg.dispatch.v1');
    expect(row?.publishedAt).toBeNull();

    const payload = row?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      schema: 'tg.dispatch.v1',
      producer: 'aiqadam-api',
    });
    const meta = payload.meta as { tenant: string };
    expect(meta.tenant).toBe('kz');

    const inner = payload.payload as {
      kind: string;
      target: { chat_id: number; member_id: string; tenant: string };
      template: { text: string; parse_mode: string };
      delivery_key: string;
    };
    expect(inner.kind).toBe('dm');
    expect(inner.target.chat_id).toBe(12345);
    expect(inner.target.member_id).toBe(rec.userId);
    expect(inner.target.tenant).toBe('kz');
    expect(inner.template.text).toBe('AI Drinks KZ on Friday');
    expect(inner.template.parse_mode).toBe('None');
    expect(inner.delivery_key).toBe(payload.id); // 1:1 with envelope id
  });

  it('uses a fresh envelope_id per call (no producer-side dedupe collision)', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    await adapter.send({
      recipient: recipient(),
      intent: 'a',
      payload: { text: 'one' },
    });
    await adapter.send({
      recipient: recipient(),
      intent: 'b',
      payload: { text: 'two' },
    });
    const rows = await db.select().from(outbox);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.envelopeId).not.toBe(rows[1]?.envelopeId);
  });

  it('surfaces failure when the outbox publish throws', async () => {
    // Fake publisher that rejects.
    const failingPublisher = {
      publish: vi.fn().mockRejectedValue(new Error('db down')),
    } as unknown as OutboxPublisher;
    const adapter = new TelegramAdapter(failingPublisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'announce',
      payload: { text: 'hi' },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/outbox publish failed/i);
  });
});
