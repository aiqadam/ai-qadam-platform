import { NotFoundException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthentikClient } from '../src/modules/admin-invites/authentik.client';
import {
  CountryProvisioningService,
  PROVISIONING_STEP_IDS,
} from '../src/modules/country-provisioning/country-provisioning.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { DirectusError } from '../src/modules/directus/directus.client';

// F-S4.1 — country provisioning state machine. Mocks Directus + Authentik.
// Most steps are stubs (succeed unconditionally). authentik_oidc is real
// as of F-S4.1-b — its tests live in a dedicated block at the bottom.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
type FakeAuthentik = {
  isConfigured: ReturnType<typeof vi.fn>;
  getOauthProviderByName: ReturnType<typeof vi.fn>;
  setOauthProviderRedirectUris: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let ak: FakeAuthentik;
let svc: CountryProvisioningService;

const UZ = { code: 'uz', name: 'Uzbekistan', provisioning_state: null };

// Framework tests share a fake AuthentikClient with happy-path defaults
// so the real authentik_oidc runner succeeds inside them. Tests that
// exercise the runner specifically (bottom block) override per-case.
beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  ak = {
    isConfigured: vi.fn().mockReturnValue(true),
    getOauthProviderByName: vi.fn().mockResolvedValue({
      pk: 1,
      name: 'aiqadam',
      redirect_uris: [{ matching_mode: 'strict', url: 'https://aiqadam.org/api/v1/auth/callback' }],
    }),
    setOauthProviderRedirectUris: vi.fn().mockResolvedValue(undefined),
  };
  // F-S4.1-c — fallback for the new directus_policy step's lookup +
  // create. Tests that exercise this step specifically override per-case.
  dx.get.mockResolvedValue({ data: [] }); // policy lookup → empty (not exists)
  dx.post.mockResolvedValue({ data: { id: 'policy-new' } }); // policy create
  vi.stubEnv('AUTHENTIK_OIDC_PROVIDER_NAME', 'aiqadam');
  svc = new CountryProvisioningService(
    dx as unknown as DirectusClient,
    ak as unknown as AuthentikClient,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('CountryProvisioningService.run — fresh provisioning', () => {
  it('initialises state + runs all 4 stub steps + marks completed', async () => {
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: null } });
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('uz');

    expect(state.started_at).toBeTruthy();
    expect(state.completed_at).toBeTruthy();
    for (const id of PROVISIONING_STEP_IDS) {
      expect(state.steps[id].status).toBe('succeeded');
      expect(state.steps[id].error).toBeNull();
      expect(state.steps[id].attempted_at).toBeTruthy();
    }
    // Persisted at the end only (single patch when whole chain succeeds)
    expect(dx.patch).toHaveBeenCalledTimes(1);
    expect(dx.patch.mock.calls[0]?.[0]).toBe('/items/countries/uz');
    const persisted = (dx.patch.mock.calls[0]?.[1] as { provisioning_state: unknown })
      .provisioning_state;
    expect(persisted).toEqual(state);
  });

  it('normalises the country code (case + whitespace) before lookup', async () => {
    dx.get.mockResolvedValueOnce({ data: UZ });
    dx.patch.mockResolvedValueOnce({});
    await svc.run('  UZ  ');
    expect(dx.get.mock.calls[0]?.[0]).toContain('/items/countries/uz');
  });

  it('throws NotFoundException on invalid code shape', async () => {
    await expect(svc.run('abc')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.run('1a')).rejects.toBeInstanceOf(NotFoundException);
    expect(dx.get).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when Directus 404s on the country lookup', async () => {
    dx.get.mockRejectedValueOnce(new DirectusError(404, '/items/countries/zz', 'not found'));
    await expect(svc.run('zz')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CountryProvisioningService.run — already complete', () => {
  it('returns existing state without re-running when completed_at is set', async () => {
    const completed = {
      started_at: '2026-05-20T00:00:00.000Z',
      completed_at: '2026-05-20T00:00:05.000Z',
      steps: Object.fromEntries(
        PROVISIONING_STEP_IDS.map((id) => [
          id,
          { status: 'succeeded' as const, attempted_at: '2026-05-20T00:00:01.000Z', error: null },
        ]),
      ),
    };
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: completed } });

    const state = await svc.run('uz');
    expect(state).toEqual(completed);
    expect(dx.patch).not.toHaveBeenCalled();
  });
});

describe('CountryProvisioningService.run — resume after failure', () => {
  it('resumes from the first non-succeeded step (skips already-succeeded ones)', async () => {
    const partial = {
      started_at: '2026-05-20T00:00:00.000Z',
      completed_at: null,
      steps: {
        authentik_oidc: {
          status: 'succeeded' as const,
          attempted_at: '2026-05-20T00:00:01.000Z',
          error: null,
        },
        directus_policy: {
          status: 'failed' as const,
          attempted_at: '2026-05-20T00:00:02.000Z',
          error: 'transient network',
        },
        plausible_site: { status: 'pending' as const, attempted_at: null, error: null },
        coolify_fqdn: { status: 'pending' as const, attempted_at: null, error: null },
      },
    };
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: partial } });
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('uz');
    expect(state.completed_at).toBeTruthy();
    expect(state.steps.authentik_oidc.attempted_at).toBe('2026-05-20T00:00:01.000Z'); // untouched
    expect(state.steps.directus_policy.status).toBe('succeeded');
    expect(state.steps.directus_policy.error).toBeNull();
    expect(state.steps.plausible_site.status).toBe('succeeded');
  });

  it('stops on first failing step + persists + returns state with error', async () => {
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: null } });
    dx.patch.mockResolvedValueOnce({});
    // Inject a failure on directus_policy by replacing its runner
    (
      svc as unknown as {
        runners: Record<string, (c: { code: string; name: string }) => Promise<void>>;
      }
    ).runners.directus_policy = async () => {
      throw new Error('directus 503');
    };

    const state = await svc.run('uz');
    expect(state.completed_at).toBeNull();
    expect(state.steps.authentik_oidc.status).toBe('succeeded');
    expect(state.steps.directus_policy.status).toBe('failed');
    expect(state.steps.directus_policy.error).toBe('directus 503');
    expect(state.steps.plausible_site.status).toBe('pending');
    expect(state.steps.coolify_fqdn.status).toBe('pending');
    // Persisted on failure too
    expect(dx.patch).toHaveBeenCalledTimes(1);
  });
});

describe('CountryProvisioningService.getState', () => {
  it('returns the persisted state', async () => {
    const partial = {
      started_at: '2026-05-20T00:00:00.000Z',
      completed_at: null,
      steps: Object.fromEntries(
        PROVISIONING_STEP_IDS.map((id) => [
          id,
          { status: 'pending' as const, attempted_at: null, error: null },
        ]),
      ),
    };
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: partial } });
    expect(await svc.getState('uz')).toEqual(partial);
  });

  it('returns null when the country has never been provisioned', async () => {
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: null } });
    expect(await svc.getState('uz')).toBeNull();
  });
});

// F-S4.1-b — real authentik_oidc runner (replaces the v1 stub).
describe('CountryProvisioningService — authentik_oidc real runner', () => {
  const KG = { code: 'kg', name: 'Kyrgyzstan', provisioning_state: null };
  const EXPECTED_URI = 'https://kg.aiqadam.org/api/v1/auth/callback';

  it('appends the new redirect URI when not already present', async () => {
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.patch.mockResolvedValueOnce({});
    ak.getOauthProviderByName.mockResolvedValueOnce({
      pk: 1,
      name: 'aiqadam',
      redirect_uris: [
        { matching_mode: 'strict', url: 'https://aiqadam.org/api/v1/auth/callback' },
        { matching_mode: 'strict', url: 'https://uz.aiqadam.org/api/v1/auth/callback' },
      ],
    });

    const state = await svc.run('kg');
    expect(state.steps.authentik_oidc.status).toBe('succeeded');
    expect(ak.setOauthProviderRedirectUris).toHaveBeenCalledTimes(1);
    const [pk, uris] = ak.setOauthProviderRedirectUris.mock.calls[0] as [
      number,
      Array<{ matching_mode: string; url: string }>,
    ];
    expect(pk).toBe(1);
    expect(uris).toHaveLength(3);
    expect(uris[2]).toEqual({ matching_mode: 'strict', url: EXPECTED_URI });
  });

  it('is idempotent: skips PATCH when URI already present', async () => {
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.patch.mockResolvedValueOnce({});
    ak.getOauthProviderByName.mockResolvedValueOnce({
      pk: 1,
      name: 'aiqadam',
      redirect_uris: [{ matching_mode: 'strict', url: EXPECTED_URI }],
    });

    const state = await svc.run('kg');
    expect(state.steps.authentik_oidc.status).toBe('succeeded');
    expect(ak.setOauthProviderRedirectUris).not.toHaveBeenCalled();
  });

  it('fails with authentik_admin_not_configured when token missing', async () => {
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.patch.mockResolvedValueOnce({});
    ak.isConfigured.mockReturnValueOnce(false);

    const state = await svc.run('kg');
    expect(state.steps.authentik_oidc.status).toBe('failed');
    expect(state.steps.authentik_oidc.error).toBe('authentik_admin_not_configured');
    // Subsequent steps stay pending (state-machine halts on first failure)
    expect(state.steps.directus_policy.status).toBe('pending');
  });

  it('fails with authentik_oidc_provider_not_configured when env var unset', async () => {
    vi.stubEnv('AUTHENTIK_OIDC_PROVIDER_NAME', '');
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('kg');
    expect(state.steps.authentik_oidc.status).toBe('failed');
    expect(state.steps.authentik_oidc.error).toBe('authentik_oidc_provider_not_configured');
  });

  it('fails with authentik_oidc_provider_not_found when name resolves null', async () => {
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.patch.mockResolvedValueOnce({});
    ak.getOauthProviderByName.mockResolvedValueOnce(null);

    const state = await svc.run('kg');
    expect(state.steps.authentik_oidc.status).toBe('failed');
    expect(state.steps.authentik_oidc.error).toContain('authentik_oidc_provider_not_found');
  });
});

// F-S4.1-c — real directus_policy runner.
describe('CountryProvisioningService — directus_policy real runner', () => {
  const KG = { code: 'kg', name: 'Kyrgyzstan', provisioning_state: null };
  const EXPECTED_NAME = 'policy.country_lead.kg';

  it('creates the per-country policy when not already present', async () => {
    // Override defaults to track call shape
    dx.get.mockReset();
    dx.post.mockReset();
    dx.patch.mockReset();
    dx.get
      .mockResolvedValueOnce({ data: KG }) // fetchCountry
      .mockResolvedValueOnce({ data: [] }); // policy lookup → empty
    dx.post.mockResolvedValueOnce({ data: { id: 'policy-kg-1' } });
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('kg');
    expect(state.steps.directus_policy.status).toBe('succeeded');
    const policyPost = dx.post.mock.calls.find((c) => c[0] === '/policies');
    expect(policyPost).toBeDefined();
    const body = policyPost?.[1] as Record<string, unknown>;
    expect(body.name).toBe(EXPECTED_NAME);
    expect(body.admin_access).toBe(false);
    expect(body.app_access).toBe(true);
    expect(body.enforce_tfa).toBe(false);
  });

  it('is idempotent: skips POST when policy with matching name already exists', async () => {
    dx.get.mockReset();
    dx.post.mockReset();
    dx.patch.mockReset();
    dx.get
      .mockResolvedValueOnce({ data: KG })
      .mockResolvedValueOnce({ data: [{ id: 'policy-kg-existing' }] }); // policy lookup → found
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('kg');
    expect(state.steps.directus_policy.status).toBe('succeeded');
    const policyPost = dx.post.mock.calls.find((c) => c[0] === '/policies');
    expect(policyPost).toBeUndefined(); // no POST — idempotent short-circuit
  });

  it('fails when the policy lookup throws (e.g. Directus 503)', async () => {
    dx.get.mockReset();
    dx.post.mockReset();
    dx.patch.mockReset();
    dx.get
      .mockResolvedValueOnce({ data: KG })
      .mockRejectedValueOnce(new Error('Directus 503 /policies'));
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('kg');
    expect(state.steps.directus_policy.status).toBe('failed');
    expect(state.steps.directus_policy.error).toContain('Directus 503');
    // Subsequent steps stay pending (state machine halts on first failure)
    expect(state.steps.plausible_site.status).toBe('pending');
  });
});
