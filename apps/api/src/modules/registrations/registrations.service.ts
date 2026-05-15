import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { events } from '../events/schema';
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

@Injectable()
export class RegistrationsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // Idempotent register. Re-registering after a cancel flips the row back to
  // 'registered' and clears cancelledAt. Re-registering while already
  // registered is a no-op (returns the existing row).
  async register(input: {
    userId: string;
    eventId: string;
    countryCode: string;
  }): Promise<Registration> {
    await this.assertEventVisible(input.eventId, input.countryCode);

    const now = new Date();
    const [row] = await this.db
      .insert(registrations)
      .values({ userId: input.userId, eventId: input.eventId, status: 'registered' })
      .onConflictDoUpdate({
        target: [registrations.eventId, registrations.userId],
        set: { status: 'registered', cancelledAt: null, updatedAt: now },
      })
      .returning();

    if (!row) throw new Error('registrations upsert returned no row');
    return row;
  }

  // Cancel a registration. No-op if no row exists or already cancelled —
  // returns the row anyway for the caller to inspect. Throws NotFound if the
  // event isn't visible to this tenant (defense in depth against probing).
  async cancel(input: {
    userId: string;
    eventId: string;
    countryCode: string;
  }): Promise<Registration | undefined> {
    await this.assertEventVisible(input.eventId, input.countryCode);

    const now = new Date();
    const [row] = await this.db
      .update(registrations)
      .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
      .where(and(eq(registrations.eventId, input.eventId), eq(registrations.userId, input.userId)))
      .returning();
    return row;
  }

  // The caller's active registrations + just-enough event info to render a
  // "your upcoming events" card. Joins on events; only returns events that
  // still belong to the current tenant (defense against tenant migration).
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
          eq(registrations.status, 'registered'),
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

  // For badging the events list: which of these event IDs am I registered
  // for? Returns the subset. Empty input → empty output (no DB hit).
  async findActiveForUserAndEvents(input: {
    userId: string;
    eventIds: string[];
  }): Promise<string[]> {
    if (input.eventIds.length === 0) return [];
    const rows = await this.db
      .select({ eventId: registrations.eventId })
      .from(registrations)
      .where(
        and(
          eq(registrations.userId, input.userId),
          eq(registrations.status, 'registered'),
          inArray(registrations.eventId, input.eventIds),
        ),
      );
    return rows.map((r) => r.eventId);
  }

  private async assertEventVisible(eventId: string, countryCode: string): Promise<void> {
    const [row] = await this.db
      .select({ id: events.id })
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
  }
}
