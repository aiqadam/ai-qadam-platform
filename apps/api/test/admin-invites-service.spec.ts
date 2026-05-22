import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminInvitesService } from '../src/modules/admin-invites/admin-invites.service';
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

    // Authentik received the email and a slugified username.
    expect(authentik.createUser).toHaveBeenCalledWith({
      email: 'Aigerim.K@aiqadam.org',
      username: 'aigerim.k',
      name: 'Aigerim K.',
    });
  });

  it('plaintext token is 32 bytes base64url = 43 chars', async () => {
    const res = await svc.createInvite(
      {
        email: 'a@aiqadam.org',
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
        { email: 'x@y.org', role_groups: [], delivery_channel: 'copy_paste' },
        'caller',
      ),
    ).rejects.toThrow(/role_groups_empty/);
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
