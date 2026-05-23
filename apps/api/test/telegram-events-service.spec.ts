import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TelegramEventsService,
  rowToSummary,
} from '../src/modules/telegram/telegram-events.service';

// Phase Bot-B PR-4 — ungated event browse for the bot.
// Contract pinned by sibling repo aiqadam-telegram-bot's EventSummary
// pydantic model (src/aiqadam_telegram_bot/shared/aiqadam_client.py).
// Changes to field names here must coordinate a cross-repo PR.

describe('rowToSummary', () => {
  const base = {
    id: 'evt-1',
    slug: 'ai-qadam-meetup-2026-06',
    title: 'AI Qadam Meetup',
    starts_at: '2026-06-20T03:00:00.000Z',
    location: 'IMPACT.T',
    country: 'uz',
    status: 'published',
    visibility_scope: 'public',
    capacity: 50,
  };

  it('maps the 7 wire fields', () => {
    const out = rowToSummary(base);
    expect(out).toEqual({
      id: 'evt-1',
      slug: 'ai-qadam-meetup-2026-06',
      title: 'AI Qadam Meetup',
      starts_at: '2026-06-20T03:00:00.000Z',
      location: 'IMPACT.T',
      country: 'uz',
      registration_open: true,
    });
  });

  it('falls back slug → id when CMS slug is null (existing events pre-F-S3.10-a)', () => {
    const out = rowToSummary({ ...base, slug: null });
    expect(out.slug).toBe('evt-1');
  });

  it('falls back slug → id when CMS slug is empty string', () => {
    const out = rowToSummary({ ...base, slug: '' });
    expect(out.slug).toBe('evt-1');
  });

  it('preserves null location (virtual events)', () => {
    const out = rowToSummary({ ...base, location: null });
    expect(out.location).toBeNull();
  });
});

describe('TelegramEventsService.listOpenEvents', () => {
  function makeService(getMock: ReturnType<typeof vi.fn>): TelegramEventsService {
    const directus = { get: getMock } as unknown as DirectusClient;
    return new TelegramEventsService(directus);
  }

  it('queries Directus with the 3 published-public-future filters when no tenant', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents(null);

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[status][_eq]=published');
    expect(call).toContain('filter[visibility_scope][_eq]=public');
    expect(call).toContain('filter[starts_at][_gt]=');
    expect(call).not.toContain('filter[country][_eq]=');
    expect(call).toContain('sort=starts_at');
  });

  it('adds country filter when tenant is provided', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents('kz');

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[country][_eq]=kz');
  });

  it('URL-encodes the ISO timestamp in the filter (Directus needs encoded colons)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents(null);

    const call = getMock.mock.calls[0]?.[0] as string;
    // Encoded "T" stays plain; ":" becomes %3A.
    expect(call).toMatch(/filter\[starts_at\]\[_gt\]=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}/);
  });

  it('caps the page at 50 (bot only renders ~10 in inline keyboards anyway)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents(null);

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('limit=50');
  });

  it('returns the mapped EventSummary rows in Directus order', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'evt-a',
          slug: 'a',
          title: 'A',
          starts_at: '2026-07-01T00:00:00Z',
          location: null,
          country: 'uz',
          status: 'published',
          visibility_scope: 'public',
          capacity: null,
        },
        {
          id: 'evt-b',
          slug: null,
          title: 'B',
          starts_at: '2026-07-15T00:00:00Z',
          location: 'Almaty',
          country: 'kz',
          status: 'published',
          visibility_scope: 'public',
          capacity: 100,
        },
      ],
    });
    const svc = makeService(getMock);

    const out = await svc.listOpenEvents(null);

    expect(out).toHaveLength(2);
    expect(out[0]?.slug).toBe('a');
    expect(out[1]?.slug).toBe('evt-b'); // fallback to id
    expect(out[1]?.country).toBe('kz');
  });
});
