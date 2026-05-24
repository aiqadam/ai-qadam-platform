import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TgBroadcastsService,
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
