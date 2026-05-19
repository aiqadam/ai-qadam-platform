import { Injectable, Logger } from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';
import type { ConsentBasis, InitiatorActor } from './interactions.types';

// Sprint 5.5/5b — consent service.
//
// Replaces InteractionsService's inline trivial `checkConsent`. For each
// (recipient, interaction) pair the dispatcher asks: should this go out?
// Outcomes:
//   { ok: true }                  → adapter runs
//   { ok: false, reason: '...' }  → delivery row state=skipped_consent
//
// Decision per consent_basis (per docs/interaction-architecture.md §5):
//
//   operational_contract  → always pass (transactional reply for an
//                           action the user just took: registration
//                           confirmation, password reset, ...)
//
//   explicit_opt_in       → query consent_records for the latest row
//                           matching (user, initiator_actor_class,
//                           intent_class, scope). Most recent wins;
//                           revoked_at must be null to pass.
//
//   b2b_contract          → trust when initiator is sponsor/speaker/
//                           operator. Future: assert recipient is an
//                           operator (operator role lands in Sprint 6+).
//
//   event_eula            → check eula_acceptances for the scope's
//                           eula_id. Deferred to 5.5/7 (registration-
//                           time prompt is what populates the data).
//
//   client_initiated      → check a recent (last N hours) interaction
//                           where the recipient was the initiator and
//                           current initiator was the recipient.
//                           Deferred — first use case is support replies
//                           which we don't have yet.
//
// Reads only. The /me/preferences UI (5.5/6) writes consent_records;
// the registration-time prompt (5.5/7) writes eula_acceptances.

export interface CheckConsentInput {
  userId: string;
  initiatorActor: InitiatorActor;
  intent: string;
  consentBasis: ConsentBasis;
  consentScope?: Record<string, unknown> | null | undefined;
}

export type ConsentDecision = { ok: true } | { ok: false; reason: string };

interface ConsentRecord {
  id: string;
  granted_at: string;
  revoked_at: string | null;
  scope: Record<string, unknown> | null;
}

// Map initiator_actor → consent_records.initiator_actor_class. The latter
// is a coarser bucket (we don't track per-sponsor consent today — that's
// what `scope: {sponsor_id}` is for) so 'sponsor'/'speaker'/'operator'/
// 'client'/'system' map 1:1. 'team' as initiator collapses to 'system'
// because consent for team broadcasts is implicit in team membership.
const ACTOR_TO_CLASS: Record<InitiatorActor, string> = {
  operator: 'operator',
  sponsor: 'sponsor',
  speaker: 'speaker',
  client: 'client',
  system: 'system',
  team: 'system',
};

@Injectable()
export class ConsentService {
  private readonly logger = new Logger(ConsentService.name);

  constructor(private readonly directus: DirectusClient) {}

  async check(input: CheckConsentInput): Promise<ConsentDecision> {
    switch (input.consentBasis) {
      case 'operational_contract':
        return { ok: true };

      case 'b2b_contract':
        if (input.initiatorActor === 'client') {
          return {
            ok: false,
            reason: 'b2b_contract requires non-client initiator',
          };
        }
        return { ok: true };

      case 'explicit_opt_in':
        return this.checkExplicitOptIn(input);

      case 'event_eula':
        return {
          ok: false,
          reason: 'event_eula consent check not yet implemented (5.5/7)',
        };

      case 'client_initiated':
        return {
          ok: false,
          reason: 'client_initiated consent check not yet implemented',
        };
    }
  }

  private async checkExplicitOptIn(input: CheckConsentInput): Promise<ConsentDecision> {
    const actorClass = ACTOR_TO_CLASS[input.initiatorActor];
    // Coarse query: filter by user + initiator_actor_class + intent_class.
    // Scope match is done in code because Directus filter on a jsonb
    // column matching a specific shape is awkward and we expect <10 rows
    // per user × intent in practice.
    const filter = encodeURIComponent(
      JSON.stringify({
        user: { _eq: input.userId },
        initiator_actor_class: { _eq: actorClass },
        intent_class: { _eq: input.intent },
      }),
    );
    const url = `/items/consent_records?filter=${filter}&sort=-granted_at&limit=20&fields=id,granted_at,revoked_at,scope`;
    const res = await this.directus.get<{ data: ConsentRecord[] }>(url);

    const matching = res.data.filter((r) => scopeMatches(r.scope, input.consentScope));
    const latest = matching[0]; // sort=-granted_at already applied

    if (!latest) {
      return {
        ok: false,
        reason: `no consent_record for user×${actorClass}×${input.intent}`,
      };
    }
    if (latest.revoked_at !== null) {
      return {
        ok: false,
        reason: `consent revoked at ${latest.revoked_at}`,
      };
    }
    return { ok: true };
  }
}

// A consent_record with `scope: null` covers ALL scopes (broadest grant).
// A request with no scope matches any granted record. Otherwise, every
// key in the request's scope must equal the corresponding key in the
// record's scope.
function scopeMatches(
  recordScope: Record<string, unknown> | null,
  requestScope: Record<string, unknown> | null | undefined,
): boolean {
  if (recordScope === null) return true;
  if (!requestScope) return false;
  for (const key of Object.keys(recordScope)) {
    if (recordScope[key] !== requestScope[key]) return false;
  }
  return true;
}
