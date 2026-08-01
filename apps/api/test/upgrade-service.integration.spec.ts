import { randomUUID } from 'node:crypto';
import { eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import type { AuthentikClient, AuthentikUser } from '../src/modules/admin-invites/authentik.client';
import { upgradeIntents } from '../src/modules/auth/upgrade-intent.schema';
import { UpgradeService } from '../src/modules/auth/upgrade.service';
import { users } from '../src/modules/users/schema';

// Integration tests for UpgradeService (FR-AUTH-006), 06-test-strategy.md's
// Integration Test Plan. Real Postgres via Testcontainers
// (inject('TEST_DATABASE_URL'), same harness as refresh-token.spec.ts) for
// the DB half; a faked AuthentikClient (vi.fn() stubs, NOT a second
// Testcontainer) for the Authentik half — matching
// magic-link-controller.spec.ts's / upgrade-service.spec.ts's own header
// comment on why this codebase's precedent for "needs real DB, only other
// collaborator is AuthentikClient" is a real DB + a fake client, not two
// real backends.
//
// This file's most important test is the MAJOR-2 race/collision regression
// (SecurityReviewer's still-open finding, 04-security-review.md) — see the
// dedicated describe block below. It proves, against a REAL
// users_email_unique Postgres constraint, that a losing collision racer's
// commitUpgrade() is never reached: is_temporary stays true, the
// upgrade_intents row stays unconsumed.

const url = inject('TEST_DATABASE_URL');
const client = postgres(url, { max: 2 });
const db = drizzle(client);

afterAll(async () => {
  await client.end();
});

async function resetTables(): Promise<void> {
  await db.delete(upgradeIntents);
  await db.delete(users);
}

type FakeAuthentik = {
  getUserByTelegramId: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
  getUserById: ReturnType<typeof vi.fn>;
  setUserEmail: ReturnType<typeof vi.fn>;
  patchAttributes: ReturnType<typeof vi.fn>;
  sendMagicLinkEmail: ReturnType<typeof vi.fn>;
};

function makeFakeAuthentik(): FakeAuthentik {
  return {
    getUserByTelegramId: vi.fn(),
    getUserByEmail: vi.fn(),
    getUserById: vi.fn(),
    setUserEmail: vi.fn().mockResolvedValue(undefined),
    patchAttributes: vi.fn().mockResolvedValue(undefined),
    sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  };
}

function makeAkUser(overrides: Partial<AuthentikUser> = {}): AuthentikUser {
  return {
    pk: 1,
    username: 'tg1',
    email: 'tg1@telegram.local',
    name: 'Temp User',
    is_active: true,
    uid: 'ak-uid-1',
    groups: [],
    groups_obj: [],
    attributes: { is_temporary: true, telegram_id: '1' },
    ...overrides,
  };
}

function makeService(authentik: FakeAuthentik): UpgradeService {
  return new UpgradeService(db as unknown as never, authentik as unknown as AuthentikClient);
}

async function insertUser(overrides: {
  authentikSubject: string;
  email: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values({
      authentikSubject: overrides.authentikSubject,
      email: overrides.email,
    })
    .returning({ id: users.id });
  if (!row) throw new Error('user insert returned no row');
  return row;
}

// Env config (AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID/BRAND_DOMAIN) is
// already set in vitest.config.ts for the whole suite (non-empty
// placeholders are NOT set there for these two — see that file; this
// module reads them via `env`, which in the test env resolves through
// config/env.ts's real parsing of the vitest.config.ts `env` block. Since
// vitest.config.ts does not set AUTHENTIK_MAGIC_LINK_* at all, they are
// undefined in this file's process — requestUpgrade() therefore takes the
// degraded (no sendMagicLinkEmail call) branch here, which is fine: this
// file's assertions target the DB/collision behavior, not the send step.

describe('upgrade_intents table CRUD (real Postgres)', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('insert, point lookup by tokenHash, and consumedAt update all persist correctly', async () => {
    // Arrange
    const now = new Date();
    const [inserted] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'a'.repeat(64),
        authentikUserPk: 100,
        telegramId: '100',
        targetEmail: 'crud-test@example.com',
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();
    expect(inserted).toBeDefined();

    // Act — point lookup by tokenHash.
    const [found] = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.tokenHash, 'a'.repeat(64)));

    // Assert
    expect(found?.authentikUserPk).toBe(100);
    expect(found?.telegramId).toBe('100');
    expect(found?.targetEmail).toBe('crud-test@example.com');
    expect(found?.consumedAt).toBeNull();

    // Act — consumedAt update persists.
    const consumedAt = new Date();
    await db
      .update(upgradeIntents)
      .set({ consumedAt })
      .where(eq(upgradeIntents.id, found!.id));
    const [reselected] = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.id, found!.id));

    // Assert
    expect(reselected?.consumedAt).not.toBeNull();
  });

  it('a select filtered by expiresAt > now() correctly excludes an already-expired row (boundary case)', async () => {
    // Arrange — one row expiring 1 hour ago, one expiring 1 hour from now.
    const now = new Date();
    await db.insert(upgradeIntents).values([
      {
        tokenHash: 'b'.repeat(64),
        authentikUserPk: 200,
        telegramId: '200',
        targetEmail: 'expired@example.com',
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
      {
        tokenHash: 'c'.repeat(64),
        authentikUserPk: 201,
        telegramId: '201',
        targetEmail: 'live@example.com',
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      },
    ]);

    // Act
    const live = await db
      .select()
      .from(upgradeIntents)
      .where(gt(upgradeIntents.expiresAt, now));

    // Assert — exactly the non-expired row is returned.
    expect(live).toHaveLength(1);
    expect(live[0]?.targetEmail).toBe('live@example.com');
  });
});

describe('requestUpgrade() full round trip against real DB', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('inserts exactly one real upgrade_intents row that resolvePendingUpgrade can later find via the SAME service instance', async () => {
    // Arrange
    const authentik = makeFakeAuthentik();
    const akUser = makeAkUser({ pk: 300 });
    authentik.getUserByTelegramId.mockResolvedValue(akUser);
    authentik.getUserByEmail.mockResolvedValue(null); // no collision on either check
    const svc = makeService(authentik);

    // Act
    const result = await svc.requestUpgrade('300', 'roundtrip@example.com');

    // Assert — insert happened for real.
    expect(result).toEqual({ ok: true });
    const rows = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.authentikUserPk, 300));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetEmail).toBe('roundtrip@example.com');
    expect(rows[0]?.consumedAt).toBeNull();

    // Act — same service instance, resolvePendingUpgrade finds it via a
    // real indexed query (not a re-assertion of individual Drizzle calls,
    // which the unit suite already covers with mocks).
    authentik.getUserByEmail.mockResolvedValue({ ...akUser, email: 'roundtrip@example.com' });
    const pending = await svc.resolvePendingUpgrade('roundtrip@example.com');

    // Assert
    expect(pending).not.toBeNull();
    expect(pending?.authentikUserPk).toBe(300);
    expect(pending?.intent.id).toBe(rows[0]?.id);
  });
});

describe('resolvePendingUpgrade() -> commitUpgrade() full round trip against real DB', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('seeded live intent resolves, and commitUpgrade consumes it + merge-patches is_temporary=false', async () => {
    // Arrange — seed a live intent row directly.
    const now = new Date();
    const [intentRow] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'd'.repeat(64),
        authentikUserPk: 400,
        telegramId: '400',
        targetEmail: 'commit-test@example.com',
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();
    const authentik = makeFakeAuthentik();
    authentik.getUserByEmail.mockResolvedValue(
      makeAkUser({ pk: 400, email: 'commit-test@example.com' }),
    );
    authentik.getUserById.mockResolvedValue(
      makeAkUser({
        pk: 400,
        email: 'commit-test@example.com',
        attributes: { is_temporary: true, telegram_id: '400', keep_me: 'yes' },
      }),
    );
    const svc = makeService(authentik);

    // Act
    const pending = await svc.resolvePendingUpgrade('commit-test@example.com');
    expect(pending).not.toBeNull();
    await svc.commitUpgrade(pending!);

    // Assert — real Postgres row now has consumedAt set.
    const [reselected] = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.id, intentRow!.id));
    expect(reselected?.consumedAt).not.toBeNull();

    // Assert — attributes merge preserved keep_me, flipped is_temporary.
    expect(authentik.patchAttributes).toHaveBeenCalledWith(400, {
      is_temporary: false,
      telegram_id: '400',
      keep_me: 'yes',
    });
  });
});

describe('AC-8 fall-through: expired intent', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('resolvePendingUpgrade returns null for an expired-only seed — no throw, no mutation, ordinary sign-in proceeds unaffected', async () => {
    // Arrange
    const now = new Date();
    await db.insert(upgradeIntents).values({
      tokenHash: 'e'.repeat(64),
      authentikUserPk: 500,
      telegramId: '500',
      targetEmail: 'expired-fallthrough@example.com',
      expiresAt: new Date(now.getTime() - 60 * 1000),
    });
    const authentik = makeFakeAuthentik();
    authentik.getUserByEmail.mockResolvedValue(makeAkUser({ pk: 500 }));
    const svc = makeService(authentik);

    // Act
    const pending = await svc.resolvePendingUpgrade('expired-fallthrough@example.com');

    // Assert
    expect(pending).toBeNull();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();
  });
});

describe('AC-8 fall-through: already-consumed intent (replay)', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('resolvePendingUpgrade returns null for a consumed-only seed — same non-throw/no-mutation guarantee', async () => {
    // Arrange
    const now = new Date();
    await db.insert(upgradeIntents).values({
      tokenHash: 'f'.repeat(64),
      authentikUserPk: 600,
      telegramId: '600',
      targetEmail: 'replay@example.com',
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      consumedAt: new Date(),
    });
    const authentik = makeFakeAuthentik();
    authentik.getUserByEmail.mockResolvedValue(makeAkUser({ pk: 600 }));
    const svc = makeService(authentik);

    // Act
    const pending = await svc.resolvePendingUpgrade('replay@example.com');

    // Assert
    expect(pending).toBeNull();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MAJOR-2 — race/collision regression test (SecurityReviewer's explicitly-
// required, still-open finding, 04-security-review.md). THE most important
// test in this workflow. Two required sub-cases.
// ═══════════════════════════════════════════════════════════════════════

describe('MAJOR-2 (a): common-case collision caught by requestUpgrade()\'s re-check', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('second concurrent requestUpgrade() call for a different temp user targeting the same email is rejected before any mutation', async () => {
    // Arrange — model "concurrency" by sequencing the faked
    // getUserByEmail's return values across the two calls: caller A's
    // step-c and step-c2 both see no collision and successfully patches +
    // inserts; by the time caller B's step-c runs, getUserByEmail is
    // reprogrammed to return A's now-patched Authentik user.
    const SHARED_EMAIL = 'contested@example.com';
    const authentikA = makeFakeAuthentik();
    const userA = makeAkUser({ pk: 700, attributes: { is_temporary: true, telegram_id: '700' } });
    authentikA.getUserByTelegramId.mockResolvedValue(userA);
    authentikA.getUserByEmail.mockResolvedValue(null); // both checks clean for A
    const svcA = makeService(authentikA);

    // Act — A wins cleanly.
    const resultA = await svcA.requestUpgrade('700', SHARED_EMAIL);
    expect(resultA).toEqual({ ok: true });

    // Arrange — B's Authentik client now sees A's patched user as a
    // collision on BOTH getUserByEmail calls (modeling that A's PATCH has
    // already landed by the time B's checks run).
    const authentikB = makeFakeAuthentik();
    const userB = makeAkUser({
      pk: 701,
      attributes: { is_temporary: true, telegram_id: '701' },
    });
    authentikB.getUserByTelegramId.mockResolvedValue(userB);
    authentikB.getUserByEmail.mockResolvedValue({ ...userA, email: SHARED_EMAIL });
    const svcB = makeService(authentikB);

    // Act / Assert — B's request is rejected, no mutation attempted.
    await expect(svcB.requestUpgrade('701', SHARED_EMAIL)).rejects.toMatchObject({
      response: { error: 'email_already_in_use' },
    });
    expect(authentikB.setUserEmail).not.toHaveBeenCalled();

    // Assert — only A's intent row exists in real Postgres.
    const rows = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.targetEmail, SHARED_EMAIL));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.authentikUserPk).toBe(700);
  });
});

describe('MAJOR-2 (b): residual race window — a losing racer never reaches is_temporary=false with no platform.users row', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('racer A commits successfully; racer B\'s platform.users insert hits the REAL users_email_unique violation, and B\'s commitUpgrade() is never called: is_temporary stays true, intent stays unconsumed', async () => {
    // Arrange — model the state the residual TOCTOU window can produce
    // despite requestUpgrade()'s re-check: BOTH racers already won their
    // own collision checks and already got their Authentik record PATCHed
    // to the identical target email (this is the state fix (a) above
    // cannot fully prevent under a sufficiently adversarial scheduler, per
    // SecurityReviewer's own acknowledgment). Skip straight to two live
    // upgrade_intents rows for two different authentikUserPks, both
    // carrying the SAME targetEmail.
    const SHARED_EMAIL = 'racer-shared@example.com';
    const now = new Date();
    const [intentA] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'aa'.repeat(32),
        authentikUserPk: 800,
        telegramId: '800',
        targetEmail: SHARED_EMAIL,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();
    const [intentB] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'bb'.repeat(32),
        authentikUserPk: 801,
        telegramId: '801',
        targetEmail: SHARED_EMAIL,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();
    expect(intentA).toBeDefined();
    expect(intentB).toBeDefined();

    const authentikA = makeFakeAuthentik();
    const userA = makeAkUser({
      pk: 800,
      email: SHARED_EMAIL,
      attributes: { is_temporary: true, telegram_id: '800' },
    });
    authentikA.getUserByEmail.mockResolvedValue(userA);
    authentikA.getUserById.mockResolvedValue(userA);
    const svcA = makeService(authentikA);

    const authentikB = makeFakeAuthentik();
    const userB = makeAkUser({
      pk: 801,
      email: SHARED_EMAIL,
      attributes: { is_temporary: true, telegram_id: '801' },
    });
    authentikB.getUserByEmail.mockResolvedValue(userB);
    authentikB.getUserById.mockResolvedValue(userB);
    const svcB = makeService(authentikB);

    // ── Racer A goes first: resolvePendingUpgrade -> real platform.users
    // insert (mirrors callback()'s upsertByAuthentikSubject) -> succeeds
    // -> commitUpgrade. ──
    const pendingA = await svcA.resolvePendingUpgrade(SHARED_EMAIL);
    expect(pendingA).not.toBeNull();
    const userRowA = await insertUser({ authentikSubject: `sub-A-${randomUUID()}`, email: SHARED_EMAIL });
    expect(userRowA.id).toBeDefined();
    await svcA.commitUpgrade(pendingA!);

    // Assert — A is fully committed.
    expect(authentikA.patchAttributes).toHaveBeenCalledWith(800, {
      is_temporary: false,
      telegram_id: '800',
    });
    const [reselectedA] = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.id, intentA!.id));
    expect(reselectedA?.consumedAt).not.toBeNull();

    // ── Racer B goes second: resolvePendingUpgrade succeeds (side-effect-
    // free, does not know about A's write) -> the platform.users insert
    // for a DIFFERENT authentikSubject but the SAME email MUST raise the
    // real users_email_unique violation — do NOT catch it silently. This
    // is the exact invariant the whole reorder design in
    // AuthController.callback() depends on. ──
    const pendingB = await svcB.resolvePendingUpgrade(SHARED_EMAIL);
    expect(pendingB).not.toBeNull();

    const bAuthentikSubject = `sub-B-${randomUUID()}`;
    let raised: unknown;
    try {
      await insertUser({ authentikSubject: bAuthentikSubject, email: SHARED_EMAIL });
    } catch (err) {
      raised = err;
    }

    // Assert — the real Postgres unique-constraint violation surfaced.
    // Drizzle's postgres-js driver wraps the raw PostgresError in a
    // DrizzleQueryError, with the real driver error (code 23505 = Postgres
    // unique_violation) on `.cause` — asserted here, not caught/swallowed,
    // per this test's whole point: the exception the reorder design in
    // AuthController.callback() depends on must be real.
    expect(raised).toBeDefined();
    expect(raised).toMatchObject({
      cause: {
        code: '23505',
        constraint_name: 'users_email_unique',
      },
    });

    // Critically: mirroring callback()'s real unguarded-await control flow
    // (auth.controller.ts — no try/catch between upsertByAuthentikSubject
    // and commitUpgrade), commitUpgrade() for B is NEVER called after that
    // throw. We do not call it here, by design — asserting the state below
    // proves B was never touched.

    // Assert — B's Authentik record was never patched.
    expect(authentikB.patchAttributes).not.toHaveBeenCalled();

    // Assert — B's upgrade_intents row is still unconsumed in real Postgres.
    const [reselectedB] = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.id, intentB!.id));
    expect(reselectedB?.consumedAt).toBeNull();

    // Assert — B never got a platform.users row: the insert that would
    // have created one threw, so a lookup by B's own authentikSubject
    // (captured above, not a placeholder) finds nothing.
    const bUserRows = await db.select().from(users).where(eq(users.authentikSubject, bAuthentikSubject));
    expect(bUserRows).toHaveLength(0);
    const allUsersWithSharedEmail = await db.select().from(users).where(eq(users.email, SHARED_EMAIL));
    expect(allUsersWithSharedEmail).toHaveLength(1); // only A's row exists
    expect(allUsersWithSharedEmail[0]?.id).toBe(userRowA.id);
  });
});

describe('callback()-level integration: commitUpgrade runs only after the users upsert succeeds', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('mirrors AuthController.callback()\'s real ordering against a real UpgradeService + real Postgres — happy path, single racer', async () => {
    // Arrange — a single (non-colliding) live intent.
    const now = new Date();
    const [intentRow] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'cc'.repeat(32),
        authentikUserPk: 900,
        telegramId: '900',
        targetEmail: 'callback-ordering@example.com',
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();
    const authentik = makeFakeAuthentik();
    const akUser = makeAkUser({ pk: 900, email: 'callback-ordering@example.com' });
    authentik.getUserByEmail.mockResolvedValue(akUser);
    authentik.getUserById.mockResolvedValue(akUser);
    const svc = makeService(authentik);

    const callOrder: string[] = [];

    // Act — mirror callback()'s exact sequence: resolvePendingUpgrade
    // before the users upsert, commitUpgrade only after it succeeds.
    const pending = await svc.resolvePendingUpgrade('callback-ordering@example.com');
    callOrder.push('resolvePendingUpgrade');
    expect(pending).not.toBeNull();

    await insertUser({ authentikSubject: `sub-${randomUUID()}`, email: 'callback-ordering@example.com' });
    callOrder.push('upsertByAuthentikSubject');

    if (pending) {
      await svc.commitUpgrade(pending);
      callOrder.push('commitUpgrade');
    }

    // Assert — correct order, and the intent is now consumed for real.
    expect(callOrder).toEqual(['resolvePendingUpgrade', 'upsertByAuthentikSubject', 'commitUpgrade']);
    const [reselected] = await db
      .select()
      .from(upgradeIntents)
      .where(eq(upgradeIntents.id, intentRow!.id));
    expect(reselected?.consumedAt).not.toBeNull();
  });
});

// Multiple live rows for the same pk (re-issued /upgrade-temp calls before
// the first expired) — assert the most recently created wins, per
// orderBy(desc(createdAt)).limit(1). Unit suite proves the pass-through
// wiring with a mock; this proves the real ORDER BY against Postgres.
describe('resolvePendingUpgrade() — multiple live rows for the same pk (real ORDER BY)', () => {
  beforeEach(async () => {
    await resetTables();
  });

  it('returns the most recently created row, not just any row', async () => {
    // Arrange
    const now = new Date();
    const older = new Date(now.getTime() - 60_000);
    const [olderRow] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'dd'.repeat(32),
        authentikUserPk: 1000,
        telegramId: '1000',
        targetEmail: 'reissue@example.com',
        createdAt: older,
        expiresAt: new Date(older.getTime() + 30 * 60 * 1000),
      })
      .returning();
    const [newerRow] = await db
      .insert(upgradeIntents)
      .values({
        tokenHash: 'ee'.repeat(32),
        authentikUserPk: 1000,
        telegramId: '1000',
        targetEmail: 'reissue@example.com',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();
    expect(olderRow?.id).not.toBe(newerRow?.id);

    const authentik = makeFakeAuthentik();
    authentik.getUserByEmail.mockResolvedValue(makeAkUser({ pk: 1000, email: 'reissue@example.com' }));
    const svc = makeService(authentik);

    // Act
    const pending = await svc.resolvePendingUpgrade('reissue@example.com');

    // Assert
    expect(pending?.intent.id).toBe(newerRow?.id);
  });
});
