import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import { DirectusClient } from '../src/modules/directus/directus.client';
import { users } from '../src/modules/users/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

// Tiny fake to avoid touching a real Directus. The bridge only uses
// get / post / patch on /users, so we mock those.
type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

function makeBridge(fake: FakeDirectus) {
  return new DirectusUsersBridgeService(db, fake as unknown as DirectusClient);
}

async function seedUser(email: string) {
  const [row] = await db
    .insert(users)
    .values({
      authentikSubject: `sub-${email}`,
      email,
      displayName: 'Test User',
    })
    .returning();
  if (!row) throw new Error('seed failed');
  return row;
}

describe('DirectusUsersBridgeService.ensureLinked', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('creates a directus_users row when none exists, and stores the mapping', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({
        data: { id: '11111111-1111-4000-8000-000000000001', email: 'a@b.com' },
      }),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('a@b.com');

    const id = await bridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBe('11111111-1111-4000-8000-000000000001');
    expect(fake.get).toHaveBeenCalledTimes(1);
    expect(fake.post).toHaveBeenCalledTimes(1);
    expect(fake.post.mock.calls[0]?.[0]).toBe('/users');
    const body = fake.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({
      email: 'a@b.com',
      provider: 'authentik',
      external_identifier: 'a@b.com',
      status: 'active',
    });
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id));
    expect(refreshed?.directusUserId).toBe('11111111-1111-4000-8000-000000000001');
  });

  it('links to an existing matching directus_users row without creating a duplicate', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: '22222222-2222-4000-8000-000000000002',
            email: 'b@c.com',
            external_identifier: 'b@c.com',
            provider: 'authentik',
          },
        ],
      }),
      post: vi.fn(),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('b@c.com');

    const id = await bridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBe('22222222-2222-4000-8000-000000000002');
    expect(fake.post).not.toHaveBeenCalled();
    expect(fake.patch).not.toHaveBeenCalled();
  });

  it('backfills provider+external_identifier when an existing row has the wrong shape', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: '33333333-3333-4000-8000-000000000003',
            email: 'c@d.com',
            external_identifier: null,
            provider: 'default',
          },
        ],
      }),
      post: vi.fn(),
      patch: vi.fn().mockResolvedValue({}),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('c@d.com');

    await bridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    expect(fake.patch).toHaveBeenCalledWith('/users/33333333-3333-4000-8000-000000000003', {
      provider: 'authentik',
      external_identifier: 'c@d.com',
    });
  });

  it('is a no-op (fast path) when directusUserId is already populated', async () => {
    const fake: FakeDirectus = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('d@e.com');
    await db
      .update(users)
      .set({ directusUserId: '44444444-4444-4000-8000-000000000004' })
      .where(eq(users.id, user.id));

    const id = await bridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBe('44444444-4444-4000-8000-000000000004');
    expect(fake.get).not.toHaveBeenCalled();
    expect(fake.post).not.toHaveBeenCalled();
  });

  it('returns null + does NOT throw when Directus is unreachable (sign-in must not block)', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      post: vi.fn(),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('e@f.com');

    const id = await bridge.ensureLinked({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBeNull();
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id));
    expect(refreshed?.directusUserId).toBeNull();
  });
});

describe('DirectusUsersBridgeService.resolveDirectusId', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('returns null for unknown userId', async () => {
    const fake: FakeDirectus = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
    const bridge = makeBridge(fake);
    const id = await bridge.resolveDirectusId('00000000-0000-0000-0000-000000000000');
    expect(id).toBeNull();
  });

  it('falls back to ensureLinked when the column is empty', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({ data: { id: '55555555-5555-4000-8000-000000000005' } }),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('f@g.com');
    const id = await bridge.resolveDirectusId(user.id);
    expect(id).toBe('55555555-5555-4000-8000-000000000005');
  });
});

// ISS-UAT-001-1 — covers the email-keyed variant used by the new
// POST /v1/internal/users/ensure-linked handler. Uses the same
// Testcontainers Postgres setup as the rest of this suite (per
// AGENTS.md §3: "never mock the database"); the Directus REST client
// stays faked because the bridge is what we're testing, not Directus.
describe('DirectusUsersBridgeService.ensureLinkedByEmail', () => {
  beforeEach(async () => {
    await db.delete(users);
  });

  it('returns null when no local user exists for the email (no Directus traffic)', async () => {
    const fake: FakeDirectus = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
    const bridge = makeBridge(fake);

    const id = await bridge.ensureLinkedByEmail({
      email: 'nobody@nowhere.test',
      displayName: null,
    });

    expect(id).toBeNull();
    // No Directus call must happen when there's no local row to mirror —
    // otherwise the bridge would happily create a Directus user for a
    // row that doesn't exist locally, which is exactly the audit hole
    // we're trying to avoid by gating on the local lookup.
    expect(fake.get).not.toHaveBeenCalled();
    expect(fake.post).not.toHaveBeenCalled();
  });

  it('returns the existing directusUserId without re-creating when the column is already populated', async () => {
    const existingId = '66666666-6666-4000-8000-000000000006';
    const fake: FakeDirectus = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
    const bridge = makeBridge(fake);
    const user = await seedUser('linked@aiqadam.test');
    await db
      .update(users)
      .set({ directusUserId: existingId })
      .where(eq(users.id, user.id));

    const id = await bridge.ensureLinkedByEmail({
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBe(existingId);
    expect(fake.get).not.toHaveBeenCalled();
    expect(fake.post).not.toHaveBeenCalled();
  });

  it('creates the Directus row + persists directusUserId when the local row exists but the column is null', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockResolvedValue({ data: [] }),
      post: vi.fn().mockResolvedValue({
        data: { id: '77777777-7777-4000-8000-000000000007', email: 'fresh@aiqadam.test' },
      }),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('fresh@aiqadam.test');

    const id = await bridge.ensureLinkedByEmail({
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBe('77777777-7777-4000-8000-000000000007');
    expect(fake.post).toHaveBeenCalledTimes(1);
    const body = fake.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toMatchObject({
      email: 'fresh@aiqadam.test',
      provider: 'authentik',
      external_identifier: 'fresh@aiqadam.test',
      status: 'active',
    });
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id));
    expect(refreshed?.directusUserId).toBe('77777777-7777-4000-8000-000000000007');
  });

  it('logs + returns null when Directus is unreachable (caller must not block on a bridge failure)', async () => {
    const fake: FakeDirectus = {
      get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      post: vi.fn(),
      patch: vi.fn(),
    };
    const bridge = makeBridge(fake);
    const user = await seedUser('broken@aiqadam.test');

    const id = await bridge.ensureLinkedByEmail({
      email: user.email,
      displayName: user.displayName,
    });

    expect(id).toBeNull();
    // Bridge failure must NOT auto-populate directusUserId — the next
    // call (real sign-in or another seed run) needs a clean retry.
    const [refreshed] = await db.select().from(users).where(eq(users.id, user.id));
    expect(refreshed?.directusUserId).toBeNull();
  });
});
