// F-S3.9 — client-side attribution: resolve ?ref= + capture UTM into
// long-lived cookies that the registration submit reads.
//
// Two cookies (90-day TTL each):
//   aiqadam-ref-owner  → owner_user_id resolved from /api/v1/referrals/resolve
//   aiqadam-attribution → JSON { first_touch: {utm_*, ts}, last_touch: {...} }
//
// First-touch is set once and never overwritten (the original discovery
// channel). Last-touch is overwritten on every visit with UTM params.
// Per marketing playbook §16.3.

const REF_COOKIE = 'aiqadam-ref-owner';
const ATTR_COOKIE = 'aiqadam-attribution';
const COOKIE_TTL_SECONDS = 90 * 24 * 60 * 60;

interface TouchPoint {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  ts: string;
}

interface Attribution {
  first_touch?: TouchPoint;
  last_touch?: TouchPoint;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export interface ResolvedAttribution {
  referredBy: string | null;
  acquisitionSource: Attribution | null;
}

/**
 * Read what's currently stored so registration submits can include it.
 * Pure read — never resolves codes or makes network calls.
 */
export function readAttribution(): ResolvedAttribution {
  if (typeof document === 'undefined') return { referredBy: null, acquisitionSource: null };
  const referredBy = readCookie(REF_COOKIE);
  const raw = readCookie(ATTR_COOKIE);
  let acquisitionSource: Attribution | null = null;
  if (raw) {
    try {
      acquisitionSource = JSON.parse(raw) as Attribution;
    } catch {
      acquisitionSource = null;
    }
  }
  return { referredBy: referredBy || null, acquisitionSource };
}

/**
 * Idempotent landing-page hook. Reads window.location.search; if there's
 * a ?ref= or any utm_*, persists/updates the cookies. Resolves ?ref= via
 * POST /api/v1/referrals/resolve. Self-call-safe; designed to run once
 * per page load in a top-level script tag.
 */
export async function captureLandingAttribution(): Promise<void> {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  await maybeCaptureUtm(params);
  await maybeResolveRef(params);
}

async function maybeCaptureUtm(params: URLSearchParams): Promise<void> {
  const touch = readTouchFromParams(params);
  if (!touch) return;
  const current = readAttribution().acquisitionSource ?? {};
  const next: Attribution = { ...current };
  if (!next.first_touch) next.first_touch = touch;
  next.last_touch = touch;
  writeCookie(ATTR_COOKIE, JSON.stringify(next));
}

async function maybeResolveRef(params: URLSearchParams): Promise<void> {
  const ref = params.get('ref');
  if (!ref) return;
  try {
    const r = await fetch('/api/v1/referrals/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: ref }),
    });
    if (!r.ok) return;
    const { ownerUserId } = (await r.json()) as { ownerUserId: string | null };
    if (ownerUserId) writeCookie(REF_COOKIE, ownerUserId);
  } catch {
    // network blip; the ref param stays in the URL — visitor can re-share
  }
}

function readTouchFromParams(params: URLSearchParams): TouchPoint | null {
  const partial: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  let any = false;
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v) {
      partial[key] = v;
      any = true;
    }
  }
  if (!any) return null;
  return { ...partial, ts: new Date().toISOString() };
}

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return '';
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  const v = encodeURIComponent(value);
  document.cookie = `${name}=${v}; max-age=${COOKIE_TTL_SECONDS}; path=/; samesite=lax`;
}
