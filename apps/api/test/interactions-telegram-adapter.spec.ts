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

describe('TelegramAdapter — inline_buttons', () => {
  it('passes a valid inline_buttons array through into the envelope template unchanged', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const buttons = [[{ text: 'Open event page', url: 'https://aiqadam.org/events/abc' }]];
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', inline_buttons: buttons },
    });
    expect(res.state).toBe('sent');

    const rows = await db.select().from(outbox);
    const payload = rows[0]?.payload as { payload: { template: { inline_buttons: unknown } } };
    expect(payload.payload.template.inline_buttons).toEqual(buttons);
  });

  it('defaults inline_buttons to null when omitted (AC-2 backward compatibility)', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi' },
    });
    expect(res.state).toBe('sent');

    const rows = await db.select().from(outbox);
    const payload = rows[0]?.payload as { payload: { template: { inline_buttons: unknown } } };
    expect(payload.payload.template.inline_buttons).toBeNull();
  });
});

describe('TelegramAdapter — inline_buttons size/format bounds (MAJOR-1)', () => {
  it('fails when the outer array has more than 10 rows', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const rows = Array.from({ length: 11 }, (_, i) => [
      { text: `btn${i}`, url: 'https://aiqadam.org/events/abc' },
    ]);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', inline_buttons: rows },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/payload invalid/i);
  });

  it('fails when a single row has more than 10 buttons', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const row = Array.from({ length: 11 }, (_, i) => ({
      text: `btn${i}`,
      url: 'https://aiqadam.org/events/abc',
    }));
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', inline_buttons: [row] },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/payload invalid/i);
  });

  it('passes with a 64-char button text (boundary-exact, inclusive)', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const text64 = 'x'.repeat(64);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: {
        text: 'hi',
        inline_buttons: [[{ text: text64, url: 'https://aiqadam.org/events/abc' }]],
      },
    });
    expect(res.state).toBe('sent');
  });

  it('fails when button text is 65 chars (over the boundary)', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const text65 = 'x'.repeat(65);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: {
        text: 'hi',
        inline_buttons: [[{ text: text65, url: 'https://aiqadam.org/events/abc' }]],
      },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/payload invalid/i);
  });

  it('fails when button url is 2049+ chars', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const longUrl = `https://aiqadam.org/events/${'a'.repeat(2049)}`;
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', inline_buttons: [[{ text: 'Open', url: longUrl }]] },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/payload invalid/i);
  });

  it('fails when button url is malformed (not a valid URL)', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', inline_buttons: [[{ text: 'Open', url: 'not-a-url' }]] },
    });
    expect(res.state).toBe('failed');
    expect(res.failureReason).toMatch(/payload invalid/i);
  });

  // NOTE: 'javascript:alert(1)' is deliberately NOT tested as a rejection
  // case here. Zod's `.url()` is backed by the WHATWG URL parser, which
  // validates well-formedness only (scheme + authority/path shape), not a
  // scheme allowlist — `new URL('javascript:alert(1)')` parses
  // successfully (confirmed directly: z.string().url().safeParse(
  // 'javascript:alert(1)').success === true), so this string legitimately
  // passes `.url()` and reaches 'sent'. The test strategy suggested this
  // case "worth including" but its own framing already flagged that
  // ".url() is what's actually being tested here, not a sanitizer
  // concern" — tracing it further shows .url() doesn't reject this
  // particular string at all, so asserting 'failed' here would be a wrong
  // test, not a real bug: the adapter's payload validation was never
  // meant to be a scheme allowlist, and scheme-smuggling mitigation (if
  // ever needed) belongs in a dedicated check, not folded into this
  // MAJOR-1 size/format-bounds fix. Flagging this here rather than
  // silently asserting the wrong expected value.
});

describe('TelegramAdapter — sanitizer + inline_buttons integration (outbox-durable)', () => {
  it('writes the sanitized text (not the raw input) to the outbox row', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: '<div>hi</div>', parse_mode: 'HTML' },
    });
    expect(res.state).toBe('sent');

    const rows = await db.select().from(outbox);
    const payload = rows[0]?.payload as { payload: { template: { text: string } } };
    expect(payload.payload.template.text).toBe('hi');
  });

  it('never writes an outbox row when inline_buttons is oversized (11 rows)', async () => {
    const publisher = new OutboxPublisher(db);
    const adapter = new TelegramAdapter(publisher, db);
    const rows = Array.from({ length: 11 }, (_, i) => [
      { text: `btn${i}`, url: 'https://aiqadam.org/events/abc' },
    ]);
    const res = await adapter.send({
      recipient: recipient(),
      intent: 'event_announce',
      payload: { text: 'hi', inline_buttons: rows },
    });
    expect(res.state).toBe('failed');

    const outboxRows = await db.select().from(outbox);
    expect(outboxRows).toHaveLength(0);
  });
});
