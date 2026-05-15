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
}): Promise<string> {
  const [row] = await db
    .insert(events)
    .values({
      countryCode: input.countryCode,
      title: 'Test event',
      description: 'desc',
      format: 'meetup',
      status: input.status ?? 'published',
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 86_400_000 + 7200_000),
    })
    .returning({ id: events.id });
  if (!row) throw new Error('event insert returned no row');
  return row.id;
}

describe('RegistrationsService.register', () => {
  beforeEach(async () => {
    await db.delete(registrations);
    await db.delete(events);
    await db.delete(users);
    await setupCountries();
  });

  it('inserts a new registration with status=registered', async () => {
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

  it('reactivates a cancelled registration', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    await service.register({ userId, eventId, countryCode: 'uz' });
    await service.cancel({ userId, eventId, countryCode: 'uz' });
    const reactivated = await service.register({ userId, eventId, countryCode: 'uz' });

    expect(reactivated.status).toBe('registered');
    expect(reactivated.cancelledAt).toBeNull();
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

describe('RegistrationsService.cancel', () => {
  beforeEach(async () => {
    await db.delete(registrations);
    await db.delete(events);
    await db.delete(users);
    await setupCountries();
  });

  it('flips status to cancelled and sets cancelledAt', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });
    await service.register({ userId, eventId, countryCode: 'uz' });

    const cancelled = await service.cancel({ userId, eventId, countryCode: 'uz' });

    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.cancelledAt).toBeInstanceOf(Date);
  });

  it('returns undefined when no registration exists', async () => {
    const userId = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    const cancelled = await service.cancel({ userId, eventId, countryCode: 'uz' });
    expect(cancelled).toBeUndefined();
  });
});

describe('RegistrationsService.listMine', () => {
  beforeEach(async () => {
    await db.delete(registrations);
    await db.delete(events);
    await db.delete(users);
    await setupCountries();
  });

  it('returns only the caller’s active registrations for the current tenant', async () => {
    const me = await makeUser();
    const someoneElse = await makeUser();
    const uzEvent = await makeEvent({ countryCode: 'uz' });
    const kzEvent = await makeEvent({ countryCode: 'kz' });

    await service.register({ userId: me, eventId: uzEvent, countryCode: 'uz' });
    await service.register({ userId: someoneElse, eventId: uzEvent, countryCode: 'uz' });

    const mine = await service.listMine({ userId: me, countryCode: 'uz' });
    expect(mine).toHaveLength(1);
    expect(mine[0]?.event.id).toBe(uzEvent);

    // KZ tenant has no registrations for me — and even though I might have
    // a record of a UZ event, listing under KZ tenant scope gives nothing.
    const mineKz = await service.listMine({ userId: me, countryCode: 'kz' });
    expect(mineKz).toHaveLength(0);
    void kzEvent;
  });

  it('excludes cancelled registrations', async () => {
    const me = await makeUser();
    const eventId = await makeEvent({ countryCode: 'uz' });

    await service.register({ userId: me, eventId, countryCode: 'uz' });
    await service.cancel({ userId: me, eventId, countryCode: 'uz' });

    const mine = await service.listMine({ userId: me, countryCode: 'uz' });
    expect(mine).toHaveLength(0);
  });
});

describe('RegistrationsService.findActiveForUserAndEvents', () => {
  beforeEach(async () => {
    await db.delete(registrations);
    await db.delete(events);
    await db.delete(users);
    await setupCountries();
  });

  it('returns the subset of event IDs the user is actively registered for', async () => {
    const me = await makeUser();
    const a = await makeEvent({ countryCode: 'uz' });
    const b = await makeEvent({ countryCode: 'uz' });
    const c = await makeEvent({ countryCode: 'uz' });

    await service.register({ userId: me, eventId: a, countryCode: 'uz' });
    await service.register({ userId: me, eventId: c, countryCode: 'uz' });
    await service.cancel({ userId: me, eventId: c, countryCode: 'uz' });

    const subset = await service.findActiveForUserAndEvents({
      userId: me,
      eventIds: [a, b, c],
    });

    expect(subset.sort()).toEqual([a].sort());
  });

  it('returns empty array for empty input without hitting DB', async () => {
    const me = await makeUser();
    const subset = await service.findActiveForUserAndEvents({ userId: me, eventIds: [] });
    expect(subset).toEqual([]);
  });
});
