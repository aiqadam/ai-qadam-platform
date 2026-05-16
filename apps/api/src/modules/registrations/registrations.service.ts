import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { events, type Event } from '../events/schema';
import { PointsService } from '../points/points.service';
import { users } from '../users/schema';
import { type Registration, registrations } from './schema';

interface MineEntry {
  registration: Registration;
  event: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    location: string | null;
  };
}

export interface CheckinResult {
  registration: Registration;
  event: {
    id: string;
    title: string;
    startsAt: Date;
    endsAt: Date;
    location: string | null;
  };
  // True if THIS call flipped status to 'attended'; false if the row was
  // already 'attended'. Lets the controller distinguish first scan from
  // a duplicate scan in its response.
  alreadyCheckedIn: boolean;
}

export class CheckinNotFoundError extends Error {
  constructor() {
    super('check-in code not recognized');
    this.name = 'CheckinNotFoundError';
  }
}

export class CheckinIneligibleError extends Error {
  constructor(reason: string) {
    super(`registration is not eligible for check-in: ${reason}`);
    this.name = 'CheckinIneligibleError';
  }
}

interface CancelResult {
  cancelled: Registration | null;
  // Set when this cancel freed a registered seat AND someone on the waitlist
  // got promoted. Controller uses this to fire the promotion email.
  promoted: { registration: Registration; userId: string } | null;
}

@Injectable()
export class RegistrationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly points: PointsService,
  ) {}

  // Idempotent register. Capacity-aware:
  //   - event.capacity is null → always 'registered'
  //   - registered count < capacity → 'registered'
  //   - else → 'waitlisted'
  // If a row already exists in registered/waitlisted, return as-is.
  // If existing row was 'cancelled', re-evaluate capacity and reactivate.
  async register(input: {
    userId: string;
    eventId: string;
    countryCode: string;
  }): Promise<Registration> {
    const event = await this.requireVisibleEvent(input.eventId, input.countryCode);

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(registrations)
        .where(
          and(eq(registrations.eventId, input.eventId), eq(registrations.userId, input.userId)),
        )
        .limit(1);

      if (existing && (existing.status === 'registered' || existing.status === 'waitlisted')) {
        return existing;
      }

      const status = await capacityAwareStatus(tx, event);
      const now = new Date();
      const [row] = await tx
        .insert(registrations)
        .values({ userId: input.userId, eventId: input.eventId, status })
        .onConflictDoUpdate({
          target: [registrations.eventId, registrations.userId],
          set: { status, cancelledAt: null, updatedAt: now },
        })
        .returning();

      if (!row) throw new Error('registrations upsert returned no row');
      return row;
    });
  }

  // Cancel + auto-promote oldest waitlisted (FIFO by createdAt) when a
  // registered seat is vacated. All in one transaction so concurrent cancels
  // don't double-promote or skip a slot.
  async cancel(input: {
    userId: string;
    eventId: string;
    countryCode: string;
  }): Promise<CancelResult> {
    const event = await this.requireVisibleEvent(input.eventId, input.countryCode);

    return this.db.transaction(async (tx) => {
      const existing = await findExistingRegistration(tx, input.eventId, input.userId);
      if (!existing || existing.status === 'cancelled' || existing.status === 'attended') {
        return { cancelled: existing ?? null, promoted: null };
      }

      const cancelled = await markCancelled(tx, existing.id);
      const shouldPromote = existing.status === 'registered' && event.capacity !== null;
      const promoted = shouldPromote ? await promoteOldestWaitlisted(tx, input.eventId) : null;
      return { cancelled, promoted };
    });
  }

  // The caller's active registrations + just-enough event info to render a
  // "your upcoming events" card. Joins on events; only returns events that
  // still belong to the current tenant. Active = registered OR waitlisted.
  async listMine(input: { userId: string; countryCode: string }): Promise<MineEntry[]> {
    const rows = await this.db
      .select({
        registration: registrations,
        event: {
          id: events.id,
          title: events.title,
          startsAt: events.startsAt,
          endsAt: events.endsAt,
          location: events.location,
          countryCode: events.countryCode,
        },
      })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(
        and(
          eq(registrations.userId, input.userId),
          inArray(registrations.status, ['registered', 'waitlisted']),
          eq(events.countryCode, input.countryCode),
        ),
      );

    return rows.map((r) => ({
      registration: r.registration,
      event: {
        id: r.event.id,
        title: r.event.title,
        startsAt: r.event.startsAt,
        endsAt: r.event.endsAt,
        location: r.event.location,
      },
    }));
  }

  // QR check-in. Trust model: physical possession of the QR proves
  // attendance — anyone with the code can flip status to 'attended'. Hardening
  // (organizer-only check-in) lands in a follow-up. Idempotent: scanning the
  // same code twice returns alreadyCheckedIn=true; status stays 'attended'.
  // Throws CheckinNotFoundError on unknown code, CheckinIneligibleError on
  // cancelled rows.
  async checkin(checkinCode: string): Promise<CheckinResult> {
    const rows = await this.db
      .select({ registration: registrations, event: events })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(eq(registrations.checkinCode, checkinCode))
      .limit(1);
    const row = rows[0];
    if (!row) throw new CheckinNotFoundError();

    if (row.registration.status === 'cancelled') {
      throw new CheckinIneligibleError('cancelled');
    }
    if (row.registration.status === 'attended') {
      return makeCheckinResult(row.registration, row.event, true);
    }

    const now = new Date();
    const [updated] = await this.db
      .update(registrations)
      .set({ status: 'attended', checkedInAt: now, updatedAt: now })
      .where(eq(registrations.id, row.registration.id))
      .returning();
    if (!updated) throw new Error('checkin update returned no row');

    // Award points for the attended event. Idempotent in PointsService via
    // (user_id, source, source_ref) unique constraint, so a stray double-call
    // is harmless. Fire after the row update so a points-side error doesn't
    // roll back the check-in.
    await this.points.awardForAttended({
      userId: updated.userId,
      registrationId: updated.id,
      countryCode: row.event.countryCode,
    });

    return makeCheckinResult(updated, row.event, false);
  }

  // For badging the events list: which of these event IDs am I actively
  // associated with, and in what status? Returns a Map of eventId → status.
  // Empty input → empty map (no DB hit).
  async findActiveStatusesForUserAndEvents(input: {
    userId: string;
    eventIds: string[];
  }): Promise<Map<string, 'registered' | 'waitlisted'>> {
    if (input.eventIds.length === 0) return new Map();
    const rows = await this.db
      .select({ eventId: registrations.eventId, status: registrations.status })
      .from(registrations)
      .where(
        and(
          eq(registrations.userId, input.userId),
          inArray(registrations.status, ['registered', 'waitlisted']),
          inArray(registrations.eventId, input.eventIds),
        ),
      );
    const out = new Map<string, 'registered' | 'waitlisted'>();
    for (const row of rows) {
      if (row.status === 'registered' || row.status === 'waitlisted') {
        out.set(row.eventId, row.status);
      }
    }
    return out;
  }

  private async requireVisibleEvent(eventId: string, countryCode: string): Promise<Event> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.id, eventId),
          eq(events.countryCode, countryCode),
          eq(events.status, 'published'),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException(`event ${eventId} not found`);
    }
    return row;
  }

  // Admin: list every registration for an event (any status). Tenant-scoped
  // — verifies the event lives in the requested country before returning.
  async listForEventAdmin(input: {
    eventId: string;
    countryCode: string;
  }): Promise<AdminRegistrationRow[] | null> {
    const [event] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, input.eventId), eq(events.countryCode, input.countryCode)))
      .limit(1);
    if (!event) return null;

    const rows = await this.db
      .select({
        registration: registrations,
        user: {
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          handle: users.handle,
        },
      })
      .from(registrations)
      .innerJoin(users, eq(users.id, registrations.userId))
      .where(eq(registrations.eventId, input.eventId))
      .orderBy(asc(registrations.createdAt));

    return rows.map((r) => ({
      registration: r.registration,
      user: r.user,
    }));
  }
}

export interface AdminRegistrationRow {
  registration: Registration;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    handle: string | null;
  };
}

function makeCheckinResult(
  registration: Registration,
  event: Event,
  alreadyCheckedIn: boolean,
): CheckinResult {
  return {
    registration,
    event: {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
    },
    alreadyCheckedIn,
  };
}

async function capacityAwareStatus(
  tx: Pick<Db, 'select'>,
  event: Event,
): Promise<'registered' | 'waitlisted'> {
  if (event.capacity === null) return 'registered';
  const [counts] = await tx
    .select({ registeredCount: sql<number>`count(*)::int` })
    .from(registrations)
    .where(and(eq(registrations.eventId, event.id), eq(registrations.status, 'registered')));
  const used = counts?.registeredCount ?? 0;
  return used >= event.capacity ? 'waitlisted' : 'registered';
}

async function findExistingRegistration(
  tx: Pick<Db, 'select'>,
  eventId: string,
  userId: string,
): Promise<Registration | undefined> {
  const [row] = await tx
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.userId, userId)))
    .limit(1);
  return row;
}

async function markCancelled(tx: Pick<Db, 'update'>, id: string): Promise<Registration> {
  const now = new Date();
  const [row] = await tx
    .update(registrations)
    .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
    .where(eq(registrations.id, id))
    .returning();
  if (!row) throw new Error('registrations cancel returned no row');
  return row;
}

async function promoteOldestWaitlisted(
  tx: Pick<Db, 'select' | 'update'>,
  eventId: string,
): Promise<{ registration: Registration; userId: string } | null> {
  const [oldest] = await tx
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, eventId), eq(registrations.status, 'waitlisted')))
    .orderBy(asc(registrations.createdAt))
    .limit(1);
  if (!oldest) return null;
  const [promoted] = await tx
    .update(registrations)
    .set({ status: 'registered', updatedAt: new Date() })
    .where(eq(registrations.id, oldest.id))
    .returning();
  if (!promoted) throw new Error('promotion update returned no row');
  return { registration: promoted, userId: promoted.userId };
}
