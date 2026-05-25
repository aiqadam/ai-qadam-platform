import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  TgSegmentsService,
  buildResolverFilter,
  validateCriteria,
} from '../src/modules/workspace/tg-segments.service';

// #294 PR-c — segment criteria DSL + resolver tests.

function fakeDirectus(opts: {
  get?: ReturnType<typeof vi.fn>;
  post?: ReturnType<typeof vi.fn>;
  patch?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}): DirectusClient {
  return {
    get: opts.get ?? vi.fn(),
    post: opts.post ?? vi.fn(),
    patch: opts.patch ?? vi.fn(),
    delete: opts.delete ?? vi.fn(),
  } as unknown as DirectusClient;
}

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'UZ org members (last 30d)',
  country: 'uz',
  criteria: { _and: [{ country: { _eq: 'uz' } }, { linked_within_days: { _gte: 30 } }] },
  created_by: 'usr-1',
  date_created: '2026-05-24T12:00:00.000Z',
  date_updated: null,
};

// ─── validateCriteria ────────────────────────────────────────────────────

describe('validateCriteria', () => {
  it('accepts a valid _and with country + linked_within_days', () => {
    expect(() =>
      validateCriteria({
        _and: [{ country: { _eq: 'uz' } }, { linked_within_days: { _gte: 30 } }],
      }),
    ).not.toThrow();
  });

  it('accepts a valid _or', () => {
    expect(() =>
      validateCriteria({ _or: [{ country: { _eq: 'uz' } }, { country: { _eq: 'kz' } }] }),
    ).not.toThrow();
  });

  it('accepts country with _in array', () => {
    expect(() => validateCriteria({ _and: [{ country: { _in: ['uz', 'kz'] } }] })).not.toThrow();
  });

  it('accepts registered_for_event with uuid', () => {
    expect(() =>
      validateCriteria({
        _and: [{ registered_for_event: { _eq: '11111111-1111-4111-8111-111111111111' } }],
      }),
    ).not.toThrow();
  });

  it('accepts preferred_topics with _contains', () => {
    expect(() =>
      validateCriteria({ _and: [{ preferred_topics: { _contains: 'llm' } }] }),
    ).not.toThrow();
  });

  it('rejects non-object', () => {
    expect(() => validateCriteria('oops')).toThrow(BadRequestException);
    expect(() => validateCriteria(null)).toThrow(BadRequestException);
  });

  it('rejects missing _and/_or wrapper', () => {
    expect(() => validateCriteria({ country: { _eq: 'uz' } })).toThrow(BadRequestException);
  });

  it('rejects unsupported field', () => {
    expect(() => validateCriteria({ _and: [{ secret_field: { _eq: 1 } }] })).toThrow(
      BadRequestException,
    );
  });

  it('rejects registered_for_event with non-uuid', () => {
    expect(() =>
      validateCriteria({ _and: [{ registered_for_event: { _eq: 'not-a-uuid' } }] }),
    ).toThrow(BadRequestException);
  });

  it('rejects linked_within_days with zero / negative', () => {
    expect(() => validateCriteria({ _and: [{ linked_within_days: { _gte: 0 } }] })).toThrow(
      BadRequestException,
    );
    expect(() => validateCriteria({ _and: [{ linked_within_days: { _gte: -5 } }] })).toThrow(
      BadRequestException,
    );
  });

  it('rejects leaf with more than one field', () => {
    expect(() =>
      validateCriteria({
        _and: [{ country: { _eq: 'uz' }, preferred_topics: { _contains: 'x' } }],
      }),
    ).toThrow(BadRequestException);
  });
});

// ─── buildResolverFilter ─────────────────────────────────────────────────

describe('buildResolverFilter', () => {
  it('always intersects scope: tg-linked + not-opted-out + country', () => {
    const out = buildResolverFilter({ _and: [] }, 'uz') as { _and: unknown[] };
    expect(out._and).toContainEqual({ telegram_user_id: { _nnull: true } });
    expect(out._and).toContainEqual({ telegram_opted_out_at: { _null: true } });
    expect(out._and).toContainEqual({ country: { _eq: 'uz' } });
  });

  it('preserves country leaf alongside scope intersection', () => {
    const out = buildResolverFilter({ _and: [{ country: { _eq: 'uz' } }] }, 'uz') as {
      _and: unknown[];
    };
    // Both the scope country (from segment.country) AND the leaf
    // country are present — semantically identical but the resolver
    // does not dedupe (Directus optimizer handles it).
    expect(out._and.filter((c) => 'country' in (c as object))).toHaveLength(2);
  });

  it('translates linked_within_days to telegram_linked_at _gte ISO', () => {
    const before = Date.now();
    const out = buildResolverFilter({ _and: [{ linked_within_days: { _gte: 30 } }] }, 'uz') as {
      _and: Array<{ telegram_linked_at?: { _gte: string } }>;
    };
    const translated = out._and.find((c) => 'telegram_linked_at' in c);
    expect(translated?.telegram_linked_at?._gte).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const cutoffMs = Date.parse(translated?.telegram_linked_at?._gte ?? '');
    const expectedMs = before - 30 * 86_400_000;
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(5000); // within 5s tolerance
  });

  it('translates registered_for_event to reverse-relation existence', () => {
    const evt = '11111111-1111-4111-8111-111111111111';
    const out = buildResolverFilter({ _and: [{ registered_for_event: { _eq: evt } }] }, 'uz') as {
      _and: Array<{ registrations?: { event: { _eq: string } } }>;
    };
    expect(out._and).toContainEqual({ registrations: { event: { _eq: evt } } });
  });

  it('wraps _or branch under _or (preserving scope as AND)', () => {
    const out = buildResolverFilter(
      { _or: [{ country: { _eq: 'uz' } }, { country: { _eq: 'kz' } }] },
      'uz',
    ) as { _and: Array<{ _or?: unknown[] }> };
    const orBranch = out._and.find((c) => '_or' in c);
    expect(orBranch?._or).toEqual([{ country: { _eq: 'uz' } }, { country: { _eq: 'kz' } }]);
  });
});

// ─── Service IO ──────────────────────────────────────────────────────────

describe('TgSegmentsService.list', () => {
  it('queries with sort=-date_created + limit=200', async () => {
    const get = vi.fn().mockResolvedValue({ data: [ROW] });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    await svc.list();
    const call = get.mock.calls[0]?.[0] as string;
    expect(call).toContain('/items/tg_segments');
    expect(call).toContain('sort=-date_created');
    expect(call).toContain('limit=200');
  });

  it('adds country filter when provided', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    await svc.list({ country: 'uz' });
    expect(get.mock.calls[0]?.[0] as string).toContain('filter[country][_eq]=uz');
  });
});

describe('TgSegmentsService.get', () => {
  it('returns SegmentDetail with parsed criteria', async () => {
    const get = vi.fn().mockResolvedValue({ data: ROW });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    const out = await svc.get(ROW.id);
    expect(out.id).toBe(ROW.id);
    expect(out.criteria).toEqual(ROW.criteria);
  });

  it('throws NotFoundException when missing', async () => {
    const get = vi.fn().mockResolvedValue({ data: null });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    await expect(svc.get('missing')).rejects.toThrow(NotFoundException);
  });

  it('defensively narrows bad criteria JSON to { _and: [] }', async () => {
    const badRow = { ...ROW, criteria: 'corrupt' };
    const get = vi.fn().mockResolvedValue({ data: badRow });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    const out = await svc.get(ROW.id);
    expect(out.criteria).toEqual({ _and: [] });
  });
});

describe('TgSegmentsService.create', () => {
  it('rejects invalid criteria before POST', async () => {
    const post = vi.fn();
    const svc = new TgSegmentsService(fakeDirectus({ post }));
    await expect(
      svc.create({ name: 'x', country: 'uz', criteria: { _and: 'oops' as never } }),
    ).rejects.toThrow(BadRequestException);
    expect(post).not.toHaveBeenCalled();
  });

  it('POSTs to /items/tg_segments with valid criteria', async () => {
    const post = vi.fn().mockResolvedValue({ data: ROW });
    const svc = new TgSegmentsService(fakeDirectus({ post }));
    await svc.create({
      name: 'test',
      country: 'uz',
      criteria: { _and: [{ country: { _eq: 'uz' } }] },
    });
    expect(post).toHaveBeenCalledWith(
      '/items/tg_segments',
      expect.objectContaining({ name: 'test', country: 'uz' }),
    );
  });
});

describe('TgSegmentsService.preview', () => {
  it('returns match_count + sample names', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: ROW }) // get(id)
      .mockResolvedValueOnce({ data: [{ count: { id: 247 } }] }) // count
      .mockResolvedValueOnce({
        data: [
          { first_name: 'Viktor', last_name: 'Drukker' },
          { first_name: 'Aigerim', last_name: 'B' },
        ],
      }); // sample
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    const out = await svc.preview(ROW.id);
    expect(out.match_count).toBe(247);
    expect(out.sample).toEqual([{ display_name: 'Viktor D.' }, { display_name: 'Aigerim B.' }]);
  });

  it('skips the sample query when count=0', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: ROW })
      .mockResolvedValueOnce({ data: [{ count: { id: 0 } }] });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    const out = await svc.preview(ROW.id);
    expect(out.match_count).toBe(0);
    expect(out.sample).toEqual([]);
    expect(get).toHaveBeenCalledTimes(2); // get + count, no sample
  });
});

// ─── #393 — previewDraft (live preview without persisting) ──────────────

describe('TgSegmentsService.previewDraft', () => {
  it('validates criteria before resolving (rejects unsupported field)', async () => {
    const svc = new TgSegmentsService(fakeDirectus({ get: vi.fn() }));
    await expect(svc.previewDraft({ _and: [{ secret_field: { _eq: 1 } }] }, 'uz')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects criteria without _and/_or wrapper', async () => {
    const svc = new TgSegmentsService(fakeDirectus({ get: vi.fn() }));
    await expect(svc.previewDraft({ country: { _eq: 'uz' } }, 'uz')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns match_count + sample (no segment_id leakage)', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ count: { id: 42 } }] })
      .mockResolvedValueOnce({
        data: [{ first_name: 'Viktor', last_name: 'D' }],
      });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    const out = await svc.previewDraft({ _and: [{ country: { _eq: 'uz' } }] }, 'uz');
    expect(out).toEqual({
      match_count: 42,
      sample: [{ display_name: 'Viktor D.' }],
    });
    expect(out).not.toHaveProperty('segment_id');
  });

  it('skips sample query when count=0 (same short-circuit as preview)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [{ count: { id: 0 } }] });
    const svc = new TgSegmentsService(fakeDirectus({ get }));
    const out = await svc.previewDraft({ _and: [{ country: { _eq: 'uz' } }] }, 'uz');
    expect(out.match_count).toBe(0);
    expect(out.sample).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
