import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectusError } from '../src/modules/directus/directus.client';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  DIRECTUS_POLICY_UUIDS,
  DirectusPolicyApplier,
} from '../src/modules/rbac-sync/directus-policy-applier';

// F-S2.2-c — Directus engine apply path.

type FakeDirectus = { patch: ReturnType<typeof vi.fn> };

let directus: FakeDirectus;
let applier: DirectusPolicyApplier;

beforeEach(() => {
  directus = { patch: vi.fn().mockResolvedValue(undefined) };
  applier = new DirectusPolicyApplier(directus as unknown as DirectusClient);
});

describe('DirectusPolicyApplier.apply', () => {
  it('PATCHes user with resolved policy UUIDs + country_code', async () => {
    const outcome = await applier.apply('directus-user-uuid', {
      policies: ['policy.member', 'policy.country_lead'],
      filter_country: 'kz',
    });
    expect(outcome.status).toBe('applied');
    expect(directus.patch).toHaveBeenCalledTimes(1);
    const call = directus.patch.mock.calls[0];
    expect(call?.[0]).toBe('/users/directus-user-uuid');
    const body = call?.[1] as Record<string, unknown>;
    expect(body.policies).toEqual([
      DIRECTUS_POLICY_UUIDS['policy.member'],
      DIRECTUS_POLICY_UUIDS['policy.country_lead'],
    ]);
    expect(body.country_code).toBe('kz');
  });

  it('sends country_code=null when filter is null (super-admin)', async () => {
    await applier.apply('uuid', { policies: ['policy.member'], filter_country: null });
    const body = directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.country_code).toBeNull();
  });

  it('returns { status: failed, error } on DirectusError without throwing', async () => {
    directus.patch.mockRejectedValueOnce(new DirectusError(503, '/users/x', 'service unavailable'));
    const outcome = await applier.apply('uuid', {
      policies: ['policy.member'],
      filter_country: null,
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toContain('503');
  });
});
