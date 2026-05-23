import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CountryProvisioningService,
  PROVISIONING_STEP_IDS,
} from '../src/modules/country-provisioning/country-provisioning.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { DirectusError } from '../src/modules/directus/directus.client';

// F-S4.1 — country provisioning state machine. Mocks Directus.
// v1 stubs always succeed; tests focus on framework semantics:
// initialization, persistence, idempotency, resume-from-failure.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: CountryProvisioningService;

const UZ = { code: 'uz', name: 'Uzbekistan', provisioning_state: null };

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new CountryProvisioningService(dx as unknown as DirectusClient);
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
