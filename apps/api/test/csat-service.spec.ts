import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { CsatService } from '../src/modules/workspace/csat.service';

// F-S1.2 + F-S1.3 — CsatService is a JWT mint/verify + Directus REST proxy.
// Tests mock the Directus client; JWT secret comes from the real env
// (set globally for the test process by config/env).

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: CsatService;

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new CsatService(dx as unknown as DirectusClient);
});

describe('CsatService — token round-trip', () => {
  it('mints + verifies its own token', async () => {
    const token = await svc.mintToken('del-1');
    const claims = await svc.verifyToken(token);
    expect(claims?.sub).toBe('del-1');
  });

  it('rejects garbage tokens', async () => {
    expect(await svc.verifyToken('not.a.real.jwt')).toBeNull();
  });
});

describe('CsatService.submit', () => {
  it('rejects out-of-range rating with BadRequest', async () => {
    const token = await svc.mintToken('del-1');
    await expect(svc.submit({ token, rating: 6 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.submit({ token, rating: 0 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records response + patches delivery on first submission', async () => {
    const token = await svc.mintToken('del-1');
    dx.get.mockResolvedValueOnce({
      data: {
        id: 'del-1',
        responded_at: null,
        interaction: { id: 'i-1', payload: { event_id: 'evt-1' } },
      },
    });
    dx.patch.mockResolvedValueOnce({ data: { id: 'del-1' } });
    dx.post.mockResolvedValueOnce({ data: { id: 'resp-1' } });

    const result = await svc.submit({ token, rating: 5, comment: 'great talks' });

    expect(result).toEqual({ accepted: true });
    expect(dx.patch.mock.calls[0]?.[0]).toBe('/items/interaction_deliveries/del-1');
    const patchBody = dx.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patchBody.state).toBe('responded');
    expect(patchBody.responded_at).toBeTypeOf('string');

    const insertBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(insertBody.delivery).toBe('del-1');
    expect(insertBody.response_intent).toBe('csat_score');
    expect(insertBody.event).toBe('evt-1');
    expect(insertBody.payload).toEqual({ rating: 5, comment: 'great talks' });
  });

  it('returns already_responded when delivery already has responded_at', async () => {
    const token = await svc.mintToken('del-1');
    dx.get.mockResolvedValueOnce({
      data: { id: 'del-1', responded_at: '2026-06-15T00:00:00.000Z', interaction: null },
    });

    const result = await svc.submit({ token, rating: 4 });
    expect(result).toEqual({ accepted: false, reason: 'already_responded' });
    expect(dx.patch).not.toHaveBeenCalled();
    expect(dx.post).not.toHaveBeenCalled();
  });

  it('returns invalid_token for bogus jwt', async () => {
    const result = await svc.submit({ token: 'rubbish', rating: 5 });
    expect(result).toEqual({ accepted: false, reason: 'invalid_token' });
  });

  it('returns delivery_not_found when token verifies but delivery missing', async () => {
    const token = await svc.mintToken('del-missing');
    dx.get.mockRejectedValueOnce(new Error('404'));
    const result = await svc.submit({ token, rating: 5 });
    expect(result).toEqual({ accepted: false, reason: 'delivery_not_found' });
  });

  it('strips empty comment + writes null event when interaction payload has none', async () => {
    const token = await svc.mintToken('del-2');
    dx.get.mockResolvedValueOnce({
      data: { id: 'del-2', responded_at: null, interaction: { id: 'i-2', payload: {} } },
    });
    dx.patch.mockResolvedValueOnce({ data: { id: 'del-2' } });
    dx.post.mockResolvedValueOnce({ data: { id: 'resp-2' } });

    await svc.submit({ token, rating: 3, comment: '   ' });

    const insertBody = dx.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(insertBody.event).toBeNull();
    expect(insertBody.payload).toEqual({ rating: 3 });
  });
});

describe('CsatService.summaryForEvent', () => {
  it('returns aggregate + distribution + comments, ignoring junk rating rows', async () => {
    dx.get
      .mockResolvedValueOnce({
        data: [
          { payload: { rating: 5, comment: 'great' }, received_at: '2026-06-15T01:00:00.000Z' },
          { payload: { rating: 4 }, received_at: '2026-06-15T01:01:00.000Z' },
          {
            payload: { rating: 5, comment: 'best so far' },
            received_at: '2026-06-15T01:02:00.000Z',
          },
          { payload: { rating: 'not a number' }, received_at: '2026-06-15T01:03:00.000Z' },
          { payload: {}, received_at: '2026-06-15T01:04:00.000Z' },
          { payload: { rating: 7 }, received_at: '2026-06-15T01:05:00.000Z' }, // out of range
        ],
      })
      .mockResolvedValueOnce({ meta: { filter_count: 10 }, data: [] });

    const summary = await svc.summaryForEvent('evt-1');

    expect(summary.eventId).toBe('evt-1');
    expect(summary.count).toBe(3);
    expect(summary.delivered).toBe(10);
    expect(summary.avg).toBeCloseTo((5 + 4 + 5) / 3, 5);
    expect(summary.distribution[5]).toBe(2);
    expect(summary.distribution[4]).toBe(1);
    expect(summary.distribution[1]).toBe(0);
    expect(summary.responseRate).toBeCloseTo(0.3, 5);
    expect(summary.comments).toHaveLength(2);
    expect(summary.comments[0]?.comment).toBe('great');
  });

  it('returns zero counts + null avg + zero rate when no responses', async () => {
    dx.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ meta: { filter_count: 0 }, data: [] });

    const summary = await svc.summaryForEvent('evt-empty');
    expect(summary.count).toBe(0);
    expect(summary.avg).toBeNull();
    expect(summary.responseRate).toBe(0);
    expect(summary.delivered).toBe(0);
  });
});
