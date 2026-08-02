// event-lifecycle-tab.test.ts — Unit tests for the lifecycle-tab default
// derivation currently inline in
// apps/web-next/src/pages/events/[id].astro (lines ~106-110), FR-EVT-004
// gap-closure (wf-20260730-feat-155).
//
// This logic lives in Astro page frontmatter, which Vitest cannot import
// directly (no .astro test convention exists anywhere in this repo — see
// the empty result of a repo-wide search for one). Re-implemented locally
// as a pure function mirroring the page's exact expression, matching the
// established local-reimplementation convention already used by
// api-ssr.test.ts and cms-landing-page.test.ts for similar
// frontmatter/env-coupling reasons.
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip.

import { describe, expect, it } from 'vitest';

type EventDetailTab = 'upcoming' | 'live' | 'finished' | 'forum';

// Mirrors [id].astro's `defaultTab` derivation (defensive-fallback
// contract — see ISS-EVT-LIFECYCLE-TAB-001). The inline Astro logic
// guards `now >= endsAtMs` and `now >= startsAtMs` with
// `Number.isNaN(...)` so an unparseable ISO string cannot accidentally
// trigger a "finished" verdict purely because the OTHER date still
// parses — Date.parse returns NaN for a bad string, and any comparison
// with NaN is false, but the naive ternary's first branch would still
// win whenever the unrelated date is past. Re-implemented here as a
// pure function so Vitest can exercise it without going through the
// .astro frontmatter.
//
// Contract:
//   • both dates parseable: 'finished' if past endsAt, else 'live' if
//     past startsAt, else 'upcoming'
//   • only startsAt unparseable: ALWAYS 'upcoming' — an event with a
//     broken startsAt cannot confidently be marked finished
//   • only endsAt unparseable: 'live' if past startsAt, else 'upcoming'
//     (`now >= NaN` is false so 'finished' is unreachable)
//   • both unparseable: 'upcoming' (both NaN comparisons false)
function deriveDefaultTab(now: number, startsAt: string, endsAt: string): EventDetailTab {
  const startsAtMs = Date.parse(startsAt);
  const endsAtMs = Date.parse(endsAt);
  const startsAtValid = !Number.isNaN(startsAtMs);
  const endsAtValid = !Number.isNaN(endsAtMs);
  if (startsAtValid && endsAtValid && now >= endsAtMs) return 'finished';
  if (startsAtValid && now >= startsAtMs) return 'live';
  return 'upcoming';
}

const START = '2026-08-01T10:00:00.000Z';
const END = '2026-08-01T14:00:00.000Z';
const startMs = Date.parse(START);
const endMs = Date.parse(END);

describe('lifecycle-tab default derivation — comfortably-before/after cases', () => {
  it('resolves to "upcoming" when now is well before startsAt', () => {
    const result = deriveDefaultTab(startMs - 60 * 60 * 1000, START, END);

    expect(result).toBe('upcoming');
  });

  it('resolves to "live" when now is well between startsAt and endsAt', () => {
    const midpoint = startMs + (endMs - startMs) / 2;

    const result = deriveDefaultTab(midpoint, START, END);

    expect(result).toBe('live');
  });

  it('resolves to "finished" when now is well after endsAt', () => {
    const result = deriveDefaultTab(endMs + 60 * 60 * 1000, START, END);

    expect(result).toBe('finished');
  });
});

describe('lifecycle-tab default derivation — exact boundary conditions', () => {
  // These pin down current, deliberate behavior: the `>=` comparisons make
  // both boundaries inclusive on the LATER state. This is a spec decision
  // worth calling out explicitly (per the test strategy's flag) rather
  // than assuming it's "obviously" correct — a naive reading of "at the
  // exact end instant" could equally argue for 'live'. The code as
  // written (and as tested here) picks 'finished'.
  it('resolves to "live" (not "upcoming") when now === startsAt exactly', () => {
    const result = deriveDefaultTab(startMs, START, END);

    expect(result).toBe('live');
  });

  it('resolves to "finished" (not "live") when now === endsAt exactly', () => {
    const result = deriveDefaultTab(endMs, START, END);

    expect(result).toBe('finished');
  });
});

describe('lifecycle-tab default derivation — malformed date defensive fallback', () => {
  it('degrades to "upcoming" (not a throw) when both startsAt and endsAt are unparseable', () => {
    // Date.parse() on a bad ISO string returns NaN; `now >= NaN` is always
    // false in JS, so both comparisons fall through to the 'upcoming'
    // default rather than throwing. ApiEvent types startsAt/endsAt as
    // required strings, but a Directus data-quality issue could still
    // produce a bad ISO string reaching this code path.
    const result = deriveDefaultTab(Date.now(), 'not-a-date', 'also-not-a-date');

    expect(result).toBe('upcoming');
  });

  it('falls through to "live" when only endsAt is unparseable and now is past startsAt', () => {
    // endsAtMs is NaN, so `now >= NaN` is always false and the 'finished'
    // branch can never trigger — but the 'live' branch still evaluates
    // normally against the (valid) startsAt, so this degrades to 'live'
    // rather than 'finished' or a throw. A genuinely stuck "always live"
    // event (this is the state that occurs if endsAt is bad) is a lesser
    // failure than a crash or a false 'finished'.
    const result = deriveDefaultTab(startMs + 1000, START, 'not-a-date');

    expect(result).toBe('live');
  });

  it('degrades to "upcoming" when only endsAt is unparseable and now is still before startsAt', () => {
    const result = deriveDefaultTab(startMs - 1000, START, 'not-a-date');

    expect(result).toBe('upcoming');
  });

  it('degrades to "upcoming" when only startsAt is unparseable', () => {
    const result = deriveDefaultTab(Date.now(), 'not-a-date', END);

    expect(result).toBe('upcoming');
  });
});
