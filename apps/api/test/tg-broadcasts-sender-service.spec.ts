import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { buttonsToWire, parseChatId } from '../src/modules/workspace/tg-broadcasts-sender.service';

// #294 PR-d — pure helpers + behavior-of-record tests.
// Full integration coverage of sendNow lives behind a Testcontainers
// integration test (outbox tx semantics need real Postgres). The
// helpers here are the deterministic surface.

describe('parseChatId', () => {
  it('accepts a positive number', () => {
    expect(parseChatId(123456789)).toBe(123456789);
  });
  it('accepts a positive digit-string', () => {
    expect(parseChatId('123456789')).toBe(123456789);
  });
  it('returns null for null / undefined / empty', () => {
    expect(parseChatId(null)).toBeNull();
    expect(parseChatId(undefined)).toBeNull();
    expect(parseChatId('')).toBeNull();
  });
  it('returns null for zero', () => {
    expect(parseChatId(0)).toBeNull();
    expect(parseChatId('0')).toBeNull();
  });
  it('returns null for non-numeric strings', () => {
    expect(parseChatId('not-a-number')).toBeNull();
  });
});

describe('buttonsToWire', () => {
  it('maps each button to a one-button row (single-column grid)', () => {
    const out = buttonsToWire([
      { label: 'Register', url: 'https://example.test/register' },
      { label: 'Map', url: 'https://maps.app.goo.gl/abc' },
    ]);
    expect(out).toEqual([
      [{ text: 'Register', url: 'https://example.test/register' }],
      [{ text: 'Map', url: 'https://maps.app.goo.gl/abc' }],
    ]);
  });
  it('returns [] for empty input', () => {
    expect(buttonsToWire([])).toEqual([]);
  });
});

// ─── sendNow guard-rail tests (mocked deps) ──────────────────────────────

describe('TgBroadcastsSenderService.sendNow guards', () => {
  // Lazy-import the service so we can mock its constructor deps cleanly.
  async function makeService(broadcastFixture: {
    status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
    html_body?: string;
    audience_segment?: string | null;
    failure_reason?: string | null;
  }) {
    const { TgBroadcastsSenderService } = await import(
      '../src/modules/workspace/tg-broadcasts-sender.service'
    );
    const fakeBdc = {
      id: 'bdc-1',
      title: 't',
      country: 'uz',
      status: broadcastFixture.status,
      html_body: broadcastFixture.html_body ?? '<b>body</b>',
      image_asset: null,
      inline_buttons: [],
      audience_segment: broadcastFixture.audience_segment ?? null,
      scheduled_at: null,
      sent_at: null,
      sent_count: 0,
      failure_reason: broadcastFixture.failure_reason ?? null,
      has_image: false,
      inline_buttons_count: 0,
      created_by: null,
      date_created: '2026-05-25T00:00:00Z',
      date_updated: null,
    };
    const broadcasts = { get: vi.fn().mockResolvedValue(fakeBdc) };
    const segments = { get: vi.fn() };
    const directus = { get: vi.fn(), patch: vi.fn() };
    const outbox = { publish: vi.fn() };
    const db = { transaction: vi.fn() };
    const svc = new TgBroadcastsSenderService(
      directus as never,
      broadcasts as never,
      segments as never,
      outbox as never,
      db as never,
    );
    return { svc, broadcasts, segments, directus, outbox, db };
  }

  it('rejects with already_sent when status=sent', async () => {
    const { svc } = await makeService({ status: 'sent' });
    await expect(svc.sendNow('bdc-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects with in_progress when status=sending', async () => {
    const { svc } = await makeService({ status: 'sending' });
    await expect(svc.sendNow('bdc-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects with previous_send_failed when status=failed', async () => {
    const { svc } = await makeService({ status: 'failed', failure_reason: 'oops' });
    await expect(svc.sendNow('bdc-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects with no_audience_segment when segment is null', async () => {
    const { svc } = await makeService({ status: 'draft', audience_segment: null });
    await expect(svc.sendNow('bdc-1')).rejects.toThrow(BadRequestException);
  });

  it('rejects with empty_body when html_body is empty', async () => {
    const { svc } = await makeService({
      status: 'draft',
      html_body: '',
      audience_segment: '11111111-1111-4111-8111-111111111111',
    });
    await expect(svc.sendNow('bdc-1')).rejects.toThrow(BadRequestException);
  });
});
