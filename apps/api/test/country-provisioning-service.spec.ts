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
const originalFetch = global.fetch;

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
  // F-S4.1-d — env + fetch stubs so the real plausible_site + coolify_fqdn
  // runners succeed in the framework happy-path tests. Tests for those
  // runners specifically override per-case.
  vi.stubEnv('PLAUSIBLE_ADMIN_TOKEN', 'plausible-token-test-aaaaaaaaaa');
  vi.stubEnv('COOLIFY_API_TOKEN', 'coolify-token-test-aaaaaaaaaaa');
  vi.stubEnv('COOLIFY_WEB_APP_UUID', 'web-app-uuid-test');
  global.fetch = vi.fn(async (url: unknown, init?: unknown) => {
    const u = String(url);
    const method = ((init ?? {}) as RequestInit).method ?? 'GET';
    if (u.includes('/api/v1/sites')) {
      // Plausible site create — 200 OK
      return new Response(JSON.stringify({ domain: 'x.aiqadam.org' }), { status: 200 });
    }
    if (u.includes('/api/v1/applications/')) {
      if (method === 'GET') {
        // Coolify app fetch — return existing fqdn list (no new entry)
        return new Response(
          JSON.stringify({ fqdn: 'https://aiqadam.org:4321,https://uz.aiqadam.org:4321' }),
          { status: 200 },
        );
      }
      // Coolify PATCH — 200
      return new Response(JSON.stringify({ uuid: 'web-app-uuid-test' }), { status: 200 });
    }
    // Anything else → 404 (forces tests to cover their own URLs)
    return new Response('', { status: 404 });
  }) as typeof global.fetch;
  svc = new CountryProvisioningService(
    dx as unknown as DirectusClient,
    ak as unknown as AuthentikClient,
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  global.fetch = originalFetch;
});

describe('CountryProvisioningService.run — fresh provisioning', () => {
  it('initialises state + runs 3 automatable steps; plausible_site goes awaiting_manual (CE has no Sites API); completed_at stays null', async () => {
    dx.get.mockResolvedValueOnce({ data: { ...UZ, provisioning_state: null } });
    dx.patch.mockResolvedValueOnce({});

    const state = await svc.run('uz');

    expect(state.started_at).toBeTruthy();
    // completed_at requires ALL steps succeeded; plausible_site needs manual.
    expect(state.completed_at).toBeNull();
    expect(state.steps.authentik_oidc.status).toBe('succeeded');
    expect(state.steps.directus_policy.status).toBe('succeeded');
    expect(state.steps.plausible_site.status).toBe('awaiting_manual');
    expect(state.steps.plausible_site.error).toBeNull();
    expect(state.steps.coolify_fqdn.status).toBe('succeeded');
    // Persisted once at the end.
    expect(dx.patch).toHaveBeenCalledTimes(1);
    expect(dx.patch.mock.calls[0]?.[0]).toBe('/items/countries/uz');
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
  it('resumes from the first non-succeeded step (skips already-succeeded ones); plausible_site lands awaiting_manual', async () => {
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
    expect(state.completed_at).toBeNull(); // blocked on plausible_site awaiting_manual
    expect(state.steps.authentik_oidc.attempted_at).toBe('2026-05-20T00:00:01.000Z'); // untouched
    expect(state.steps.directus_policy.status).toBe('succeeded');
    expect(state.steps.directus_policy.error).toBeNull();
    expect(state.steps.plausible_site.status).toBe('awaiting_manual');
    expect(state.steps.coolify_fqdn.status).toBe('succeeded');
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

// F-S4.1-d — real plausible_site runner.
function plausibleAndCoolifyMock(handle: (url: string, init: RequestInit) => Response | undefined) {
  return vi.fn(async (url: unknown, init?: unknown) => {
    const u = String(url);
    const i = (init ?? {}) as RequestInit;
    const custom = handle(u, i);
    if (custom) return custom;
    if (u.includes('/api/v1/sites')) return new Response('{}', { status: 200 });
    if (u.includes('/api/v1/applications/'))
      return new Response(JSON.stringify({ fqdn: '' }), { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof global.fetch;
}

// F-S4.1-e — plausible_site is now a manual-confirmation step (Plausible
// CE doesn't ship the Sites Provisioning API, per maintainer in discussion
// #4329). Runner throws AwaitingManualError; run loop marks the step as
// awaiting_manual and continues. Operator confirms via manualComplete().
describe('CountryProvisioningService — plausible_site manual mode', () => {
  const KG = { code: 'kg', name: 'Kyrgyzstan', provisioning_state: null };

  it('marks plausible_site as awaiting_manual and continues to coolify_fqdn', async () => {
    global.fetch = plausibleAndCoolifyMock(() => undefined);
    dx.get.mockReset();
    dx.post.mockReset();
    dx.patch.mockReset();
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.get.mockResolvedValue({ data: [] });
    dx.post.mockResolvedValue({ data: { id: 'policy-new' } });
    dx.patch.mockResolvedValue({});

    const state = await svc.run('kg');
    expect(state.steps.plausible_site.status).toBe('awaiting_manual');
    expect(state.steps.plausible_site.error).toBeNull();
    // Crucially: coolify_fqdn STILL ran (chain continues past awaiting_manual)
    expect(state.steps.coolify_fqdn.status).toBe('succeeded');
    expect(state.completed_at).toBeNull();
    // No HTTP call to Plausible's /api/v1/sites — the runner short-circuits.
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.find((c) => String(c[0]).includes('/api/v1/sites'))).toBeUndefined();
  });
});

// F-S4.1-d — real coolify_fqdn runner.
describe('CountryProvisioningService — coolify_fqdn real runner', () => {
  const KG = { code: 'kg', name: 'Kyrgyzstan', provisioning_state: null };

  it('appends new FQDN to the apps domains list', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    global.fetch = plausibleAndCoolifyMock((u, i) => {
      calls.push({ url: u, init: i });
      if (u.includes('/api/v1/applications/') && (i.method ?? 'GET') === 'GET') {
        return new Response(
          JSON.stringify({ fqdn: 'https://aiqadam.org:4321,https://uz.aiqadam.org:4321' }),
          { status: 200 },
        );
      }
      return undefined;
    });
    dx.get.mockReset();
    dx.post.mockReset();
    dx.patch.mockReset();
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.get.mockResolvedValue({ data: [] });
    dx.post.mockResolvedValue({ data: { id: 'policy-new' } });
    dx.patch.mockResolvedValue({});

    const state = await svc.run('kg');
    expect(state.steps.coolify_fqdn.status).toBe('succeeded');
    const patchCall = calls.find(
      (c) => c.url.includes('/api/v1/applications/') && c.init.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const body = JSON.parse(String(patchCall?.init.body)) as { domains: string };
    expect(body.domains.split(',')).toEqual([
      'https://aiqadam.org:4321',
      'https://uz.aiqadam.org:4321',
      'https://kg.aiqadam.org:4321',
    ]);
  });

  it('is idempotent: no PATCH when FQDN already in the list', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    global.fetch = plausibleAndCoolifyMock((u, i) => {
      const method = i.method ?? 'GET';
      calls.push({ url: u, method });
      if (u.includes('/api/v1/applications/') && method === 'GET') {
        return new Response(
          JSON.stringify({
            fqdn: 'https://aiqadam.org:4321,https://kg.aiqadam.org:4321',
          }),
          { status: 200 },
        );
      }
      return undefined;
    });
    dx.get.mockReset();
    dx.post.mockReset();
    dx.patch.mockReset();
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.get.mockResolvedValue({ data: [] });
    dx.post.mockResolvedValue({ data: { id: 'policy-new' } });
    dx.patch.mockResolvedValue({});

    const state = await svc.run('kg');
    expect(state.steps.coolify_fqdn.status).toBe('succeeded');
    expect(
      calls.filter((c) => c.url.includes('/api/v1/applications/') && c.method === 'PATCH'),
    ).toHaveLength(0);
  });

  it('fails with coolify_admin_not_configured when token unset', async () => {
    vi.stubEnv('COOLIFY_API_TOKEN', '');
    dx.get.mockReset();
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.get.mockResolvedValue({ data: [] });
    dx.patch.mockResolvedValue({});

    const state = await svc.run('kg');
    expect(state.steps.coolify_fqdn.status).toBe('failed');
    expect(state.steps.coolify_fqdn.error).toBe('coolify_admin_not_configured');
  });

  it('fails with coolify_admin_not_configured when web app uuid unset', async () => {
    vi.stubEnv('COOLIFY_WEB_APP_UUID', '');
    dx.get.mockReset();
    dx.get.mockResolvedValueOnce({ data: KG });
    dx.get.mockResolvedValue({ data: [] });
    dx.patch.mockResolvedValue({});

    const state = await svc.run('kg');
    expect(state.steps.coolify_fqdn.status).toBe('failed');
    expect(state.steps.coolify_fqdn.error).toBe('coolify_admin_not_configured');
  });
});

// F-S4.2-b — go-live gate.
describe('CountryProvisioningService.activate', () => {
  const COMPLETED = {
    started_at: '2026-05-20T00:00:00.000Z',
    completed_at: '2026-05-20T00:00:05.000Z',
    steps: Object.fromEntries(
      PROVISIONING_STEP_IDS.map((id) => [
        id,
        { status: 'succeeded' as const, attempted_at: '2026-05-20T00:00:01.000Z', error: null },
      ]),
    ),
  };

  beforeEach(() => {
    dx.get.mockReset();
    dx.patch.mockReset();
    dx.patch.mockResolvedValue({});
  });

  it('flips is_active=true when all steps succeeded and country was inactive', async () => {
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: COMPLETED },
    });

    const result = await svc.activate('kg');
    expect(result.is_active).toBe(true);
    expect(result.state).toEqual(COMPLETED);
    expect(dx.patch).toHaveBeenCalledTimes(1);
    expect(dx.patch.mock.calls[0]?.[0]).toContain('/items/countries/kg');
    expect(dx.patch.mock.calls[0]?.[1]).toEqual({ is_active: true });
  });

  it('is idempotent: no PATCH when country is already active', async () => {
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: true, provisioning_state: COMPLETED },
    });

    const result = await svc.activate('kg');
    expect(result.is_active).toBe(true);
    expect(dx.patch).not.toHaveBeenCalled();
  });

  it('refuses with BadRequest(not_provisioned) when state has never been started', async () => {
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: null },
    });

    await expect(svc.activate('kg')).rejects.toThrow(/not_provisioned/);
    expect(dx.patch).not.toHaveBeenCalled();
  });

  it('refuses with BadRequest(not_provisioned) when completed_at is null', async () => {
    const inflight = {
      started_at: '2026-05-20T00:00:00.000Z',
      completed_at: null,
      steps: COMPLETED.steps,
    };
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: inflight },
    });

    await expect(svc.activate('kg')).rejects.toThrow(/not_provisioned/);
    expect(dx.patch).not.toHaveBeenCalled();
  });

  it('refuses with BadRequest(provisioning_incomplete) when one step is not succeeded', async () => {
    const partial = {
      ...COMPLETED,
      steps: {
        ...COMPLETED.steps,
        coolify_fqdn: {
          status: 'failed' as const,
          attempted_at: '2026-05-20T00:00:04.000Z',
          error: 'transient',
        },
      },
    };
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: partial },
    });

    await expect(svc.activate('kg')).rejects.toThrow(/provisioning_incomplete/);
    expect(dx.patch).not.toHaveBeenCalled();
  });
});

describe('CountryProvisioningService.getStateWithActive', () => {
  beforeEach(() => {
    dx.get.mockReset();
  });

  it('returns state + is_active together', async () => {
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: true, provisioning_state: null },
    });
    const result = await svc.getStateWithActive('kg');
    expect(result).toEqual({ state: null, is_active: true });
  });
});

// F-S4.1-e — manualComplete contract.
describe('CountryProvisioningService.manualComplete', () => {
  const AWAITING = {
    started_at: '2026-05-20T00:00:00.000Z',
    completed_at: null,
    steps: {
      authentik_oidc: {
        status: 'succeeded' as const,
        attempted_at: '2026-05-20T00:00:01.000Z',
        error: null,
      },
      directus_policy: {
        status: 'succeeded' as const,
        attempted_at: '2026-05-20T00:00:02.000Z',
        error: null,
      },
      plausible_site: {
        status: 'awaiting_manual' as const,
        attempted_at: '2026-05-20T00:00:03.000Z',
        error: null,
      },
      coolify_fqdn: {
        status: 'succeeded' as const,
        attempted_at: '2026-05-20T00:00:04.000Z',
        error: null,
      },
    },
  };

  beforeEach(() => {
    dx.get.mockReset();
    dx.patch.mockReset();
    dx.patch.mockResolvedValue({});
  });

  it('flips awaiting_manual → succeeded and sets completed_at when it was the last blocker', async () => {
    dx.get.mockResolvedValueOnce({
      data: {
        code: 'kg',
        name: 'Kyrgyzstan',
        is_active: false,
        provisioning_state: structuredClone(AWAITING),
      },
    });

    const state = await svc.manualComplete('kg', 'plausible_site');
    expect(state.steps.plausible_site.status).toBe('succeeded');
    expect(state.steps.plausible_site.error).toBeNull();
    expect(state.completed_at).toBeTruthy();
    expect(dx.patch).toHaveBeenCalledTimes(1);
  });

  it('does not set completed_at when other steps are still not succeeded', async () => {
    const stillBlocked = structuredClone(AWAITING) as typeof AWAITING & {
      steps: { coolify_fqdn: { status: string; attempted_at: string; error: string } };
    };
    stillBlocked.steps.coolify_fqdn = {
      status: 'failed',
      attempted_at: '2026-05-20T00:00:04.000Z',
      error: 'transient',
    };
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: stillBlocked },
    });

    const state = await svc.manualComplete('kg', 'plausible_site');
    expect(state.steps.plausible_site.status).toBe('succeeded');
    expect(state.completed_at).toBeNull();
  });

  it('refuses with BadRequest(invalid_step) for an unknown step id', async () => {
    await expect(svc.manualComplete('kg', 'made_up_step')).rejects.toThrow(/invalid_step/);
    expect(dx.get).not.toHaveBeenCalled();
  });

  it('refuses with BadRequest(not_provisioned) when state is null', async () => {
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: null },
    });
    await expect(svc.manualComplete('kg', 'plausible_site')).rejects.toThrow(/not_provisioned/);
    expect(dx.patch).not.toHaveBeenCalled();
  });

  it('refuses with BadRequest(step_not_awaiting_manual) when step is already succeeded', async () => {
    const completed = structuredClone(AWAITING);
    completed.steps.plausible_site = {
      status: 'succeeded',
      attempted_at: '2026-05-20T00:00:03.000Z',
      error: null,
    };
    dx.get.mockResolvedValueOnce({
      data: { code: 'kg', name: 'Kyrgyzstan', is_active: false, provisioning_state: completed },
    });
    await expect(svc.manualComplete('kg', 'plausible_site')).rejects.toThrow(
      /step_not_awaiting_manual/,
    );
    expect(dx.patch).not.toHaveBeenCalled();
  });
});
