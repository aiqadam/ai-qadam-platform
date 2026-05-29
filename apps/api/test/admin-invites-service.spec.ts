import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminInvitesService,
  usernameFromEmail,
} from '../src/modules/admin-invites/admin-invites.service';
import { AuthentikError } from '../src/modules/admin-invites/authentik.client';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { AuditEventsService } from '../src/modules/audit/audit-events.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';

// Unit tests for AdminInvitesService. Mocks DirectusClient + AuthentikClient
// so the spec validates token-gen, validation, and the persistence
// shape without any live infra.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeAuthentik = {
  createUser: ReturnType<typeof vi.fn>;
  disableUser: ReturnType<typeof vi.fn>;
  isConfigured: ReturnType<typeof vi.fn>;
  getUserById: ReturnType<typeof vi.fn>;
  setPassword: ReturnType<typeof vi.fn>;
  setUserGroups: ReturnType<typeof vi.fn>;
  patchAttributes: ReturnType<typeof vi.fn>;
  resolveGroupNames: ReturnType<typeof vi.fn>;
};
type FakeBridge = {
  resolveDirectusId: ReturnType<typeof vi.fn>;
};
type FakeAudit = {
  emit: ReturnType<typeof vi.fn>;
};

let directus: FakeDirectus;
let authentik: FakeAuthentik;
let bridge: FakeBridge;
let audit: FakeAudit;
let svc: AdminInvitesService;

beforeEach(() => {
  directus = {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: { id: 'invite-uuid-1' } }),
    patch: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  };
  authentik = {
    createUser: vi.fn().mockResolvedValue({
      pk: 99,
      username: 'aigerim.k',
      email: 'aigerim.k@aiqadam.org',
      name: 'Aigerim K.',
      is_active: true,
      uid: 'ak-uid',
      groups: [],
      attributes: {},
    }),
    disableUser: vi.fn().mockResolvedValue(undefined),
    isConfigured: vi.fn().mockReturnValue(true),
    getUserById: vi.fn().mockResolvedValue({
      pk: 99,
      username: 'aigerim.k',
      email: 'aigerim.k@aiqadam.org',
      name: 'Aigerim K.',
      is_active: true,
      uid: 'ak-uid',
      groups: [],
      groups_obj: [],
      attributes: {},
    }),
    setPassword: vi.fn().mockResolvedValue(undefined),
    setUserGroups: vi.fn().mockResolvedValue(undefined),
    patchAttributes: vi.fn().mockResolvedValue(undefined),
    resolveGroupNames: vi
      .fn()
      .mockImplementation(async (names: string[]) =>
        names.map((name, i) => ({ pk: `pk-${name}-${i}`, name, is_superuser: false, users: [] })),
      ),
  };
  bridge = {
    resolveDirectusId: vi.fn().mockResolvedValue('directus-uuid-of-caller'),
  };
  audit = {
    emit: vi.fn().mockResolvedValue(undefined),
  };
  svc = new AdminInvitesService(
    directus as unknown as DirectusClient,
    authentik as unknown as AuthentikClient,
    bridge as unknown as DirectusUsersBridgeService,
    audit as unknown as AuditEventsService,
  );
});

describe('createInvite — happy path', () => {
  it('mints a token, persists hash + prefix, returns plaintext URL once', async () => {
    const res = await svc.createInvite(
      {
        email: 'Aigerim.K@aiqadam.org',
        display_name: 'Aigerim K.',
        role_groups: ['aiqadam-staff'],
        delivery_channel: 'copy_paste',
      },
      'caller-uuid',
    );
    expect(res.invite_id).toBe('invite-uuid-1');
    expect(res.invite_url).toMatch(/\/onboard\?token=[A-Za-z0-9_-]{43}$/);
    expect(res.token_prefix).toHaveLength(8);

    // Directus row should carry the SHA256 of the URL's token.
    const url = new URL(res.invite_url);
    const plain = url.searchParams.get('token') ?? '';
    expect(plain).not.toBe('');
    const expectedHash = createHash('sha256').update(plain).digest('hex');
    const row = directus.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(row.token_hash).toBe(expectedHash);
    expect(row.token_prefix).toBe(plain.slice(0, 8));
    expect(row.status).toBe('pending');
    expect(row.role_groups).toEqual(['aiqadam-staff']);
    expect(row.authentik_user_id).toBe(99);
    expect(row.email).toBe('Aigerim.K@aiqadam.org');
    // created_by must be the BRIDGE-resolved directus uuid, NOT the
    // raw local users.id — operator_invites.created_by FKs to
    // directus_users.id (not users.id).
    expect(row.created_by).toBe('directus-uuid-of-caller');
    expect(bridge.resolveDirectusId).toHaveBeenCalledWith('caller-uuid');

    // Authentik received the email + slugified username AND the
    // identity-model attributes (upn + mailboxEmail). Without these,
    // the operator cannot sign in with their @aiqadam.org work email
    // and Dovecot LDAP auth doesn't match — closed 2026-05-26 after
    // the Aigerim manual-fix lesson.
    expect(authentik.createUser).toHaveBeenCalledWith({
      email: 'Aigerim.K@aiqadam.org',
      username: 'aigerim.k',
      name: 'Aigerim K.',
      attributes: {
        upn: 'aigerim.k@aiqadam.org',
        mailboxEmail: 'aigerim.k@aiqadam.org',
      },
    });
  });

  it('username + upn + mailboxEmail derive from display_name, not email local-part', async () => {
    // The 2026-05-25 bug: I derived "kambetbayeva" from her gmail and
    // had to rename to "aigerim.kambetbayeva" later. This test pins
    // the corrected behaviour.
    await svc.createInvite(
      {
        email: 'kambetbayeva@gmail.com',
        display_name: 'Aigerim Kambetbayeva',
        role_groups: ['aiqadam-super-admin'],
        delivery_channel: 'copy_paste',
      },
      'caller',
    );
    expect(authentik.createUser).toHaveBeenCalledWith({
      email: 'kambetbayeva@gmail.com',
      username: 'aigerim.kambetbayeva',
      name: 'Aigerim Kambetbayeva',
      attributes: {
        upn: 'aigerim.kambetbayeva@aiqadam.org',
        mailboxEmail: 'aigerim.kambetbayeva@aiqadam.org',
      },
    });
  });

  it('plaintext token is 32 bytes base64url = 43 chars', async () => {
    const res = await svc.createInvite(
      {
        email: 'a@aiqadam.org',
        display_name: 'Anonymous Tester',
        role_groups: ['aiqadam-staff'],
        delivery_channel: 'copy_paste',
      },
      'caller',
    );
    const token = new URL(res.invite_url).searchParams.get('token') ?? '';
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('createInvite — validation', () => {
  it('rejects empty role_groups', async () => {
    await expect(
      svc.createInvite(
        {
          email: 'x@y.org',
          display_name: 'X Y',
          role_groups: [],
          delivery_channel: 'copy_paste',
        },
        'caller',
      ),
    ).rejects.toThrow(/role_groups_empty/);
    expect(authentik.createUser).not.toHaveBeenCalled();
  });

  it('rejects display_name that slugifies to empty (e.g. emoji-only)', async () => {
    await expect(
      svc.createInvite(
        {
          email: 'x@y.org',
          display_name: '🦊',
          role_groups: ['aiqadam-staff'],
          delivery_channel: 'copy_paste',
        },
        'caller',
      ),
    ).rejects.toThrow(/display_name_unusable/);
    expect(authentik.createUser).not.toHaveBeenCalled();
  });

  it('maps Authentik 4xx (e.g. email already taken) to 409 ConflictException', async () => {
    authentik.createUser.mockRejectedValueOnce(
      new AuthentikError(400, '/api/v3/core/users/', '{"email":["already taken"]}'),
    );
    await expect(
      svc.createInvite(
        {
          email: 'dup@aiqadam.org',
          display_name: 'Dup User',
          role_groups: ['aiqadam-staff'],
          delivery_channel: 'copy_paste',
        },
        'caller',
      ),
    ).rejects.toMatchObject({ name: 'ConflictException' });
    expect(directus.post).not.toHaveBeenCalled();
  });

  it('rejects country-lead invites when flag is off (default)', async () => {
    await expect(
      svc.createInvite(
        {
          email: 'a@aiqadam.org',
          display_name: 'A Lead',
          role_groups: ['country_lead_kz'],
          country: 'kz',
          delivery_channel: 'copy_paste',
        },
        'caller',
      ),
    ).rejects.toThrow(/country_lead_invites_disabled/);
  });
});

describe('revokeInvite', () => {
  it('PATCHes status=revoked + disables Authentik user', async () => {
    directus.get.mockResolvedValueOnce({
      data: {
        id: 'invite-1',
        status: 'pending',
        authentik_user_id: 99,
        email: 'x@y.org',
        display_name: null,
        role_groups: ['aiqadam-staff'],
        country: null,
        token_prefix: 'abcdef12',
        created_at: '...',
        expires_at: '...',
        delivery_channel: 'copy_paste',
        notes: null,
      },
    });
    await svc.revokeInvite('invite-1', 'caller');
    const patch = directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.status).toBe('revoked');
    expect(patch.revoked_by).toBe('directus-uuid-of-caller');
    expect(authentik.disableUser).toHaveBeenCalledWith(99);
  });

  it('rejects revoking an already-consumed invite', async () => {
    directus.get.mockResolvedValueOnce({
      data: { status: 'consumed', authentik_user_id: null },
    });
    await expect(svc.revokeInvite('invite-x', 'caller')).rejects.toThrow(/invite_consumed/);
    expect(directus.patch).not.toHaveBeenCalled();
  });
});

// F-S2.12: lock down the deterministic username generator so the
// onboarding-form mailbox panel (rendered from preview.username) and
// the Authentik account both stay in sync.
describe('usernameFromEmail (deterministic)', () => {
  it('produces firstname.lastname lowercase from a typical staff email', () => {
    expect(usernameFromEmail('Aigerim.K@aiqadam.org')).toBe('aigerim.k');
  });

  it('strips characters outside [a-z0-9.]', () => {
    expect(usernameFromEmail('binali+work@aiqadam.org')).toBe('binaliwork');
    expect(usernameFromEmail('rusłan@aiqadam.org')).toBe('rusan');
  });

  it('collapses runs of dots and trims edge dots so IMAP local-parts stay valid', () => {
    expect(usernameFromEmail('..a..b..@aiqadam.org')).toBe('a.b');
  });

  it('falls back to "user" when the local-part is empty after cleaning', () => {
    expect(usernameFromEmail('+++@aiqadam.org')).toBe('user');
  });

  it('is deterministic — same input always produces same output', () => {
    const inputs = [
      'a@aiqadam.org',
      'Binali.Rustamov@aiqadam.org',
      'a.b.c@aiqadam.org',
      'AIGERIM@aiqadam.org',
    ];
    for (const input of inputs) {
      const first = usernameFromEmail(input);
      const second = usernameFromEmail(input);
      expect(second).toBe(first);
    }
  });
});
