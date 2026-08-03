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

// FR-NTF-005 — channel toggle response
export interface ChannelToggles {
  notification_email_enabled: boolean;
  notification_telegram_enabled: boolean;
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

  // FR-NTF-005 — fetch channel toggles from directus_users
  async getChannelToggles(userId: string): Promise<ChannelToggles> {
    const res = await this.directus.get<{
      data: {
        notification_email_enabled?: boolean;
        notification_telegram_enabled?: boolean;
      };
    }>(`/users/${encodeURIComponent(userId)}?fields=notification_email_enabled,notification_telegram_enabled`);
    return {
      notification_email_enabled: res.data.notification_email_enabled ?? true,
      notification_telegram_enabled: res.data.notification_telegram_enabled ?? true,
    };
  }

  // FR-NTF-005 — update channel toggles on directus_users
  async setChannelToggles(
    userId: string,
    toggles: Partial<ChannelToggles>,
  ): Promise<ChannelToggles> {
    const patch: Record<string, boolean> = {};
    if (toggles.notification_email_enabled !== undefined) {
      patch.notification_email_enabled = toggles.notification_email_enabled;
    }
    if (toggles.notification_telegram_enabled !== undefined) {
      patch.notification_telegram_enabled = toggles.notification_telegram_enabled;
    }
    await this.directus.patch(`/users/${encodeURIComponent(userId)}`, patch);
    return this.getChannelToggles(userId);
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
