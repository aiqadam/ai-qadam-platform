import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { countries } from '../src/db/schema/tenants';
import { events } from '../src/modules/events/schema';
import { RegistrationsService } from '../src/modules/registrations/registrations.service';
import { registrations } from '../src/modules/registrations/schema';
import { users } from '../src/modules/users/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);
const service = new RegistrationsService(db);

afterAll(async () => {
  await client.end();
});

async function setupCountries(): Promise<void> {
  await db
    .insert(countries)
    .values([
      { code: 'uz', name: 'Uzbekistan', nameRu: 'Узбекистан', tz: 'Asia/Tashkent' },
      { code: 'kz', name: 'Kazakhstan', nameRu: 'Казахстан', tz: 'Asia/Almaty' },
    ])
    .onConflictDoNothing();
}

async function makeUser(): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      authentikSubject: `sub-${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
    })
    .returning({ id: users.id });
  if (!row) throw new Error('user insert returned no row');
  return row.id;
}

async function makeEvent(input: {
  countryCode: string;
  status?: 'draft' | 'published' | 'cancelled';
  capacity?: number | null;
}): Promise<string> {
  const [row] = await db
    .insert(events)
    .values({
      countryCode: input.countryCode,
      title: 'Test event',
      description: 'desc',
      format: 'meetup',
      status: input.status ?? 'published',
      capacity: input.capacity ?? null,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000 + 7200_000),
    })
    .returning({ id: events.id });
  if (!row) throw new Error('event insert returned no row');
  return row.id;
}

async function resetTables(): Promise<void> {
  await db.delete(registrations);
  await db.delete(events);
  await db.delete(users);
  await setupCountries();
}

describe('RegistrationsService.register', () => {
  beforeEach(resetTables);

  it('inserts a new registration with status=registered when capacity is unlimited', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    const reg = await service.register({ userId, eventId, countryCode: 'uz' });

    expect(reg.status).toBe('registered');
    expect(reg.cancelledAt).toBeNull();
  });

  it('is idempotent — registering twice returns the same row', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    const first = await service.register({ userId, eventId, countryCode: 'uz' });
    const second = await service.register({ userId, eventId, countryCode: 'uz' });

    expect(second.id).toBe(first.id);
    const all = await db.select().from(registrations);
    expect(all).toHaveLength(1);
  });

  it('reactivates a cancelled registration (capacity-aware)', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    await service.register({ userId, eventId, countryCode: 'uz' });
    await service.cancel({ userId, eventId, countryCode: 'uz' });
    const reactivated = await service.register({ userId, eventId, countryCode: 'uz' });

    expect(reactivated.status).toBe('registered');
    expect(reactivated.cancelledAt).toBeNull();
  });

  it('puts the second user on the waitlist when capacity=1 is full', async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz', capacity: 1 });

    const r1 = await service.register({ userId: u1, eventId, countryCode: 'uz' });
    const r2 = await service.register({ userId: u2, eventId, countryCode: 'uz' });

    expect(r1.status).toBe('registered');
    expect(r2.status).toBe('waitlisted');
  });

  it('throws NotFound when the event does not exist', async () => {
    const userId = await makeUser();
    await expect(
      service.register({ userId, eventId: randomUUID(), countryCode: 'uz' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when the event belongs to a different tenant', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'kz' });

    await expect(service.register({ userId, eventId, countryCode: 'uz' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFound when the event is draft', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz', status: 'draft' });

    await expect(service.register({ userId, eventId, countryCode: 'uz' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('RegistrationsService.cancel + waitlist promotion', () => {
  beforeEach(resetTables);

  it('flips status to cancelled and sets cancelledAt', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });
    await service.register({ userId, eventId, countryCode: 'uz' });

    const result = await service.cancel({ userId, eventId, countryCode: 'uz' });

    expect(result.cancelled?.status).toBe('cancelled');
    expect(result.cancelled?.cancelledAt).toBeInstanceOf(Date);
    expect(result.promoted).toBeNull();
  });

  it('returns null cancelled + null promoted when no registration exists', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    const result = await service.cancel({ userId, eventId, countryCode: 'uz' });
    expect(result.cancelled).toBeNull();
    expect(result.promoted).toBeNull();
  });

  it('promotes the oldest waitlisted user when a registered seat opens', async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const u3 = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz', capacity: 1 });

    await service.register({ userId: u1, eventId, countryCode: 'uz' });
    // Force u2 to be older than u3 on the waitlist by inserting in order
    // with small sleeps so createdAt is distinct.
    await service.register({ userId: u2, eventId, countryCode: 'uz' });
    await new Promise((r) => setTimeout(r, 5));
    await service.register({ userId: u3, eventId, countryCode: 'uz' });

    const result = await service.cancel({ userId: u1, eventId, countryCode: 'uz' });

    expect(result.cancelled?.status).toBe('cancelled');
    expect(result.promoted?.userId).toBe(u2);
    expect(result.promoted?.registration.status).toBe('registered');
  });

  it('does NOT promote when a waitlisted user cancels', async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz', capacity: 1 });

    await service.register({ userId: u1, eventId, countryCode: 'uz' });
    await service.register({ userId: u2, eventId, countryCode: 'uz' }); // waitlisted

    const result = await service.cancel({ userId: u2, eventId, countryCode: 'uz' });

    expect(result.cancelled?.status).toBe('cancelled');
    expect(result.promoted).toBeNull();
  });

  it('does NOT promote when capacity is unlimited (no waitlist concept)', async () => {
    const u1 = await makeUser();
    const u2 = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' }); // capacity null

    await service.register({ userId: u1, eventId, countryCode: 'uz' });
    await service.register({ userId: u2, eventId, countryCode: 'uz' });

    const result = await service.cancel({ userId: u1, eventId, countryCode: 'uz' });
    expect(result.promoted).toBeNull();
  });
});

describe('RegistrationsService.listMine', () => {
  beforeEach(resetTables);

  it('includes both registered and waitlisted; excludes cancelled', async () => {
    const me = await makeUser();
    const filler = await makeUser();
    const fullEvent = await makeEvent({ countryCode: 'uz', capacity: 1 });
    const openEvent = await makeEvent({ countryCode: 'uz' });

    await service.register({ userId: filler, eventId: fullEvent, countryCode: 'uz' });
    await service.register({ userId: me, eventId: fullEvent, countryCode: 'uz' }); // waitlisted
    await service.register({ userId: me, eventId: openEvent, countryCode: 'uz' }); // registered

    const mine = await service.listMine({ userId: me, countryCode: 'uz' });
    const ids = mine.map((m) => m.event.id).sort();
    expect(ids).toEqual([fullEvent, openEvent].sort());
  });
});

describe('RegistrationsService.findActiveStatusesForUserAndEvents', () => {
  beforeEach(resetTables);

  it('returns a map of eventId → status for active rows only', async () => {
    const me = await makeUser();
    const filler = await makeUser();
    const a = await makeEvent({ countryCode: 'uz', capacity: 1 });
    const b = await makeEvent({ countryCode: 'uz' });
    const c = await makeEvent({ countryCode: 'uz' });

    await service.register({ userId: filler, eventId: a, countryCode: 'uz' });
    await service.register({ userId: me, eventId: a, countryCode: 'uz' }); // waitlisted
    await service.register({ userId: me, eventId: b, countryCode: 'uz' }); // registered
    await service.register({ userId: me, eventId: c, countryCode: 'uz' });
    await service.cancel({ userId: me, eventId: c, countryCode: 'uz' }); // not in map

    const map = await service.findActiveStatusesForUserAndEvents({
      userId: me,
      eventIds: [a, b, c],
    });
    expect(map.get(a)).toBe('waitlisted');
    expect(map.get(b)).toBe('registered');
    expect(map.has(c)).toBe(false);
  });

  it('returns empty map for empty input without hitting DB', async () => {
    const me = await makeUser();
    const map = await service.findActiveStatusesForUserAndEvents({
      userId: me,
      eventIds: [],
    });
    expect(map.size).toBe(0);
  });
});
