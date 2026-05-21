import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { CohortsService } from '../src/modules/workspace/cohorts.service';
import { MembersService } from '../src/modules/workspace/members.service';

// F-S3.2 — services are pure proxies over Directus REST + filter
// composition. Tests mock the Directus client; no Testcontainers needed
// for this layer.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let members: MembersService;
let cohorts: CohortsService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  members = new MembersService(dx as unknown as DirectusClient);
  cohorts = new CohortsService(dx as unknown as DirectusClient, members);
});

describe('MembersService.search', () => {
  it('paginates with defaults and encodes filter', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'u-1', email: 'a@b.c' }],
      meta: { filter_count: 1 },
    });

    const result = await members.search({
      filter: { country: { _eq: 'uz' } },
    });

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    const call = dx.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('/users?fields=');
    expect(call).toContain('limit=50');
    expect(call).toContain('offset=0');
    expect(call).toContain('meta=filter_count');
    const filterPart = call.split('filter=')[1]?.split('&')[0] ?? '';
    expect(decodeURIComponent(filterPart)).toBe('{"country":{"_eq":"uz"}}');
  });

  it('clamps limit to MAX_LIMIT and computes offset', async () => {
    dx.get.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });
    await members.search({ page: 3, limit: 500 });
    const call = dx.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('limit=200');
    expect(call).toContain('offset=400'); // (3-1) * 200
  });

  it('passes optional search query through', async () => {
    dx.get.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });
    await members.search({ query: 'tashkent' });
    const call = dx.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('search=tashkent');
  });
});

describe('MembersService.count', () => {
  it('returns the meta filter_count cheaply', async () => {
    dx.get.mockResolvedValueOnce({ data: [], meta: { filter_count: 47 } });
    const n = await members.count({ seniority: { _eq: 'c_level' } });
    expect(n).toBe(47);
    const call = dx.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('limit=1');
  });

  it('returns 0 when meta is missing', async () => {
    dx.get.mockResolvedValueOnce({ data: [] });
    const n = await members.count({});
    expect(n).toBe(0);
  });
});

describe('CohortsService.create', () => {
  it('snapshots count and derives slug from name', async () => {
    // count() call first (via members.count)
    dx.get.mockResolvedValueOnce({ data: [], meta: { filter_count: 47 } });
    dx.post.mockResolvedValueOnce({
      data: {
        id: 'c-1',
        name: 'UZ Fintech CEOs Q3',
        slug: 'uz-fintech-ceos-q3',
        filter_query: { _and: [{ country: { _eq: 'uz' } }] },
        member_count_cached: 47,
      },
    });

    const cohort = await cohorts.create({
      name: 'UZ Fintech CEOs Q3',
      filter_query: { _and: [{ country: { _eq: 'uz' } }] },
      created_by: 'admin-uuid',
    });

    expect(cohort.member_count_cached).toBe(47);
    const postCall = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(postCall.slug).toBe('uz-fintech-ceos-q3');
    expect(postCall.member_count_cached).toBe(47);
    expect(postCall.created_by).toBe('admin-uuid');
  });

  it('rejects empty name', async () => {
    await expect(
      cohorts.create({ name: '   ', filter_query: {}, created_by: 'x' }),
    ).rejects.toThrow();
  });

  it('rejects non-object filter_query', async () => {
    await expect(
      cohorts.create({
        name: 'ok',
        filter_query: null as unknown as Record<string, unknown>,
        created_by: 'x',
      }),
    ).rejects.toThrow();
  });
});

describe('CohortsService.getById', () => {
  it('returns current count + 7d delta vs cached', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: {
          id: 'c-1',
          name: 'Active UZ 90d',
          slug: 'active-uz-90d',
          filter_query: { country: { _eq: 'uz' } },
          member_count_cached: 100,
          member_count_refreshed_at: '2026-05-14T00:00:00Z',
        },
      })
      .mockResolvedValueOnce({ data: [], meta: { filter_count: 123 } });

    const cohort = await cohorts.getById('c-1');
    expect(cohort.current_member_count).toBe(123);
    expect(cohort.member_count_delta_7d).toBe(23);
  });

  it('throws when cohort does not exist', async () => {
    dx.get.mockResolvedValueOnce({ data: null });
    await expect(cohorts.getById('missing')).rejects.toThrow();
  });
});

describe('CohortsService.update', () => {
  it('re-snapshots count when filter_query changes', async () => {
    // members.count for re-snapshot
    dx.get.mockResolvedValueOnce({ data: [], meta: { filter_count: 5 } });
    dx.patch.mockResolvedValueOnce({
      data: { id: 'c-1', member_count_cached: 5 },
    });

    await cohorts.update('c-1', { filter_query: { country: { _eq: 'kz' } } });

    const patchCall = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchCall.filter_query).toEqual({ country: { _eq: 'kz' } });
    expect(patchCall.member_count_cached).toBe(5);
  });

  it('does not re-count when only name changes', async () => {
    dx.patch.mockResolvedValueOnce({ data: { id: 'c-1' } });
    await cohorts.update('c-1', { name: 'Renamed Cohort' });
    expect(dx.get).not.toHaveBeenCalled();
    const patchCall = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchCall.name).toBe('Renamed Cohort');
    expect(patchCall.slug).toBe('renamed-cohort');
    expect(patchCall.member_count_cached).toBeUndefined();
  });
});

describe('CohortsService.delete + list + sample', () => {
  it('list returns the rows directly', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        { id: 'c-1', name: 'A', slug: 'a', filter_query: {}, member_count_cached: 0 },
        { id: 'c-2', name: 'B', slug: 'b', filter_query: {}, member_count_cached: 5 },
      ],
    });
    const rows = await cohorts.list();
    expect(rows).toHaveLength(2);
  });

  it('sample fetches filter_query then runs PII-light user select', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: { filter_query: { country: { _eq: 'uz' } } },
      })
      .mockResolvedValueOnce({
        data: [{ id: 'u-1', first_name: 'Aigerim', city: 'Tashkent' }],
      });

    const { members: rows } = await cohorts.sample('c-1', 20);
    expect(rows).toHaveLength(1);
    const sampleCall = dx.get.mock.calls[1]?.[0] as string;
    expect(sampleCall).toContain('/users?fields=');
    expect(decodeURIComponent(sampleCall)).toContain('id,first_name,city,seniority,industry');
  });

  it('delete calls DELETE on the right path', async () => {
    dx.delete.mockResolvedValueOnce(undefined);
    await cohorts.delete('c-1');
    expect(dx.delete).toHaveBeenCalledWith('/items/cohorts/c-1');
  });
});
