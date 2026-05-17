import { Injectable, Logger } from '@nestjs/common';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// Member-side registration ops, backed by Directus instead of Drizzle.
// Capacity / waitlist promotion / point award / email side-effects are
// all done by Directus flows (see infrastructure/directus/flows-bootstrap.sh
// installed in Sprint 3). This service is just thin REST orchestration.
//
// Tenant scoping happens via the `country` field on the event (filtered
// before issuing the registration). Members can only register for events
// in their tenant.

export type Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended';

export interface RegistrationRow {
  id: string;
  event: string;
  user: string;
  status: Status;
  checkin_code: string;
  checked_in_at: string | null;
  cancelled_at: string | null;
  date_created: string;
  date_updated: string | null;
}

export interface RegistrationView {
  id: string;
  eventId: string;
  status: Status;
  checkinCode: string;
  checkedInAt: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

export interface MineEntry {
  registration: RegistrationView;
  event: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    location: string | null;
  };
}

export class RegistrationNotFoundError extends Error {}
export class RegistrationIneligibleError extends Error {}
export class CheckinNotFoundError extends Error {}
export class CheckinIneligibleError extends Error {}

@Injectable()
export class RegistrationsDirectusService {
  private readonly logger = new Logger(RegistrationsDirectusService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly bridge: DirectusUsersBridgeService,
  ) {}

  // POST: idempotently create (or fetch existing non-cancelled) registration
  // for (user, event). Capacity flow patches status to waitlisted if needed.
  async register(input: {
    userId: string;
    eventId: string;
    countryCode: string;
  }): Promise<RegistrationView> {
    const directusUserId = await this.requireDirectusUserId(input.userId);
    await this.assertEventInTenant(input.eventId, input.countryCode);

    // Idempotency: if a non-cancelled row exists, return it instead of
    // creating a duplicate. Cancelled rows can be "re-registered" by
    // inserting a fresh row.
    const existing = await this.findActiveByUserEvent(directusUserId, input.eventId);
    if (existing) {
      return toView(existing);
    }

    const created = await this.directus.post<{ data: RegistrationRow }>('/items/registrations', {
      user: directusUserId,
      event: input.eventId,
    });
    // Re-read so the capacity flow's status patch is reflected.
    const settled = await this.directus.get<{ data: RegistrationRow }>(
      `/items/registrations/${created.data.id}`,
    );
    return toView(settled.data);
  }

  // DELETE: flip the active reg's status to cancelled. Returns null if no
  // active reg exists (already cancelled, never registered).
  async cancel(input: {
    userId: string;
    eventId: string;
    countryCode: string;
  }): Promise<RegistrationView | null> {
    const directusUserId = await this.requireDirectusUserId(input.userId);
    await this.assertEventInTenant(input.eventId, input.countryCode);

    const existing = await this.findActiveByUserEvent(directusUserId, input.eventId);
    if (!existing) return null;

    const patched = await this.directus.patch<{ data: RegistrationRow }>(
      `/items/registrations/${existing.id}`,
      { status: 'cancelled', cancelled_at: new Date().toISOString() },
    );
    return toView(patched.data);
  }

  // /me: every non-cancelled reg for the user, scoped to the tenant.
  async listMine(input: { userId: string; countryCode: string }): Promise<MineEntry[]> {
    const directusUserId = await this.requireDirectusUserId(input.userId);
    const params = new URLSearchParams({
      'filter[user][_eq]': directusUserId,
      'filter[status][_neq]': 'cancelled',
      'filter[event][country][_eq]': input.countryCode,
      fields: [
        'id',
        'event',
        'user',
        'status',
        'checkin_code',
        'checked_in_at',
        'cancelled_at',
        'date_created',
        'date_updated',
        'event.id',
        'event.title',
        'event.starts_at',
        'event.ends_at',
        'event.location',
      ].join(','),
      sort: '-date_created',
      limit: '-1',
    });
    interface MineRow extends Omit<RegistrationRow, 'event'> {
      event: {
        id: string;
        title: string;
        starts_at: string;
        ends_at: string;
        location: string | null;
      };
    }
    const body = await this.directus.get<{ data: MineRow[] }>(
      `/items/registrations?${params.toString()}`,
    );
    return body.data.map((row) => ({
      registration: toView({ ...row, event: row.event.id }),
      event: {
        id: row.event.id,
        title: row.event.title,
        startsAt: row.event.starts_at,
        endsAt: row.event.ends_at,
        location: row.event.location,
      },
    }));
  }

  // Check-in by QR code: PATCH status to attended. Idempotent — re-scan
  // returns the existing row's checked_in_at. Throws on unknown code or a
  // reg that isn't eligible (cancelled / waitlisted).
  async checkin(code: string): Promise<{
    registration: RegistrationView;
    alreadyCheckedIn: boolean;
    event: { id: string; title: string; startsAt: string; endsAt: string; location: string | null };
  }> {
    interface CheckinRow extends Omit<RegistrationRow, 'event'> {
      event: {
        id: string;
        title: string;
        starts_at: string;
        ends_at: string;
        location: string | null;
      };
    }
    const params = new URLSearchParams({
      'filter[checkin_code][_eq]': code,
      fields: [
        'id',
        'event',
        'user',
        'status',
        'checkin_code',
        'checked_in_at',
        'cancelled_at',
        'date_created',
        'date_updated',
        'event.id',
        'event.title',
        'event.starts_at',
        'event.ends_at',
        'event.location',
      ].join(','),
      limit: '1',
    });
    const found = await this.directus.get<{ data: CheckinRow[] }>(
      `/items/registrations?${params.toString()}`,
    );
    const row = found.data[0];
    if (!row) {
      throw new CheckinNotFoundError('check-in code not recognized');
    }
    if (row.status === 'cancelled') {
      throw new CheckinIneligibleError('this registration was cancelled');
    }
    if (row.status === 'waitlisted') {
      throw new CheckinIneligibleError('waitlisted — promoted users only get a check-in code');
    }

    const eventView = {
      id: row.event.id,
      title: row.event.title,
      startsAt: row.event.starts_at,
      endsAt: row.event.ends_at,
      location: row.event.location,
    };

    if (row.status === 'attended') {
      return {
        registration: toView({ ...row, event: row.event.id }),
        alreadyCheckedIn: true,
        event: eventView,
      };
    }

    const patched = await this.directus.patch<{ data: CheckinRow }>(
      `/items/registrations/${row.id}`,
      { status: 'attended', checked_in_at: new Date().toISOString() },
    );
    return {
      registration: toView({ ...patched.data, event: patched.data.event.id }),
      alreadyCheckedIn: false,
      event: eventView,
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private async requireDirectusUserId(userId: string): Promise<string> {
    const id = await this.bridge.resolveDirectusId(userId);
    if (!id) {
      throw new RegistrationIneligibleError('account not yet linked to CMS — sign out and back in');
    }
    return id;
  }

  // Confirms the event is published + scoped to the caller's tenant.
  // Avoids letting a member of `uz` register for a `kz` event by id-guessing.
  private async assertEventInTenant(eventId: string, countryCode: string): Promise<void> {
    try {
      const body = await this.directus.get<{
        data: { id: string; country: string; status: string } | null;
      }>(`/items/events/${eventId}?fields=id,country,status`);
      const ev = body.data;
      if (!ev || ev.country !== countryCode || ev.status !== 'published') {
        throw new RegistrationNotFoundError(`event ${eventId} not available in ${countryCode}`);
      }
    } catch (err) {
      if (err instanceof DirectusError && err.status === 404) {
        throw new RegistrationNotFoundError(`event ${eventId} not found`);
      }
      throw err;
    }
  }

  private async findActiveByUserEvent(
    directusUserId: string,
    eventId: string,
  ): Promise<RegistrationRow | undefined> {
    const params = new URLSearchParams({
      'filter[user][_eq]': directusUserId,
      'filter[event][_eq]': eventId,
      'filter[status][_neq]': 'cancelled',
      limit: '1',
      fields:
        'id,event,user,status,checkin_code,checked_in_at,cancelled_at,date_created,date_updated',
    });
    const body = await this.directus.get<{ data: RegistrationRow[] }>(
      `/items/registrations?${params.toString()}`,
    );
    return body.data[0];
  }
}

function toView(row: RegistrationRow): RegistrationView {
  return {
    id: row.id,
    eventId: row.event,
    status: row.status,
    checkinCode: row.checkin_code,
    checkedInAt: row.checked_in_at,
    createdAt: row.date_created,
    updatedAt: row.date_updated ?? row.date_created,
    cancelledAt: row.cancelled_at,
  };
}
