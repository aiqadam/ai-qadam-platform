import { createHash, createHmac } from 'node:crypto';
import { NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthentikUser } from '../src/modules/admin-invites/authentik.client';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { env } from '../src/config/env';
import { TelegramAuthService, type TelegramWidgetPayload } from '../src/modules/auth/telegram-auth.service';

// ── HMAC fixture helpers ──────────────────────────────────────────────────────
//
// We derive the hash using the real SHA-256 key derivation so that any
// algorithmic regression in deriveHmacKey or buildDataCheckString will
// correctly fail these tests.

const BOT_TOKEN = 'test-bot-token-that-is-at-least-20-chars-long';

function makeHash(fields: Record<string, unknown>): string {
  const key = createHash('sha256').update(BOT_TOKEN).digest();
  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('\n');
  return createHmac('sha256', key).update(dataCheckString).digest('hex');
}

/** Returns an auth_date fresh enough to pass the 300-second window. */
function freshAuthDate(): number {
  return Math.floor(Date.now() / 1000);
}

/** Builds a valid TelegramWidgetPayload with a correctly computed HMAC. */
function makeValidPayload(overrides: Partial<TelegramWidgetPayload> = {}): TelegramWidgetPayload {
  const base = {
    id: '123456789',
    first_name: 'Aigerim',
    username: 'aigerim_k',
    auth_date: freshAuthDate(),
    ...overrides,
  };
  // Compute hash over the base fields (hash excluded per spec).
  const { hash: _ignored, ...fieldsForHash } = { ...base, hash: '' };
  void _ignored;
  const hash = overrides.hash ?? makeHash(fieldsForHash as Record<string, unknown>);
  return { ...base, hash } as TelegramWidgetPayload;
}

// ── Mock AuthentikClient ──────────────────────────────────────────────────────

function makeAuthentikClient() {
  return {
    getUserByTelegramId: vi.fn<(id: string) => Promise<AuthentikUser | null>>(),
    getUserByEmail: vi.fn<(email: string) => Promise<AuthentikUser | null>>(),
    createUser: vi.fn<(input: unknown) => Promise<AuthentikUser>>(),
    patchAttributes: vi.fn<(pk: number, attrs: Record<string, unknown>) => Promise<void>>(),
    createRecoveryLink: vi.fn<(pk: number) => Promise<string>>(),
  };
}

function fakeUser(pk: number, overrides: Partial<AuthentikUser> = {}): AuthentikUser {
  return {
    pk,
    username: `user${pk}`,
    email: `user${pk}@example.com`,
    name: `User ${pk}`,
    is_active: true,
    uid: `uid-${pk}`,
    groups: [],
    groups_obj: [],
    attributes: {},
    ...overrides,
  };
}

// ── env isolation helpers ─────────────────────────────────────────────────────
//
// env is a plain parsed object; mutate-and-restore is the established pattern
// in this repo (see observe-throttler-guard.spec.ts).

const ORIGINAL_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramAuthService.verifyWidgetHash', () => {
  let mockAuthentik: ReturnType<typeof makeAuthentikClient>;
  let service: TelegramAuthService;

  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    mockAuthentik = makeAuthentikClient();
    service = new TelegramAuthService(mockAuthentik as never);
  });

  afterEach(() => {
    env.TELEGRAM_BOT_TOKEN = ORIGINAL_BOT_TOKEN;
    vi.restoreAllMocks();
  });

  it('does not throw when the payload has a valid HMAC and a fresh auth_date', () => {
    const payload = makeValidPayload();

    expect(() => service.verifyWidgetHash(payload)).not.toThrow();
  });

  it('throws UnauthorizedException with message "telegram_hmac_invalid" when the hash is tampered', () => {
    const payload = makeValidPayload({ hash: 'a'.repeat(64) });

    expect(() => service.verifyWidgetHash(payload)).toThrow(UnauthorizedException);
    expect(() => service.verifyWidgetHash(payload)).toThrow('telegram_hmac_invalid');
  });

  it('throws UnauthorizedException with message "telegram_auth_date_expired" when auth_date is older than 300 s', () => {
    const expiredAuthDate = Math.floor(Date.now() / 1000) - 301;
    const payload = makeValidPayload({ auth_date: expiredAuthDate });

    expect(() => service.verifyWidgetHash(payload)).toThrow(UnauthorizedException);
    expect(() => service.verifyWidgetHash(payload)).toThrow('telegram_auth_date_expired');
  });

  it('throws ServiceUnavailableException with message "telegram_not_configured" when TELEGRAM_BOT_TOKEN is absent', () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const payload = makeValidPayload();

    expect(() => service.verifyWidgetHash(payload)).toThrow(ServiceUnavailableException);
    expect(() => service.verifyWidgetHash(payload)).toThrow('telegram_not_configured');
  });

  it('optional fields (username, first_name) are included in the data-check string when present', () => {
    // Rebuild hash with optional fields omitted — should NOT match the full-payload hash.
    const full = makeValidPayload({ first_name: 'Aigerim', username: 'aigerim_k' });
    // Manually compute hash without first_name + username.
    const partialHash = makeHash({ id: full.id, auth_date: full.auth_date });
    const partialPayload: TelegramWidgetPayload = { ...full, hash: partialHash };

    // The valid full payload passes.
    expect(() => service.verifyWidgetHash(full)).not.toThrow();
    // A payload whose hash was computed without optional fields fails (they affect the check string).
    expect(() => service.verifyWidgetHash(partialPayload)).toThrow(UnauthorizedException);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramAuthService.exchangeWidgetPayload', () => {
  let mockAuthentik: ReturnType<typeof makeAuthentikClient>;
  let service: TelegramAuthService;

  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    mockAuthentik = makeAuthentikClient();
    service = new TelegramAuthService(mockAuthentik as never);
  });

  afterEach(() => {
    env.TELEGRAM_BOT_TOKEN = ORIGINAL_BOT_TOKEN;
    vi.restoreAllMocks();
  });

  it('returns the recovery URL when an existing user is found by telegram_id', async () => {
    const existingUser = fakeUser(42);
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(existingUser);
    mockAuthentik.createRecoveryLink.mockResolvedValueOnce('https://auth.aiqadam.org/recovery/abc123');

    const payload = makeValidPayload();
    const result = await service.exchangeWidgetPayload(payload);

    expect(result).toBe('https://auth.aiqadam.org/recovery/abc123');
    expect(mockAuthentik.getUserByTelegramId).toHaveBeenCalledWith(payload.id);
    expect(mockAuthentik.createRecoveryLink).toHaveBeenCalledWith(42);
    expect(mockAuthentik.createUser).not.toHaveBeenCalled();
  });

  it('creates a new user when telegram_id is not found and no email is present', async () => {
    const newUser = fakeUser(99);
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    mockAuthentik.createUser.mockResolvedValueOnce(newUser);
    mockAuthentik.createRecoveryLink.mockResolvedValueOnce('https://auth.aiqadam.org/recovery/newuser');

    const payload = makeValidPayload({ email: undefined });
    const result = await service.exchangeWidgetPayload(payload);

    expect(result).toBe('https://auth.aiqadam.org/recovery/newuser');
    expect(mockAuthentik.createUser).toHaveBeenCalledOnce();
    const createArg = mockAuthentik.createUser.mock.calls[0]?.[0];
    expect(createArg).toMatchObject({
      email: `tg${payload.id}@telegram.local`,
      attributes: { telegram_id: payload.id },
    });
    expect(mockAuthentik.getUserByEmail).not.toHaveBeenCalled();
  });

  it('patches telegram_id onto an existing email-matched user and does not create a new one', async () => {
    const emailUser = fakeUser(77, { attributes: { some_key: 'some_value' } });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    mockAuthentik.getUserByEmail.mockResolvedValueOnce(emailUser);
    mockAuthentik.patchAttributes.mockResolvedValueOnce(undefined);
    mockAuthentik.createRecoveryLink.mockResolvedValueOnce('https://auth.aiqadam.org/recovery/patched');

    const payload = makeValidPayload({ email: 'aigerim@gmail.com' });
    const result = await service.exchangeWidgetPayload(payload);

    expect(result).toBe('https://auth.aiqadam.org/recovery/patched');
    expect(mockAuthentik.createUser).not.toHaveBeenCalled();
    expect(mockAuthentik.patchAttributes).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ telegram_id: payload.id, some_key: 'some_value' }),
    );
    expect(mockAuthentik.createRecoveryLink).toHaveBeenCalledWith(77);
  });

  it('propagates UnauthorizedException from verifyWidgetHash before any Authentik call', async () => {
    env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    const payload = makeValidPayload({ hash: 'b'.repeat(64) });

    await expect(service.exchangeWidgetPayload(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mockAuthentik.getUserByTelegramId).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TelegramAuthService.upsertTempUser', () => {
  let mockAuthentik: ReturnType<typeof makeAuthentikClient>;
  let service: TelegramAuthService;

  beforeEach(() => {
    env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    mockAuthentik = makeAuthentikClient();
    service = new TelegramAuthService(mockAuthentik as never);
  });

  afterEach(() => {
    env.TELEGRAM_BOT_TOKEN = ORIGINAL_BOT_TOKEN;
    vi.restoreAllMocks();
  });

  it('returns isNew=false and the existing pk when the user already exists in Authentik', async () => {
    const existingUser = fakeUser(55);
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(existingUser);

    const result = await service.upsertTempUser('555555555', 'Aigerim', 'aigerim_k');

    expect(result).toEqual({ authentikUserId: 55, directusUserId: null, isNew: false });
    expect(mockAuthentik.createUser).not.toHaveBeenCalled();
  });

  it('creates a new user with is_temporary=true and a synthetic email when the user is not found', async () => {
    const createdUser = fakeUser(66);
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    mockAuthentik.createUser.mockResolvedValueOnce(createdUser);

    const result = await service.upsertTempUser('666666666', 'Dilnoza', 'dilnoza_uz');

    expect(result).toEqual({ authentikUserId: 66, directusUserId: null, isNew: true });
    expect(mockAuthentik.createUser).toHaveBeenCalledOnce();
    const createArg = mockAuthentik.createUser.mock.calls[0]?.[0];
    expect(createArg).toMatchObject({
      email: 'tg666666666@telegram.local',
      attributes: { telegram_id: '666666666', is_temporary: true },
    });
  });

  it('is idempotent: second call for the same telegramId returns existing user without creating a new one', async () => {
    const existingUser = fakeUser(77);
    // Both calls return the existing user.
    mockAuthentik.getUserByTelegramId
      .mockResolvedValueOnce(existingUser)
      .mockResolvedValueOnce(existingUser);

    await service.upsertTempUser('777777777', 'Bobur');
    const result = await service.upsertTempUser('777777777', 'Bobur');

    expect(result.isNew).toBe(false);
    expect(mockAuthentik.createUser).not.toHaveBeenCalled();
  });

  it('uses telegramId as username and name fallback when username is absent', async () => {
    const createdUser = fakeUser(88);
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    mockAuthentik.createUser.mockResolvedValueOnce(createdUser);

    await service.upsertTempUser('888888888', 'Jasur');

    const createArg = mockAuthentik.createUser.mock.calls[0]?.[0];
    expect(createArg).toMatchObject({
      username: 'tg888888888',
      name: 'Jasur',
    });
  });

  it('throws ZodError when telegramId is not a numeric string', async () => {
    await expect(service.upsertTempUser('not-a-number', 'Test')).rejects.toThrow();
    expect(mockAuthentik.getUserByTelegramId).not.toHaveBeenCalled();
  });

  it('throws ServiceUnavailableException when TELEGRAM_BOT_TOKEN is absent', async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;

    await expect(service.upsertTempUser('123456789', 'Test')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(mockAuthentik.getUserByTelegramId).not.toHaveBeenCalled();
  });

  it('sets directusUserId=null always (Directus linkage is a separate flow)', async () => {
    const createdUser = fakeUser(99);
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    mockAuthentik.createUser.mockResolvedValueOnce(createdUser);

    const result = await service.upsertTempUser('999999999', 'Viktor');

    expect(result.directusUserId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FEAT-BOT-1 — TelegramAuthService.lookupUser (POST /v1/internal/telegram/lookup)
//
// Mocks both AuthentikClient and DirectusClient — this method makes zero
// Postgres/Drizzle calls (confirmed by 02-impact-analysis.md and
// 04-security-review.md), so no Testcontainers is needed here either;
// mocking the two HTTP boundaries is the correct "unit" isolation.

function makeDirectusClient() {
  return {
    get: vi.fn<(path: string) => Promise<{ data: unknown[] }>>(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

function fakeDirectusRow(overrides: { id?: string; country?: string | null } = {}) {
  return {
    id: overrides.id ?? 'dir-user-1',
    country: overrides.country === undefined ? 'uz' : overrides.country,
  };
}

describe('TelegramAuthService.lookupUser', () => {
  let mockAuthentik: ReturnType<typeof makeAuthentikClient>;
  let mockDirectus: ReturnType<typeof makeDirectusClient>;
  let service: TelegramAuthService;

  beforeEach(() => {
    mockAuthentik = makeAuthentikClient();
    mockDirectus = makeDirectusClient();
    service = new TelegramAuthService(
      mockAuthentik as never,
      mockDirectus as unknown as DirectusClient,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── AC-1: linked, non-temp user ──────────────────────────────────────────

  it('returns real directusUserId/country and isTemp=false for a linked, non-temp user', async () => {
    const authentikUser = fakeUser(11, { attributes: {} });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(authentikUser);
    mockDirectus.get.mockResolvedValueOnce({
      data: [fakeDirectusRow({ id: 'dir-user-11', country: 'kz' })],
    });

    const result = await service.lookupUser('111111111');

    expect(result).toEqual({ directusUserId: 'dir-user-11', isTemp: false, country: 'kz', role: null });
    expect(mockAuthentik.getUserByTelegramId).toHaveBeenCalledWith('111111111');
  });

  // ── AC-2 (common case): temp-only user, no matching Directus row ────────

  it('returns directusUserId=null and country=null for a temp user with no Directus row (common case)', async () => {
    const authentikUser = fakeUser(22, { attributes: { is_temporary: true } });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(authentikUser);
    mockDirectus.get.mockResolvedValueOnce({ data: [] });

    const result = await service.lookupUser('222222222');

    expect(result).toEqual({ directusUserId: null, isTemp: true, country: null, role: null });
  });

  // ── AC-2 (edge case): temp user WITH a matching Directus row ────────────
  // Explicitly called out in 03-code-summary.md Key Design Decision #5: the
  // member registered fully before ever hitting /start again with a stale
  // local bot cache. isTemp must reflect the Authentik attribute
  // independent of whether a Directus mirror exists.

  it('returns the real directusUserId while isTemp stays true when a temp user already has a matching Directus row', async () => {
    const authentikUser = fakeUser(33, { attributes: { is_temporary: true } });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(authentikUser);
    mockDirectus.get.mockResolvedValueOnce({
      data: [fakeDirectusRow({ id: 'dir-user-33', country: 'tj' })],
    });

    const result = await service.lookupUser('333333333');

    expect(result).toEqual({ directusUserId: 'dir-user-33', isTemp: true, country: 'tj', role: null });
  });

  // ── AC-3: no Authentik user at all ───────────────────────────────────────

  it('throws NotFoundException with a structured { error: "telegram_user_not_found" } body when no Authentik user exists', async () => {
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);

    await expect(service.lookupUser('999999999')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockDirectus.get).not.toHaveBeenCalled();

    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    try {
      await service.lookupUser('999999999');
      expect.unreachable('lookupUser should have thrown');
    } catch (e) {
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('telegram_user_not_found');
    }
  });

  // ── malformed telegramId at the service boundary ─────────────────────────

  it('throws (ZodError) when telegramId is not a numeric string, without calling Authentik', async () => {
    await expect(service.lookupUser('not-a-number')).rejects.toThrow();
    expect(mockAuthentik.getUserByTelegramId).not.toHaveBeenCalled();
  });

  it('throws (ZodError) when telegramId is oversized (>19 digits), without calling Authentik', async () => {
    await expect(service.lookupUser('1'.repeat(20))).rejects.toThrow();
    expect(mockAuthentik.getUserByTelegramId).not.toHaveBeenCalled();
  });

  // ── AC-5: read-path idempotency — no writes anywhere ─────────────────────

  it('never calls a write method on AuthentikClient or DirectusClient across happy-path and not-found scenarios', async () => {
    const linkedUser = fakeUser(44, { attributes: {} });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(linkedUser);
    mockDirectus.get.mockResolvedValueOnce({ data: [fakeDirectusRow()] });
    await service.lookupUser('444444444');

    const tempUser = fakeUser(55, { attributes: { is_temporary: true } });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(tempUser);
    mockDirectus.get.mockResolvedValueOnce({ data: [] });
    await service.lookupUser('555555555');

    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(null);
    await expect(service.lookupUser('666666666')).rejects.toBeInstanceOf(NotFoundException);

    expect(mockAuthentik.createUser).not.toHaveBeenCalled();
    expect(mockAuthentik.patchAttributes).not.toHaveBeenCalled();
    expect(mockDirectus.post).not.toHaveBeenCalled();
    expect(mockDirectus.patch).not.toHaveBeenCalled();
    expect(mockDirectus.delete).not.toHaveBeenCalled();
  });

  // ── Directus query-shape lock-in ──────────────────────────────────────────
  // Defends the "no PII over-fetch" property credited in the security
  // review: only `id,country` are projected, and the email filter is
  // present + URI-encoded.

  it('queries Directus with filter[email][_eq]=<encoded email>, fields=id,country, and limit=1', async () => {
    const authentikUser = fakeUser(77, { attributes: {}, email: 'tg777777777@telegram.local' });
    mockAuthentik.getUserByTelegramId.mockResolvedValueOnce(authentikUser);
    mockDirectus.get.mockResolvedValueOnce({ data: [] });

    await service.lookupUser('777777777');

    expect(mockDirectus.get).toHaveBeenCalledOnce();
    const calledPath = mockDirectus.get.mock.calls[0]?.[0] as string;
    expect(calledPath).toContain('filter[email][_eq]=tg777777777%40telegram.local');
    expect(calledPath).toContain('fields=id,country');
    expect(calledPath).toContain('limit=1');
  });
});
