import { Injectable } from '@nestjs/common';

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
// i18n: english label only for now. #318 wires Accept-Language to
// the bot; this service will read the requested locale and surface
// translated labels at that point. Until then ru/uz default to en.

export interface EventTopic {
  slug: string;
  label: string;
  icon: string | null;
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

@Injectable()
export class TelegramEventTopicsService {
  list(): EventTopic[] {
    return KNOWN_EVENT_TOPICS.map((t) => ({ ...t }));
  }

  // Exposed for callers that want to validate user-supplied slugs
  // (e.g. POST /admin/event payload check, future cabinet tag picker).
  isKnown(slug: string): boolean {
    return KNOWN_EVENT_TOPICS.some((t) => t.slug === slug);
  }
}
