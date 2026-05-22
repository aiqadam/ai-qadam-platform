import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUP_CURRENT_VERSION,
  AdminInvitesService,
} from '../src/modules/admin-invites/admin-invites.service';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import type { CloudflareRoutingClient } from '../src/modules/admin-invites/cloudflare-routing.client';
import type { ResendAdminClient } from '../src/modules/admin-invites/resend-admin.client';
import type { AuditEventsService } from '../src/modules/audit/audit-events.service';
import type { DirectusUsersBridgeService } from '../src/modules/directus/directus-users-bridge.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';

// PR-4 onboarding-path unit tests. Covers previewInvite, consumeInvite,
// listInvites. All three resolve via SHA256(token) lookup. Mocks
// Directus + Authentik.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeAuthentik = {
  setPassword: ReturnType<typeof vi.fn>;
  disableUser: ReturnType<typeof vi.fn>;
  createUser: ReturnType<typeof vi.fn>;
  isConfigured: ReturnType<typeof vi.fn>;
};

type FakeBridge = { resolveDirectusId: ReturnType<typeof vi.fn> };
type FakeAudit = { emit: ReturnType<typeof vi.fn> };

let directus: FakeDirectus;
let authentik: FakeAuthentik;
let bridge: FakeBridge;
let audit: FakeAudit;
let svc: AdminInvitesService;

const VALID_TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'; // 43 chars
const VALID_HASH = createHash('sha256').update(VALID_TOKEN).digest('hex');

function pendingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'invite-1',
    email: 'aigerim.k@aiqadam.org',
    display_name: 'Aigerim K.',
    role_groups: ['aiqadam-staff'],
    country: null,
    status: 'pending',
    token_hash: VALID_HASH,
    token_prefix: VALID_TOKEN.slice(0, 8),
    created_at: '2026-05-22T10:00:00Z',
    expires_at: '2026-12-31T10:00:00Z',
    authentik_user_id: 99,
    delivery_channel: 'copy_paste',
    ...overrides,
  };
}

beforeEach(() => {
  directus = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
  };
  authentik = {
    setPassword: vi.fn().mockResolvedValue(undefined),
    disableUser: vi.fn(),
    createUser: vi.fn(),
    isConfigured: vi.fn().mockReturnValue(true),
  };
  bridge = { resolveDirectusId: vi.fn().mockResolvedValue('directus-uuid-of-caller') };
  audit = { emit: vi.fn().mockResolvedValue(undefined) };
  const cloudflare = {
    isConfigured: vi.fn().mockReturnValue(false),
    createRoutingRule: vi.fn(),
  };
  const resendAdmin = {
    isConfigured: vi.fn().mockReturnValue(false),
    createPerOperatorKey: vi.fn(),
  };
  svc = new AdminInvitesService(
    directus as unknown as DirectusClient,
    authentik as unknown as AuthentikClient,
    bridge as unknown as DirectusUsersBridgeService,
    audit as unknown as AuditEventsService,
    cloudflare as unknown as CloudflareRoutingClient,
    resendAdmin as unknown as ResendAdminClient,
  );
});

describe('previewInvite', () => {
  it('returns safe shape (no token_hash, no Authentik id) for pending token', async () => {
    directus.get.mockResolvedValueOnce({ data: [pendingRow()] });
    const preview = await svc.previewInvite(VALID_TOKEN);
    expect(preview.email).toBe('aigerim.k@aiqadam.org');
    expect(preview.role_groups).toEqual(['aiqadam-staff']);
    expect(preview.aup_version).toBe(AUP_CURRENT_VERSION);
    // Negative assertions: hash + Authentik id must not leak.
    expect(preview).not.toHaveProperty('token_hash');
    expect(preview).not.toHaveProperty('authentik_user_id');
  });

  it('throws GoneException when no row matches', async () => {
    directus.get.mockResolvedValueOnce({ data: [] });
    await expect(svc.previewInvite(VALID_TOKEN)).rejects.toThrow(/invite_invalid/);
  });

  it('throws GoneException for consumed invite', async () => {
    directus.get.mockResolvedValueOnce({ data: [pendingRow({ status: 'consumed' })] });
    await expect(svc.previewInvite(VALID_TOKEN)).rejects.toThrow(/invite_consumed/);
  });

  it('throws GoneException for expired (past expires_at)', async () => {
    directus.get.mockResolvedValueOnce({
      data: [pendingRow({ expires_at: '2020-01-01T00:00:00Z' })],
    });
    await expect(svc.previewInvite(VALID_TOKEN)).rejects.toThrow(/invite_expired/);
  });

  it('rejects tokens shorter than 16 chars before hitting the DB', async () => {
    await expect(svc.previewInvite('short')).rejects.toThrow(/invite_invalid/);
    expect(directus.get).not.toHaveBeenCalled();
  });
});

describe('consumeInvite', () => {
  it('happy path — sets Authentik password, marks consumed + AUP version', async () => {
    directus.get.mockResolvedValueOnce({ data: [pendingRow()] });
    const res = await svc.consumeInvite({
      token: VALID_TOKEN,
      password: 'a-strong-passw0rd!',
      aup_accepted: true,
    });
    expect(res).toEqual({ ok: true });
    expect(authentik.setPassword).toHaveBeenCalledWith(99, 'a-strong-passw0rd!');
    const patch = directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.status).toBe('consumed');
    expect(patch.aup_version).toBe(AUP_CURRENT_VERSION);
    expect(typeof patch.consumed_at).toBe('string');
    expect(typeof patch.aup_accepted_at).toBe('string');
  });

  it('rejects when aup_accepted is false', async () => {
    await expect(
      svc.consumeInvite({
        token: VALID_TOKEN,
        password: 'a-strong-passw0rd!',
        aup_accepted: false,
      }),
    ).rejects.toThrow(/aup_not_accepted/);
    expect(directus.get).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 12 chars', async () => {
    await expect(
      svc.consumeInvite({ token: VALID_TOKEN, password: 'short', aup_accepted: true }),
    ).rejects.toThrow(/password_too_short/);
  });

  it('rejects revoked invites with GoneException', async () => {
    directus.get.mockResolvedValueOnce({ data: [pendingRow({ status: 'revoked' })] });
    await expect(
      svc.consumeInvite({
        token: VALID_TOKEN,
        password: 'a-strong-passw0rd!',
        aup_accepted: true,
      }),
    ).rejects.toThrow(/invite_revoked/);
    expect(authentik.setPassword).not.toHaveBeenCalled();
  });
});

describe('listInvites', () => {
  it('returns the data array verbatim (controller already shaped fields=)', async () => {
    const rows = [pendingRow(), pendingRow({ id: 'invite-2', status: 'consumed' })];
    directus.get.mockResolvedValueOnce({ data: rows });
    const out = await svc.listInvites();
    expect(out).toHaveLength(2);
    const url = directus.get.mock.calls[0]?.[0] as string;
    expect(url).toContain('/items/operator_invites');
    expect(url).toContain('sort=-created_at');
    expect(url).not.toContain('filter=');
  });

  it('appends filter when status passed', async () => {
    directus.get.mockResolvedValueOnce({ data: [pendingRow()] });
    await svc.listInvites('pending');
    const url = directus.get.mock.calls[0]?.[0] as string;
    expect(url).toContain('filter=');
    expect(decodeURIComponent(url)).toContain('"status":{"_eq":"pending"}');
  });
});
