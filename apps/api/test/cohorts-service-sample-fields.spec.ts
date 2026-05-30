import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { CohortsService } from '../src/modules/workspace/cohorts.service';
import { MembersService } from '../src/modules/workspace/members.service';

// Regression guard for the same field-name trap fixed in MembersService
// (fix-F, 2026-05-30). CohortsService.sample fetches a PII-light cut of
// directus_users for cohort previews; it had `industry` in the fields
// selector but the canonical schema field is `industry_tags`. This spec
// locks the contract before the cabinet starts exercising the endpoint.

type FakeDirectus = { get: ReturnType<typeof vi.fn> };

const COHORT_ID = '11111111-1111-4000-8000-000000000001';

let dx: FakeDirectus;
let cohorts: CohortsService;

beforeEach(() => {
  dx = { get: vi.fn() };
  const members = new MembersService(dx as unknown as DirectusClient);
  cohorts = new CohortsService(dx as unknown as DirectusClient, members);
});

describe('CohortsService.sample — Directus field contract', () => {
  it('requests industry_tags (not industry) for the sample fields', async () => {
    // First get: cohort row by id. Second get: users by filter.
    dx.get
      .mockResolvedValueOnce({ data: { filter_query: { country: { _eq: 'uz' } } } })
      .mockResolvedValueOnce({ data: [] });

    await cohorts.sample(COHORT_ID, 20);

    expect(dx.get).toHaveBeenCalledTimes(2);
    const [usersPath] = (dx.get.mock.calls[1] ?? []) as [string];
    const decoded = decodeURIComponent(usersPath);

    expect(decoded).toContain('industry_tags');
    expect(decoded).not.toContain('display_name');
    // Defensive: no standalone `industry,` token leaked.
    expect(decoded).not.toMatch(/[,?]industry(?:,|&|$)/);
  });
});
