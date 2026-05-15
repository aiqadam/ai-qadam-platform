import i18next from 'i18next';
import en from '../locales/en.json';
import ru from '../locales/ru.json';

// Server-side i18n. Used by .astro pages + the Nav helper. React islands
// stay locale-blind for now (their content is mostly data — event titles,
// dates, badges — not UI strings); when admin or /me UI grows enough
// chrome to need it, swap in react-i18next per the Phase 2 plan.
//
// Bootstrapping i18next at module-load is safe because the locale files
// are bundled JSON, not loaded async. One init across the whole web app.

export type Locale = 'en' | 'ru';
export const SUPPORTED_LOCALES = ['en', 'ru'] as const satisfies readonly Locale[];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'aiqadam-locale';

let initialised = false;
function ensureInit(): void {
  if (initialised) return;
  i18next.init({
    resources: { en: { translation: en }, ru: { translation: ru } },
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
  });
  initialised = true;
}

interface AstroLike {
  cookies?: { get?: (name: string) => { value?: string } | undefined };
  request?: { headers: Headers };
}

// Resolve the active locale. Cookie wins (`aiqadam-locale=ru`); falls back
// to `Accept-Language` header negotiation; finally to `en`.
//
// On prerendered pages (build time) Astro.cookies returns undefined for
// every key — those pages always render in DEFAULT_LOCALE. SSR pages
// (`export const prerender = false`) get the per-request value.
export function getLocale(astro: AstroLike): Locale {
  ensureInit();
  const cookieValue = astro.cookies?.get?.(LOCALE_COOKIE)?.value;
  if (cookieValue && (SUPPORTED_LOCALES as readonly string[]).includes(cookieValue)) {
    return cookieValue as Locale;
  }
  const acceptLanguage = astro.request?.headers.get('accept-language') ?? '';
  for (const part of acceptLanguage.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().slice(0, 2);
    if (tag && (SUPPORTED_LOCALES as readonly string[]).includes(tag)) {
      return tag as Locale;
    }
  }
  return DEFAULT_LOCALE;
}

// Translation helper bound to a locale. Use as `const t = makeT(locale);`
// then `t('nav.events')`. Missing keys return the key itself rather than
// silently rendering empty — easier to spot drift in the UI.
export function makeT(locale: Locale): (key: string) => string {
  ensureInit();
  return (key: string) => i18next.t(key, { lng: locale }) as string;
}
