import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { MembersService } from '../src/modules/workspace/members.service';

// Regression guard for the 2026-05-29 root-cause: MembersService was
// requesting `display_name` + `industry` from Directus, but the canonical
// fields on directus_users are first_name + industry_tags (no display_name
// at all). Directus 400'd → DirectusError → opaque 500 on EVERY signed-in
// hit of /workspace/members in v1 + v2. This spec locks the contract.

type FakeDirectus = { get: ReturnType<typeof vi.fn> };

let dx: FakeDirectus;
let members: MembersService;

beforeEach(() => {
  dx = { get: vi.fn() };
  members = new MembersService(dx as unknown as DirectusClient);
});

describe('MembersService.search — Directus field contract', () => {
  it('requests industry_tags (not industry) and never display_name', async () => {
    dx.get.mockResolvedValueOnce({ data: [], meta: { filter_count: 0 } });

    await members.search({});

    expect(dx.get).toHaveBeenCalledTimes(1);
    const [path] = (dx.get.mock.calls[0] ?? []) as [string];
    const decoded = decodeURIComponent(path);

    expect(decoded).toContain('industry_tags');
    expect(decoded).not.toContain('display_name');
    // Defensive: `industry` is allowed only inside `industry_tags` —
    // assert no standalone `industry,` or `industry&` token leaked.
    expect(decoded).not.toMatch(/[,?]industry(?:,|&|$)/);
  });

  it('maps the Directus industry_tags field to the public industry key on the response', async () => {
    dx.get.mockResolvedValueOnce({
      data: [
        {
          id: 'u1',
          email: 'a@example.org',
          first_name: 'Alice',
          industry_tags: ['ai', 'data'],
        },
      ],
      meta: { filter_count: 1 },
    });

    const result = await members.search({});

    expect(result.members).toHaveLength(1);
    const [row] = result.members;
    expect(row?.industry).toEqual(['ai', 'data']);
    // The Directus name MUST NOT leak through the public contract.
    expect(row).not.toHaveProperty('industry_tags');
  });

  it('returns industry=null when Directus omits industry_tags', async () => {
    dx.get.mockResolvedValueOnce({
      data: [{ id: 'u2', email: 'b@example.org' }],
      meta: { filter_count: 1 },
    });

    const result = await members.search({});

    expect(result.members[0]?.industry).toBeNull();
  });
});
