import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { countries } from '../src/db/schema/tenants';
import { PointsService } from '../src/modules/points/points.service';
import { POINTS_FOR_EVENT_ATTENDED, pointAwards } from '../src/modules/points/schema';
import { users } from '../src/modules/users/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);
const service = new PointsService(db);

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

async function makeUser(displayName?: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      authentikSubject: `sub-${randomUUID()}`,
      email: `${randomUUID()}@example.com`,
      displayName: displayName ?? null,
    })
    .returning({ id: users.id });
  if (!row) throw new Error('user insert returned no row');
  return row.id;
}

describe('PointsService.awardForAttended', () => {
  beforeEach(async () => {
    await db.delete(pointAwards);
    await db.delete(users);
    await setupCountries();
  });

  it('inserts an award row with the standard amount', async () => {
    const userId = await makeUser();
    const registrationId = randomUUID();

    await service.awardForAttended({ userId, registrationId, countryCode: 'uz' });

    const rows = await db.select().from(pointAwards);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.points).toBe(POINTS_FOR_EVENT_ATTENDED);
    expect(rows[0]?.source).toBe('event_attended');
    expect(rows[0]?.sourceRef).toBe(registrationId);
  });

  it('is idempotent — calling twice with the same source_ref leaves one row', async () => {
    const userId = await makeUser();
    const registrationId = randomUUID();

    await service.awardForAttended({ userId, registrationId, countryCode: 'uz' });
    await service.awardForAttended({ userId, registrationId, countryCode: 'uz' });

    const rows = await db.select().from(pointAwards);
    expect(rows).toHaveLength(1);
  });

  it('allows a different registration_id to award separately', async () => {
    const userId = await makeUser();

    await service.awardForAttended({ userId, registrationId: randomUUID(), countryCode: 'uz' });
    await service.awardForAttended({ userId, registrationId: randomUUID(), countryCode: 'uz' });

    const rows = await db.select().from(pointAwards);
    expect(rows).toHaveLength(2);
  });
});

describe('PointsService.leaderboard', () => {
  beforeEach(async () => {
    await db.delete(pointAwards);
    await db.delete(users);
    await setupCountries();
  });

  it('returns users ordered by total points descending', async () => {
    const userA = await makeUser('Alice');
    const userB = await makeUser('Bob');
    const userC = await makeUser('Carol');

    // A: 30 (3 attendances), B: 20 (2), C: 10 (1)
    for (let i = 0; i < 3; i++) {
      await service.awardForAttended({
        userId: userA,
        registrationId: randomUUID(),
        countryCode: 'uz',
      });
    }
    for (let i = 0; i < 2; i++) {
      await service.awardForAttended({
        userId: userB,
        registrationId: randomUUID(),
        countryCode: 'uz',
      });
    }
    await service.awardForAttended({
      userId: userC,
      registrationId: randomUUID(),
      countryCode: 'uz',
    });

    const top = await service.leaderboard({ countryCode: 'uz', limit: 10 });

    expect(top).toHaveLength(3);
    expect(top[0]?.displayName).toBe('Alice');
    expect(top[0]?.totalPoints).toBe(30);
    expect(top[1]?.displayName).toBe('Bob');
    expect(top[1]?.totalPoints).toBe(20);
    expect(top[2]?.displayName).toBe('Carol');
    expect(top[2]?.totalPoints).toBe(10);
  });

  it('scopes by tenant — KZ awards do not appear in the UZ leaderboard', async () => {
    const u = await makeUser('UZ user');
    const k = await makeUser('KZ user');

    await service.awardForAttended({ userId: u, registrationId: randomUUID(), countryCode: 'uz' });
    await service.awardForAttended({ userId: k, registrationId: randomUUID(), countryCode: 'kz' });

    const top = await service.leaderboard({ countryCode: 'uz', limit: 10 });
    expect(top.map((e) => e.displayName)).toEqual(['UZ user']);
  });

  it('honours the limit', async () => {
    for (let i = 0; i < 5; i++) {
      const userId = await makeUser(`User ${i}`);
      await service.awardForAttended({
        userId,
        registrationId: randomUUID(),
        countryCode: 'uz',
      });
    }
    const top = await service.leaderboard({ countryCode: 'uz', limit: 3 });
    expect(top).toHaveLength(3);
  });

  it('rejects invalid limits', async () => {
    await expect(service.leaderboard({ countryCode: 'uz', limit: 0 })).rejects.toThrow();
    await expect(service.leaderboard({ countryCode: 'uz', limit: 101 })).rejects.toThrow();
  });
});
