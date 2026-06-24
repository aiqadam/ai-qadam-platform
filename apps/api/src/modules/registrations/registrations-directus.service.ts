import { Injectable, Logger } from '@nestjs/common';
import { BadgeAwarderService } from '../badges/badge-awarder.service';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient, DirectusError } from '../directus/directus.client';
import {
  type AcceptanceInput,
  EulaAcceptanceMismatchError,
  EulaConsentIncompleteError,
  EulaService,
} from '../eula/eula.service';

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
export class RegistrationConsentRequiredError extends Error {}
export class CheckinNotFoundError extends Error {}
export class CheckinIneligibleError extends Error {}
export class WrongEventError extends Error {
  constructor(eventTitle: string) {
    super(`this ticket is for a different event: ${eventTitle}`);
    this.name = 'WrongEventError';
  }
}

@Injectable()
export class RegistrationsDirectusService {
  private readonly logger = new Logger(RegistrationsDirectusService.name);

  constructor(
    private readonly directus: DirectusClient,
    private readonly bridge: DirectusUsersBridgeService,
    private readonly eulas: EulaService,
    private readonly badges: BadgeAwarderService,
  ) {}

  // POST: idempotently create (or fetch existing non-cancelled) registration
  // for (user, event). Capacity flow patches status to waitlisted if needed.
  //
  // Sprint 5.5/7: if the event resolves to an EULA, the caller MUST pass
  // an `acceptance` block (eulaId + consented intents). On success we
  // write eula_acceptances + per-intent consent_records rows linked to
  // the new registration. If the event has no EULA (null after both
  // event.eula_id and event_type.default_eula_id lookups), `acceptance`
  // is ignored.
  async register(input: {
    userId: string;
    eventId: string;
    countryCode: string;
    acceptance?: AcceptanceInput | undefined;
    referredBy?: string | undefined;
    acquisitionSource?: Record<string, unknown> | undefined;
  }): Promise<RegistrationView> {
    const directusUserId = await this.requireDirectusUserId(input.userId);
    await this.assertEventInTenant(input.eventId, input.countryCode);

    // EULA gate runs BEFORE the registration insert so a missing
    // acceptance never produces an orphan registration row.
    const required = await this.eulas.resolveForEvent(input.eventId);
    if (required && !input.acceptance) {
      throw new RegistrationConsentRequiredError(
        `event ${input.eventId} requires EULA acceptance — call /consent-prompt first`,
      );
    }

    // Idempotency: if a non-cancelled row exists, return it instead of
    // creating a duplicate. We do NOT re-write acceptance/consent rows
    // for the idempotent case — the user already accepted on first
    // registration. Same with referred_by / acquisition_source — first
    // touch wins.
    const existing = await this.findActiveByUserEvent(directusUserId, input.eventId);
    if (existing) {
      return toView(existing);
    }

    const insertBody: Record<string, unknown> = {
      user: directusUserId,
      event: input.eventId,
    };
    // F-S3.9: self-referrals discarded (a user can't refer themselves).
    if (input.referredBy && input.referredBy !== directusUserId) {
      insertBody.referred_by = input.referredBy;
    }
    if (input.acquisitionSource) {
      insertBody.acquisition_source = input.acquisitionSource;
    }
    const created = await this.directus.post<{ data: RegistrationRow }>(
      '/items/registrations',
      insertBody,
    );

    if (required && input.acceptance) {
      await this.recordAcceptanceOrThrow({
        userId: directusUserId,
        eventId: input.eventId,
        registrationId: created.data.id,
        acceptance: input.acceptance,
      });
    }

    // Re-read so the capacity flow's status patch is reflected.
    const settled = await this.directus.get<{ data: RegistrationRow }>(
      `/items/registrations/${created.data.id}`,
    );

    await this.maybeFireFirstEventWelcome({
      directusUserId,
      eventId: input.eventId,
      registrationId: created.data.id,
    });

    return toView(settled.data);
  }

  // C-4b-2b — first-event welcome trigger. Extracted so register() stays
  // under the noExcessiveCognitiveComplexity ceiling. Best-effort —
  // every branch swallows its error; never blocks register().
  private async maybeFireFirstEventWelcome(input: {
    directusUserId: string;
    eventId: string;
    registrationId: string;
  }): Promise<void> {
    try {
      const [userRow, eventRow] = await Promise.all([
        this.directus.get<{ data: { email: string | null; first_name: string | null } }>(
          `/items/directus_users/${input.directusUserId}?fields=email,first_name`,
        ),
        this.directus.get<{ data: { title: string; starts_at: string } }>(
          `/items/events/${input.eventId}?fields=title,starts_at`,
        ),
      ]);
      if (!userRow.data.email) return;
      await this.badges.onRegistrationCreated({
        directusUserId: input.directusUserId,
        recipientEmail: userRow.data.email,
        ...(userRow.data.first_name ? { recipientName: userRow.data.first_name } : {}),
        eventTitle: eventRow.data.title,
        eventStartsAt: new Date(eventRow.data.starts_at),
      });
    } catch (err) {
      this.logger.warn(
        `first-event-welcome lookup failed user=${input.directusUserId} reg=${input.registrationId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
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
        country: string;
      };
      referred_by: string | null;
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
        'referred_by',
        'event.id',
        'event.title',
        'event.starts_at',
        'event.ends_at',
        'event.location',
        'event.country',
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
    // F-S5.3 — best-effort referral bonus + brought-a-friend badge for
    // the referrer when the referee actually attends (not just registers).
    // Failure never blocks check-in; we log + continue.
    if (row.referred_by) {
      await this.awardReferralBonus({
        registrationId: row.id,
        refereeUserId: row.user,
        referrerUserId: row.referred_by,
        eventCountry: row.event.country,
      });
    }
    // C-4b-2 — evaluate count_attended badge rules for the attendee.
    // Errors are swallowed by the awarder; never blocks check-in.
    try {
      await this.badges.onAttendanceRecorded({
        refereeUserId: row.user,
        eventId: row.event.id,
      });
    } catch (err) {
      this.logger.warn(
        `badge awarder threw for user=${row.user} event=${row.event.id}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    return {
      registration: toView({ ...patched.data, event: patched.data.event.id }),
      alreadyCheckedIn: false,
      event: eventView,
    };
  }

  // FR-MIG-021: check-in with event validation + member enrichment.
  // The token is the checkin_code UUID from the registration. The eventId
  // is provided by the operator's dropdown. If the token belongs to a
  // different event, throws WrongEventError with the correct event title.
  async checkinWithEvent(token: string, eventId: string): Promise<{
    registration: RegistrationView;
    alreadyCheckedIn: boolean;
    member: { name: string; avatar: string | null };
    event: { id: string; title: string; startsAt: string; endsAt: string; location: string | null };
  }> {
    // Fetch the registration with event + user info in a single query.
    const params = new URLSearchParams({
      'filter[checkin_code][_eq]': token,
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
        'referred_by',
        'event.id',
        'event.title',
        'event.starts_at',
        'event.ends_at',
        'event.location',
        'event.country',
      ].join(','),
      limit: '1',
    });
    const found = await this.directus.get<{
      data: Array<{
        id: string;
        event: {
          id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          location: string | null;
          country: string;
        };
        user: string;
        status: Status;
        checkin_code: string;
        checked_in_at: string | null;
        cancelled_at: string | null;
        date_created: string;
        date_updated: string | null;
        referred_by: string | null;
      }>;
    }>(`/items/registrations?${params.toString()}`);

    const row = found.data[0];
    if (!row) {
      throw new CheckinNotFoundError('check-in code not recognized');
    }

    // Validate the registration belongs to the specified event.
    if (row.event.id !== eventId) {
      // Fetch the actual event title for the error message.
      try {
        const eventRes = await this.directus.get<{
          data: { id: string; title: string };
        }>(`/items/events/${row.event.id}?fields=id,title`);
        throw new WrongEventError(eventRes.data.title);
      } catch (err) {
        if (err instanceof WrongEventError) throw err;
        // If we can't fetch the title, throw with generic message.
        throw new WrongEventError('another event');
      }
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

    // Fetch member info for display.
    let memberInfo: { name: string; avatar: string | null } = { name: 'Member', avatar: null };
    try {
      const userRes = await this.directus.get<{
        data: { first_name: string | null; last_name: string | null; avatar: string | null };
      }>(`/items/directus_users/${row.user}?fields=first_name,last_name,avatar`);
      const u = userRes.data;
      const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ');
      memberInfo = {
        name: fullName || 'Member',
        avatar: u.avatar ?? null,
      };
    } catch (err) {
      this.logger.warn(
        `could not fetch member info for user=${row.user}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    if (row.status === 'attended') {
      return {
        registration: toView({
          id: row.id,
          event: row.event.id,
          user: row.user,
          status: row.status,
          checkin_code: row.checkin_code,
          checked_in_at: row.checked_in_at,
          cancelled_at: row.cancelled_at,
          date_created: row.date_created,
          date_updated: row.date_updated,
        }),
        alreadyCheckedIn: true,
        member: memberInfo,
        event: eventView,
      };
    }

    // PATCH to attended.
    const patched = await this.directus.patch<{
      data: {
        id: string;
        event: string;
        user: string;
        status: Status;
        checkin_code: string;
        checked_in_at: string | null;
        cancelled_at: string | null;
        date_created: string;
        date_updated: string | null;
      };
    }>(`/items/registrations/${row.id}`, {
      status: 'attended',
      checked_in_at: new Date().toISOString(),
    });

    // Referral bonus (best-effort).
    if (row.referred_by) {
      await this.awardReferralBonus({
        registrationId: row.id,
        refereeUserId: row.user,
        referrerUserId: row.referred_by,
        eventCountry: row.event.country,
      });
    }

    // Badge award (best-effort).
    try {
      await this.badges.onAttendanceRecorded({
        refereeUserId: row.user,
        eventId: row.event.id,
      });
    } catch (err) {
      this.logger.warn(
        `badge awarder threw for user=${row.user} event=${row.event.id}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    return {
      registration: toView({
        id: patched.data.id,
        event: patched.data.event,
        user: patched.data.user,
        status: patched.data.status,
        checkin_code: patched.data.checkin_code,
        checked_in_at: patched.data.checked_in_at,
        cancelled_at: patched.data.cancelled_at,
        date_created: patched.data.date_created,
        date_updated: patched.data.date_updated,
      }),
      alreadyCheckedIn: false,
      member: memberInfo,
      event: eventView,
    };
  }

  // F-S5.3 — referral bonus on attendance.
  //
  // Idempotency: one point_awards row per (referrer, source_ref=registration).
  // Re-running checkin (which short-circuits earlier when status==attended)
  // never reaches this path, so dedupe is mostly belt-and-suspenders against
  // race / manual re-PATCH.
  //
  // Badge: one member_badges row per (user, badge_type='brought_a_friend',
  // source_ref=registration). Per-registration semantic — bringing a 2nd
  // friend issues a 2nd badge row (intentional — "you brought a friend to
  // event X AND event Y").
  private async awardReferralBonus(input: {
    registrationId: string;
    refereeUserId: string;
    referrerUserId: string;
    eventCountry: string;
  }): Promise<void> {
    try {
      // Dedupe — don't double-award if this method is somehow re-entered.
      const dedupeFilter = encodeURIComponent(
        JSON.stringify({
          _and: [
            { user: { _eq: input.referrerUserId } },
            { source: { _eq: 'referral_attended' } },
            { source_ref: { _eq: input.registrationId } },
          ],
        }),
      );
      const existing = await this.directus.get<{ data: Array<{ id: string }> }>(
        `/items/point_awards?filter=${dedupeFilter}&fields=id&limit=1`,
      );
      if (existing.data.length > 0) {
        return;
      }
      await this.directus.post('/items/point_awards', {
        user: input.referrerUserId,
        country: input.eventCountry,
        source: 'referral_attended',
        source_ref: input.registrationId,
        points: 25,
      });
      // Badge: one per (referrer, badge_type, source_ref=registration).
      // Same dedupe key shape so re-entry is also a no-op.
      const badgeDedupeFilter = encodeURIComponent(
        JSON.stringify({
          _and: [
            { user: { _eq: input.referrerUserId } },
            { badge_type: { _eq: 'brought_a_friend' } },
            { source_ref: { _eq: input.registrationId } },
          ],
        }),
      );
      const existingBadge = await this.directus.get<{ data: Array<{ id: string }> }>(
        `/items/member_badges?filter=${badgeDedupeFilter}&fields=id&limit=1`,
      );
      if (existingBadge.data.length === 0) {
        await this.directus.post('/items/member_badges', {
          user: input.referrerUserId,
          badge_type: 'brought_a_friend',
          source_ref: input.registrationId,
        });
      }
      this.logger.log(
        `referral bonus awarded: referrer=${input.referrerUserId} referee=${input.refereeUserId} reg=${input.registrationId}`,
      );
    } catch (err) {
      this.logger.warn(
        `referral bonus failed reg=${input.registrationId} referrer=${input.referrerUserId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }

  // ─── helpers ──────────────────────────────────────────────────────────

  private async recordAcceptanceOrThrow(input: {
    userId: string;
    eventId: string;
    registrationId: string;
    acceptance: AcceptanceInput;
  }): Promise<void> {
    try {
      await this.eulas.recordAcceptance(input);
    } catch (err) {
      if (err instanceof EulaAcceptanceMismatchError || err instanceof EulaConsentIncompleteError) {
        throw new RegistrationConsentRequiredError(err.message);
      }
      throw err;
    }
  }

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
