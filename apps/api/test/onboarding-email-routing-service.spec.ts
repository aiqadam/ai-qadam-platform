import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudflareRoutingClient } from '../src/modules/admin-invites/cloudflare-routing.client';
import { OnboardingEmailRoutingService } from '../src/modules/admin-invites/onboarding-email-routing.service';
import type { ResendAdminClient } from '../src/modules/admin-invites/resend-admin.client';
import type { AuditEventsService } from '../src/modules/audit/audit-events.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';

// F-S2.8.1 — OnboardingEmailRoutingService state-machine tests.
// Mocks Directus/CF/Resend; verifies the three endpoints'
// pre-conditions, side-effects, and failure-mapping behaviour.

const VALID_TOKEN = 'a'.repeat(43); // base64url-ish, len > 16
const HASH = createHash('sha256').update(VALID_TOKEN).digest('hex');

type Fakes = {
  directus: { get: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  cloudflare: {
    isDestinationApiConfigured: ReturnType<typeof vi.fn>;
    isConfigured: ReturnType<typeof vi.fn>;
    addDestinationAddress: ReturnType<typeof vi.fn>;
    getDestinationByTag: ReturnType<typeof vi.fn>;
    createRoutingRule: ReturnType<typeof vi.fn>;
  };
  resendAdmin: {
    isConfigured: ReturnType<typeof vi.fn>;
    createPerOperatorKey: ReturnType<typeof vi.fn>;
  };
  audit: { emit: ReturnType<typeof vi.fn> };
};

function pendingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'invite-1',
    email: 'binali.rustamov@aiqadam.org',
    status: 'pending',
    token_hash: HASH,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    destination_gmail: null,
    cf_destination_address_id: null,
    cf_destination_verified_at: null,
    cf_rule_id: null,
    resend_key_id: null,
    email_setup_status: 'not_started',
    email_setup_failed_reason: null,
    ...overrides,
  };
}

let fakes: Fakes;
let svc: OnboardingEmailRoutingService;

beforeEach(() => {
  fakes = {
    directus: {
      get: vi.fn(),
      patch: vi.fn().mockResolvedValue(undefined),
    },
    cloudflare: {
      isDestinationApiConfigured: vi.fn().mockReturnValue(true),
      isConfigured: vi.fn().mockReturnValue(true),
      addDestinationAddress: vi
        .fn()
        .mockResolvedValue({ tag: 'cf-dest-1', already_existed: false, verified: false }),
      getDestinationByTag: vi.fn().mockResolvedValue(null),
      createRoutingRule: vi
        .fn()
        .mockResolvedValue({ rule_id: 'cf-rule-1', already_existed: false }),
    },
    resendAdmin: {
      isConfigured: vi.fn().mockReturnValue(true),
      createPerOperatorKey: vi
        .fn()
        .mockResolvedValue({ id: 'rsk_xyz', token: 're_plaintextXXXXXXXXXX' }),
    },
    audit: { emit: vi.fn().mockResolvedValue(undefined) },
  };
  svc = new OnboardingEmailRoutingService(
    fakes.directus as unknown as DirectusClient,
    fakes.cloudflare as unknown as CloudflareRoutingClient,
    fakes.resendAdmin as unknown as ResendAdminClient,
    fakes.audit as unknown as AuditEventsService,
  );
});

describe('submitDestination', () => {
  it('flips state to destination_pending and persists CF tag', async () => {
    fakes.directus.get.mockResolvedValueOnce({ data: [pendingRow()] });
    const res = await svc.submitDestination({
      token: VALID_TOKEN,
      destination_gmail: 'op@gmail.com',
    });
    expect(res.cf_destination_address_id).toBe('cf-dest-1');
    expect(res.verified).toBe(false);
    expect(res.email_setup_status).toBe('destination_pending');
    expect(fakes.cloudflare.addDestinationAddress).toHaveBeenCalledWith('op@gmail.com');
    const patchBody = fakes.directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.destination_gmail).toBe('op@gmail.com');
    expect(patchBody.cf_destination_address_id).toBe('cf-dest-1');
    expect(patchBody.email_setup_status).toBe('destination_pending');
  });

  it('rejects with 409 if state already past not_started', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [pendingRow({ email_setup_status: 'destination_pending' })],
    });
    await expect(
      svc.submitDestination({ token: VALID_TOKEN, destination_gmail: 'op@gmail.com' }),
    ).rejects.toMatchObject({ name: 'ConflictException' });
  });

  it('rejects invalid email shape with 400', async () => {
    await expect(
      svc.submitDestination({ token: VALID_TOKEN, destination_gmail: 'not-an-email' }),
    ).rejects.toMatchObject({ name: 'BadRequestException' });
  });

  it('marks invite failed + throws 502 when CF add throws', async () => {
    fakes.directus.get.mockResolvedValueOnce({ data: [pendingRow()] });
    fakes.cloudflare.addDestinationAddress.mockRejectedValueOnce(new Error('CF down'));
    await expect(
      svc.submitDestination({ token: VALID_TOKEN, destination_gmail: 'op@gmail.com' }),
    ).rejects.toMatchObject({ name: 'BadGatewayException' });
    const failPatch = fakes.directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(failPatch.email_setup_status).toBe('failed');
    expect(String(failPatch.email_setup_failed_reason)).toMatch(
      /cloudflare_add_destination_failed/,
    );
  });

  it('410 Gone on invalid token (no row matches the hash)', async () => {
    fakes.directus.get.mockResolvedValueOnce({ data: [] });
    await expect(
      svc.submitDestination({ token: VALID_TOKEN, destination_gmail: 'op@gmail.com' }),
    ).rejects.toMatchObject({ name: 'GoneException' });
  });
});

describe('getStatus', () => {
  it('returns persisted state when not_started (no CF refresh)', async () => {
    fakes.directus.get.mockResolvedValueOnce({ data: [pendingRow()] });
    const s = await svc.getStatus(VALID_TOKEN);
    expect(s.email_setup_status).toBe('not_started');
    expect(s.destination_verified).toBe(false);
    expect(fakes.cloudflare.getDestinationByTag).not.toHaveBeenCalled();
  });

  it('refreshes from CF while destination_pending; flips verified_at on first verified poll', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'destination_pending',
          cf_destination_address_id: 'cf-dest-1',
          destination_gmail: 'op@gmail.com',
        }),
      ],
    });
    fakes.cloudflare.getDestinationByTag.mockResolvedValueOnce({
      tag: 'cf-dest-1',
      email: 'op@gmail.com',
      verified: '2026-05-23T09:00:00Z',
      created: '2026-05-23T08:00:00Z',
    });
    const s = await svc.getStatus(VALID_TOKEN);
    expect(s.destination_verified).toBe(true);
    expect(fakes.directus.patch).toHaveBeenCalledTimes(1);
    const patchBody = fakes.directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.cf_destination_verified_at).toBe('2026-05-23T09:00:00Z');
  });

  it('does NOT re-poll when already ready', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'ready',
          cf_destination_verified_at: '2026-05-23T09:00:00Z',
          cf_rule_id: 'rule-1',
          resend_key_id: 'rsk_1',
        }),
      ],
    });
    const s = await svc.getStatus(VALID_TOKEN);
    expect(s.email_setup_status).toBe('ready');
    expect(fakes.cloudflare.getDestinationByTag).not.toHaveBeenCalled();
  });

  it('soft-fails CF poll errors — returns persisted state', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'destination_pending',
          cf_destination_address_id: 'cf-dest-1',
        }),
      ],
    });
    fakes.cloudflare.getDestinationByTag.mockRejectedValueOnce(new Error('CF flaky'));
    const s = await svc.getStatus(VALID_TOKEN);
    expect(s.destination_verified).toBe(false);
    expect(s.email_setup_status).toBe('destination_pending');
  });
});

describe('finalize', () => {
  it('creates rule + Resend key + flips to ready when destination verified', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'destination_pending',
          destination_gmail: 'op@gmail.com',
          cf_destination_address_id: 'cf-dest-1',
          cf_destination_verified_at: '2026-05-23T09:00:00Z',
        }),
      ],
    });
    const res = await svc.finalize(VALID_TOKEN);
    expect(res.cf_rule_id).toBe('cf-rule-1');
    expect(res.resend_key_id).toBe('rsk_xyz');
    expect(res.resend_key_plaintext).toBe('re_plaintextXXXXXXXXXX');
    expect(res.email_setup_status).toBe('ready');
    expect(fakes.cloudflare.createRoutingRule).toHaveBeenCalledWith({
      alias: 'binali.rustamov@aiqadam.org',
      destination: 'op@gmail.com',
    });
    expect(fakes.resendAdmin.createPerOperatorKey).toHaveBeenCalledWith({
      operatorEmail: 'binali.rustamov@aiqadam.org',
    });
  });

  it('rejects with 409 if destination not verified', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'destination_pending',
          destination_gmail: 'op@gmail.com',
          cf_destination_address_id: 'cf-dest-1',
          cf_destination_verified_at: null,
        }),
      ],
    });
    await expect(svc.finalize(VALID_TOKEN)).rejects.toMatchObject({
      name: 'ConflictException',
      message: expect.stringMatching(/destination_not_verified/),
    });
    expect(fakes.cloudflare.createRoutingRule).not.toHaveBeenCalled();
    expect(fakes.resendAdmin.createPerOperatorKey).not.toHaveBeenCalled();
  });

  it('rejects with 409 if already ready (no double-mint of Resend key)', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'ready',
          destination_gmail: 'op@gmail.com',
          cf_destination_address_id: 'cf-dest-1',
          cf_destination_verified_at: '2026-05-23T09:00:00Z',
          cf_rule_id: 'rule-1',
          resend_key_id: 'rsk_1',
        }),
      ],
    });
    await expect(svc.finalize(VALID_TOKEN)).rejects.toMatchObject({ name: 'ConflictException' });
    expect(fakes.resendAdmin.createPerOperatorKey).not.toHaveBeenCalled();
  });

  it('marks failed + 502 when Resend create fails (after CF rule already created)', async () => {
    fakes.directus.get.mockResolvedValueOnce({
      data: [
        pendingRow({
          email_setup_status: 'destination_pending',
          destination_gmail: 'op@gmail.com',
          cf_destination_address_id: 'cf-dest-1',
          cf_destination_verified_at: '2026-05-23T09:00:00Z',
        }),
      ],
    });
    fakes.resendAdmin.createPerOperatorKey.mockRejectedValueOnce(new Error('boom'));
    await expect(svc.finalize(VALID_TOKEN)).rejects.toMatchObject({ name: 'BadGatewayException' });
    const failPatch = fakes.directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(failPatch.email_setup_status).toBe('failed');
  });
});
