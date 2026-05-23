import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { refreshTokens } from '../src/modules/auth/refresh-token.schema';
import {
  REFRESH_TOKEN_TTL_MS,
  RefreshTokenInvalidError,
  RefreshTokenReplayError,
  RefreshTokenService,
} from '../src/modules/auth/refresh-token.service';
import { users } from '../src/modules/users/schema';

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);
const service = new RefreshTokenService(db);

afterAll(async () => {
  await client.end();
});

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

describe('RefreshTokenService.issue', () => {
  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  it('returns an opaque token, a familyId, and an expiry ~14 days out', async () => {
    const userId = await makeUser();
    const before = Date.now();

    const issued = await service.issue({ userId });

    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    expect(issued.familyId).toMatch(/^[0-9a-f-]{36}$/);
    const ttl = issued.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(REFRESH_TOKEN_TTL_MS - 1000);
    expect(ttl).toBeLessThanOrEqual(REFRESH_TOKEN_TTL_MS + 1000);
  });

  it('preserves familyId when issuing a rotation', async () => {
    const userId = await makeUser();
    const first = await service.issue({ userId });
    const second = await service.issue({ userId, familyId: first.familyId });

    expect(second.familyId).toBe(first.familyId);
    expect(second.token).not.toBe(first.token);
  });

  it('rejects an empty userId', async () => {
    await expect(service.issue({ userId: '' })).rejects.toThrow('userId must be non-empty');
  });
});

describe('RefreshTokenService.consume', () => {
  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  it('returns userId+familyId on first use', async () => {
    const userId = await makeUser();
    const issued = await service.issue({ userId });

    const consumed = await service.consume(issued.token);

    expect(consumed.userId).toBe(userId);
    expect(consumed.familyId).toBe(issued.familyId);
  });

  it('rejects an unrecognized token', async () => {
    await expect(service.consume('not-a-real-token')).rejects.toThrow(RefreshTokenInvalidError);
  });

  it('rejects an empty token', async () => {
    await expect(service.consume('')).rejects.toThrow(RefreshTokenInvalidError);
  });

  it('rejects an expired token', async () => {
    const userId = await makeUser();
    const issued = await service.issue({ userId });
    // Force-expire the row directly (simulating clock advance).
    await db.update(refreshTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    await expect(service.consume(issued.token)).rejects.toThrow(/expired/);
  });

  it('rejects a revoked token', async () => {
    const userId = await makeUser();
    const issued = await service.issue({ userId });
    await service.revokeFamily(issued.familyId);

    await expect(service.consume(issued.token)).rejects.toThrow(/revoked/);
  });

  it('on replay (used token re-presented), revokes the entire family', async () => {
    const userId = await makeUser();
    const first = await service.issue({ userId });
    await service.consume(first.token);
    // Issue a rotation in the same family.
    const second = await service.issue({ userId, familyId: first.familyId });

    await expect(service.consume(first.token)).rejects.toThrow(RefreshTokenReplayError);

    // The second (legitimate) token in the family is now revoked too.
    await expect(service.consume(second.token)).rejects.toThrow(/revoked/);
  });
});

describe('RefreshTokenService — id_token carriage (SLO)', () => {
  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  it('persists idToken on issue and returns it from consume', async () => {
    const userId = await makeUser();
    const idToken = 'fake.authentik.idtoken.value';

    const issued = await service.issue({ userId, idToken });
    const consumed = await service.consume(issued.token);

    expect(consumed.idToken).toBe(idToken);
  });

  it('peekIdToken returns the row idToken without marking the row used', async () => {
    const userId = await makeUser();
    const idToken = 'peekable.idtoken';
    const issued = await service.issue({ userId, idToken });

    const peeked = await service.peekIdToken(issued.token);
    expect(peeked).toBe(idToken);

    // Row still consumable — peek did not mark usedAt.
    const consumed = await service.consume(issued.token);
    expect(consumed.userId).toBe(userId);
  });

  it('returns null idToken for rows issued without it (legacy/back-compat)', async () => {
    const userId = await makeUser();
    const issued = await service.issue({ userId });

    expect(await service.peekIdToken(issued.token)).toBeNull();
    const consumed = await service.consume(issued.token);
    expect(consumed.idToken).toBeNull();
  });

  it('peekIdToken returns null for unrecognized tokens (no throw)', async () => {
    expect(await service.peekIdToken('not-a-real-token')).toBeNull();
    expect(await service.peekIdToken('')).toBeNull();
  });
});

describe('RefreshTokenService.revokeAllForUser', () => {
  beforeEach(async () => {
    await db.delete(refreshTokens);
    await db.delete(users);
  });

  it('revokes all active families for the user, leaves other users untouched', async () => {
    const userA = await makeUser();
    const userB = await makeUser();
    const aToken = await service.issue({ userId: userA });
    const bToken = await service.issue({ userId: userB });

    await service.revokeAllForUser(userA);

    await expect(service.consume(aToken.token)).rejects.toThrow(/revoked/);
    const bConsumed = await service.consume(bToken.token);
    expect(bConsumed.userId).toBe(userB);
  });
});
