import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// aiqadam#292 — registration form auto-fill. Returns the caller's
// previously-saved profile values keyed on the same `key` the bot uses
// in the registration schema, so the bot can pre-fill any field for
// returning members without per-field logic.
//
// Source of truth:
//   - directus_users base fields (first_name, last_name, email) →
//     the canonical name + email
//   - last (most recent) registration's `profile` jsonb → overrides for
//     any custom field the operator added (company, phone, etc.)
//
// Merge semantics: registration.profile values WIN over directus_users
// when both exist. Rationale: a member who updates their name in a
// later registration intends that to be the new default. Operators
// don't write directly to directus_users for member-supplied data.
//
// ADR-0037 layer triage:
//   - Customer (bot pre-fill UX)
//   - Operational (reads Directus member + registrations)
//   - No engineering touch
// Cross-layer contract = the `{defaults: {key: string}}` shape pinned
// by the bot's pydantic ProfileDefaults model.

// ─── Wire shape ──────────────────────────────────────────────────────────────

export interface ProfileDefaultsResult {
  defaults: Record<string, string>;
}

// ─── Internal Directus shapes ────────────────────────────────────────────────

interface DirectusMemberRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface RegistrationRow {
  id: string;
  date_created: string;
  profile: Record<string, unknown> | null;
}

@Injectable()
export class TelegramProfileDefaultsService {
  private readonly logger = new Logger(TelegramProfileDefaultsService.name);

  constructor(private readonly directus: DirectusClient) {}

  async getDefaults(memberId: string): Promise<ProfileDefaultsResult> {
    const member = await this.findMember(memberId);
    if (!member) {
      throw new NotFoundException({ error: 'member_not_found' });
    }

    const lastProfile = await this.lastRegistrationProfile(memberId);

    return { defaults: mergeDefaults(member, lastProfile) };
  }

  private async findMember(memberId: string): Promise<DirectusMemberRow | null> {
    try {
      const res = await this.directus.get<{ data: DirectusMemberRow }>(
        `/users/${encodeURIComponent(memberId)}?fields=id,email,first_name,last_name`,
      );
      return res.data;
    } catch (err) {
      if (err instanceof DirectusError && (err.status === 404 || err.status === 403)) {
        return null;
      }
      throw err;
    }
  }

  // Returns the profile jsonb from the member's most-recent registration
  // (any status). Null when the member has no registrations yet.
  private async lastRegistrationProfile(memberId: string): Promise<Record<string, unknown> | null> {
    const u = encodeURIComponent(memberId);
    const query = [
      `filter[user][_eq]=${u}`,
      'fields=id,date_created,profile',
      'sort=-date_created',
      'limit=1',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: RegistrationRow[] }>(
        `/items/registrations?${query}`,
      );
      return res.data[0]?.profile ?? null;
    } catch (err) {
      // Best-effort enrichment — falling back to the base member fields
      // is better than 5xx-ing the auto-fill request.
      const reason = err instanceof DirectusError ? `directus_${err.status}` : 'unknown';
      this.logger.warn(`lastRegistrationProfile failed for member=${memberId}: ${reason}`);
      return null;
    }
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

// Builds the {defaults} map per the contract:
//   - `name` from first_name + last_name (or first_name alone)
//   - `email` from directus_users
//   - any profile.* keys from the last registration override the above
//     and fill in operator-defined fields (company, phone, etc.)
//   - keys with no saved value are OMITTED (not null) so "present + empty"
//     is distinct from "never set"
export function mergeDefaults(
  member: { email: string; first_name: string | null; last_name: string | null },
  lastProfile: Record<string, unknown> | null,
): Record<string, string> {
  const out: Record<string, string> = {};

  const name = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  if (name.length > 0) {
    out.name = name;
  }
  if (member.email && member.email.trim().length > 0) {
    out.email = member.email;
  }

  if (lastProfile) {
    for (const [key, value] of Object.entries(lastProfile)) {
      // Only carry string-typed values. Number/bool/array values aren't
      // useful for form pre-fill (each schema field is text-typed on the
      // bot's side); skip them defensively.
      if (typeof value === 'string' && value.trim().length > 0) {
        out[key] = value;
      }
    }
  }

  return out;
}
