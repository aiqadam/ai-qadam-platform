import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import { type EventSummary, rowToSummary } from './telegram-events.service';

// Schema-driven activation per ADR-0034 acquisition rewrite + ADR-0033
// (Directus = canonical for business state). The bot's /register_<slug>
// FSM fetches this and renders whatever shape comes back — adding a
// "company size" field on a single event is an operator UI op, zero
// bot deploys.
//
// ADR-0037 layer triage: Operational (Directus read) + Customer (bot
// consumes). Cross-layer contract = the RegistrationSchema JSON shape,
// pinned by the bot's pydantic models in
// src/aiqadam_telegram_bot/shared/aiqadam_client.py. Renames here
// require a coordinated cross-repo PR.

// ─── Wire types (match bot's pydantic exactly) ───────────────────────────────

export interface RegistrationField {
  key: string; // payload key (e.g. "name", "email", "country")
  type: 'text' | 'email' | 'choice' | 'multi_choice' | 'yes_no' | 'number' | 'rich_text';
  label: string;
  required: boolean;
  hint: string | null;
  validation: {
    min_length?: number;
    max_length?: number;
    pattern?: string; // regex (Python-flavored)
  } | null;
  options: { value: string; label: string }[] | null; // for choice / multi_choice
}

export interface RegistrationConsent {
  key: string;
  label: string;
  required: boolean;
  url: string | null;
}

export interface RegistrationSchema {
  event: EventSummary;
  fields: RegistrationField[];
  consents: RegistrationConsent[];
}

// ─── Default schema ──────────────────────────────────────────────────────────
//
// Served whenever the event has no registration_schema set. Minimum
// viable: name + email + the events consent (required to dispatch
// confirmations/reminders). Marketing newsletter is opt-in to honor
// the consent-first posture from ADR-0033 / F-S3.6 (member_consents).
//
// Operators customize per-event via the cabinet editor (PR-1.2c).

export const DEFAULT_REGISTRATION_FIELDS: RegistrationField[] = [
  {
    key: 'name',
    type: 'text',
    label: 'Your name',
    required: true,
    hint: 'First and last name',
    validation: { min_length: 2, max_length: 100 },
    options: null,
  },
  {
    key: 'email',
    type: 'email',
    label: 'Email',
    required: true,
    hint: "We'll send your confirmation here",
    validation: { max_length: 255 },
    options: null,
  },
];

export const DEFAULT_REGISTRATION_CONSENTS: RegistrationConsent[] = [
  {
    key: 'events',
    label: 'I agree to receive registration confirmation + event reminders',
    required: true,
    url: null,
  },
  {
    key: 'newsletter',
    label: 'Send me the AI Qadam newsletter (optional)',
    required: false,
    url: null,
  },
];

// ─── Service ─────────────────────────────────────────────────────────────────

// Directus events row narrowed to the fields we read here. Mirrors
// the shape in telegram-events.service.ts but adds the 3 columns from
// PR-1.2a (registration_schema + registration_open + online_meeting_url).
interface EventRowWithSchema {
  id: string;
  slug: string | null;
  title: string;
  starts_at: string;
  location: string | null;
  country: string;
  status: string;
  visibility_scope: string | null;
  capacity: number | null;
  registration_open?: boolean | null;
  registration_schema?:
    | RegistrationSchema
    | { fields: RegistrationField[]; consents?: RegistrationConsent[] }
    | null;
}

@Injectable()
export class TelegramRegistrationSchemaService {
  private readonly logger = new Logger(TelegramRegistrationSchemaService.name);

  constructor(private readonly directus: DirectusClient) {}

  // Returns the full RegistrationSchema for an event by slug-or-id.
  // Slug resolution: try the `slug` column first; if no hit, try the
  // `id` column (PR-4's EventSummary falls back to id when slug is null,
  // so the bot may pass an id-string we need to accept).
  //
  // 404 with { error: 'event_not_found' } when no event matches —
  // distinguishes from "endpoint not shipped" on the bot side per the
  // contract in shared/aiqadam_client.py.
  async getSchema(slugOrId: string): Promise<RegistrationSchema> {
    const row = await this.findEventBySlugOrId(slugOrId);
    if (!row) {
      throw new NotFoundException({ error: 'event_not_found' });
    }

    const event = rowToSummary(row);
    // PR-4 hardcoded registration_open=true; with PR-1.2a's new column,
    // read it through if present. Default true keeps existing rows
    // registration-open without backfill.
    event.registration_open = row.registration_open ?? true;

    const stored = row.registration_schema;
    if (stored && Array.isArray(stored.fields) && stored.fields.length > 0) {
      return {
        event,
        fields: stored.fields,
        consents: stored.consents ?? DEFAULT_REGISTRATION_CONSENTS,
      };
    }

    return {
      event,
      fields: DEFAULT_REGISTRATION_FIELDS,
      consents: DEFAULT_REGISTRATION_CONSENTS,
    };
  }

  private async findEventBySlugOrId(slugOrId: string): Promise<EventRowWithSchema | null> {
    const fields =
      'fields=id,slug,title,starts_at,location,country,status,visibility_scope,capacity,registration_open,registration_schema,online_meeting_url';
    const encoded = encodeURIComponent(slugOrId);

    // Try slug first — most common case post-F-S3.10-a.
    const bySlug = await this.directus.get<{ data: EventRowWithSchema[] }>(
      `/items/events?filter[slug][_eq]=${encoded}&${fields}&limit=1`,
    );
    if (bySlug.data[0]) return bySlug.data[0];

    // Fallback to id — required for existing events without slug, per
    // the slug-or-id contract documented in telegram-events.service.ts.
    // UUID filter only matches if slugOrId is a syntactically-valid uuid;
    // Directus returns empty data on non-uuid strings rather than 400.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)) {
      return null;
    }
    const byId = await this.directus.get<{ data: EventRowWithSchema[] }>(
      `/items/events?filter[id][_eq]=${encoded}&${fields}&limit=1`,
    );
    return byId.data[0] ?? null;
  }
}
