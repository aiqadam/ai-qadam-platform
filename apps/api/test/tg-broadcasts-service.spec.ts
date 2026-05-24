import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TgBroadcastsService,
  nextRecurrenceAnchor,
  normalizeRecurrence,
  rowToDetail,
  rowToSummary,
  sanitizeButtons,
} from '../src/modules/workspace/tg-broadcasts.service';

// #294 PR-a — operator-authored Telegram broadcasts cabinet (read view).

function fakeDirectus(get: ReturnType<typeof vi.fn>): DirectusClient {
  return { get } as unknown as DirectusClient;
}

const ROW = {
  id: 'bdc-1',
  title: 'July UZ meetup reminder',
  country: 'uz',
  status: 'draft' as const,
  html_body: '<b>See you tomorrow!</b>',
  image_asset: null,
  inline_buttons: [
    { label: 'Register', url: 'https://aiqadam.org/events/july' },
    { label: 'Map', url: 'https://maps.app.goo.gl/abc' },
  ],
  audience_segment: null,
  scheduled_at: null,
  sent_at: null,
  sent_count: null,
  failure_reason: null,
  recurrence: 'none' as const,
  created_by: 'usr-1',
  date_created: '2026-05-24T12:00:00.000Z',
  date_updated: null,
};

describe('sanitizeButtons', () => {
  it('returns [] for non-array input', () => {
    expect(sanitizeButtons(null)).toEqual([]);
    expect(sanitizeButtons('oops')).toEqual([]);
    expect(sanitizeButtons({})).toEqual([]);
    expect(sanitizeButtons(undefined)).toEqual([]);
  });

  it('keeps valid {label,url} entries and drops empty / malformed ones', () => {
    const out = sanitizeButtons([
      { label: 'OK', url: 'https://x.test' },
      { label: '', url: 'https://x.test' }, // empty label dropped
      { label: 'No URL', url: '' }, // empty url dropped
      'string', // not an object
      { label: 12, url: 13 }, // wrong types
      { label: 'OK2', url: 'https://x.test' },
    ]);
    expect(out).toEqual([
      { label: 'OK', url: 'https://x.test' },
      { label: 'OK2', url: 'https://x.test' },
    ]);
  });

  it('trims whitespace in label + url', () => {
    const out = sanitizeButtons([{ label: '  Trim me  ', url: '  https://x.test  ' }]);
    expect(out).toEqual([{ label: 'Trim me', url: 'https://x.test' }]);
  });

  it('truncates to max 8 buttons (Telegram inline keyboard limit)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      label: `btn-${i}`,
      url: 'https://x.test',
    }));
    expect(sanitizeButtons(many)).toHaveLength(8);
  });
});

describe('rowToSummary', () => {
  it('maps the wire fields + derives has_image + inline_buttons_count', () => {
    const out = rowToSummary(ROW);
    expect(out).toMatchObject({
      id: 'bdc-1',
      title: 'July UZ meetup reminder',
      country: 'uz',
      status: 'draft',
      sent_count: 0,
      has_image: false,
      inline_buttons_count: 2,
    });
  });

  it('reports has_image=true when image_asset is set', () => {
    const out = rowToSummary({ ...ROW, image_asset: 'file-uuid' });
    expect(out.has_image).toBe(true);
  });

  it('defaults sent_count to 0 when row has null', () => {
    const out = rowToSummary({ ...ROW, sent_count: null });
    expect(out.sent_count).toBe(0);
  });
});

describe('rowToDetail', () => {
  it('includes html_body + sanitized inline_buttons', () => {
    const out = rowToDetail(ROW);
    expect(out.html_body).toBe('<b>See you tomorrow!</b>');
    expect(out.inline_buttons).toEqual([
      { label: 'Register', url: 'https://aiqadam.org/events/july' },
      { label: 'Map', url: 'https://maps.app.goo.gl/abc' },
    ]);
  });

  it('falls through bad inline_buttons JSON to []', () => {
    const out = rowToDetail({ ...ROW, inline_buttons: 'not-an-array' });
    expect(out.inline_buttons).toEqual([]);
    expect(out.inline_buttons_count).toBe(0);
  });
});

describe('TgBroadcastsService.list', () => {
  it('queries /items/tg_broadcasts with sort=-date_created + limit=200', async () => {
    const get = vi.fn().mockResolvedValue({ data: [ROW] });
    const svc = new TgBroadcastsService(fakeDirectus(get));
    const out = await svc.list();
    const call = get.mock.calls[0]?.[0] as string;
    expect(call).toContain('/items/tg_broadcasts');
    expect(call).toContain('sort=-date_created');
    expect(call).toContain('limit=200');
    expect(out.items).toHaveLength(1);
  });

  it('adds country filter when provided', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TgBroadcastsService(fakeDirectus(get));
    await svc.list({ country: 'uz' });
    expect(get.mock.calls[0]?.[0] as string).toContain('filter[country][_eq]=uz');
  });

  it('adds status filter when provided', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TgBroadcastsService(fakeDirectus(get));
    await svc.list({ status: 'scheduled' });
    expect(get.mock.calls[0]?.[0] as string).toContain('filter[status][_eq]=scheduled');
  });

  it('omits filters when not provided', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TgBroadcastsService(fakeDirectus(get));
    await svc.list({});
    const call = get.mock.calls[0]?.[0] as string;
    expect(call).not.toContain('filter[country]');
    expect(call).not.toContain('filter[status]');
  });
});

describe('TgBroadcastsService.get', () => {
  it('returns the full detail shape', async () => {
    const get = vi.fn().mockResolvedValue({ data: ROW });
    const svc = new TgBroadcastsService(fakeDirectus(get));
    const out = await svc.get('bdc-1');
    expect(out.id).toBe('bdc-1');
    expect(out.html_body).toContain('See you tomorrow');
    expect(out.inline_buttons).toHaveLength(2);
  });

  it('throws NotFoundException with {error:"broadcast_not_found"} when missing', async () => {
    const get = vi.fn().mockResolvedValue({ data: null });
    const svc = new TgBroadcastsService(fakeDirectus(get));
    await expect(svc.get('missing-id')).rejects.toThrow(NotFoundException);
  });
});

// ─── #294 PR-b — create + update ───────────────────────────────────────────

function fakeDirectusFull(opts: {
  get?: ReturnType<typeof vi.fn>;
  post?: ReturnType<typeof vi.fn>;
  patch?: ReturnType<typeof vi.fn>;
}): DirectusClient {
  return {
    get: opts.get ?? vi.fn(),
    post: opts.post ?? vi.fn(),
    patch: opts.patch ?? vi.fn(),
  } as unknown as DirectusClient;
}

describe('TgBroadcastsService.create', () => {
  it('POSTs to /items/tg_broadcasts with status=draft and sanitized buttons', async () => {
    const post = vi.fn().mockResolvedValue({ data: { ...ROW, id: 'new-id' } });
    const svc = new TgBroadcastsService(fakeDirectusFull({ post }));
    const out = await svc.create({
      title: 'New broadcast',
      country: 'uz',
      html_body: '<b>Hi</b>',
      inline_buttons: [
        { label: 'OK', url: 'https://x.test' },
        { label: '', url: 'https://x.test' }, // dropped by sanitize
      ],
    });
    expect(post).toHaveBeenCalledWith(
      '/items/tg_broadcasts',
      expect.objectContaining({
        title: 'New broadcast',
        country: 'uz',
        status: 'draft',
        html_body: '<b>Hi</b>',
        inline_buttons: [{ label: 'OK', url: 'https://x.test' }],
      }),
    );
    expect(out.id).toBe('new-id');
  });

  it('defaults inline_buttons to [] when omitted', async () => {
    const post = vi.fn().mockResolvedValue({ data: ROW });
    const svc = new TgBroadcastsService(fakeDirectusFull({ post }));
    await svc.create({ title: 't', country: 'uz', html_body: 'x' });
    const body = post.mock.calls[0]?.[1] as { inline_buttons: unknown[] };
    expect(body.inline_buttons).toEqual([]);
  });
});

describe('TgBroadcastsService.update', () => {
  it('PATCHes only the provided fields', async () => {
    const get = vi.fn().mockResolvedValue({ data: ROW });
    const patch = vi.fn().mockResolvedValue({ data: { ...ROW, title: 'Renamed' } });
    const svc = new TgBroadcastsService(fakeDirectusFull({ get, patch }));
    const out = await svc.update('bdc-1', { title: 'Renamed' });
    expect(patch).toHaveBeenCalledWith(
      '/items/tg_broadcasts/bdc-1',
      expect.objectContaining({ title: 'Renamed' }),
    );
    // Other fields are NOT in the patch body.
    const body = patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('html_body');
    expect(body).not.toHaveProperty('inline_buttons');
    expect(out.title).toBe('Renamed');
  });

  it('rejects update when status is sent/sending/failed', async () => {
    const get = vi.fn().mockResolvedValue({ data: { ...ROW, status: 'sent' } });
    const patch = vi.fn();
    const svc = new TgBroadcastsService(fakeDirectusFull({ get, patch }));
    await expect(svc.update('bdc-1', { title: 'X' })).rejects.toThrow(BadRequestException);
    expect(patch).not.toHaveBeenCalled();
  });

  it('rejects status=scheduled when scheduled_at is in the past', async () => {
    const get = vi.fn().mockResolvedValue({ data: ROW });
    const patch = vi.fn();
    const svc = new TgBroadcastsService(fakeDirectusFull({ get, patch }));
    await expect(
      svc.update('bdc-1', { status: 'scheduled', scheduled_at: '2000-01-01T00:00:00Z' }),
    ).rejects.toThrow(BadRequestException);
    expect(patch).not.toHaveBeenCalled();
  });

  it('rejects status=scheduled when neither scheduled_at provided nor on row', async () => {
    const get = vi.fn().mockResolvedValue({ data: { ...ROW, scheduled_at: null } });
    const patch = vi.fn();
    const svc = new TgBroadcastsService(fakeDirectusFull({ get, patch }));
    await expect(svc.update('bdc-1', { status: 'scheduled' })).rejects.toThrow(BadRequestException);
  });

  it('accepts status=scheduled with future scheduled_at', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const get = vi.fn().mockResolvedValue({ data: ROW });
    const patch = vi.fn().mockResolvedValue({
      data: { ...ROW, status: 'scheduled', scheduled_at: future },
    });
    const svc = new TgBroadcastsService(fakeDirectusFull({ get, patch }));
    const out = await svc.update('bdc-1', { status: 'scheduled', scheduled_at: future });
    expect(out.status).toBe('scheduled');
    expect(out.scheduled_at).toBe(future);
  });

  it('sanitizes inline_buttons on update', async () => {
    const get = vi.fn().mockResolvedValue({ data: ROW });
    const patch = vi.fn().mockResolvedValue({ data: ROW });
    const svc = new TgBroadcastsService(fakeDirectusFull({ get, patch }));
    await svc.update('bdc-1', {
      inline_buttons: [
        { label: 'OK', url: 'https://x.test' },
        { label: '', url: 'https://x.test' }, // dropped
      ],
    });
    const body = patch.mock.calls[0]?.[1] as { inline_buttons: unknown[] };
    expect(body.inline_buttons).toEqual([{ label: 'OK', url: 'https://x.test' }]);
  });
});

// ─── #294 PR-e — recurrence helpers ──────────────────────────────────────

describe('normalizeRecurrence', () => {
  it('passes through weekly + monthly', () => {
    expect(normalizeRecurrence('weekly')).toBe('weekly');
    expect(normalizeRecurrence('monthly')).toBe('monthly');
  });
  it('falls back to none for null/undefined/unknown', () => {
    expect(normalizeRecurrence(null)).toBe('none');
    expect(normalizeRecurrence(undefined)).toBe('none');
    expect(normalizeRecurrence('daily')).toBe('none');
    expect(normalizeRecurrence('')).toBe('none');
  });
});

describe('nextRecurrenceAnchor', () => {
  it('returns null for none', () => {
    expect(nextRecurrenceAnchor('2026-07-01T12:00:00.000Z', 'none')).toBeNull();
  });
  it('adds 7 days for weekly', () => {
    expect(nextRecurrenceAnchor('2026-07-01T12:00:00.000Z', 'weekly')).toBe(
      '2026-07-08T12:00:00.000Z',
    );
  });
  it('adds 1 month for monthly (UTC-aware)', () => {
    expect(nextRecurrenceAnchor('2026-07-01T12:00:00.000Z', 'monthly')).toBe(
      '2026-08-01T12:00:00.000Z',
    );
  });
  it('returns null for malformed input', () => {
    expect(nextRecurrenceAnchor('not-a-date', 'weekly')).toBeNull();
  });
});

describe('rowToSummary — recurrence', () => {
  it('surfaces normalized recurrence', () => {
    const out = rowToSummary({ ...ROW, recurrence: 'weekly' });
    expect(out.recurrence).toBe('weekly');
  });
  it('defaults to none when row column is null', () => {
    const out = rowToSummary({ ...ROW, recurrence: null });
    expect(out.recurrence).toBe('none');
  });
});
