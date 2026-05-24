import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TelegramEventsService,
  rowToSummary,
  sanitizeMediaItems,
  speakerDisplayName,
  speakerTitle,
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

    await svc.listOpenEvents({});

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

    await svc.listOpenEvents({ tenant: 'kz' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[country][_eq]=kz');
  });

  it('URL-encodes the ISO timestamp in the filter (Directus needs encoded colons)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({});

    const call = getMock.mock.calls[0]?.[0] as string;
    // Encoded "T" stays plain; ":" becomes %3A.
    expect(call).toMatch(/filter\[starts_at\]\[_gt\]=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}/);
  });

  it('caps the page at 50 (bot only renders ~10 in inline keyboards anyway)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({});

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

    const out = await svc.listOpenEvents({});

    expect(out).toHaveLength(2);
    expect(out[0]?.slug).toBe('a');
    expect(out[1]?.slug).toBe('evt-b'); // fallback to id
    expect(out[1]?.country).toBe('kz');
  });
});

// ─── aiqadam#287 — per-caller registration annotation ────────────────────────

describe('TelegramEventsService.listOpenEvents — is_registered annotation', () => {
  function makeService(getMock: ReturnType<typeof vi.fn>): TelegramEventsService {
    const directus = { get: getMock } as unknown as DirectusClient;
    return new TelegramEventsService(directus);
  }

  const TWO_EVENTS = [
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
      registration_open: true,
    },
    {
      id: 'evt-b',
      slug: 'b',
      title: 'B',
      starts_at: '2026-07-15T00:00:00Z',
      location: 'Almaty',
      country: 'kz',
      status: 'published',
      visibility_scope: 'public',
      capacity: 100,
      registration_open: true,
    },
  ];

  it('does NOT call the registrations endpoint when tg_user_id is null (backward compat)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: TWO_EVENTS });
    const svc = makeService(getMock);

    const out = await svc.listOpenEvents({});

    expect(getMock).toHaveBeenCalledTimes(1);
    // Neither field is set on any item (response shape stays unchanged).
    expect(out.every((e) => !('is_registered' in e))).toBe(true);
  });

  it('annotates is_registered=true + registration_id for events the tg_user_id is registered for', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: TWO_EVENTS })
      .mockResolvedValueOnce({
        data: [{ id: 'reg-99', event: 'evt-a' }],
      });
    const svc = makeService(getMock);

    const out = await svc.listOpenEvents({ tgUserId: BigInt(12345) });

    expect(out[0]).toMatchObject({
      id: 'evt-a',
      is_registered: true,
      registration_id: 'reg-99',
    });
    expect(out[1]).toMatchObject({ id: 'evt-b', is_registered: false });
    expect(out[1]?.registration_id).toBeUndefined();
  });

  it('annotates is_registered=false for events not registered for', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: TWO_EVENTS })
      .mockResolvedValueOnce({ data: [] });
    const svc = makeService(getMock);

    const out = await svc.listOpenEvents({ tgUserId: BigInt(12345) });

    expect(out.every((e) => e.is_registered === false)).toBe(true);
    expect(out.every((e) => e.registration_id === undefined)).toBe(true);
  });

  it('queries registrations with the tg_user_id + event _in filter + excludes cancelled', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: TWO_EVENTS })
      .mockResolvedValueOnce({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ tgUserId: BigInt(8888) });

    const call = getMock.mock.calls[1]?.[0] as string;
    expect(call).toContain('filter[user][telegram_user_id][_eq]=8888');
    expect(call).toContain('filter[event][_in]=evt-a,evt-b');
    expect(call).toContain('filter[status][_neq]=cancelled');
  });

  it('skips the registrations query when the events list is empty', async () => {
    const getMock = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = makeService(getMock);

    const out = await svc.listOpenEvents({ tgUserId: BigInt(8888) });

    expect(out).toEqual([]);
    expect(getMock).toHaveBeenCalledTimes(1); // only events; no registrations query
  });

  it('degrades gracefully — returns un-annotated events when the registrations query fails', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: TWO_EVENTS })
      .mockRejectedValueOnce(new Error('directus 500'));
    const svc = makeService(getMock);

    const out = await svc.listOpenEvents({ tgUserId: BigInt(8888) });

    expect(out).toHaveLength(2);
    // No annotation when the lookup fails; bot's conflict-on-POST flow
    // catches the duplicate.
    expect(out.every((e) => e.is_registered === false)).toBe(true);
  });
});

// ─── aiqadam#290 — filter chips ──────────────────────────────────────────────

describe('TelegramEventsService.listOpenEvents — filter chips', () => {
  function makeService(getMock: ReturnType<typeof vi.fn>): TelegramEventsService {
    const directus = { get: getMock } as unknown as DirectusClient;
    return new TelegramEventsService(directus);
  }

  it('adds filter[starts_at][_gte] when from is provided (midnight UTC)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ from: '2026-06-01' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[starts_at][_gte]=2026-06-01T00%3A00%3A00.000Z');
  });

  it('adds filter[starts_at][_lte] when to is provided (end-of-day UTC)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ to: '2026-07-31' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[starts_at][_lte]=2026-07-31T23%3A59%3A59.999Z');
  });

  it('adds filter[format][_eq] when format is provided', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ format: 'meetup' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[format][_eq]=meetup');
  });

  it('adds filter[registration_open][_eq]=true when openOnly is true', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ openOnly: true });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[registration_open][_eq]=true');
  });

  it('does NOT add registration_open filter when openOnly is false (default)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({});

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).not.toContain('filter[registration_open]');
  });

  it('caps limit to 50; clamps values below 1 up to 1', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ limit: 999 });
    expect(getMock.mock.calls[0]?.[0] as string).toContain('limit=50');

    await svc.listOpenEvents({ limit: 0 });
    expect(getMock.mock.calls[1]?.[0] as string).toContain('limit=1');

    await svc.listOpenEvents({ limit: 10 });
    expect(getMock.mock.calls[2]?.[0] as string).toContain('limit=10');
  });

  it('adds OR filter on title/description/short_description when q is provided (aiqadam#288)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ q: 'llm' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[_or][0][title][_icontains]=llm');
    expect(call).toContain('filter[_or][1][description][_icontains]=llm');
    expect(call).toContain('filter[_or][2][short_description][_icontains]=llm');
  });

  it('trims q and treats whitespace-only as no-op (aiqadam#288)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ q: '   ' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).not.toContain('filter[_or]');
  });

  it('URL-encodes the q value (aiqadam#288)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({ q: 'foo bar' });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[_or][0][title][_icontains]=foo%20bar');
  });

  it('combines multiple filters with AND semantics (all present in query)', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await svc.listOpenEvents({
      tenant: 'uz',
      from: '2026-06-01',
      to: '2026-07-31',
      format: 'meetup',
      openOnly: true,
      limit: 10,
    });

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[country][_eq]=uz');
    expect(call).toContain('filter[starts_at][_gte]=');
    expect(call).toContain('filter[starts_at][_lte]=');
    expect(call).toContain('filter[format][_eq]=meetup');
    expect(call).toContain('filter[registration_open][_eq]=true');
    expect(call).toContain('limit=10');
  });
});

// ─── aiqadam#279 — speaker display helpers ───────────────────────────────────

describe('speakerDisplayName', () => {
  const join = (
    overrides: Partial<{
      first: string | null;
      last: string | null;
      email: string | null;
      talk_title: string | null;
      headline: string | null;
    }> = {},
  ) => ({
    talk_title: overrides.talk_title ?? null,
    speaker: {
      headline: overrides.headline ?? null,
      user: {
        first_name: overrides.first === undefined ? 'Viktor' : overrides.first,
        last_name: overrides.last === undefined ? 'Drukker' : overrides.last,
        email: overrides.email === undefined ? 'viktor@example.com' : overrides.email,
      },
    },
  });

  it('joins first + last when both present', () => {
    expect(speakerDisplayName(join())).toBe('Viktor Drukker');
  });
  it('returns first alone when last is empty', () => {
    expect(speakerDisplayName(join({ last: '' }))).toBe('Viktor');
  });
  it('returns last alone when first is null', () => {
    expect(speakerDisplayName(join({ first: null }))).toBe('Drukker');
  });
  it('falls back to email local part when name fields blank', () => {
    expect(speakerDisplayName(join({ first: '', last: null, email: 'fallback@host' }))).toBe(
      'fallback',
    );
  });
  it('returns null when nothing is usable', () => {
    expect(speakerDisplayName(join({ first: null, last: null, email: null }))).toBeNull();
  });
  it('returns null when speaker is missing entirely', () => {
    expect(speakerDisplayName({ talk_title: null, speaker: null })).toBeNull();
  });
});

describe('speakerTitle', () => {
  const make = (headline: string | null, talk_title: string | null) => ({
    talk_title,
    speaker: { headline, user: null },
  });
  it('prefers operator headline over per-event talk title', () => {
    expect(speakerTitle(make('Founder, AI Qadam', 'Why retrieval matters'))).toBe(
      'Founder, AI Qadam',
    );
  });
  it('falls back to talk title when headline is null', () => {
    expect(speakerTitle(make(null, 'Why retrieval matters'))).toBe('Why retrieval matters');
  });
  it('returns null when both empty', () => {
    expect(speakerTitle(make('  ', ''))).toBeNull();
  });
});

// ─── aiqadam#279 — getEventDetail ─────────────────────────────────────────────

describe('TelegramEventsService.getEventDetail', () => {
  const DETAIL_ROW = {
    id: 'evt-1',
    slug: 'ai-meetup',
    title: 'AI Qadam Meetup',
    starts_at: '2026-06-20T03:00:00.000Z',
    location: 'IMPACT.T',
    country: 'uz',
    status: 'published',
    visibility_scope: 'public',
    capacity: 50,
    registration_open: true,
    description: '<b>Topics</b>: retrieval, agents, evals.',
    short_description: 'Monthly meetup',
    venue: 'IMPACT.T Hall A',
    hero_image: 'aabbccdd-1111-2222-3333-444455556666',
    online_meeting_url: 'https://meet.example.com/abc',
    media: null,
    feedback_survey_url: null,
    feedback_survey_label: null,
  };

  function makeService(getMock: ReturnType<typeof vi.fn>): TelegramEventsService {
    const directus = { get: getMock } as unknown as DirectusClient;
    return new TelegramEventsService(directus);
  }

  it('returns the full detail shape with no tgUserId', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] }) // slug lookup hit
      .mockResolvedValueOnce({
        data: [
          {
            talk_title: 'RAG in production',
            speaker: {
              headline: 'Principal ML, Uzum Lab',
              user: { first_name: 'Aigerim', last_name: 'B', email: 'a@example.com' },
            },
          },
        ],
      }) // speakers
      .mockResolvedValueOnce({ data: [{ count: '17' }] }); // taken count
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');

    expect(out.id).toBe('evt-1');
    expect(out.slug).toBe('ai-meetup');
    expect(out.description).toContain('retrieval');
    expect(out.short_description).toBe('Monthly meetup');
    expect(out.venue).toBe('IMPACT.T Hall A');
    expect(out.hero_image_url).toContain('/assets/aabbccdd-1111-2222-3333-444455556666');
    expect(out.online_meeting_url).toBe('https://meet.example.com/abc');
    expect(out.capacity_total).toBe(50);
    expect(out.capacity_taken).toBe(17);
    expect(out.speakers).toEqual([{ name: 'Aigerim B', title: 'Principal ML, Uzum Lab' }]);
    expect(out.web_url).toMatch(/\/events\/ai-meetup$/);
    expect(out.is_registered).toBeUndefined();
    expect(out.registration_id).toBeUndefined();
  });

  it('omits optional fields cleanly when the row has them null', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            ...DETAIL_ROW,
            short_description: null,
            venue: null,
            hero_image: null,
            online_meeting_url: null,
            capacity: null,
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] }) // no speakers
      .mockResolvedValueOnce({ data: [{ count: 0 }] }); // 0 taken
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');

    expect(out.short_description).toBeUndefined();
    expect(out.venue).toBeUndefined();
    expect(out.hero_image_url).toBeUndefined();
    expect(out.online_meeting_url).toBeUndefined();
    expect(out.capacity_total).toBeUndefined();
    expect(out.speakers).toBeUndefined();
    expect(out.capacity_taken).toBe(0);
  });

  it('annotates is_registered=true + registration_id when tgUserId matches', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockResolvedValueOnce({ data: [] }) // speakers
      .mockResolvedValueOnce({ data: [{ count: 5 }] }) // taken
      .mockResolvedValueOnce({ data: [{ id: 'reg-42' }] }); // tg registration
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup', 12345n);

    expect(out.is_registered).toBe(true);
    expect(out.registration_id).toBe('reg-42');
  });

  it('annotates is_registered=false when tgUserId is provided but no registration exists', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 5 }] })
      .mockResolvedValueOnce({ data: [] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup', 99999n);

    expect(out.is_registered).toBe(false);
    expect(out.registration_id).toBeUndefined();
  });

  it('falls back to id when slug lookup misses + input is a uuid', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [] }) // slug miss
      .mockResolvedValueOnce({ data: [{ ...DETAIL_ROW, id: uuid, slug: null }] }) // id hit
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail(uuid);

    expect(out.slug).toBe(uuid); // fallback per rowToSummary
    // The id-lookup call should have been issued.
    const idCall = get.mock.calls[1]?.[0] as string;
    expect(idCall).toContain(`filter[id][_eq]=${uuid}`);
  });

  it('does NOT issue an id-lookup when the input is not uuid-shaped', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] }); // slug miss
    const svc = makeService(get);

    await expect(svc.getEventDetail('not-a-uuid-or-event')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(get).toHaveBeenCalledTimes(1); // no id fallback
  });

  it('throws NotFoundException with {error:"event_not_found"} when no match', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = makeService(get);

    try {
      await svc.getEventDetail('missing');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('event_not_found');
    }
  });

  it('applies the published+public filter guards in the slug query', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    await svc.getEventDetail('ai-meetup');

    const slugCall = get.mock.calls[0]?.[0] as string;
    expect(slugCall).toContain('filter[status][_eq]=published');
    expect(slugCall).toContain('filter[visibility_scope][_eq]=public');
  });

  it('degrades speakers to [] when the join query throws', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockRejectedValueOnce(new Error('directus 502'))
      .mockResolvedValueOnce({ data: [{ count: 3 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');

    expect(out.speakers).toBeUndefined(); // empty → omitted
    expect(out.capacity_taken).toBe(3); // others still work
  });

  it('degrades capacity_taken to 0 when aggregate fails', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('directus 500'));
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');

    expect(out.capacity_taken).toBe(0);
  });

  it('filters speakers to status=confirmed in the query', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    await svc.getEventDetail('ai-meetup');

    const speakersCall = get.mock.calls[1]?.[0] as string;
    expect(speakersCall).toContain('filter[event][_eq]=evt-1');
    expect(speakersCall).toContain('filter[status][_eq]=confirmed');
    expect(speakersCall).toContain('sort=order_index');
  });

  it('passes media items through after sanitization (aiqadam#293)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            ...DETAIL_ROW,
            media: [
              { kind: 'photo', url: 'https://cdn.example/a.jpg', caption: 'A', order: 1 },
              { kind: 'video', url: 'https://cdn.example/b.mp4', order: 0 },
              { kind: 'unknown', url: 'https://cdn.example/c' }, // dropped
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');

    expect(out.media).toHaveLength(2);
    expect(out.media?.[0]?.kind).toBe('video'); // order=0 sorts first
    expect(out.media?.[1]?.caption).toBe('A');
  });

  it('omits media key entirely when row.media is null (aiqadam#293)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ ...DETAIL_ROW, media: null }] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');
    expect(out.media).toBeUndefined();
  });

  // aiqadam#322 — feedback survey fields surface only when URL is set.
  it('omits feedback_survey_* keys entirely when url is null', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [DETAIL_ROW] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');
    expect(out.feedback_survey_url).toBeUndefined();
    expect(out.feedback_survey_label).toBeUndefined();
  });

  it('exposes feedback_survey_url + label verbatim when both are set', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            ...DETAIL_ROW,
            feedback_survey_url: 'https://forms.gle/abc123',
            feedback_survey_label: '5-question feedback (2 min)',
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');
    expect(out.feedback_survey_url).toBe('https://forms.gle/abc123');
    expect(out.feedback_survey_label).toBe('5-question feedback (2 min)');
  });

  it('exposes feedback_survey_url without label when label is null', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            ...DETAIL_ROW,
            feedback_survey_url: 'https://forms.gle/abc123',
            feedback_survey_label: null, // bot falls back to its default text
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ count: 0 }] });
    const svc = makeService(get);

    const out = await svc.getEventDetail('ai-meetup');
    expect(out.feedback_survey_url).toBe('https://forms.gle/abc123');
    expect(out.feedback_survey_label).toBeUndefined();
  });
});

// ─── aiqadam#293 — sanitizeMediaItems ───────────────────────────────────────

describe('sanitizeMediaItems', () => {
  it('returns [] for non-array input', () => {
    expect(sanitizeMediaItems(null)).toEqual([]);
    expect(sanitizeMediaItems(undefined)).toEqual([]);
    expect(sanitizeMediaItems({ kind: 'photo' })).toEqual([]);
    expect(sanitizeMediaItems('string')).toEqual([]);
  });

  it('keeps valid items + drops malformed ones', () => {
    const out = sanitizeMediaItems([
      { kind: 'photo', url: 'https://x/a.jpg', order: 0 },
      { kind: 'video', url: '', order: 1 }, // empty url → drop
      { kind: 'unknown', url: 'https://x/c', order: 2 }, // bad kind → drop
      { url: 'https://x/d', order: 3 }, // missing kind → drop
      null,
      'not-an-object',
      { kind: 'document', url: 'https://x/e.pdf', order: 4 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.kind).toBe('photo');
    expect(out[1]?.kind).toBe('document');
  });

  it('sorts by order ascending', () => {
    const out = sanitizeMediaItems([
      { kind: 'photo', url: 'https://x/b.jpg', order: 5 },
      { kind: 'photo', url: 'https://x/a.jpg', order: 1 },
      { kind: 'photo', url: 'https://x/c.jpg', order: 3 },
    ]);
    expect(out.map((m) => m.url)).toEqual([
      'https://x/a.jpg',
      'https://x/c.jpg',
      'https://x/b.jpg',
    ]);
  });

  it('keeps caption + thumbnail_url when present, omits when missing', () => {
    const out = sanitizeMediaItems([
      {
        kind: 'video',
        url: 'https://x/v.mp4',
        caption: 'Talk replay',
        thumbnail_url: 'https://x/v.jpg',
        order: 0,
      },
      { kind: 'photo', url: 'https://x/p.jpg', order: 1 },
    ]);
    expect(out[0]).toMatchObject({
      caption: 'Talk replay',
      thumbnail_url: 'https://x/v.jpg',
    });
    expect(out[1]?.caption).toBeUndefined();
    expect(out[1]?.thumbnail_url).toBeUndefined();
  });

  it('synthesizes order from index when missing', () => {
    const out = sanitizeMediaItems([
      { kind: 'photo', url: 'https://x/a.jpg' },
      { kind: 'photo', url: 'https://x/b.jpg' },
    ]);
    expect(out[0]?.order).toBe(0);
    expect(out[1]?.order).toBe(1);
  });
});
