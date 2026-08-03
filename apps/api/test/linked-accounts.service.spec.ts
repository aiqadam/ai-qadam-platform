import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthentikSourceConnection, AuthentikUserDetail } from '../src/modules/admin-invites/authentik.client';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { LinkedAccountsService } from '../src/modules/auth/linked-accounts.service';

// FR-AUTH-007 — unit tests for LinkedAccountsService.
// Direct instantiation with mocks — no NestJS DI overhead.
// Pattern follows telegram-bot-me-service.spec.ts.

const USER_ID = 'platform-user-1';
const USER_EMAIL = 'alice@example.com';
const AUTHENTIK_PK = 42;
const DIRECTUS_ID = 'dir-user-1';

// --- factory helpers ---

function makeAuthentikClient(overrides: Partial<AuthentikClient> = {}): AuthentikClient {
  return {
    isConfigured: vi.fn().mockReturnValue(true),
    getUserByEmail: vi.fn(),
    getUserDetail: vi.fn(),
    getUserSourceConnections: vi.fn(),
    deleteUserSourceConnection: vi.fn(),
    inviteUser: vi.fn(),
    getUsers: vi.fn(),
    ...overrides,
  } as unknown as AuthentikClient;
}

function makeDirectusClient(overrides: Partial<DirectusClient> = {}): DirectusClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as unknown as DirectusClient;
}

function makeDirectusBridge(
  overrides: Partial<DirectusUsersBridgeService> = {},
): DirectusUsersBridgeService {
  return {
    resolveDirectusId: vi.fn(),
    resolveUserIdFromDirectusId: vi.fn(),
    ensureLinked: vi.fn(),
    ensureLinkedByEmail: vi.fn(),
    ...overrides,
  } as unknown as DirectusUsersBridgeService;
}

function makeService(input: {
  authentik?: AuthentikClient;
  directus?: DirectusClient;
  bridge?: DirectusUsersBridgeService;
}): LinkedAccountsService {
  return new LinkedAccountsService(
    input.authentik ?? makeAuthentikClient(),
    input.directus ?? makeDirectusClient(),
    input.bridge ?? makeDirectusBridge(),
  );
}

// Minimal Authentik user response for getUserByEmail
const AUTHENTIK_USER_STUB = { pk: AUTHENTIK_PK, email: USER_EMAIL };

// Detail stubs
const detailWithPassword: AuthentikUserDetail = { pk: AUTHENTIK_PK, has_usable_password: true };
const detailWithoutPassword: AuthentikUserDetail = { pk: AUTHENTIK_PK, has_usable_password: false };

// Source connection stubs
const googleConn: AuthentikSourceConnection = { pk: 101, source: { slug: 'google-oauth2' } };
const githubConn: AuthentikSourceConnection = { pk: 102, source: { slug: 'github-oauth' } };

// Directus Telegram row helpers
const tgLinkedRow = { data: { telegram_user_id: '123456', telegram_username: 'alice_tg', telegram_linked_at: '2026-01-01' } };
const tgUnlinkedRow = { data: { telegram_user_id: null, telegram_username: null, telegram_linked_at: null } };

// ============================================================
// getLinkedAccounts
// ============================================================

describe('LinkedAccountsService.getLinkedAccounts', () => {
  it('returns 4 rows when all providers are linked', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([googleConn, githubConn]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgLinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);

    expect(result).toHaveLength(4);
    expect(result.find((r) => r.provider === 'email')).toEqual({
      provider: 'email',
      linked: true,
      handle: USER_EMAIL,
      canUnlink: false,
    });
    expect(result.find((r) => r.provider === 'google')).toEqual({
      provider: 'google',
      linked: true,
      handle: null,
      canUnlink: true, // 4 methods total → can unlink
    });
    expect(result.find((r) => r.provider === 'github')).toEqual({
      provider: 'github',
      linked: true,
      handle: null,
      canUnlink: true,
    });
    expect(result.find((r) => r.provider === 'telegram')).toEqual({
      provider: 'telegram',
      linked: true,
      handle: '@alice_tg',
      canUnlink: true,
    });
  });

  it('email row: linked=false and handle=null when has_usable_password=false', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithoutPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([googleConn]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const emailRow = result.find((r) => r.provider === 'email');

    expect(emailRow).toEqual({
      provider: 'email',
      linked: false,
      handle: null,
      canUnlink: false, // always false for email
    });
  });

  it('email row: canUnlink is always false even when it is the only method', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const emailRow = result.find((r) => r.provider === 'email');

    expect(emailRow?.canUnlink).toBe(false);
  });

  it('google row: linked=true and canUnlink=true when connection exists and totalLinked>1', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([googleConn]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const googleRow = result.find((r) => r.provider === 'google');

    expect(googleRow).toEqual({ provider: 'google', linked: true, handle: null, canUnlink: true });
  });

  it('google row: canUnlink=false when google is the only linked method (totalLinked==1)', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithoutPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([googleConn]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const googleRow = result.find((r) => r.provider === 'google');

    expect(googleRow?.canUnlink).toBe(false);
  });

  it('github row: linked=true when getUserSourceConnections returns a github connection', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([githubConn]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const githubRow = result.find((r) => r.provider === 'github');

    expect(githubRow?.linked).toBe(true);
    expect(githubRow?.canUnlink).toBe(true); // email also linked
  });

  it('telegram row: linked=true and handle=@username when telegram_user_id is set', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: '99', telegram_username: 'alice_tg' } }),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const tgRow = result.find((r) => r.provider === 'telegram');

    expect(tgRow?.linked).toBe(true);
    expect(tgRow?.handle).toBe('@alice_tg');
    expect(tgRow?.canUnlink).toBe(true); // email also linked
  });

  it('telegram row: linked=false when telegram_user_id is null', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const tgRow = result.find((r) => r.provider === 'telegram');

    expect(tgRow).toEqual({ provider: 'telegram', linked: false, handle: null, canUnlink: false });
  });

  it('telegram row: linked=false and directus.get not called when resolveDirectusId returns null', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient();
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ authentik, directus, bridge });

    const result = await service.getLinkedAccounts(USER_ID, USER_EMAIL);
    const tgRow = result.find((r) => r.provider === 'telegram');

    expect(tgRow?.linked).toBe(false);
    expect(directus.get).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when getUserByEmail returns null', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ authentik });

    await expect(service.getLinkedAccounts(USER_ID, USER_EMAIL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resolves Authentik PK server-side (getUserByEmail called with the JWT email, not user input)', async () => {
    const getUserByEmail = vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB);
    const authentik = makeAuthentikClient({
      getUserByEmail,
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithoutPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce(tgUnlinkedRow),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ authentik, directus, bridge });

    await service.getLinkedAccounts(USER_ID, USER_EMAIL);

    // IDOR check: the PK is fetched by email from JWT claims, not passed by the caller
    expect(getUserByEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(getUserByEmail).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// unlinkProvider
// ============================================================

describe('LinkedAccountsService.unlinkProvider', () => {
  it("throws ConflictException when provider is 'email' (always)", async () => {
    const service = makeService({});

    await expect(
      service.unlinkProvider(USER_ID, USER_EMAIL, 'email'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("throws ConflictException when provider is 'email' without calling Authentik (fast-path)", async () => {
    const authentik = makeAuthentikClient();
    const service = makeService({ authentik });

    await expect(service.unlinkProvider(USER_ID, USER_EMAIL, 'email')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(authentik.getUserByEmail).not.toHaveBeenCalled();
  });

  it('throws ConflictException when google is the last linked method (totalLinked==1)', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithoutPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([googleConn]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: null } }),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    await expect(
      service.unlinkProvider(USER_ID, USER_EMAIL, 'google'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws ConflictException when telegram is the last linked method', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithoutPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: '99' } }),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    await expect(
      service.unlinkProvider(USER_ID, USER_EMAIL, 'telegram'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('calls deleteUserSourceConnection with the server-resolved pk when unlinking google', async () => {
    const deleteUserSourceConnection = vi.fn().mockResolvedValueOnce(undefined);
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([googleConn]),
      deleteUserSourceConnection,
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: null } }),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    await service.unlinkProvider(USER_ID, USER_EMAIL, 'google');

    // IDOR check: pk comes from the server-fetched connection, not user input
    expect(deleteUserSourceConnection).toHaveBeenCalledWith(googleConn.pk);
    expect(deleteUserSourceConnection).toHaveBeenCalledTimes(1);
  });

  it('calls deleteUserSourceConnection with the server-resolved pk when unlinking github', async () => {
    const deleteUserSourceConnection = vi.fn().mockResolvedValueOnce(undefined);
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([githubConn]),
      deleteUserSourceConnection,
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: null } }),
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    await service.unlinkProvider(USER_ID, USER_EMAIL, 'github');

    expect(deleteUserSourceConnection).toHaveBeenCalledWith(githubConn.pk);
  });

  it('is idempotent for google: returns without error when connection is not found (already unlinked)', async () => {
    const deleteUserSourceConnection = vi.fn();
    // email + telegram both linked → totalLinked=2, so last-method guard passes.
    // google connection NOT in the list → idempotent early return.
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]), // no google connection
      deleteUserSourceConnection,
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: '99' } }), // telegram linked
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    await expect(service.unlinkProvider(USER_ID, USER_EMAIL, 'google')).resolves.toBeUndefined();
    expect(deleteUserSourceConnection).not.toHaveBeenCalled();
  });

  it('PATCHes telegram fields to null when unlinking telegram', async () => {
    const patch = vi.fn().mockResolvedValueOnce({});
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([]),
    });
    const directus = makeDirectusClient({
      get: vi.fn().mockResolvedValueOnce({ data: { telegram_user_id: '99' } }),
      patch,
    });
    const bridge = makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(DIRECTUS_ID),
    });
    const service = makeService({ authentik, directus, bridge });

    await service.unlinkProvider(USER_ID, USER_EMAIL, 'telegram');

    expect(patch).toHaveBeenCalledWith(
      `/users/${encodeURIComponent(DIRECTUS_ID)}`,
      { telegram_user_id: null, telegram_username: null, telegram_linked_at: null },
    );
  });

  it('returns without calling PATCH when directusId is null for telegram unlink (idempotent)', async () => {
    const patch = vi.fn();
    // email+github linked (totalLinked=2), directusId=null → tg unlinked by definition,
    // last-method guard passes (2>1), provider=telegram, directusId=null → early return.
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(AUTHENTIK_USER_STUB),
      getUserDetail: vi.fn().mockResolvedValueOnce(detailWithPassword),
      getUserSourceConnections: vi.fn().mockResolvedValueOnce([githubConn]),
    });
    const service = new LinkedAccountsService(authentik, makeDirectusClient({ patch }), makeDirectusBridge({
      resolveDirectusId: vi.fn().mockResolvedValueOnce(null),
    }));

    await expect(service.unlinkProvider(USER_ID, USER_EMAIL, 'telegram')).resolves.toBeUndefined();
    expect(patch).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when getUserByEmail returns null', async () => {
    const authentik = makeAuthentikClient({
      getUserByEmail: vi.fn().mockResolvedValueOnce(null),
    });
    const service = makeService({ authentik });

    await expect(
      service.unlinkProvider(USER_ID, USER_EMAIL, 'google'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
