// L1 — pure helpers for turning a recording/livestream URL into a
// privacy-friendly embed URL, or splitting "recording" materials off
// from the general materials list.
//
// Port of V1's inline `recordingEmbedSrc` (apps/web/src/pages/events/[id].astro
// lines ~59-84) extracted to a standalone module per the impact
// analysis's recommendation (easily unit-testable pure function, no
// Astro frontmatter coupling needed). Used by both the Live-tab
// livestream panel and the Finished-tab recordings list.

import type { EventMaterial } from './types';

const YOUTUBE_ID_PATTERN = /^[\w-]{6,}$/;

/**
 * Detects YouTube / Vimeo URLs and turns them into privacy-friendly
 * embed URLs (youtube-nocookie.com so no tracking cookie is set until
 * the user hits Play). Anything else returns null and the caller falls
 * back to a click-through link.
 */
export function recordingEmbedSrc(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();

  if (host === 'youtu.be') {
    const ytId = parsed.pathname.slice(1).split('/')[0] ?? '';
    return YOUTUBE_ID_PATTERN.test(ytId) ? `https://www.youtube-nocookie.com/embed/${ytId}` : null;
  }

  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    const v = parsed.searchParams.get('v');
    if (v && YOUTUBE_ID_PATTERN.test(v)) return `https://www.youtube-nocookie.com/embed/${v}`;
    const segs = parsed.pathname.split('/').filter(Boolean);
    const kind = segs[0];
    const videoId = segs[1];
    if (
      (kind === 'embed' || kind === 'shorts') &&
      videoId !== undefined &&
      YOUTUBE_ID_PATTERN.test(videoId)
    ) {
      return `https://www.youtube-nocookie.com/embed/${videoId}`;
    }
    return null;
  }

  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    const m = parsed.pathname.match(/^\/(\d+)/);
    return m?.[1] ? `https://player.vimeo.com/video/${m[1]}` : null;
  }

  return null;
}

export interface RecordingMaterial extends EventMaterial {
  embedSrc: string;
}

export interface SplitMaterials {
  /** `recording`-kind materials that resolved to an embeddable URL. */
  recordings: RecordingMaterial[];
  /** Everything else, including recordings that didn't resolve to an embed. */
  materials: EventMaterial[];
}

/**
 * Splits embeddable recordings out of the general materials list so
 * the Finished tab can render them as inline video players instead of
 * plain pill links. A `recording`-kind material without a resolvable
 * embed URL (unrecognized host) stays in `materials` as a click-through
 * pill — same fallback V1 uses.
 */
export function splitRecordings(allMaterials: EventMaterial[]): SplitMaterials {
  const recordings: RecordingMaterial[] = [];
  const recordingIds = new Set<string>();
  for (const m of allMaterials) {
    if (m.kind !== 'recording' || m.url == null) continue;
    const embedSrc = recordingEmbedSrc(m.url);
    if (!embedSrc) continue;
    recordings.push({ ...m, embedSrc });
    recordingIds.add(m.id);
  }
  const materials = allMaterials.filter((m) => !recordingIds.has(m.id));
  return { recordings, materials };
}
