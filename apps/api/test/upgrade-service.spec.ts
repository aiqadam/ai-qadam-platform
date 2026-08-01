import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unit tests for UpgradeService (FR-AUTH-006). Per 06-test-strategy.md's
// Unit Test Plan: mocks AuthentikClient (FakeAuthentik style, matching
// magic-link-service.spec.ts's precedent) AND the Drizzle `Db` (mock chain)
// since this is a unit-level test — the DB-touching assertions that need a
// REAL Postgres (upgrade_intents CRUD, the collision-race regression) live
// in upgrade-service.integration.spec.ts instead. `env` is mocked via
// vi.hoisted + vi.mock, mirroring magic-link-service.spec.ts's exact
// pattern, since AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID/BRAND_DOMAIN are read
// directly inside upgrade.service.ts via `import { env } from
// '../../config/env'`, not constructor-injected.

const mockEnv = vi.hoisted(() => ({
  AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID: 'stage-uuid-1234' as string | undefined,
  AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN: 'magic-link.aiqadam.internal' as string | undefined,
}));

vi.mock('../src/config/env', () => ({ env: mockEnv }));

// Imports AFTER the mock is hoisted so the module under test sees the fake env.
import type { AuthentikClient, AuthentikUser } from '../src/modules/admin-invites/authentik.client';
import type { UpgradeIntent } from '../src/modules/auth/upgrade-intent.schema';
import { UpgradeService } from '../src/modules/auth/upgrade.service';

type FakeAuthentik = {
  getUserByTelegramId: ReturnType<typeof vi.fn>;
  getUserByEmail: ReturnType<typeof vi.fn>;
  getUserById: ReturnType<typeof vi.fn>;
  setUserEmail: ReturnType<typeof vi.fn>;
  patchAttributes: ReturnType<typeof vi.fn>;
  sendMagicLinkEmail: ReturnType<typeof vi.fn>;
};

// Minimal mock Drizzle chain — supports the three shapes UpgradeService
// actually calls: db.insert(...).values(...), db.select().from().where()
// .orderBy().limit(...), db.update(...).set(...).where(...). Each test
// configures the specific terminal promise it needs.
interface FakeDb {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeFakeDb(overrides: { selectResult?: unknown[] } = {}): FakeDb {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values: insertValues });

  const limit = vi.fn().mockResolvedValue(overrides.selectResult ?? []);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where: updateWhere });
  const update = vi.fn().mockReturnValue({ set });

  return { insert, select, update };
}

const AK_USER: AuthentikUser = {
  pk: 909,
  username: 'tg909',
  email: 'tg909@telegram.local',
  name: 'Temp User',
  is_active: true,
  uid: 'ak-uid-909',
  groups: [],
  groups_obj: [],
  attributes: { is_temporary: true, telegram_id: '909' },
};

const TELEGRAM_ID = '909';
const TARGET_EMAIL = 'real.member@example.com';
const STAGE_UUID = 'stage-uuid-1234';
const BRAND_DOMAIN = 'magic-link.aiqadam.internal';

let authentik: FakeAuthentik;

beforeEach(() => {
  mockEnv.AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID = STAGE_UUID;
  mockEnv.AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN = BRAND_DOMAIN;
  authentik = {
    getUserByTelegramId: vi.fn().mockResolvedValue({ ...AK_USER }),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    getUserById: vi.fn().mockResolvedValue({ ...AK_USER }),
    setUserEmail: vi.fn().mockResolvedValue(undefined),
    patchAttributes: vi.fn().mockResolvedValue(undefined),
    sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined),
  };
});

function makeService(db: FakeDb): UpgradeService {
  return new UpgradeService(db as unknown as never, authentik as unknown as AuthentikClient);
}

// ─── UpgradeService.requestUpgrade ─────────────────────────────────────

describe('UpgradeService.requestUpgrade — happy path', () => {
  it('patches the email, inserts an intent row, and sends the magic link', async () => {
    // Arrange
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act
    const result = await svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL);

    // Assert
    expect(authentik.getUserByTelegramId).toHaveBeenCalledWith(TELEGRAM_ID);
    expect(authentik.getUserByEmail).toHaveBeenCalledTimes(2); // step (c) + re-check (c-2)
    expect(authentik.setUserEmail).toHaveBeenCalledWith(AK_USER.pk, TARGET_EMAIL);
    expect(db.insert).toHaveBeenCalledTimes(1);
    const insertCall = db.insert.mock.results[0]?.value as { values: ReturnType<typeof vi.fn> };
    const insertedValues = insertCall.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedValues.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(insertedValues.authentikUserPk).toBe(AK_USER.pk);
    expect(insertedValues.telegramId).toBe(TELEGRAM_ID);
    expect(insertedValues.targetEmail).toBe(TARGET_EMAIL);
    const expiresAt = insertedValues.expiresAt as Date;
    const expectedTtlMs = 30 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + expectedTtlMs - 5000);
    expect(expiresAt.getTime()).toBeLessThan(Date.now() + expectedTtlMs + 5000);
    expect(authentik.sendMagicLinkEmail).toHaveBeenCalledWith(AK_USER.pk, STAGE_UUID, BRAND_DOMAIN);
    expect(result).toEqual({ ok: true });
  });
});

describe('UpgradeService.requestUpgrade — failure paths', () => {
  it('throws NotFoundException("telegram_user_not_found") when no Authentik user exists for telegramId, no mutation attempted', async () => {
    // Arrange
    authentik.getUserByTelegramId.mockResolvedValue(null);
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act / Assert
    await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toMatchObject({
      response: { error: 'telegram_user_not_found' },
    });
    expect(authentik.setUserEmail).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['false', false],
    ['undefined', undefined],
    ['the string "true"', 'true'],
  ])(
    'throws ConflictException("not_a_temp_account") when attributes.is_temporary is %s (fail-closed, strict !== true)',
    async (_label, isTemporaryValue) => {
      // Arrange
      authentik.getUserByTelegramId.mockResolvedValue({
        ...AK_USER,
        attributes: { ...AK_USER.attributes, is_temporary: isTemporaryValue },
      });
      const db = makeFakeDb();
      const svc = makeService(db);

      // Act / Assert
      await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toMatchObject({
        response: { error: 'not_a_temp_account' },
      });
      expect(authentik.setUserEmail).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  it('throws ConflictException("email_already_in_use") when the FIRST collision check (step c) finds a different pk, setUserEmail never called', async () => {
    // Arrange
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, pk: 12345 }); // different pk, both checks see this
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act / Assert
    await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toMatchObject({
      response: { error: 'email_already_in_use' },
    });
    expect(authentik.setUserEmail).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws ConflictException("email_already_in_use") when only the RE-CHECK (step c-2) finds a collision — proves the re-check is load-bearing, not dead code', async () => {
    // Arrange — first getUserByEmail call (step c) sees no collision; the
    // SECOND call (step c-2, immediately before setUserEmail) sees one.
    // This models a different concurrent request winning the email in the
    // window between this request's two checks.
    authentik.getUserByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...AK_USER, pk: 77777 });
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act / Assert
    await expect(svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL)).rejects.toMatchObject({
      response: { error: 'email_already_in_use' },
    });
    expect(authentik.getUserByEmail).toHaveBeenCalledTimes(2);
    expect(authentik.setUserEmail).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('does NOT throw when the collision check matches the CALLER OWN pk — self-collision is not a real collision (idempotency)', async () => {
    // Arrange — both getUserByEmail calls resolve to the SAME pk as the
    // requesting temp user (e.g. a retried /upgrade-temp call after the
    // email was already patched onto this same user in a prior attempt).
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, pk: AK_USER.pk, email: TARGET_EMAIL });
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act
    const result = await svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL);

    // Assert — no throw, proceeds to patch + insert + send.
    expect(result).toEqual({ ok: true });
    expect(authentik.setUserEmail).toHaveBeenCalledWith(AK_USER.pk, TARGET_EMAIL);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('degraded path: magic-link not configured — email still patched, intent still inserted, sendMagicLinkEmail NOT called, still resolves { ok: true }', async () => {
    // Arrange
    mockEnv.AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID = undefined;
    const db = makeFakeDb();
    const svc = makeService(db);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    const result = await svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL);

    // Assert
    expect(authentik.setUserEmail).toHaveBeenCalledWith(AK_USER.pk, TARGET_EMAIL);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('degraded path: brand domain unset — same fail-closed-on-send behavior as missing stage UUID', async () => {
    // Arrange
    mockEnv.AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN = undefined;
    const db = makeFakeDb();
    const svc = makeService(db);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act
    const result = await svc.requestUpgrade(TELEGRAM_ID, TARGET_EMAIL);

    // Assert
    expect(authentik.sendMagicLinkEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
    warnSpy.mockRestore();
  });
});

// ─── UpgradeService.resolvePendingUpgrade ──────────────────────────────

describe('UpgradeService.resolvePendingUpgrade — happy path', () => {
  it('returns { intent, authentikUserPk } when a live (unexpired, unconsumed) intent row exists', async () => {
    // Arrange
    const intentRow: UpgradeIntent = {
      id: 'intent-uuid-1',
      tokenHash: 'a'.repeat(64),
      authentikUserPk: AK_USER.pk,
      telegramId: TELEGRAM_ID,
      targetEmail: TARGET_EMAIL,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, email: TARGET_EMAIL });
    const db = makeFakeDb({ selectResult: [intentRow] });
    const svc = makeService(db);

    // Act
    const result = await svc.resolvePendingUpgrade(TARGET_EMAIL);

    // Assert
    expect(result).toEqual({ intent: intentRow, authentikUserPk: AK_USER.pk });
  });
});

describe('UpgradeService.resolvePendingUpgrade — failure/fall-through paths', () => {
  it('returns null when getUserByEmail finds no Authentik user at all, no DB query attempted', async () => {
    // Arrange
    authentik.getUserByEmail.mockResolvedValue(null);
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act
    const result = await svc.resolvePendingUpgrade('unknown@example.com');

    // Assert
    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns null when no upgrade_intents row exists for the resolved pk (AC-8 ordinary sign-in case)', async () => {
    // Arrange
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, email: TARGET_EMAIL });
    const db = makeFakeDb({ selectResult: [] });
    const svc = makeService(db);

    // Act
    const result = await svc.resolvePendingUpgrade(TARGET_EMAIL);

    // Assert
    expect(result).toBeNull();
  });

  it('excludes an expired row via the query filter — the select is seeded empty to model gt(expiresAt, now) already excluding it', async () => {
    // Arrange — the SQL-level gt(expiresAt, now) filter is what the real
    // (integration) test proves against Postgres; here we assert that when
    // the DB layer correctly returns no rows (as it would for an
    // expired-only seed), resolvePendingUpgrade returns null and does not
    // itself apply any redundant in-memory expiry check that could mask a
    // filter regression.
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, email: TARGET_EMAIL });
    const db = makeFakeDb({ selectResult: [] });
    const svc = makeService(db);

    // Act
    const result = await svc.resolvePendingUpgrade(TARGET_EMAIL);

    // Assert
    expect(result).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns null when the only row is already consumed (consumedAt IS NOT NULL) — modeled as the query returning no rows', async () => {
    // Arrange — isNull(consumedAt) is a query-level filter (proven against
    // real Postgres in the integration suite); at the unit level we assert
    // resolvePendingUpgrade correctly treats an empty result as "nothing
    // pending" with no special-casing.
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, email: TARGET_EMAIL });
    const db = makeFakeDb({ selectResult: [] });
    const svc = makeService(db);

    // Act
    const result = await svc.resolvePendingUpgrade(TARGET_EMAIL);

    // Assert
    expect(result).toBeNull();
  });

  it('returns the single row the query builder resolves (ordering/limit(1) is a query-level concern proven in the integration suite)', async () => {
    // Arrange — the orderBy(desc(createdAt)).limit(1) chain is exercised
    // for real against Postgres in upgrade-service.integration.spec.ts
    // (multiple live rows, assert the newest wins). Here we confirm
    // resolvePendingUpgrade passes through exactly whichever single row
    // the query builder chain resolves, without any further in-memory
    // re-sorting or re-filtering of its own.
    const newestIntent: UpgradeIntent = {
      id: 'intent-uuid-newest',
      tokenHash: 'b'.repeat(64),
      authentikUserPk: AK_USER.pk,
      telegramId: TELEGRAM_ID,
      targetEmail: TARGET_EMAIL,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };
    authentik.getUserByEmail.mockResolvedValue({ ...AK_USER, email: TARGET_EMAIL });
    const db = makeFakeDb({ selectResult: [newestIntent] });
    const svc = makeService(db);

    // Act
    const result = await svc.resolvePendingUpgrade(TARGET_EMAIL);

    // Assert
    expect(result?.intent.id).toBe('intent-uuid-newest');
  });
});

// ─── UpgradeService.commitUpgrade ──────────────────────────────────────

describe('UpgradeService.commitUpgrade — happy path', () => {
  it('merge-patches is_temporary=false (preserving other attributes) and marks the intent consumed', async () => {
    // Arrange
    const intent: UpgradeIntent = {
      id: 'intent-uuid-1',
      tokenHash: 'c'.repeat(64),
      authentikUserPk: AK_USER.pk,
      telegramId: TELEGRAM_ID,
      targetEmail: TARGET_EMAIL,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };
    authentik.getUserById.mockResolvedValue({
      ...AK_USER,
      attributes: { is_temporary: true, telegram_id: TELEGRAM_ID, some_other_key: 'preserve-me' },
    });
    const db = makeFakeDb();
    const svc = makeService(db);

    // Act
    await svc.commitUpgrade({ intent, authentikUserPk: AK_USER.pk });

    // Assert
    expect(authentik.getUserById).toHaveBeenCalledWith(AK_USER.pk);
    expect(authentik.patchAttributes).toHaveBeenCalledWith(AK_USER.pk, {
      is_temporary: false,
      telegram_id: TELEGRAM_ID,
      some_other_key: 'preserve-me',
    });
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});

describe('UpgradeService.commitUpgrade — failure path', () => {
  it('no-ops (does not throw) when the Authentik user is gone at completion time — patchAttributes and the consumedAt update are NOT called', async () => {
    // Arrange
    authentik.getUserById.mockResolvedValue(null);
    const intent: UpgradeIntent = {
      id: 'intent-uuid-1',
      tokenHash: 'd'.repeat(64),
      authentikUserPk: AK_USER.pk,
      telegramId: TELEGRAM_ID,
      targetEmail: TARGET_EMAIL,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    };
    const db = makeFakeDb();
    const svc = makeService(db);
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    // Act / Assert
    await expect(
      svc.commitUpgrade({ intent, authentikUserPk: AK_USER.pk }),
    ).resolves.toBeUndefined();
    expect(authentik.patchAttributes).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
