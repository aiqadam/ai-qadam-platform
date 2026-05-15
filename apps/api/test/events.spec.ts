import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { countries } from '../src/db/schema/tenants';
import { EventsService } from '../src/modules/events/events.service';
import { events } from '../src/modules/events/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);
const service = new EventsService(db);

afterAll(async () => {
  await client.end();
});

const baseEvent = {
  title: 'Sample',
  description: 'Sample description',
  format: 'meetup' as const,
  status: 'published' as const,
  startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  endsAt: new Date(Date.now() + 26 * 60 * 60 * 1000),
};

async function ensureCountries(): Promise<void> {
  // Migrations create the countries table empty in the test DB; PR #5's
  // seed lives in the migration file, but the migrator runs the SQL once.
  // For idempotence under per-test wipes we re-insert here.
  await db
    .insert(countries)
    .values([
      { code: 'uz', name: 'Uzbekistan', nameRu: 'Узбекистан', tz: 'Asia/Tashkent' },
      { code: 'kz', name: 'Kazakhstan', nameRu: 'Казахстан', tz: 'Asia/Almaty' },
    ])
    .onConflictDoNothing();
}

describe('EventsService.listUpcoming', () => {
  beforeEach(async () => {
    await db.delete(events);
    await ensureCountries();
  });

  it('returns published future events for the requested tenant in startsAt order', async () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const inOneDay = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

    await db.insert(events).values([
      {
        ...baseEvent,
        countryCode: 'uz',
        title: 'Later UZ',
        startsAt: inThreeDays,
        endsAt: new Date(inThreeDays.getTime() + 7200_000),
      },
      {
        ...baseEvent,
        countryCode: 'uz',
        title: 'Earlier UZ',
        startsAt: inOneDay,
        endsAt: new Date(inOneDay.getTime() + 7200_000),
      },
    ]);

    const list = await service.listUpcoming('uz');

    expect(list).toHaveLength(2);
    expect(list[0]?.title).toBe('Earlier UZ');
    expect(list[1]?.title).toBe('Later UZ');
  });

  it('excludes events from other tenants', async () => {
    await db.insert(events).values([
      { ...baseEvent, countryCode: 'uz', title: 'UZ event' },
      { ...baseEvent, countryCode: 'kz', title: 'KZ event' },
    ]);

    const list = await service.listUpcoming('uz');

    expect(list.map((e) => e.title)).toEqual(['UZ event']);
  });

  it('excludes draft and cancelled events', async () => {
    await db.insert(events).values([
      { ...baseEvent, countryCode: 'uz', title: 'Published', status: 'published' },
      { ...baseEvent, countryCode: 'uz', title: 'Draft', status: 'draft' },
      { ...baseEvent, countryCode: 'uz', title: 'Cancelled', status: 'cancelled' },
    ]);

    const list = await service.listUpcoming('uz');

    expect(list.map((e) => e.title)).toEqual(['Published']);
  });

  it('excludes events whose endsAt is in the past', async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.insert(events).values([
      {
        ...baseEvent,
        countryCode: 'uz',
        title: 'Past',
        startsAt: new Date(yesterday.getTime() - 7200_000),
        endsAt: yesterday,
      },
      { ...baseEvent, countryCode: 'uz', title: 'Future' },
    ]);

    const list = await service.listUpcoming('uz');

    expect(list.map((e) => e.title)).toEqual(['Future']);
  });

  it('rejects a non-2-char country code', async () => {
    await expect(service.listUpcoming('xyz')).rejects.toThrow(
      'countryCode must be a 2-char ISO code',
    );
  });
});

describe('EventsService.findByIdForTenant', () => {
  beforeEach(async () => {
    await db.delete(events);
    await ensureCountries();
  });

  it('returns the event when present in the same tenant', async () => {
    const [created] = await db
      .insert(events)
      .values({ ...baseEvent, countryCode: 'uz', title: 'Findable' })
      .returning();
    if (!created) throw new Error('insert returned no row');

    const found = await service.findByIdForTenant({ id: created.id, countryCode: 'uz' });
    expect(found?.title).toBe('Findable');
  });

  it('returns undefined when the event belongs to another tenant', async () => {
    const [created] = await db
      .insert(events)
      .values({ ...baseEvent, countryCode: 'kz', title: 'KZ only' })
      .returning();
    if (!created) throw new Error('insert returned no row');

    const found = await service.findByIdForTenant({ id: created.id, countryCode: 'uz' });
    expect(found).toBeUndefined();
  });
});
