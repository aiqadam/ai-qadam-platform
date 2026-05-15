import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { events, type Event } from './schema';

@Injectable()
export class EventsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // The public events list: only published, only future (endsAt > now), only
  // for the requested tenant, ordered by startsAt ascending. PR #13 will add
  // pagination + filters (format, has-capacity, etc.) when we have enough
  // data to need them.
  async listUpcoming(countryCode: string): Promise<Event[]> {
    if (countryCode.length !== 2) {
      throw new Error('countryCode must be a 2-char ISO code');
    }
    return this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.countryCode, countryCode),
          eq(events.status, 'published'),
          gt(events.endsAt, new Date()),
        ),
      )
      .orderBy(asc(events.startsAt));
  }

  // Tenant-scoped lookup. Returns undefined if not found OR if the event
  // belongs to a different tenant — same observable behavior either way so
  // callers can't probe for cross-tenant existence.
  async findByIdForTenant(input: { id: string; countryCode: string }): Promise<Event | undefined> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.id, input.id), eq(events.countryCode, input.countryCode)))
      .limit(1);
    return row;
  }
}
