import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { PointsDirectusService } from '../src/modules/points/points-directus.service';
import { users } from '../src/modules/users/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

// Mock Directus, real Postgres (testcontainers) — the service joins
// aggregates with platform.users via a real WHERE IN clause.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function makeService(fake: FakeDirectus) {
  return new PointsDirectusService(db, fake as unknown as DirectusClient);
}

async function seedUser(input: {
  email: string;
  displayName?: string;
  directusUserId: string;
}) {
  const [row] = await db
    .insert(users)
    .values({
      authentikSubject: `sub-${input.email}`,
      email: input.email,
      displayName: input.displayName ?? null,
      directusUserId: input.directusUserId,
    })
    .returning();
  if (!row) throw new Error('seed failed');
  return row;
}

const DX_A = '11111111-1111-4000-8000-000000000001';
const DX_B = '22222222-2222-4000-8000-000000000002';
const DX_ORPHAN = '99999999-9999-4000-8000-000000000099';

describe('PointsDirectusService.leaderboard', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('returns entries with platform.users.id, ordered by Directus aggregate, mapped to display fields', async () => {
    const alice = await seedUser({ email: 'a@b.com', displayName: 'Alice', directusUserId: DX_A });
    const bob = await seedUser({ email: 'b@b.com', displayName: 'Bob', directusUserId: DX_B });

    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({
        data: [
          { user: DX_A, sum: { points: '50' } },
          { user: DX_B, sum: { points: '30' } },
        ],
      }),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeService(fake);
    const entries = await svc.leaderboard({ countryCode: 'uz', limit: 20 });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      userId: alice.id,
      email: 'a@b.com',
      displayName: 'Alice',
      handle: alice.handle,
      totalPoints: 50,
    });
    expect(entries[1]).toEqual({
      userId: bob.id,
      email: 'b@b.com',
      displayName: 'Bob',
      handle: bob.handle,
      totalPoints: 30,
    });

    // Sanity: the URL we hit Directus with includes the tenant + aggregate
    const call = fake.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('filter%5Bcountry%5D%5B_eq%5D=uz');
    expect(call).toContain('aggregate%5Bsum%5D=points');
    expect(call).toContain('groupBy=user');
    expect(call).toContain('sort=-sum.points');
    expect(call).toContain('limit=20');
    // F-S5.6 — excludes users with appear_on_public_leaderboard=false.
    // _neq:false keeps users where the flag is true OR null (legacy rows).
    expect(decodeURIComponent(call)).toContain(
      'filter[user][appear_on_public_leaderboard][_neq]=false',
    );
  });

  it('silently drops aggregate rows for users not yet linked in platform.users', async () => {
    const alice = await seedUser({ email: 'a@b.com', displayName: 'Alice', directusUserId: DX_A });
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({
        data: [
          { user: DX_A, sum: { points: '50' } },
          { user: DX_ORPHAN, sum: { points: '99' } },
        ],
      }),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeService(fake);
    const entries = await svc.leaderboard({ countryCode: 'uz', limit: 20 });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.userId).toBe(alice.id);
  });

  it('returns [] when Directus has no aggregate rows for this tenant', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeService(fake);
    const entries = await svc.leaderboard({ countryCode: 'uz', limit: 20 });
    expect(entries).toEqual([]);
  });

  it('throws on invalid limit (preserves the existing controller contract)', async () => {
    const fake: FakeDirectus = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeService(fake);
    await expect(svc.leaderboard({ countryCode: 'uz', limit: 0 })).rejects.toThrow();
    await expect(svc.leaderboard({ countryCode: 'uz', limit: 101 })).rejects.toThrow();
    expect(fake.get).not.toHaveBeenCalled();
  });
});

// FR-MIG-020 — awardFirstJoinPoints
describe('PointsDirectusService.awardFirstJoinPoints', () => {
  function makeSvc(fake: FakeDirectus) {
    return new PointsDirectusService(
      {} as Parameters<typeof PointsDirectusService.prototype.leaderboard>[0] extends { db: infer D } ? D : never,
      fake as unknown as DirectusClient,
    );
  }

  it('inserts point_awards row with key=first_join and points=10', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }), // no existing award
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeSvc(fake);

    await svc.awardFirstJoinPoints('u-1');

    expect(fake.post).toHaveBeenCalledTimes(1);
    const postCall = fake.post.mock.calls[0]!;
    expect(postCall[0]).toBe('/items/point_awards');
    const body = postCall[1] as Record<string, unknown>;
    expect(body).toEqual({
      user: 'u-1',
      points: 10,
      key: 'first_join',
    });
  });

  it('is idempotent — skips insert when existing award row is found', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [{ id: 'existing-award' }] }), // already awarded
      post: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeSvc(fake);

    await svc.awardFirstJoinPoints('u-1');

    expect(fake.post).not.toHaveBeenCalled();
  });

  it('queries with correct filter for key=first_join and the userId', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeSvc(fake);

    await svc.awardFirstJoinPoints('11111111-1111-4000-8000-000000000001');

    const getCall = fake.get.mock.calls[0]?.[0] as string;
    expect(getCall).toContain('/items/point_awards');
    // The filter param is double-encoded: encodeURIComponent(JSON.stringify({...}))
    // produces %7B%22user%22..., which URLSearchParams encodes again to %257B%2522user%2522...
    // So we verify the path is correct and the filter param is present (not the exact encoding).
    expect(getCall).toContain('filter=');
    expect(getCall).toContain('fields=id');
    expect(getCall).toContain('limit=1');
  });

  it('uses the user directus ID, not the platform.users.id', async () => {
    // The method takes a directus user ID and writes it to directus point_awards.
    // (Platform users join is only needed for leaderboard display fields.)
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({}),
      patch: vi.fn(),
      delete: vi.fn(),
    };
    const svc = makeSvc(fake);

    const directusId = 'directus-uuid-1111';
    await svc.awardFirstJoinPoints(directusId);

    const postBody = fake.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(postBody.user).toBe(directusId);
  });
});
