# Step 5: Security Review

**Workflow:** wf-20260731-fix-167
**Files reviewed:** `apps/web-next/src/lib/cms.ts` (registeredCountOf + fetchEvent diff)

## Invariant checks

| Invariant | Verdict | Notes |
|---|---|---|
| No string-concatenated queries / injection | Pass | `URLSearchParams` encodes `eventId` as a param value; no raw string interpolation into a Directus filter expression. Same idiom as every other fetcher in this file. |
| No new PII / data exposure | Pass | Returns only an integer count. `registeredCountOf` is called with `body.data.id` (the already-fetched, already-gated event row's own id) — not raw client input — and only after the publish/country visibility gate has already passed. No new field is exposed that wasn't already computable by an authenticated actor with existing endpoints. |
| No new authentication/authorization surface | Pass | Read-only aggregate query, same trust boundary as the rest of `fetchEvent()` (public SSR event-detail page). No write path touched. |
| Error handling doesn't leak internals | Pass | `catch` logs to server console only (`console.error`), returns a plain `0` to the caller — no stack trace or Directus error body reaches the client. |
| Rate limiting / DoS | N/A | No new public endpoint added; this is an internal SSR fetch helper, same call volume as the existing `fetchEvent` (one extra Directus round-trip per event-detail page load, not attacker-controllable beyond what already existed). |
| Secrets | Pass | No secrets touched; uses the existing `directusBase()`/`get()` helpers unchanged. |

## Findings

None. Zero BLOCKER, zero MAJOR.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T07:16:00Z"
  summary: "No BLOCKER/MAJOR findings. Read-only aggregate count query, encoded via URLSearchParams, gated behind the existing publish/country visibility check, no new data exposure."
  findings: []
