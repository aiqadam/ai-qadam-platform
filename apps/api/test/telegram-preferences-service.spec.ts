import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { type DirectusClient, DirectusError } from '../src/modules/directus/directus.client';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_OPT_INS,
  TelegramPreferencesService,
  isPlausibleIanaTz,
} from '../src/modules/telegram/telegram-preferences.service';

function fakeDirectus(opts: { get?: ReturnType<typeof vi.fn>; patch?: ReturnType<typeof vi.fn> }) {
  return {
    get: opts.get ?? vi.fn(),
    patch: opts.patch ?? vi.fn(),
  } as unknown as DirectusClient;
}

// Directus row fixtures — `preferred_language` is the COLUMN name (renamed
// from `language` to avoid the system-field collision). Wire shape stays
// `language`, asserted on the GET / PATCH responses below.
const MEMBER_NULL_PREFS = {
  id: 'mem-1',
  country: 'uz',
  preferred_language: null,
  timezone: null,
  notification_opt_ins: null,
};

const MEMBER_SET_PREFS = {
  id: 'mem-1',
  country: 'uz',
  preferred_language: 'ru',
  timezone: 'Europe/Moscow',
  notification_opt_ins: { event_reminders: true, newsletter: true, community_announcements: false },
};

// ─── isPlausibleIanaTz ──────────────────────────────────────────────────────

describe('isPlausibleIanaTz', () => {
  it.each([
    ['Asia/Tashkent', true],
    ['Europe/Moscow', true],
    ['America/New_York', true],
    ['UTC', true],
    ['America/Argentina/Buenos_Aires', true],
    ['not-a-tz', false],
    ['Asia/', false],
    ['/Tashkent', false],
    ['<script>', false],
    ['', false],
  ])('%s → %s', (input, expected) => {
    expect(isPlausibleIanaTz(input)).toBe(expected);
  });
});

// ─── get() — resolves defaults ───────────────────────────────────────────────

describe('TelegramPreferencesService.get', () => {
  it('resolves all-null fields to spec defaults (with tenant tz)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER_NULL_PREFS }) // member
      .mockResolvedValueOnce({ data: { code: 'uz', tz: 'Asia/Tashkent' } }); // country
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out).toEqual({
      language: DEFAULT_LANGUAGE,
      timezone: 'Asia/Tashkent',
      notification_opt_ins: DEFAULT_OPT_INS,
    });
  });

  it('returns stored fields when set (no countries lookup needed)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: MEMBER_SET_PREFS });
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out).toEqual({
      language: 'ru',
      timezone: 'Europe/Moscow',
      notification_opt_ins: {
        event_reminders: true,
        newsletter: true,
        community_announcements: false,
      },
    });
    // Only the member lookup happened — timezone is stored so no country query.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('falls back to hardcoded tenant tz when countries.tz lookup fails', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER_NULL_PREFS })
      .mockRejectedValueOnce(new DirectusError(500, '/items/countries/uz', 'boom'));
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out.timezone).toBe('Asia/Tashkent'); // tenant fallback
  });

  it('falls back to UTC when no country is set', async () => {
    const get = vi.fn().mockResolvedValueOnce({
      data: { ...MEMBER_NULL_PREFS, country: null },
    });
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out.timezone).toBe('UTC');
  });

  it('merges partial stored opt-ins with defaults', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ...MEMBER_NULL_PREFS, notification_opt_ins: { newsletter: true } },
      })
      .mockResolvedValueOnce({ data: { code: 'uz', tz: 'Asia/Tashkent' } });
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out.notification_opt_ins).toEqual({
      event_reminders: true, // default
      newsletter: true, // from stored
      community_announcements: true, // default
    });
  });

  it('ignores unknown opt-in keys + non-boolean values', async () => {
    const get = vi.fn().mockResolvedValueOnce({
      data: {
        ...MEMBER_SET_PREFS,
        notification_opt_ins: {
          event_reminders: false,
          legacy_key: true, // unknown — ignored
          newsletter: 'yes', // non-boolean — ignored, default used
          community_announcements: false,
        },
      },
    });
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out.notification_opt_ins).toEqual({
      event_reminders: false, // stored
      newsletter: false, // default (non-bool dropped)
      community_announcements: false, // stored
    });
    expect('legacy_key' in out.notification_opt_ins).toBe(false);
  });

  it('falls back to "en" for invalid stored language', async () => {
    const get = vi.fn().mockResolvedValueOnce({
      data: { ...MEMBER_SET_PREFS, preferred_language: 'klingon' },
    });
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    const out = await svc.get('mem-1');

    expect(out.language).toBe('en');
  });

  it('throws NotFoundException with {error:"member_not_found"} when member 404s', async () => {
    const get = vi.fn().mockRejectedValueOnce(new DirectusError(404, '/users/x', 'not found'));
    const svc = new TelegramPreferencesService(fakeDirectus({ get }));

    try {
      await svc.get('nonexistent');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('member_not_found');
    }
  });
});

// ─── patch() — validation + merge ───────────────────────────────────────────

describe('TelegramPreferencesService.patch', () => {
  it('rejects invalid language with allowed list (400)', async () => {
    const svc = new TelegramPreferencesService(fakeDirectus({}));
    try {
      await svc.patch('mem-1', { language: 'klingon' as any });
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as { error: string; allowed: string[] };
      expect(resp.error).toBe('invalid_language');
      expect(resp.allowed).toEqual(['en', 'ru', 'uz']);
    }
  });

  it('rejects invalid timezone (400)', async () => {
    const svc = new TelegramPreferencesService(fakeDirectus({}));
    await expect(svc.patch('mem-1', { timezone: 'not-a-tz' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects unknown opt-in keys (400)', async () => {
    const svc = new TelegramPreferencesService(fakeDirectus({}));
    try {
      await svc.patch('mem-1', { notification_opt_ins: { legacy_key: true } as never });
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as { error: string; key: string };
      expect(resp.error).toBe('unknown_opt_in_key');
      expect(resp.key).toBe('legacy_key');
    }
  });

  it('PATCHes only the keys provided (partial body)', async () => {
    const get = vi.fn().mockResolvedValue({ data: MEMBER_NULL_PREFS });
    const patch = vi.fn().mockResolvedValueOnce({ data: {} });
    const svc = new TelegramPreferencesService(fakeDirectus({ get, patch }));

    await svc.patch('mem-1', { language: 'ru' });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch.mock.calls[0]?.[0]).toBe('/users/mem-1');
    // Wire field `language` is rewritten to the renamed Directus column.
    expect(patch.mock.calls[0]?.[1]).toEqual({ preferred_language: 'ru' });
  });

  it('merges opt-ins with existing row (does not clobber unset keys)', async () => {
    const existingRow = {
      ...MEMBER_NULL_PREFS,
      notification_opt_ins: { event_reminders: true, newsletter: false },
    };
    const get = vi.fn().mockResolvedValue({ data: existingRow });
    const patch = vi.fn().mockResolvedValueOnce({ data: {} });
    const svc = new TelegramPreferencesService(fakeDirectus({ get, patch }));

    await svc.patch('mem-1', { notification_opt_ins: { newsletter: true } });

    expect(patch.mock.calls[0]?.[1]).toEqual({
      notification_opt_ins: {
        event_reminders: true, // preserved
        newsletter: true, // overridden
      },
    });
  });

  it('returns the resolved full doc after a successful PATCH', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER_NULL_PREFS }) // member fetch
      .mockResolvedValueOnce({ data: { code: 'uz', tz: 'Asia/Tashkent' } }); // country
    const patch = vi.fn().mockResolvedValueOnce({ data: {} });
    const svc = new TelegramPreferencesService(fakeDirectus({ get, patch }));

    const out = await svc.patch('mem-1', { language: 'ru' });

    expect(out.language).toBe('ru');
    expect(out.timezone).toBe('Asia/Tashkent'); // tenant default still
  });

  it('404 when member not found (no PATCH issued)', async () => {
    const get = vi.fn().mockRejectedValueOnce(new DirectusError(404, '/users/x', 'not found'));
    const patch = vi.fn();
    const svc = new TelegramPreferencesService(fakeDirectus({ get, patch }));

    await expect(svc.patch('mem-1', { language: 'ru' })).rejects.toBeInstanceOf(NotFoundException);
    expect(patch).not.toHaveBeenCalled();
  });

  it('skips the PATCH entirely when the body has nothing to change', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: MEMBER_NULL_PREFS })
      .mockResolvedValueOnce({ data: { code: 'uz', tz: 'Asia/Tashkent' } });
    const patch = vi.fn();
    const svc = new TelegramPreferencesService(fakeDirectus({ get, patch }));

    const out = await svc.patch('mem-1', {});

    expect(patch).not.toHaveBeenCalled();
    expect(out.language).toBe('en'); // returns resolved defaults
  });
});
