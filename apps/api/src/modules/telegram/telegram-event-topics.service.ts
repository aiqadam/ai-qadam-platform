import { Injectable } from '@nestjs/common';
import { type I18nLocale, pickLocale } from './telegram-events.service';

// aiqadam#323 — curated event topics taxonomy.
//
// Static enum (not a Directus collection) for v1: the list is small,
// it changes slowly, and operator-curated additions are PR-worthy
// (translations need review). When the list grows past ~20 OR we
// need per-tenant taxonomies, promote to a Directus collection.
//
// Slugs are the canonical filter key — they ship in
// events.topic_tags[] AND in the bot's ?topic= query. Renaming a
// slug is a breaking change: old events keep the old slug. Add new
// slugs freely; never delete (set `deprecated: true` instead).
//
// aiqadam#326 PR-c — locale support. list(locale) returns labels
// from KNOWN_EVENT_TOPIC_TRANSLATIONS when the locale has them;
// english label as base.

export interface EventTopic {
  slug: string;
  label: string;
  icon: string | null;
  // aiqadam#326 PR-c — locale the labels were served in.
  locale?: string;
}

const KNOWN_EVENT_TOPICS: readonly EventTopic[] = [
  { slug: 'llm', label: 'Large Language Models', icon: '🧠' },
  { slug: 'mlops', label: 'MLOps', icon: '⚙️' },
  { slug: 'computer-vision', label: 'Computer Vision', icon: '👁️' },
  { slug: 'product', label: 'AI Product', icon: '📦' },
  { slug: 'career', label: 'AI Careers', icon: '💼' },
  { slug: 'ethics', label: 'AI Ethics', icon: '⚖️' },
  { slug: 'infra', label: 'AI Infrastructure', icon: '🏗️' },
] as const;

// aiqadam#326 PR-c — operator-reviewed translations. Keys are the
// curated slugs; values are the per-locale label substitutions.
// Missing slug→locale fall back to the english label silently.
const KNOWN_EVENT_TOPIC_TRANSLATIONS: Readonly<
  Record<string, Partial<Record<I18nLocale, string>>>
> = {
  llm: { ru: 'Большие языковые модели', uz: 'Katta til modellari' },
  mlops: { ru: 'MLOps', uz: 'MLOps' },
  'computer-vision': { ru: 'Компьютерное зрение', uz: "Kompyuter ko'rishi" },
  product: { ru: 'AI-продукт', uz: 'AI mahsulot' },
  career: { ru: 'Карьера в AI', uz: 'AI karera' },
  ethics: { ru: 'Этика AI', uz: 'AI etikasi' },
  infra: { ru: 'AI-инфраструктура', uz: 'AI infratuzilmasi' },
};

@Injectable()
export class TelegramEventTopicsService {
  // aiqadam#326 PR-c — accepts Accept-Language. v1 falls through to the
  // english base when the locale isn't present in the translations map
  // OR is not a known I18N_SUPPORTED_LOCALES value. `undefined` arg
  // preserves the pre-#326 callsite behaviour.
  list(locale?: string | null): EventTopic[] {
    const resolved = pickLocale(locale ?? null);
    return KNOWN_EVENT_TOPICS.map((t) => {
      const translation = KNOWN_EVENT_TOPIC_TRANSLATIONS[t.slug]?.[resolved];
      return {
        ...t,
        label: translation && resolved !== 'en' ? translation : t.label,
        locale: resolved,
      };
    });
  }

  // Exposed for callers that want to validate user-supplied slugs
  // (e.g. POST /admin/event payload check, future cabinet tag picker).
  isKnown(slug: string): boolean {
    return KNOWN_EVENT_TOPICS.some((t) => t.slug === slug);
  }
}
