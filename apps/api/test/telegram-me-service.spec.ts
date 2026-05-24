import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TelegramMeService,
  rowToWire,
  sortFutureFirst,
} from '../src/modules/telegram/telegram-me.service';

// aiqadam#281 Part 1 — /me/registrations contract pinned by the bot's
// pydantic MyRegistration[] response. Field renames here require a
// coordinated cross-repo PR.

function fakeDirectus(getMock: ReturnType<typeof vi.fn>): DirectusClient {
  return { get: getMock } as unknown as DirectusClient;
}

// ─── rowToWire ──────────────────────────────────────────────────────────────

describe('rowToWire', () => {
  const baseEvent = {
    id: 'evt-1',
    slug: 'ai-meetup',
    title: 'AI Meetup',
    starts_at: '2026-06-20T03:00:00.000Z',
    location: 'IMPACT.T',
  };

  it('maps the 5 wire fields and nests the event', () => {
    const out = rowToWire({ id: 'reg-1', checked_in_at: null, checkin_code: 'CHK-123' }, baseEvent);
    expect(out.registration_id).toBe('reg-1');
    expect(out.event).toEqual({
      id: 'evt-1',
      slug: 'ai-meetup',
      title: 'AI Meetup',
      starts_at: '2026-06-20T03:00:00.000Z',
      location: 'IMPACT.T',
    });
    expect(out.checked_in_at).toBeNull();
    expect(out.qr_token).toBe('CHK-123');
    expect(out.web_url).toMatch(/\/me\/registrations\/reg-1$/);
  });

  it('falls back slug → event id when CMS slug is null', () => {
    const out = rowToWire(
      { id: 'reg-1', checked_in_at: null, checkin_code: null },
      { ...baseEvent, slug: null },
    );
    expect(out.event.slug).toBe('evt-1');
  });

  it('falls back slug → event id when CMS slug is empty string', () => {
    const out = rowToWire(
      { id: 'reg-1', checked_in_at: null, checkin_code: null },
      { ...baseEvent, slug: '' },
    );
    expect(out.event.slug).toBe('evt-1');
  });

  it('hides qr_token when already checked in (no leak of usable code)', () => {
    const out = rowToWire(
      { id: 'reg-1', checked_in_at: '2026-06-20T03:30:00.000Z', checkin_code: 'CHK-123' },
      baseEvent,
    );
    expect(out.qr_token).toBeNull();
    expect(out.checked_in_at).toBe('2026-06-20T03:30:00.000Z');
  });

  it('exposes null qr_token when no code was issued (virtual event)', () => {
    const out = rowToWire({ id: 'reg-1', checked_in_at: null, checkin_code: null }, baseEvent);
    expect(out.qr_token).toBeNull();
  });
});

// ─── sortFutureFirst ────────────────────────────────────────────────────────

describe('sortFutureFirst', () => {
  function make(id: string, startsAt: string) {
    return {
      registration_id: id,
      event: { id, slug: id, title: id, starts_at: startsAt, location: null },
      checked_in_at: null,
      qr_token: null,
      web_url: '',
    };
  }

  it('puts future events before past events', () => {
    const past = make('p', '2020-01-01T00:00:00.000Z');
    const future = make('f', '2999-12-31T00:00:00.000Z');
    const out = sortFutureFirst([past, future]);
    expect(out.map((r) => r.registration_id)).toEqual(['f', 'p']);
  });

  it('orders future events closest-first', () => {
    const farFuture = make('far', '2999-12-31T00:00:00.000Z');
    const nearFuture = make('near', '2099-01-01T00:00:00.000Z');
    const out = sortFutureFirst([farFuture, nearFuture]);
    expect(out.map((r) => r.registration_id)).toEqual(['near', 'far']);
  });

  it('orders past events most-recent-first', () => {
    const old = make('old', '2010-01-01T00:00:00.000Z');
    const recent = make('recent', '2024-01-01T00:00:00.000Z');
    const out = sortFutureFirst([old, recent]);
    expect(out.map((r) => r.registration_id)).toEqual(['recent', 'old']);
  });

  it('mixes future + past correctly', () => {
    const items = [
      make('past-old', '2010-01-01T00:00:00.000Z'),
      make('future-far', '2999-12-31T00:00:00.000Z'),
      make('past-recent', '2024-01-01T00:00:00.000Z'),
      make('future-near', '2099-01-01T00:00:00.000Z'),
    ];
    const out = sortFutureFirst(items);
    expect(out.map((r) => r.registration_id)).toEqual([
      'future-near',
      'future-far',
      'past-recent',
      'past-old',
    ]);
  });
});

// ─── listMyRegistrations ────────────────────────────────────────────────────

describe('TelegramMeService.listMyRegistrations', () => {
  const ROW = {
    id: 'reg-1',
    status: 'registered',
    checked_in_at: null,
    checkin_code: 'CHK-1',
    event: {
      id: 'evt-1',
      slug: 'ai-meetup',
      title: 'AI Meetup',
      starts_at: '2099-06-20T03:00:00.000Z',
      location: 'IMPACT.T',
    },
  };

  it('queries Directus with tg_user_id + excludes cancelled + nested event fields', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [ROW] });
    const svc = new TelegramMeService(fakeDirectus(getMock));

    await svc.listMyRegistrations(BigInt(52128246));

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[telegram_user_id][_eq]=52128246');
    expect(call).toContain('filter[status][_neq]=cancelled');
    expect(call).toContain(
      'fields=id,status,checked_in_at,checkin_code,event.id,event.slug,event.title,event.starts_at,event.location',
    );
  });

  it('returns the rows mapped to the wire shape', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [ROW] });
    const svc = new TelegramMeService(fakeDirectus(getMock));

    const out = await svc.listMyRegistrations(BigInt(52128246));

    expect(out).toHaveLength(1);
    expect(out[0]?.registration_id).toBe('reg-1');
    expect(out[0]?.event.id).toBe('evt-1');
    expect(out[0]?.qr_token).toBe('CHK-1');
  });

  it('returns empty array when the user has no registrations', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramMeService(fakeDirectus(getMock));

    const out = await svc.listMyRegistrations(BigInt(1));

    expect(out).toEqual([]);
  });

  it('skips rows whose event has been deleted (event=null)', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [ROW, { ...ROW, id: 'reg-orphan', event: null }],
    });
    const svc = new TelegramMeService(fakeDirectus(getMock));

    const out = await svc.listMyRegistrations(BigInt(52128246));

    expect(out).toHaveLength(1);
    expect(out[0]?.registration_id).toBe('reg-1');
  });

  it('returns events sorted future-first', async () => {
    const future = { ...ROW, id: 'reg-future' };
    const past = {
      ...ROW,
      id: 'reg-past',
      event: { ...ROW.event, id: 'evt-past', starts_at: '2010-01-01T00:00:00.000Z' },
    };
    const getMock = vi.fn().mockResolvedValue({ data: [past, future] });
    const svc = new TelegramMeService(fakeDirectus(getMock));

    const out = await svc.listMyRegistrations(BigInt(52128246));

    expect(out.map((r) => r.registration_id)).toEqual(['reg-future', 'reg-past']);
  });
});
