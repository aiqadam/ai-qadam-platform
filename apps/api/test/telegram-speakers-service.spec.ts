import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TelegramSpeakersService,
  applyDetailI18n,
  applySummaryI18n,
  buildSocialLinks,
  rowToSpeakerSummary,
  speakerName,
} from '../src/modules/telegram/telegram-speakers.service';

// aiqadam#291 — wire shape pinned by sibling repo's pydantic. Any field
// rename here must coordinate a cross-repo PR.

function fakeDirectus(get: ReturnType<typeof vi.fn>): DirectusClient {
  return { get } as unknown as DirectusClient;
}

const SPEAKER_BASE = {
  id: 'spk-1',
  slug: 'aigerim-b',
  headline: 'Principal ML, Uzum Lab',
  bio: '**About**: retrieval, agents, evals.',
  photo: 'aabbccdd-1111-2222-3333-444455556666',
  linkedin_url: 'https://linkedin.com/in/aigerim',
  twitter_handle: '@aigerim',
  status: 'active',
  country: 'uz',
  user: {
    first_name: 'Aigerim',
    last_name: 'B',
    email: 'aigerim@example.com',
  },
};

// ─── speakerName ─────────────────────────────────────────────────────────────

describe('speakerName', () => {
  const make = (
    overrides: Partial<{ first: string | null; last: string | null; email: string | null }> = {},
  ) => ({
    ...SPEAKER_BASE,
    user: {
      first_name: overrides.first === undefined ? 'Aigerim' : overrides.first,
      last_name: overrides.last === undefined ? 'B' : overrides.last,
      email: overrides.email === undefined ? 'aigerim@example.com' : overrides.email,
    },
  });

  it('joins first + last when both present', () => {
    expect(speakerName(make())).toBe('Aigerim B');
  });
  it('returns first alone when last is empty', () => {
    expect(speakerName(make({ last: '' }))).toBe('Aigerim');
  });
  it('returns last alone when first is null', () => {
    expect(speakerName(make({ first: null }))).toBe('B');
  });
  it('falls back to email local part when name fields blank', () => {
    expect(speakerName(make({ first: '', last: null, email: 'fallback@host' }))).toBe('fallback');
  });
  it('returns null when nothing is usable', () => {
    expect(speakerName(make({ first: null, last: null, email: null }))).toBeNull();
  });
  it('returns null when user is missing entirely', () => {
    expect(speakerName({ ...SPEAKER_BASE, user: null })).toBeNull();
  });
});

// ─── rowToSpeakerSummary ─────────────────────────────────────────────────────

describe('rowToSpeakerSummary', () => {
  it('maps the 5 wire fields', () => {
    const out = rowToSpeakerSummary(SPEAKER_BASE);
    expect(out).toMatchObject({
      id: 'spk-1',
      slug: 'aigerim-b',
      name: 'Aigerim B',
      title: 'Principal ML, Uzum Lab',
    });
    // avatar_url is env-dependent (DIRECTUS_URL varies between local + CI);
    // assert the trailing path, not the full origin.
    expect(out?.avatar_url).toMatch(/\/assets\/aabbccdd-1111-2222-3333-444455556666$/);
  });
  it('falls back slug → id when speakers.slug is null', () => {
    const out = rowToSpeakerSummary({ ...SPEAKER_BASE, slug: null });
    expect(out?.slug).toBe('spk-1');
  });
  it('returns null avatar_url when photo is null', () => {
    const out = rowToSpeakerSummary({ ...SPEAKER_BASE, photo: null });
    expect(out?.avatar_url).toBeNull();
  });
  it('returns null title when headline is null', () => {
    const out = rowToSpeakerSummary({ ...SPEAKER_BASE, headline: null });
    expect(out?.title).toBeNull();
  });
  it('returns null when name unresolvable', () => {
    const out = rowToSpeakerSummary({
      ...SPEAKER_BASE,
      user: { first_name: null, last_name: null, email: null },
    });
    expect(out).toBeNull();
  });
});

// ─── buildSocialLinks ────────────────────────────────────────────────────────

describe('buildSocialLinks', () => {
  it('emits LinkedIn entry when url present', () => {
    const links = buildSocialLinks(SPEAKER_BASE);
    expect(links).toContainEqual({ label: 'LinkedIn', url: 'https://linkedin.com/in/aigerim' });
  });
  it('normalizes @handle to twitter.com URL', () => {
    const links = buildSocialLinks(SPEAKER_BASE);
    expect(links).toContainEqual({ label: 'Twitter', url: 'https://twitter.com/aigerim' });
  });
  it('accepts handle without leading @', () => {
    const links = buildSocialLinks({ ...SPEAKER_BASE, twitter_handle: 'bare_handle' });
    expect(links.find((l) => l.label === 'Twitter')?.url).toBe('https://twitter.com/bare_handle');
  });
  it('omits Twitter when handle is whitespace only', () => {
    const links = buildSocialLinks({ ...SPEAKER_BASE, twitter_handle: '   ' });
    expect(links.find((l) => l.label === 'Twitter')).toBeUndefined();
  });
  it('returns empty array when no social fields set', () => {
    const links = buildSocialLinks({ ...SPEAKER_BASE, linkedin_url: null, twitter_handle: null });
    expect(links).toEqual([]);
  });
});

// ─── listSpeakers ────────────────────────────────────────────────────────────

describe('TelegramSpeakersService.listSpeakers', () => {
  it('filters status=active by default + sorts by user.last_name', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await svc.listSpeakers();
    const call = get.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter[status][_eq]=active');
    expect(call).toContain('sort=user.last_name');
  });

  it('adds country filter when provided', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await svc.listSpeakers({ country: 'uz' });
    expect(get.mock.calls[0]?.[0] as string).toContain('filter[country][_eq]=uz');
  });

  it('caps limit at MAX_SPEAKERS_LIMIT', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await svc.listSpeakers({ limit: 9999 });
    expect(get.mock.calls[0]?.[0] as string).toContain('limit=50');
  });

  it('drops speakers without a usable name', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        SPEAKER_BASE,
        {
          ...SPEAKER_BASE,
          id: 'spk-2',
          user: { first_name: null, last_name: null, email: null },
        },
      ],
    });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const { items } = await svc.listSpeakers();
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('spk-1');
  });

  it('maps rows to wire summaries', async () => {
    const get = vi.fn().mockResolvedValue({ data: [SPEAKER_BASE] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const { items } = await svc.listSpeakers();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'spk-1', name: 'Aigerim B' });
  });
});

// ─── getSpeakerDetail ────────────────────────────────────────────────────────

describe('TelegramSpeakersService.getSpeakerDetail', () => {
  const UPCOMING_EVENT = {
    talk_title: 'RAG in production',
    event: {
      id: 'evt-1',
      slug: 'ai-meetup',
      title: 'AI Qadam Meetup',
      starts_at: '2026-06-20T03:00:00.000Z',
      status: 'published',
      visibility_scope: 'public',
      registration_open: true,
    },
  };

  it('returns the full detail with events + social_links + bio', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [SPEAKER_BASE] })
      .mockResolvedValueOnce({ data: [UPCOMING_EVENT] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail('aigerim-b');
    expect(out.id).toBe('spk-1');
    expect(out.slug).toBe('aigerim-b');
    expect(out.bio).toContain('retrieval');
    expect(out.social_links).toHaveLength(2);
    expect(out.events).toHaveLength(1);
    expect(out.events[0]).toMatchObject({ id: 'evt-1', slug: 'ai-meetup' });
  });

  it('falls back to id lookup when slug misses + input is uuid', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [] }) // slug miss
      .mockResolvedValueOnce({ data: [{ ...SPEAKER_BASE, id: uuid, slug: null }] })
      .mockResolvedValueOnce({ data: [] }); // no events
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail(uuid);
    expect(out.slug).toBe(uuid);
    const idCall = get.mock.calls[1]?.[0] as string;
    expect(idCall).toContain(`filter[id][_eq]=${uuid}`);
  });

  it('does NOT issue an id-lookup when input is not uuid-shaped', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] }); // slug miss
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await expect(svc.getSpeakerDetail('not-a-uuid')).rejects.toBeInstanceOf(NotFoundException);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('404s with {error:"speaker_not_found"} when no row', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    try {
      await svc.getSpeakerDetail('missing');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('speaker_not_found');
    }
  });

  it('applies status=active guard in the slug query', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [SPEAKER_BASE] })
      .mockResolvedValueOnce({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await svc.getSpeakerDetail('aigerim-b');
    expect(get.mock.calls[0]?.[0] as string).toContain('filter[status][_eq]=active');
  });

  it('filters events to confirmed + published + public + future', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [SPEAKER_BASE] })
      .mockResolvedValueOnce({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await svc.getSpeakerDetail('aigerim-b');
    const eventsCall = get.mock.calls[1]?.[0] as string;
    expect(eventsCall).toContain('filter[speaker][_eq]=spk-1');
    expect(eventsCall).toContain('filter[status][_eq]=confirmed');
    expect(eventsCall).toContain('filter[event][status][_eq]=published');
    expect(eventsCall).toContain('filter[event][visibility_scope][_eq]=public');
    expect(eventsCall).toContain('filter[event][starts_at][_gt]=');
  });

  it('degrades events to [] when the join query throws', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [SPEAKER_BASE] })
      .mockRejectedValueOnce(new Error('directus 502'));
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail('aigerim-b');
    expect(out.events).toEqual([]);
  });

  it('skips event rows with no joined event payload', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [SPEAKER_BASE] })
      .mockResolvedValueOnce({
        data: [UPCOMING_EVENT, { talk_title: 'orphan', event: null }],
      });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail('aigerim-b');
    expect(out.events).toHaveLength(1);
  });

  it('falls back event slug → id when event.slug is null', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [SPEAKER_BASE] })
      .mockResolvedValueOnce({
        data: [{ ...UPCOMING_EVENT, event: { ...UPCOMING_EVENT.event, slug: null } }],
      });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail('aigerim-b');
    expect(out.events[0]?.slug).toBe('evt-1');
  });
});

// ─── aiqadam#326 PR-c — speakers i18n ─────────────────────────────────────

describe('applySummaryI18n', () => {
  const ROW = {
    ...SPEAKER_BASE,
    translations: { ru: { headline: 'Главный ML, Uzum Lab' }, uz: {} },
  };

  it('substitutes headline → title when ru translation is present', () => {
    const base = rowToSpeakerSummary(ROW);
    if (!base) throw new Error('expected summary');
    const out = applySummaryI18n(base, ROW, 'ru');
    expect(out.title).toBe('Главный ML, Uzum Lab');
    expect(out.locale).toBe('ru');
  });

  it('keeps base headline when locale=en', () => {
    const base = rowToSpeakerSummary(ROW);
    if (!base) throw new Error('expected summary');
    const out = applySummaryI18n(base, ROW, 'en');
    expect(out.title).toBe('Principal ML, Uzum Lab');
    expect(out.locale).toBe('en');
  });

  it('falls back to base when locale has empty subobject (no headline key)', () => {
    const base = rowToSpeakerSummary(ROW);
    if (!base) throw new Error('expected summary');
    const out = applySummaryI18n(base, ROW, 'uz');
    expect(out.title).toBe('Principal ML, Uzum Lab');
    expect(out.locale).toBe('uz');
  });

  it('defends against bad translations payload shapes', () => {
    const base = rowToSpeakerSummary(SPEAKER_BASE);
    if (!base) throw new Error('expected summary');
    const out = applySummaryI18n(
      base,
      { ...SPEAKER_BASE, translations: 'oops' as unknown as Record<string, never> },
      'ru',
    );
    expect(out.title).toBe('Principal ML, Uzum Lab');
  });
});

describe('applyDetailI18n', () => {
  const ROW = {
    ...SPEAKER_BASE,
    translations: {
      ru: { headline: 'Главный ML, Uzum Lab', bio: 'Русское био.' },
    },
  };

  function baseDetail() {
    const summary = rowToSpeakerSummary(ROW);
    if (!summary) throw new Error('expected summary');
    return {
      ...summary,
      bio: SPEAKER_BASE.bio,
      social_links: buildSocialLinks(ROW),
      events: [],
    };
  }

  it('substitutes title + bio when ru is present', () => {
    const out = applyDetailI18n(baseDetail(), ROW, 'ru');
    expect(out.title).toBe('Главный ML, Uzum Lab');
    expect(out.bio).toBe('Русское био.');
    expect(out.locale).toBe('ru');
  });

  it('partial translation (bio only) leaves base title', () => {
    const row = { ...SPEAKER_BASE, translations: { ru: { bio: 'Только био.' } } };
    const summary = rowToSpeakerSummary(row);
    if (!summary) throw new Error('expected summary');
    const detail = { ...summary, bio: SPEAKER_BASE.bio, social_links: [], events: [] };
    const out = applyDetailI18n(detail, row, 'ru');
    expect(out.title).toBe('Principal ML, Uzum Lab');
    expect(out.bio).toBe('Только био.');
  });

  it('keeps base when locale=en (no en subobject)', () => {
    const out = applyDetailI18n(baseDetail(), ROW, 'en');
    expect(out.title).toBe('Principal ML, Uzum Lab');
    expect(out.bio).toBe(SPEAKER_BASE.bio);
    expect(out.locale).toBe('en');
  });
});

describe('TelegramSpeakersService.listSpeakers — locale', () => {
  const TRANSLATED_ROW = {
    ...SPEAKER_BASE,
    translations: { ru: { headline: 'Главный ML' } },
  };

  it('substitutes title when locale="ru-RU,en;q=0.9"', async () => {
    const get = vi.fn().mockResolvedValue({ data: [TRANSLATED_ROW] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.listSpeakers({ locale: 'ru-RU,en;q=0.9' });
    expect(out.items[0]?.title).toBe('Главный ML');
    expect(out.items[0]?.locale).toBe('ru');
  });

  it('fetches the translations field in the SELECT', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    await svc.listSpeakers();
    expect(get.mock.calls[0]?.[0] as string).toContain('translations');
  });
});

describe('TelegramSpeakersService.getSpeakerDetail — locale', () => {
  const TRANSLATED_ROW = {
    ...SPEAKER_BASE,
    translations: { ru: { headline: 'Главный ML', bio: 'Русское био.' } },
  };

  it('substitutes title + bio when locale="ru"', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [TRANSLATED_ROW] })
      .mockResolvedValueOnce({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail('aigerim-b', 'ru');
    expect(out.title).toBe('Главный ML');
    expect(out.bio).toBe('Русское био.');
    expect(out.locale).toBe('ru');
  });

  it('keeps base + locale=en when no Accept-Language', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [TRANSLATED_ROW] })
      .mockResolvedValueOnce({ data: [] });
    const svc = new TelegramSpeakersService(fakeDirectus(get));
    const out = await svc.getSpeakerDetail('aigerim-b');
    expect(out.title).toBe('Principal ML, Uzum Lab');
    expect(out.locale).toBe('en');
  });
});
