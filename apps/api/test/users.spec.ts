import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { users } from '../src/modules/users/schema';
import { UsersService } from '../src/modules/users/users.service';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);
const service = new UsersService(db);

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
