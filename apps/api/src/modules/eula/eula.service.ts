import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// Sprint 5.5/7 — EULA resolution + acceptance recording.
//
// Per docs/04-development/architecture/interaction-architecture.md §5: events resolve their EULA via
//   event.eula_id  ?? event_type.default_eula_id  ?? null
// A null result means "no prompt" — the registration flow is a no-op
// for consent, as in Sprints 1-4.
//
// When an EULA does apply, registration MUST include an acceptance
// payload. recordAcceptance() inserts one eula_acceptances row + one
// consent_records row per intent the user consented to.

export class EulaNotResolvedError extends Error {}
export class EulaAcceptanceMismatchError extends Error {}
export class EulaConsentIncompleteError extends Error {}

export interface ResolvedEula {
  eulaId: string;
  slug: string;
  version: string;
  locale: string;
  title: string;
  bodyMarkdown: string;
  requiredConsents: string[];
}

export interface AcceptanceInput {
  eulaId: string;
  consentedIntents: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface EulaRow {
  id: string;
  slug: string;
  version: string;
  locale: string;
  status: string;
  title: string;
  body_markdown: string;
  required_consents: string[] | null;
}

interface EventRow {
  id: string;
  eula_id: string | null;
  format: string | null;
}

interface EventTypeRow {
  key: string;
  default_eula_id: string | null;
}

@Injectable()
export class EulaService {
  private readonly logger = new Logger(EulaService.name);

  constructor(private readonly directus: DirectusClient) {}

  // Returns the EULA the user must accept to register for this event,
  // or null if no prompt is needed. Read-only — safe to call from the
  // /consent-prompt endpoint and from the registration flow.
  async resolveForEvent(eventId: string): Promise<ResolvedEula | null> {
    const eventBody = await this.directus.get<{ data: EventRow | null }>(
      `/items/events/${eventId}?fields=id,eula_id,format`,
    );
    const event = eventBody.data;
    if (!event) return null;

    let eulaId: string | null = event.eula_id;
    if (!eulaId && event.format) {
      const typeBody = await this.directus.get<{ data: EventTypeRow | null }>(
        `/items/event_types/${event.format}?fields=key,default_eula_id`,
      );
      eulaId = typeBody.data?.default_eula_id ?? null;
    }
    if (!eulaId) return null;
    return this.loadEula(eulaId);
  }

  // Writes the acceptance + per-intent consent rows. Must be called AFTER
  // registration insert so source_ref carries the registration id. Throws
  // if the supplied eulaId doesn't match the event's resolved EULA, or if
  // the consentedIntents are missing any items the EULA marks required.
  async recordAcceptance(input: {
    userId: string;
    eventId: string;
    registrationId: string;
    acceptance: AcceptanceInput;
  }): Promise<void> {
    const required = await this.resolveForEvent(input.eventId);
    if (!required) {
      throw new EulaNotResolvedError(
        `event ${input.eventId} has no EULA — acceptance not expected`,
      );
    }
    if (required.eulaId !== input.acceptance.eulaId) {
      throw new EulaAcceptanceMismatchError(
        `acceptance.eulaId=${input.acceptance.eulaId} does not match event's resolved EULA ${required.eulaId}`,
      );
    }
    const missing = required.requiredConsents.filter(
      (intent) => !input.acceptance.consentedIntents.includes(intent),
    );
    if (missing.length > 0) {
      throw new EulaConsentIncompleteError(
        `acceptance missing required consents: ${missing.join(', ')}`,
      );
    }

    const now = new Date().toISOString();
    await this.directus.post('/items/eula_acceptances', {
      user: input.userId,
      eula: required.eulaId,
      source_event: input.eventId,
      accepted_at: now,
      ip_address: input.acceptance.ipAddress ?? null,
      user_agent: input.acceptance.userAgent ?? null,
    });

    // One consent_records row per intent. Source = registration so
    // operators can trace why a grant exists.
    for (const intent of input.acceptance.consentedIntents) {
      await this.directus.post('/items/consent_records', {
        user: input.userId,
        // Acceptances are about the platform → user contract; bucket under
        // 'system' so /me/preferences (which queries on operator/sponsor/
        // speaker) doesn't show these as toggleable. Operators can still
        // audit by intent.
        initiator_actor_class: 'system',
        intent_class: intent,
        scope: { event_id: input.eventId },
        granted_at: now,
        revoked_at: null,
        source: 'registration',
        source_ref: { registration_id: input.registrationId, event_id: input.eventId },
      });
    }
  }

  private async loadEula(eulaId: string): Promise<ResolvedEula | null> {
    const body = await this.directus.get<{ data: EulaRow | null }>(
      `/items/eulas/${eulaId}?fields=id,slug,version,locale,status,title,body_markdown,required_consents`,
    );
    const row = body.data;
    if (!row || row.status !== 'published') return null;
    return {
      eulaId: row.id,
      slug: row.slug,
      version: row.version,
      locale: row.locale,
      title: row.title,
      bodyMarkdown: row.body_markdown,
      requiredConsents: row.required_consents ?? [],
    };
  }
}
