// S0.4 — Plausible custom events for operational signals
// (auth.failed, dispatch.failed, rbac.denied).
//
// Plausible's Events API: POST <host>/api/event with a synthetic URL.
// https://plausible.io/docs/events-api
// We self-host at analytics.aiqadam.org; the API contract is identical.
//
// Three rules for this helper:
//   1. Never throw — observability MUST NOT break the request path. On
//      network/timeout/non-2xx, log and swallow.
//   2. Never block. fire-and-forget Promise via Node's global fetch (no
//      await in callers). Callers can `void track(...)`.
//   3. Bounded: 1-second timeout; if Plausible is down, drop the event.
//
// is_test_user routing is a TODO — the email-adapter S0.1 routing pattern
// will be ported here once that ships. For now every event is emitted;
// the Plausible dashboard can filter by props.

import { env } from '../config/env';

const PLAUSIBLE_URL = `${env.PLAUSIBLE_HOST}/api/event`;
const PLAUSIBLE_DOMAIN = 'aiqadam.org';
const TIMEOUT_MS = 1_000;

// Synthetic URL per event so Plausible's URL-grouped views still make sense.
// /__ops__/* is excluded from Plausible's public dashboards via a filter.
function syntheticUrl(name: string): string {
  return `https://aiqadam.org/__ops__/${name}`;
}

export interface OpsEventProps {
  // Free-form string properties — Plausible accepts up to 30 chars per
  // key, 2000 per value. Keep them small. Numbers stringified.
  [key: string]: string | number | undefined;
}

/**
 * Emit a Plausible custom event. Fire-and-forget; never throws.
 *
 * @example
 * void track('auth.failed', { reason: 'invalid_state', country: 'uz' });
 */
export async function track(name: string, props: OpsEventProps = {}): Promise<void> {
  if (!env.PLAUSIBLE_HOST) {
    // Plausible disabled in this env (dev / test). No-op.
    return;
  }

  // Plausible's props value must be a string (or boolean/number per their
  // newer docs — we stringify everything to be conservative).
  const stringifiedProps: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) stringifiedProps[k] = String(v);
  }

  const body = JSON.stringify({
    name,
    url: syntheticUrl(name),
    domain: PLAUSIBLE_DOMAIN,
    props: Object.keys(stringifiedProps).length > 0 ? stringifiedProps : undefined,
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(PLAUSIBLE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Plausible requires a User-Agent header on the events endpoint.
        // We pick a stable string so this traffic is identifiable.
        'user-agent': 'AIQadamOpsEvents/1.0',
      },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // 202 Accepted is the happy path; anything else is suspicious but
      // not request-path-fatal.
      // eslint-disable-next-line no-console
      console.warn(`[ops-events] plausible POST ${name} returned ${res.status}`);
    }
  } catch (err) {
    // Network error, timeout (AbortError), or Plausible unreachable.
    // Log and swallow — observability MUST NOT break the caller.
    // eslint-disable-next-line no-console
    console.warn(
      `[ops-events] plausible POST ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
