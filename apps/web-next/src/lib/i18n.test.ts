// i18n.test.ts — Unit tests for getLocale/makeT (ISS-WEB-NEXT-I18N-001).
//
// Regression test: before this fix, apps/web-next had no i18n layer at all —
// LocaleSwitcher wrote the `aiqadam-locale` cookie but nothing read it back,
// so selecting Русский never changed the UI. getLocale() reading the cookie
// and makeT() returning translated strings is the behaviour that was missing.

import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES, getLocale, makeT } from './i18n';

function astroLike(opts: { cookie?: string; acceptLanguage?: string } = {}) {
  return {
    cookies: {
      get: (name: string) =>
        name === LOCALE_COOKIE && opts.cookie ? { value: opts.cookie } : undefined,
    },
    request: {
      headers: new Headers(opts.acceptLanguage ? { 'accept-language': opts.acceptLanguage } : {}),
    },
  };
}

describe('getLocale', () => {
  it('returns the cookie value when it names a supported locale', () => {
    const locale = getLocale(astroLike({ cookie: 'ru' }));
    expect(locale).toBe('ru');
  });

  it('falls back to Accept-Language when no cookie is set', () => {
    const locale = getLocale(astroLike({ acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.8' }));
    expect(locale).toBe('ru');
  });

  it('falls back to the default locale when cookie and header are both absent', () => {
    const locale = getLocale(astroLike());
    expect(locale).toBe(DEFAULT_LOCALE);
  });

  it('ignores a cookie value that is not a supported locale', () => {
    const locale = getLocale(astroLike({ cookie: 'fr' }));
    expect(locale).toBe(DEFAULT_LOCALE);
  });

  it('exposes en and ru as the supported locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ru']);
  });
});

describe('makeT', () => {
  it('returns the English string for the en locale', () => {
    const t = makeT('en');
    expect(t('nav.events')).toBe('Events');
  });

  it('returns the Russian translation for the ru locale — the bug this fixes', () => {
    const t = makeT('ru');
    expect(t('nav.events')).toBe('События');
    expect(t('nav.events')).not.toBe('Events');
  });

  it('interpolates params into the translated string', () => {
    const t = makeT('en');
    expect(t('event_card.going_count', { count: 5 })).toBe('5 going');
  });

  it('returns the key itself for a missing translation', () => {
    const t = makeT('en');
    expect(t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });
});
