import { describe, expect, it } from 'vitest';
import { ApprovalsService } from '../src/modules/workspace/approvals.service';

// F-S3.7 — empty-shell v1. No sources are wired, so list() always
// returns items=[] and a static sources roadmap. When a source flips to
// ready=true (sponsor F-S3.5, speaker F-S4.x, dispatcher-flag PR), add
// a test alongside the loader.

describe('ApprovalsService.list (v1 empty shell)', () => {
  const svc = new ApprovalsService();

  it('returns an empty items array', async () => {
    const result = await svc.list();
    expect(result.items).toEqual([]);
  });

  it('reports all three expected sources, all not ready', async () => {
    const result = await svc.list();
    const kinds = result.sources.map((s) => s.kind).sort();
    expect(kinds).toEqual([
      'operator_assisted_interaction',
      'speaker_proposal',
      'sponsor_onboarding',
    ]);
    expect(result.sources.every((s) => s.ready === false)).toBe(true);
  });

  it('every source has a non-empty roadmap note', async () => {
    const result = await svc.list();
    for (const s of result.sources) {
      expect(s.note.length).toBeGreaterThan(10);
    }
  });
});
