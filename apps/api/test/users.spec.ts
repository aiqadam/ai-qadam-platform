import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { users } from '../src/modules/users/schema';
import { UsersService } from '../src/modules/users/users.service';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);
// Only getPublicProfile touches Directus — the rest of the suite never
// reaches into directus, so a never-call stub is fine.
const fakeDirectus = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
} as unknown as DirectusClient;
const service = new UsersService(db, fakeDirectus);

afterAll(async () => {
  await client.end();
});

describe('UsersService.upsertByAuthentikSubject', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('inserts a new row when no user exists for the subject', async () => {
    const created = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-001',
      email: 'alice@example.com',
      displayName: 'Alice',
    });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.authentikSubject).toBe('sub-001');
    expect(created.email).toBe('alice@example.com');
    expect(created.displayName).toBe('Alice');
    expect(created.lastLoginAt).toBeInstanceOf(Date);
  });

  it('updates email + displayName + lastLoginAt for an existing subject (no duplicate row)', async () => {
    const first = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-002',
      email: 'old@example.com',
      displayName: 'Old Name',
    });
    const firstLogin = first.lastLoginAt;

    // Avoid a same-millisecond timestamp collision when running fast.
    await new Promise((r) => setTimeout(r, 5));

    const second = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-002',
      email: 'new@example.com',
      displayName: 'New Name',
    });

    expect(second.id).toBe(first.id);
    expect(second.email).toBe('new@example.com');
    expect(second.displayName).toBe('New Name');
    expect(second.lastLoginAt.getTime()).toBeGreaterThan(firstLogin.getTime());

    const all = await db.select().from(users);
    expect(all).toHaveLength(1);
  });

  it('rejects an empty subject', async () => {
    await expect(
      service.upsertByAuthentikSubject({
        authentikSubject: '',
        email: 'x@example.com',
      }),
    ).rejects.toThrow('authentikSubject must be non-empty');
  });

  it('rejects a malformed email', async () => {
    await expect(
      service.upsertByAuthentikSubject({
        authentikSubject: 'sub-003',
        email: 'not-an-email',
      }),
    ).rejects.toThrow('email must be an email address');
  });
});

describe('UsersService.findByAuthentikSubject', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('returns the user when present', async () => {
    await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-find',
      email: 'find@example.com',
    });

    const found = await service.findByAuthentikSubject('sub-find');
    expect(found?.email).toBe('find@example.com');
  });

  it('returns undefined when absent', async () => {
    const found = await service.findByAuthentikSubject('does-not-exist');
    expect(found).toBeUndefined();
  });
});

describe('UsersService.findByHandle', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('returns the user when handle matches', async () => {
    await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-handle-1',
      email: 'binali@example.com',
    });
    const found = await service.findByHandle('binali');
    expect(found?.email).toBe('binali@example.com');
    expect(found?.handle).toBe('binali');
  });

  it('returns the user case-insensitively', async () => {
    await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-handle-2',
      email: 'kate@example.com',
    });
    const found = await service.findByHandle('  KATE  ');
    expect(found?.handle).toBe('kate');
  });

  it('returns undefined for an unknown handle', async () => {
    const found = await service.findByHandle('ghost');
    expect(found).toBeUndefined();
  });

  it('returns undefined for an empty handle', async () => {
    const found = await service.findByHandle('   ');
    expect(found).toBeUndefined();
  });
});

describe('UsersService.findHandlesByDirectusIds (F-S3.10-c bridge)', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('returns empty map for an empty input', async () => {
    const out = await service.findHandlesByDirectusIds([]);
    expect(out).toEqual({});
  });

  it('returns a map of directus_user_id → handle for users that have both', async () => {
    const alice = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-bridge-1',
      email: 'alice@example.com',
    });
    const bob = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-bridge-2',
      email: 'bob@example.com',
    });
    const aliceDx = '11111111-1111-1111-1111-111111111111';
    const bobDx = '22222222-2222-2222-2222-222222222222';
    await db.update(users).set({ directusUserId: aliceDx }).where(eq(users.id, alice.id));
    await db.update(users).set({ directusUserId: bobDx }).where(eq(users.id, bob.id));

    const out = await service.findHandlesByDirectusIds([aliceDx, bobDx]);
    expect(out).toEqual({ [aliceDx]: 'alice', [bobDx]: 'bob' });
  });

  it('omits users without a handle (e.g. derived handle was too short)', async () => {
    const u = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-bridge-3',
      // 2-char prefix → derived handle below the 3-char floor → null.
      email: 'ab@example.com',
    });
    const dx = '33333333-3333-3333-3333-333333333333';
    await db.update(users).set({ directusUserId: dx }).where(eq(users.id, u.id));

    const out = await service.findHandlesByDirectusIds([dx]);
    expect(out).toEqual({});
  });

  it('omits directus IDs that match no local user', async () => {
    const out = await service.findHandlesByDirectusIds(['99999999-9999-9999-9999-999999999999']);
    expect(out).toEqual({});
  });
});

describe('UsersService.upsertByAuthentikSubject (handle derivation)', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('derives handle from email prefix on first insert', async () => {
    const created = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-derive-1',
      email: 'alice@example.com',
    });
    expect(created.handle).toBe('alice');
  });

  it('replaces non-handle chars with underscore', async () => {
    const created = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-derive-2',
      email: 'first.last+tag@example.com',
    });
    expect(created.handle).toBe('first_last_tag');
  });

  it('skips handle assignment when prefix is too short', async () => {
    const created = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-derive-3',
      email: 'a@example.com',
    });
    expect(created.handle).toBeNull();
  });

  it('does not overwrite an existing handle on update', async () => {
    const first = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-derive-4',
      email: 'kate@example.com',
    });
    expect(first.handle).toBe('kate');

    const second = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-derive-4',
      email: 'kate-rebrand@example.com',
    });
    expect(second.handle).toBe('kate');
  });
});

describe('UsersService.getPublicProfile', () => {
  beforeEach(async () => {
    await db.delete(users);
    (fakeDirectus.get as ReturnType<typeof vi.fn>).mockReset();
  });

  it('returns undefined when no user matches the handle', async () => {
    const profile = await service.getPublicProfile('nobody', 'uz');
    expect(profile).toBeUndefined();
    expect(fakeDirectus.get).not.toHaveBeenCalled();
  });

  it('returns zero counts when the user is not yet bridge-linked (directus_user_id is null)', async () => {
    await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-profile-unlinked',
      email: 'unlinked@example.com',
    });
    const profile = await service.getPublicProfile('unlinked', 'uz');
    expect(profile).toMatchObject({
      attendedCount: 0,
      registeredCount: 0,
      totalPoints: 0,
    });
    expect(fakeDirectus.get).not.toHaveBeenCalled();
  });

  it('hits Directus five times (3 aggregates + user fields + recent events) when bridge-linked', async () => {
    const user = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-profile-linked',
      email: 'linked@example.com',
    });
    await db
      .update(users)
      .set({ directusUserId: '11111111-1111-4000-8000-000000000099' })
      .where(eq(users.id, user.id));

    // Order matches the Promise.all in getPublicProfile:
    //   [attended count, registered count, points sum, user fields, recent events]
    (fakeDirectus.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: [{ count: { id: '3' } }] })
      .mockResolvedValueOnce({ data: [{ count: { id: '5' } }] })
      .mockResolvedValueOnce({ data: [{ sum: { points: '42' } }] })
      .mockResolvedValueOnce({
        data: {
          bio_md: 'Hello from the test.',
          job_title: 'ML Engineer',
          employer: { name: 'Acme AI' },
        },
      })
      .mockResolvedValueOnce({
        data: [
          {
            event: {
              id: 'ev-1',
              title: 'LoRA Deep Dive',
              starts_at: '2026-04-12T16:00:00Z',
              ends_at: '2026-04-12T19:00:00Z',
            },
          },
        ],
      });

    const profile = await service.getPublicProfile('linked', 'uz');
    expect(profile).toMatchObject({
      attendedCount: 3,
      registeredCount: 5,
      totalPoints: 42,
      extras: {
        bioMd: 'Hello from the test.',
        jobTitle: 'ML Engineer',
        employerName: 'Acme AI',
        recentEvents: [
          {
            eventId: 'ev-1',
            title: 'LoRA Deep Dive',
            startsAt: '2026-04-12T16:00:00Z',
            endsAt: '2026-04-12T19:00:00Z',
          },
        ],
      },
    });
    expect(fakeDirectus.get).toHaveBeenCalledTimes(5);
    // sanity: tenant + status filters applied to the registrations queries
    const calls = (fakeDirectus.get as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(calls[0]).toContain('filter%5Bstatus%5D%5B_eq%5D=attended');
    expect(calls[0]).toContain('filter%5Bevent%5D%5Bcountry%5D%5B_eq%5D=uz');
    expect(calls[1]).toContain('filter%5Bstatus%5D%5B_eq%5D=registered');
    expect(calls[2]).toContain('aggregate%5Bsum%5D=points');
    // F-WebU15 extras: user fields read + recent events list
    expect(calls[3]).toContain('/users/11111111-1111-4000-8000-000000000099');
    expect(calls[3]).toContain('fields=bio_md');
    expect(calls[4]).toContain('/items/registrations');
    expect(calls[4]).toContain('filter%5Bstatus%5D%5B_eq%5D=attended');
    expect(calls[4]).toContain('sort=-date_updated');
  });

  it('gracefully degrades to zero counts on Directus failure (page still renders)', async () => {
    const user = await service.upsertByAuthentikSubject({
      authentikSubject: 'sub-profile-degrade',
      email: 'degrade@example.com',
    });
    await db
      .update(users)
      .set({ directusUserId: '22222222-2222-4000-8000-000000000098' })
      .where(eq(users.id, user.id));

    (fakeDirectus.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ECONNREFUSED'));

    const profile = await service.getPublicProfile('degrade', 'uz');
    expect(profile).toMatchObject({
      attendedCount: 0,
      registeredCount: 0,
      totalPoints: 0,
    });
  });
});
