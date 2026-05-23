import { describe, expect, it } from 'vitest';
import { type AttendeeForMatch, rankCandidates } from '../src/modules/workspace/match-algorithm';

// F-S1.5b ext — canonical job-title + connection-dedup behaviour of
// the shared ranker. F-S1.5b's exact-string-match + tag-overlap path
// stays covered by the service-level specs.

function person(
  id: string,
  firstName: string,
  jobTitle: string | null,
  canonical: string | null,
): AttendeeForMatch {
  return {
    user: {
      id,
      first_name: firstName,
      job_title: jobTitle,
      job_title_canonical: canonical,
    },
  };
}

const NO_TAGS = new Map<string, Set<string>>();
const NO_CONN = new Set<string>();

describe('rankCandidates — F-S1.5b ext job-title taxonomy', () => {
  it('canonical match (2 pts) outranks raw-only match (1 pt)', async () => {
    const me = {
      myJobTitle: 'ML Eng',
      myJobTitleCanonical: 'ml_engineer',
      alreadyConnected: NO_CONN,
    };
    const others = [
      person('o-canonical', 'Aigerim', 'Machine Learning Engineer', 'ml_engineer'),
      person('o-raw', 'Bek', 'ml eng', null), // raw exact match only
      person('o-none', 'Chyngyz', 'Founder', 'founder'),
    ];
    const ranked = rankCandidates(others, NO_TAGS, new Set(), me);
    expect(ranked[0]?.userId).toBe('o-canonical');
    expect(ranked[0]?.jobTitleMatchKind).toBe('canonical');
    expect(ranked[1]?.userId).toBe('o-raw');
    expect(ranked[1]?.jobTitleMatchKind).toBe('raw');
    expect(ranked[2]?.userId).toBe('o-none');
    expect(ranked[2]?.jobTitleMatchKind).toBe('none');
  });

  it("'other' canonical value carries no signal (treated as unset)", async () => {
    const me = { myJobTitle: null, myJobTitleCanonical: 'other', alreadyConnected: NO_CONN };
    const others = [person('o-other', 'X', null, 'other')];
    const ranked = rankCandidates(others, NO_TAGS, new Set(), me);
    expect(ranked[0]?.jobTitleMatchKind).toBe('none');
  });

  it('falls back to raw-string when one side has no canonical', async () => {
    const me = { myJobTitle: 'Founder', myJobTitleCanonical: null, alreadyConnected: NO_CONN };
    const others = [
      person('o-raw', 'A', 'Founder', null),
      person('o-canon-only', 'B', null, 'founder'),
    ];
    const ranked = rankCandidates(others, NO_TAGS, new Set(), me);
    // o-raw matches via raw string; o-canon-only can't match (my canonical
    // is null, so canonical comparison fails; my raw='Founder' but theirs='' raw).
    expect(ranked[0]?.userId).toBe('o-raw');
    expect(ranked[0]?.jobTitleMatchKind).toBe('raw');
    expect(ranked[1]?.jobTitleMatchKind).toBe('none');
  });
});

describe('rankCandidates — F-S1.5b ext connection dedup', () => {
  it('demotes an already-connected candidate below an equal-strength fresh one', async () => {
    const me = {
      myJobTitle: 'ML Eng',
      myJobTitleCanonical: 'ml_engineer',
      alreadyConnected: new Set(['o-met']),
    };
    const others = [
      // both have canonical match; only one is already connected
      person('o-met', 'Aigerim', 'ML Eng', 'ml_engineer'),
      person('o-fresh', 'Bek', 'ML Eng', 'ml_engineer'),
    ];
    const ranked = rankCandidates(others, NO_TAGS, new Set(), me);
    expect(ranked[0]?.userId).toBe('o-fresh'); // 2 pts
    expect(ranked[0]?.alreadyConnected).toBe(false);
    expect(ranked[1]?.userId).toBe('o-met'); // 2 * 0.5 = 1 pt
    expect(ranked[1]?.alreadyConnected).toBe(true);
  });

  it('does not eliminate already-connected — keeps them for thin audiences', async () => {
    const me = {
      myJobTitle: null,
      myJobTitleCanonical: null,
      alreadyConnected: new Set(['o-met']),
    };
    const others = [person('o-met', 'Aigerim', null, null)];
    const ranked = rankCandidates(others, NO_TAGS, new Set(), me);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.userId).toBe('o-met');
    expect(ranked[0]?.alreadyConnected).toBe(true);
  });

  it('fresh canonical match beats already-connected canonical-AND-tag overlap (when penalty kicks in)', async () => {
    // already-connected has tag overlap (2 pts) + canonical (2 pts) = 4 * 0.5 = 2
    // fresh has canonical only = 2
    // tie → name tiebreak. Pick 'A' over 'B'.
    const me = {
      myJobTitle: 'ML Eng',
      myJobTitleCanonical: 'ml_engineer',
      alreadyConnected: new Set(['o-met']),
    };
    const tags = new Map([['o-met', new Set(['mlops'])]]);
    const others = [
      person('o-met', 'Aliya', 'ML Eng', 'ml_engineer'),
      person('o-fresh', 'Bek', 'ML Eng', 'ml_engineer'),
    ];
    const ranked = rankCandidates(others, tags, new Set(['mlops']), me);
    // o-met score: (1 shared tag * 2) + canonical 2 = 4 → *0.5 = 2
    // o-fresh score: canonical 2 = 2 → tie. Name tiebreak: Aliya before Bek.
    expect(ranked[0]?.userId).toBe('o-met');
    expect(ranked[1]?.userId).toBe('o-fresh');
  });
});
