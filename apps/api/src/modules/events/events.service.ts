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
}
