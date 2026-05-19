import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// Sprint 5.5/6 — service backing /v1/me/preferences/consents.
//
// Schema for consent_records (5.5/2): append-only-ish. Each toggle
// inserts a new row. Reading current state = SELECT most recent
// (granted_at DESC) per (user, initiator_actor_class, intent_class)
// and check revoked_at IS NULL.
//
// Row write conventions matching ConsentService's read logic:
//   - Grant:  { granted_at: now(), revoked_at: null }
//   - Revoke: { granted_at: now(), revoked_at: now() }
//   In both cases granted_at = WHEN THIS ROW WAS WRITTEN.
//   revoked_at distinguishes grant vs revoke.

// The canonical preference topics surfaced in /me/preferences. Each
// resolves to (initiator_actor_class, intent_class) for the consent_records
// schema and matches how the dispatcher will check consent at send time.
//
// Add new topics here AND in the UI's label table. Adding here without
// the UI hides it. Adding to the UI without here means writes fail
// validation.

export const TOPICS = {
  newsletter: {
    initiator_actor_class: 'operator',
    intent_class: 'newsletter',
  },
  sponsor_offer: {
    initiator_actor_class: 'sponsor',
    intent_class: 'sponsor_offer',
  },
  speaker_promo: {
    initiator_actor_class: 'speaker',
    intent_class: 'speaker_promo',
  },
} as const;

export type TopicKey = keyof typeof TOPICS;
export const TOPIC_KEYS = Object.keys(TOPICS) as TopicKey[];

export interface ConsentSummary {
  topic: TopicKey;
  granted: boolean;
  // The granted_at of the row that determined the current state. null
  // when the user has never toggled this topic (no rows exist).
  lastChangedAt: string | null;
}

interface ConsentRecordRow {
  id: string;
  granted_at: string;
  revoked_at: string | null;
}

@Injectable()
export class PreferencesService {
  private readonly logger = new Logger(PreferencesService.name);

  constructor(private readonly directus: DirectusClient) {}

  async list(userId: string): Promise<ConsentSummary[]> {
    // One query per topic. Three topics × ~ms = fine; could batch later.
    const summaries = await Promise.all(
      TOPIC_KEYS.map((topic) => this.summarizeTopic(userId, topic)),
    );
    return summaries;
  }

  async set(userId: string, topic: TopicKey, granted: boolean): Promise<ConsentSummary> {
    const { initiator_actor_class, intent_class } = TOPICS[topic];
    const now = new Date().toISOString();
    await this.directus.post('/items/consent_records', {
      user: userId,
      initiator_actor_class,
      intent_class,
      scope: null,
      granted_at: now,
      revoked_at: granted ? null : now,
      source: 'preferences_page',
    });
    return {
      topic,
      granted,
      lastChangedAt: now,
    };
  }

  private async summarizeTopic(userId: string, topic: TopicKey): Promise<ConsentSummary> {
    const { initiator_actor_class, intent_class } = TOPICS[topic];
    const filter = encodeURIComponent(
      JSON.stringify({
        user: { _eq: userId },
        initiator_actor_class: { _eq: initiator_actor_class },
        intent_class: { _eq: intent_class },
        // Only rows with scope=null (broad consent) count for /me/preferences;
        // scoped grants are managed elsewhere (e.g. sponsor-specific flows).
        scope: { _null: true },
      }),
    );
    const url = `/items/consent_records?filter=${filter}&sort=-granted_at&limit=1&fields=id,granted_at,revoked_at`;
    const res = await this.directus.get<{ data: ConsentRecordRow[] }>(url);
    const latest = res.data[0];
    if (!latest) {
      return { topic, granted: false, lastChangedAt: null };
    }
    return {
      topic,
      granted: latest.revoked_at === null,
      lastChangedAt: latest.granted_at,
    };
  }
}
