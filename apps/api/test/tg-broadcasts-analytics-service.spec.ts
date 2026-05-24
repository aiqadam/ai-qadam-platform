import { describe, expect, it } from 'vitest';
import { rowsToAnalytics } from '../src/modules/workspace/tg-broadcasts-analytics.service';

// #294 PR-e — analytics aggregation. The DB query is exercised behind
// the Testcontainers integration tests already in this repo; here we
// cover the pure aggregator.

describe('rowsToAnalytics', () => {
  it('returns zeroed shape for empty rows', () => {
    const out = rowsToAnalytics('bdc-1', []);
    expect(out).toEqual({
      broadcast_id: 'bdc-1',
      delivered: 0,
      opted_out: 0,
      failed: 0,
      pending: 0,
      total_audited: 0,
    });
  });

  it('maps sent → delivered', () => {
    const out = rowsToAnalytics('bdc-1', [{ outcome: 'sent', count: 247 }]);
    expect(out.delivered).toBe(247);
    expect(out.total_audited).toBe(247);
  });

  it('maps opted_out separately from failed', () => {
    const out = rowsToAnalytics('bdc-1', [
      { outcome: 'sent', count: 200 },
      { outcome: 'opted_out', count: 12 },
    ]);
    expect(out.opted_out).toBe(12);
    expect(out.failed).toBe(0);
  });

  it('lumps bad_request / blocked / expired / unknown_error into failed', () => {
    const out = rowsToAnalytics('bdc-1', [
      { outcome: 'bad_request', count: 3 },
      { outcome: 'blocked', count: 5 },
      { outcome: 'expired', count: 1 },
      { outcome: 'unknown_error', count: 2 },
    ]);
    expect(out.failed).toBe(11);
  });

  it('counts retry as pending', () => {
    const out = rowsToAnalytics('bdc-1', [{ outcome: 'retry', count: 7 }]);
    expect(out.pending).toBe(7);
    expect(out.failed).toBe(0);
  });

  it('accepts count as string (Drizzle ::text cast)', () => {
    const out = rowsToAnalytics('bdc-1', [{ outcome: 'sent', count: '99' }]);
    expect(out.delivered).toBe(99);
  });

  it('sums total_audited across all outcomes', () => {
    const out = rowsToAnalytics('bdc-1', [
      { outcome: 'sent', count: 100 },
      { outcome: 'opted_out', count: 5 },
      { outcome: 'blocked', count: 3 },
      { outcome: 'retry', count: 2 },
    ]);
    expect(out.total_audited).toBe(110);
  });
});
