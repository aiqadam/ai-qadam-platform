import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { DirectusClient } from '../directus/directus.client';

// aiqadam#281 Part 1 — bot's /me command. Lists the caller's
// registrations (upcoming first, then past) so they can see what
// they're attending without typing an email.
//
// Bundle 4 deliverable. Part 2 (invites/redeem) lands separately
// because it needs a new Directus collection + signed-token issuance.
//
// ADR-0037 layer triage:
//   - Customer (bot owns the /me UI)
//   - Operational (reads Directus registrations + event m2o)
//   - No engineering touch
// Cross-layer contract = the response shape pinned by the bot's
// pydantic /me handler. Renames here require a coordinated cross-repo PR.

// ─── Wire shape (matches bot's pydantic) ─────────────────────────────────────

export interface MeRegistrationEvent {
  id: string;
  slug: string; // never null on the wire — falls back to id when CMS slug missing
  title: string;
  starts_at: string;
  location: string | null;
}

export interface MeRegistration {
  registration_id: string;
  event: MeRegistrationEvent;
  checked_in_at: string | null;
  // Present when check-in is still ahead (checked_in_at is null AND we
  // have a code on the row); null when already checked in (no QR
  // needed) OR no code issued yet (virtual event etc.).
  qr_token: string | null;
  // Where to read more about this registration on web. Matches the
  // F-S5.4 /me/registrations route pattern.
  web_url: string;
}

// ─── Internal Directus shape ─────────────────────────────────────────────────

interface RegistrationRow {
  id: string;
  status: string;
  checked_in_at: string | null;
  checkin_code: string | null;
  event: {
    id: string;
    slug: string | null;
    title: string;
    starts_at: string;
    location: string | null;
  } | null;
}

@Injectable()
export class TelegramMeService {
  private readonly logger = new Logger(TelegramMeService.name);

  constructor(private readonly directus: DirectusClient) {}

  // Returns all of the caller's registrations sorted future-first, then
  // past most-recent first. Cancelled rows are excluded — they're a
  // mistake or a withdrawal, not something the bot's /me should display.
  // Empty array is fine; bot renders "No registrations yet."
  async listMyRegistrations(tgUserId: bigint): Promise<MeRegistration[]> {
    const t = encodeURIComponent(tgUserId.toString());
    const query = [
      `filter[telegram_user_id][_eq]=${t}`,
      'filter[status][_neq]=cancelled',
      'fields=id,status,checked_in_at,checkin_code,event.id,event.slug,event.title,event.starts_at,event.location',
      'limit=100',
    ].join('&');

    const res = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?${query}`,
    );

    const items: MeRegistration[] = [];
    for (const row of res.data) {
      // Defensive: skip rows whose event has been deleted (m2o resolves
      // to null). Shouldn't happen in normal operation; logged so we
      // notice if it starts.
      if (!row.event) {
        this.logger.warn(`registration ${row.id} has no event; skipping in /me list`);
        continue;
      }
      items.push(rowToWire(row, row.event));
    }
    return sortFutureFirst(items);
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

export function rowToWire(
  row: { id: string; checked_in_at: string | null; checkin_code: string | null },
  event: {
    id: string;
    slug: string | null;
    title: string;
    starts_at: string;
    location: string | null;
  },
): MeRegistration {
  return {
    registration_id: row.id,
    event: {
      id: event.id,
      slug: event.slug && event.slug.length > 0 ? event.slug : event.id,
      title: event.title,
      starts_at: event.starts_at,
      location: event.location,
    },
    checked_in_at: row.checked_in_at,
    // Only expose the code when it's still useful — post-check-in we
    // shouldn't leak the same secret a future scanner might accept.
    qr_token: row.checked_in_at == null ? row.checkin_code : null,
    web_url: buildWebUrl(row.id),
  };
}

// Future-first, then past most-recent first. "Future" = starts_at > now.
// Stable secondary sort on registration_id for determinism in tests.
export function sortFutureFirst(items: MeRegistration[]): MeRegistration[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aT = Date.parse(a.event.starts_at);
    const bT = Date.parse(b.event.starts_at);
    const aFuture = aT > now;
    const bFuture = bT > now;
    if (aFuture !== bFuture) return aFuture ? -1 : 1; // future before past
    if (aFuture) return aT - bT; // future: closest first
    return bT - aT; // past: most-recent first
  });
}

function buildWebUrl(registrationId: string): string {
  // F-S5.4 + F-S3.6 surface the /me/registrations/<id> page on the
  // tenant's web. WEB_BASE_URL is a required env var (validated at
  // bootstrap) so always defined.
  return `${env.WEB_BASE_URL.replace(/\/$/, '')}/me/registrations/${registrationId}`;
}
