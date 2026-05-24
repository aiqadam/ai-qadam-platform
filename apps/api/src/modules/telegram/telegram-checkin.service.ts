import {
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DirectusClient } from '../directus/directus.client';

// aiqadam#280 — bot-facing event check-in. The bot calls this when the
// user opens a deeplink like t.me/aiqadameventbot?start=checkin_<token>
// or types /checkin <token>.
//
// Idempotent on the checkin_code → status='attended' transition: a
// repeat tap returns 200 with first_checkin=false rather than 409. The
// 409 path is reserved for "event window not yet open" (operator can
// require day-of check-in).
//
// ADR-0037 layer triage:
//   - Customer (bot owns the /checkin UX)
//   - Operational (mutates registrations.{status, checked_in_at})
//   - No engineering touch
// Cross-layer contract = the response shape pinned by the bot's pydantic
// CheckinResponse model. Renames here require a coordinated cross-repo PR.

// ─── Wire shape (matches bot's pydantic exactly) ─────────────────────────────

export interface CheckinResult {
  member_id: string;
  event_id: string;
  event_title: string;
  checked_in_at: string;
  first_checkin: boolean;
}

// ─── Internal Directus shapes ────────────────────────────────────────────────

interface RegistrationRow {
  id: string;
  user: string;
  status: string;
  checked_in_at: string | null;
  event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
  } | null;
}

// Operator-tunable window: how far before starts_at can a user check in?
// Defaults to 60 minutes — covers early arrivals at IRL meetups; tight
// enough to reject deeplink replays the night before. If we need per-
// event windows later, this moves to events.{checkin_opens_at, ...}.
const CHECKIN_WINDOW_BEFORE_MS = 60 * 60 * 1000;

// #316 — `registrations.checkin_code` is a uuid column. Pre-check
// shape before querying so non-UUID tokens don't crash Postgres's
// cast and propagate as 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class TelegramCheckinService {
  private readonly logger = new Logger(TelegramCheckinService.name);

  constructor(private readonly directus: DirectusClient) {}

  async checkin(token: string): Promise<CheckinResult> {
    const row = await this.findRegistrationByToken(token);
    if (!row) {
      throw new NotFoundException({ error: 'checkin_token_not_found' });
    }
    if (!row.event) {
      // Defensive: registration's event was deleted. Bot UX is the same
      // as a bad token — the link no longer points anywhere usable.
      this.logger.warn(`checkin token ${token} resolves to registration ${row.id} with no event`);
      throw new NotFoundException({ error: 'checkin_token_not_found' });
    }

    const now = Date.now();
    const startsAt = Date.parse(row.event.starts_at);
    const endsAt = Date.parse(row.event.ends_at);
    if (Number.isFinite(startsAt) && now < startsAt - CHECKIN_WINDOW_BEFORE_MS) {
      throw new ConflictException({ error: 'event_not_started' });
    }
    if (Number.isFinite(endsAt) && now > endsAt) {
      throw new GoneException({ error: 'event_ended' });
    }

    // Idempotent — replay returns the existing checked_in_at with
    // first_checkin=false. status='attended' is the marker.
    if (row.status === 'attended' && row.checked_in_at) {
      return {
        member_id: row.user,
        event_id: row.event.id,
        event_title: row.event.title,
        checked_in_at: row.checked_in_at,
        first_checkin: false,
      };
    }

    const checkedAt = new Date().toISOString();
    await this.directus.patch(`/items/registrations/${encodeURIComponent(row.id)}`, {
      status: 'attended',
      checked_in_at: checkedAt,
    });
    return {
      member_id: row.user,
      event_id: row.event.id,
      event_title: row.event.title,
      checked_in_at: checkedAt,
      first_checkin: true,
    };
  }

  private async findRegistrationByToken(token: string): Promise<RegistrationRow | null> {
    // #316 — `registrations.checkin_code` is a Postgres uuid column.
    // Directus's filter[_eq] casts the value before WHERE; a non-UUID
    // token raises a 500 from the underlying CAST. Pre-check the shape
    // here and treat non-UUID tokens as "not found" (caller will throw
    // the documented 404 checkin_token_not_found) — same observable
    // result as "valid UUID that doesn't exist." Future short-token
    // variants would live in a separate column with its own validator.
    if (!UUID_RE.test(token)) return null;
    const t = encodeURIComponent(token);
    const query = [
      `filter[checkin_code][_eq]=${t}`,
      'fields=id,user,status,checked_in_at,event.id,event.title,event.starts_at,event.ends_at',
      'limit=1',
    ].join('&');
    const res = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?${query}`,
    );
    return res.data[0] ?? null;
  }
}
