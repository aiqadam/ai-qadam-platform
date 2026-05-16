import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { registrations } from '../registrations/schema';
import { events, type Event } from './schema';

export interface EventWithCount extends Event {
  registeredCount: number;
}

@Injectable()
export class EventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // Public list: only published, only future, only the requested tenant,
  // ordered by startsAt asc. Each row carries a `registeredCount` derived
  // by left-joining registrations with status='registered' and counting.
  // Single SQL — N+1-free.
  async listUpcoming(countryCode: string): Promise<EventWithCount[]> {
    if (countryCode.length !== 2) {
      throw new Error('countryCode must be a 2-char ISO code');
    }
    const rows = await this.db
      .select({
        event: events,
        registeredCount: sql<number>`count(${registrations.id})::int`,
      })
      .from(events)
      .leftJoin(
        registrations,
        and(eq(registrations.eventId, events.id), eq(registrations.status, 'registered')),
      )
      .where(
        and(
          eq(events.countryCode, countryCode),
          eq(events.status, 'published'),
          gt(events.endsAt, new Date()),
        ),
      )
      .groupBy(events.id)
      .orderBy(asc(events.startsAt));

    return rows.map((r) => ({ ...r.event, registeredCount: r.registeredCount }));
  }

  async findByIdForTenant(input: { id: string; countryCode: string }): Promise<Event | undefined> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.id, input.id), eq(events.countryCode, input.countryCode)))
      .limit(1);
    return row;
  }

  // Admin mutations. Tenant scope is enforced by the caller (controller)
  // — never trust the client to send country_code.

  async createForTenant(input: NewEventInput): Promise<Event> {
    const [row] = await this.db.insert(events).values(input).returning();
    if (!row) throw new Error('event insert returned no row');
    return row;
  }

  async updateForTenant(input: {
    id: string;
    countryCode: string;
    patch: UpdateEventInput;
  }): Promise<Event | undefined> {
    // Capacity-down guard: cannot lower below current registered count.
    if (input.patch.capacity != null) {
      const [counts] = await this.db
        .select({ n: sql<number>`count(${registrations.id})::int` })
        .from(events)
        .leftJoin(
          registrations,
          and(eq(registrations.eventId, events.id), eq(registrations.status, 'registered')),
        )
        .where(and(eq(events.id, input.id), eq(events.countryCode, input.countryCode)))
        .groupBy(events.id);
      if (counts && counts.n > input.patch.capacity) {
        throw new CapacityTooLowError(counts.n, input.patch.capacity);
      }
    }

    const [row] = await this.db
      .update(events)
      .set({ ...input.patch, updatedAt: new Date() })
      .where(and(eq(events.id, input.id), eq(events.countryCode, input.countryCode)))
      .returning();
    return row;
  }

  async deleteForTenant(input: { id: string; countryCode: string }): Promise<boolean> {
    const result = await this.db
      .delete(events)
      .where(and(eq(events.id, input.id), eq(events.countryCode, input.countryCode)))
      .returning({ id: events.id });
    return result.length > 0;
  }

  // Admin list: all events for this tenant regardless of status, ordered
  // by startsAt desc (newest first). Includes draft + cancelled so the
  // admin sees the full picture. Registered count is joined like
  // listUpcoming.
  async listAllForTenant(countryCode: string): Promise<EventWithCount[]> {
    const rows = await this.db
      .select({
        event: events,
        registeredCount: sql<number>`count(${registrations.id})::int`,
      })
      .from(events)
      .leftJoin(
        registrations,
        and(eq(registrations.eventId, events.id), eq(registrations.status, 'registered')),
      )
      .where(eq(events.countryCode, countryCode))
      .groupBy(events.id)
      .orderBy(asc(events.startsAt));
    return rows.map((r) => ({ ...r.event, registeredCount: r.registeredCount }));
  }
}

export interface NewEventInput {
  countryCode: string;
  title: string;
  description: string;
  format: Event['format'];
  status?: Event['status'];
  startsAt: Date;
  endsAt: Date;
  capacity?: number | null;
  location?: string | null;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  format?: Event['format'];
  status?: Event['status'];
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number | null;
  location?: string | null;
}

export class CapacityTooLowError extends Error {
  constructor(
    public readonly registered: number,
    public readonly requested: number,
  ) {
    super(`capacity ${requested} below registered count ${registered}`);
    this.name = 'CapacityTooLowError';
  }
}
