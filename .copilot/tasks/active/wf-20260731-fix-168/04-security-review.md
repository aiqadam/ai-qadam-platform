# Step 5: Security Review

**Workflow:** wf-20260731-fix-168

## Invariant checks

| Invariant | Verdict | Notes |
|---|---|---|
| No string-concatenated queries / injection | Pass | `event-registration-count.controller.ts` uses `encodeURIComponent(JSON.stringify(...))` for the Directus filter — same idiom as every sibling `apps/api` service (`event-speaker-briefs.service.ts`, `checkin-events.controller.ts`). `ParseUUIDPipe` on `:id` rejects non-UUID input before it reaches the query. |
| No new data exposure | Pass | The new endpoint returns only `{ registeredCount: number }` — a derived integer, never row-level `registrations` data (no user ids, no per-row status). This is the entire point of the fix: proxy the count without exposing who registered. |
| Authorization boundary preserved | Pass | The endpoint is intentionally public (matches `checkin-events.controller.ts`'s precedent) — same trust level as the public event-detail page itself. It does NOT grant Directus Public role any new permission; the count is computed server-side by `apps/api`'s own already-authenticated `DirectusClient`. `ISS-RBAC-PERMS-001`/`ISS-SEC-PUBLIC-UNMANAGED-001`'s hardening of the `registrations` collection is fully preserved — no permission row changed. |
| Error handling doesn't leak internals | Pass | `fetchEventRegistrationCount` (web-next side) catches and logs server-side only, returns `0` to the caller. `event-registration-count.controller.ts` lets a Directus failure propagate as a standard NestJS 5xx (no custom leaking behavior) — same convention as the rest of the module. |
| RegistrationCTA prop fix | Pass | Passing pre-formatted strings instead of functions removes a class of prop-serialization footgun; no new data exposure (the strings are the same translated text that was already being computed server-side, just not re-executed as a function). |
| use-registrations.ts endpoint fix | Pass | `/v1/registrations/mine` is the existing, already-`AuthGuard`-protected route (`registrations.controller.ts:127`) — scoped to `requireUserId(req)`, i.e. the caller's own registrations only. No new surface; this fix only corrects the client to call the endpoint that was always intended. |
| Rate limiting / DoS | N/A | New endpoint inherits the existing global `ThrottlerModule` rate limit (`app.module.ts`) — no per-route override needed, consistent with `checkin-events.controller.ts`. |
| Secrets | Pass | No secrets touched. |

## Findings

None. Zero BLOCKER, zero MAJOR.

## Gate Result

gate_result:
  status: passed
  attempt: 1
  timestamp: "2026-07-31T09:24:00Z"
  summary: "No BLOCKER/MAJOR findings. New endpoint exposes only a derived count, preserves the ISS-RBAC-PERMS-001/ISS-SEC-PUBLIC-UNMANAGED-001 permission boundary; other two fixes correct pre-existing client-side bugs with no new data exposure."
  findings: []
