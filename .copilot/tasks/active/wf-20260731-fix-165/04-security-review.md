# Step 5 — Security Review

## Scope

`apps/api/src/modules/registrations/registrations-directus.service.ts`:
bounded poll (3 attempts, 150ms apart) added around an existing internal
re-read. No new external input, no new endpoint, no new auth/authz path,
no new data returned to the client (same `RegistrationView` shape).

## Invariant checks

| Invariant | Verdict | Note |
|---|---|---|
| Input validation at boundaries | N/A | No new input — `registrationId` is the id this same method just created, not attacker-controlled. |
| Parameterized queries / no injection | Pass | Directus REST client, same `GET /items/registrations/:id` call shape already in use. |
| No secrets logged | Pass | No new logging added. |
| Rate limiting on public endpoints | N/A | Endpoint (`POST /events/:id/register`) is unchanged; this only affects internal timing before the existing response is sent. |
| Authn/authz enforced at controller | N/A | No controller/guard change. |
| DoS / resource exhaustion | Pass | Bounded loop (hard cap 3 iterations, `SETTLE_POLL_MAX_ATTEMPTS`), no unbounded retry, no recursion. Adds at most 300ms of extra latency (2 delays) to one request path — negligible amplification, and only on the already-rare at/near-capacity path. |
| Fail-safe behavior preserved | Pass | On any read failure, `DirectusClient` throws `DirectusError` same as before (no new try/catch swallowing errors) — the method's existing error-propagation behavior is unchanged, just re-entered up to 3 times instead of once. |

## Verdict

No BLOCKER/MAJOR findings. This is a timing-only change with no new
attack surface. Pass.

## Gate

`passed` → Step 6 (Test Strategy).
