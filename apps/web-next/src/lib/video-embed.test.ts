// video-embed.test.ts — Unit tests for lib/video-embed.ts (FR-EVT-004
// gap-closure, wf-20260730-feat-155).
//
// Tests: recordingEmbedSrc (YouTube/Vimeo → nocookie-embed URL detector),
// splitRecordings (extracts embeddable `recording`-kind materials from
// the general materials list).
//
// Per standards.md §IV: AAA pattern, Vitest, no it.skip. This module has
// no Astro-frontmatter coupling and no process.env/fetch dependency, so
// (unlike api-ssr.test.ts / cms-landing-page.test.ts's local-reimplementation
// convention, which exists specifically to dodge Node-global mocking) it is
// imported directly — the whole point of extracting it per the impact
// analysis was to make it trivially unit-testable as-is.

import { describe, expect, it } from 'vitest';
import type { EventMaterial } from './types';
import { recordingEmbedSrc, splitRecordings } from './video-embed';

// ─── recordingEmbedSrc — happy paths ──────────────────────────────────────────

describe('recordingEmbedSrc — YouTube URLs', () => {
  it('converts a youtu.be short link to a nocookie embed URL', () => {
    const result = recordingEmbedSrc('https://youtu.be/dQw4w9WgXcQ');

    expect(result).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('converts a youtube.com/watch?v= URL to a nocookie embed URL', () => {
    const result = recordingEmbedSrc('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('converts a youtube.com/embed/ URL to a nocookie embed URL', () => {
    const result = recordingEmbedSrc('https://youtube.com/embed/dQw4w9WgXcQ');

    expect(result).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('converts a youtube.com/shorts/ URL to a nocookie embed URL', () => {
    const result = recordingEmbedSrc('https://youtube.com/shorts/dQw4w9WgXcQ');

    expect(result).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });

  it('accepts a youtube.com subdomain (m.youtube.com)', () => {
    const result = recordingEmbedSrc('https://m.youtube.com/watch?v=dQw4w9WgXcQ');

    expect(result).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});

describe('recordingEmbedSrc — Vimeo URLs', () => {
  it('converts a vimeo.com/<id> URL to a player.vimeo.com embed URL', () => {
    const result = recordingEmbedSrc('https://vimeo.com/123456789');

    expect(result).toBe('https://player.vimeo.com/video/123456789');
  });

  it('accepts a vimeo.com subdomain (player.vimeo.com as the host itself)', () => {
    const result = recordingEmbedSrc('https://player.vimeo.com/123456789');

    expect(result).toBe('https://player.vimeo.com/video/123456789');
  });
});

// ─── recordingEmbedSrc — failure paths ────────────────────────────────────────

describe('recordingEmbedSrc — malformed / rejected input', () => {
  it('returns null for a malformed URL string (new URL() throws)', () => {
    const result = recordingEmbedSrc('not-a-url');

    expect(result).toBeNull();
  });

  it('returns null for an empty string', () => {
    const result = recordingEmbedSrc('');

    expect(result).toBeNull();
  });

  it('returns null for a javascript: scheme URL (empty hostname falls through)', () => {
    const result = recordingEmbedSrc('javascript:alert(1)');

    expect(result).toBeNull();
  });

  it('returns null for a non-allowlisted host (e.g. dailymotion.com)', () => {
    const result = recordingEmbedSrc('https://dailymotion.com/video/x1234');

    expect(result).toBeNull();
  });

  it('returns null for a lookalike host that merely contains "vimeo" as a subdomain label of an attacker domain', () => {
    const result = recordingEmbedSrc('https://vimeo.evil.com.attacker.io/123456789');

    expect(result).toBeNull();
  });

  it('returns null for a YouTube v= param shorter than 6 chars (fails YOUTUBE_ID_PATTERN)', () => {
    const result = recordingEmbedSrc('https://www.youtube.com/watch?v=abc');

    expect(result).toBeNull();
  });

  it('returns null for youtube.com/embed/ with no id segment', () => {
    const result = recordingEmbedSrc('https://youtube.com/embed/');

    expect(result).toBeNull();
  });

  it('returns null for youtube.com with an unrecognized path segment (not embed/shorts)', () => {
    const result = recordingEmbedSrc('https://youtube.com/watch/dQw4w9WgXcQ');

    expect(result).toBeNull();
  });

  it('returns null for a Vimeo URL with a non-numeric path', () => {
    const result = recordingEmbedSrc('https://vimeo.com/abc');

    expect(result).toBeNull();
  });
});

// ─── splitRecordings — happy path ──────────────────────────────────────────────

function makeMaterial(overrides: Partial<EventMaterial>): EventMaterial {
  return {
    id: 'mat-1',
    title: 'Untitled',
    kind: 'other',
    fileUrl: null,
    url: null,
    orderIndex: 0,
    ...overrides,
  };
}

describe('splitRecordings — happy path', () => {
  it('splits one resolvable recording out of a mixed list, leaving the rest in materials', () => {
    const resolvable = makeMaterial({
      id: 'rec-resolvable',
      kind: 'recording',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const nonResolvable = makeMaterial({
      id: 'rec-non-resolvable',
      kind: 'recording',
      url: 'https://dailymotion.com/video/x1234',
    });
    const slides = makeMaterial({ id: 'mat-slides', kind: 'slides', fileUrl: '/slides.pdf' });
    const handout = makeMaterial({ id: 'mat-handout', kind: 'handout', fileUrl: '/handout.pdf' });

    const { recordings, materials } = splitRecordings([
      resolvable,
      nonResolvable,
      slides,
      handout,
    ]);

    expect(recordings).toHaveLength(1);
    expect(recordings[0]?.id).toBe('rec-resolvable');
    expect(recordings[0]?.embedSrc).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');

    expect(materials).toHaveLength(3);
    expect(materials.map((m) => m.id)).toEqual(['rec-non-resolvable', 'mat-slides', 'mat-handout']);
  });
});

// ─── splitRecordings — failure / edge paths ───────────────────────────────────

describe('splitRecordings — edge cases', () => {
  it('returns empty recordings and materials for an empty input array', () => {
    const { recordings, materials } = splitRecordings([]);

    expect(recordings).toEqual([]);
    expect(materials).toEqual([]);
  });

  it('keeps all items in materials when no recording-kind item resolves to an embed', () => {
    const nonResolvable1 = makeMaterial({
      id: 'rec-1',
      kind: 'recording',
      url: 'https://dailymotion.com/video/x1',
    });
    const nonResolvable2 = makeMaterial({
      id: 'rec-2',
      kind: 'recording',
      url: 'not-a-url',
    });

    const { recordings, materials } = splitRecordings([nonResolvable1, nonResolvable2]);

    expect(recordings).toEqual([]);
    expect(materials).toHaveLength(2);
    expect(materials.map((m) => m.id)).toEqual(['rec-1', 'rec-2']);
  });

  it('skips a recording-kind item with a null url, leaving it in materials', () => {
    const nullUrlRecording = makeMaterial({ id: 'rec-null-url', kind: 'recording', url: null });

    const { recordings, materials } = splitRecordings([nullUrlRecording]);

    expect(recordings).toEqual([]);
    expect(materials).toHaveLength(1);
    expect(materials[0]?.id).toBe('rec-null-url');
  });
});
