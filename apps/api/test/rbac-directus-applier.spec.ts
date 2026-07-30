import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DirectusError } from '../src/modules/directus/directus.client';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  DIRECTUS_POLICY_UUIDS,
  DirectusPolicyApplier,
} from '../src/modules/rbac-sync/directus-policy-applier';

// F-S2.2-c — Directus engine apply path.
// ISS-UAT-RBAC-001: `policies` on directus_users is an M2M alias field
// backed by directus_access — Directus rejects a flat array of policy
// UUIDs there with a generic 403 even for a full-admin token. The correct
// write shape is the relational create/update/delete envelope, and reading
// the user's existing directus_access row ids (for `delete`) has to go
// through GET /users/{id}?fields=policies — GET /items/directus_access
// itself 403s even for admins, since it's a protected system collection.

type FakeDirectus = { patch: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };

let directus: FakeDirectus;
let applier: DirectusPolicyApplier;

beforeEach(() => {
  directus = {
    patch: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({ data: { policies: [] } }),
  };
  applier = new DirectusPolicyApplier(directus as unknown as DirectusClient);
});

describe('DirectusPolicyApplier.apply', () => {
  it('fetches existing access rows via /users/{id}?fields=policies, not /items/directus_access', async () => {
    await applier.apply('directus-user-uuid', {
      policies: ['policy.member'],
      filter_country: null,
    });
    expect(directus.get).toHaveBeenCalledWith(
      '/users/directus-user-uuid?fields=policies',
    );
  });

  it('PATCHes policies via the create/update/delete relational envelope, not a flat array', async () => {
    const outcome = await applier.apply('directus-user-uuid', {
      policies: ['policy.member', 'policy.country_lead'],
      filter_country: 'kz',
    });
    expect(outcome.status).toBe('applied');
    expect(directus.patch).toHaveBeenCalledTimes(1);
    const call = directus.patch.mock.calls[0];
    expect(call?.[0]).toBe('/users/directus-user-uuid');
    const body = call?.[1] as Record<string, unknown>;
    expect(body.policies).toEqual({
      create: [
        { user: 'directus-user-uuid', policy: DIRECTUS_POLICY_UUIDS['policy.member'] },
        { user: 'directus-user-uuid', policy: DIRECTUS_POLICY_UUIDS['policy.country_lead'] },
      ],
      update: [],
      delete: [],
    });
    expect(body.country).toBe('kz');
  });

  it('deletes existing access rows when replacing the policy set', async () => {
    directus.get.mockResolvedValueOnce({ data: { policies: ['old-access-row-id'] } });
    await applier.apply('directus-user-uuid', {
      policies: ['policy.member'],
      filter_country: null,
    });
    const body = directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    const policies = body.policies as { delete: string[] };
    expect(policies.delete).toEqual(['old-access-row-id']);
  });

  it('sends country=null when filter is null (super-admin)', async () => {
    await applier.apply('uuid', { policies: ['policy.member'], filter_country: null });
    const body = directus.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.country).toBeNull();
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

  it('returns { status: failed, error } when the existing-policies lookup fails', async () => {
    directus.get.mockRejectedValueOnce(new DirectusError(403, '/users/x', 'forbidden'));
    const outcome = await applier.apply('uuid', {
      policies: ['policy.member'],
      filter_country: null,
    });
    expect(outcome.status).toBe('failed');
    expect(directus.patch).not.toHaveBeenCalled();
  });
});
