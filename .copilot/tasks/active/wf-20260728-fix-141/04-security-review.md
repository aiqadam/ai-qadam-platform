# Step 5: Security Review — wf-20260728-fix-141

## Scope

`apps/api/src/modules/me-profile/{me-profile.service.ts,me-profile.controller.ts}`,
`apps/api/src/modules/members/{onboarding.controller.ts,onboarding.service.ts}`,
`apps/api/src/modules/referrals/referrals.controller.ts`.

## Invariants checked (AGENTS.md §5, `docs/04-development/security/security.md`)

- **Resource ownership / self-scoping (security.md §Authorization):**
  unchanged. Every method still derives its acting identity exclusively
  from `req.user.sub` / `req.user.email` — both come from the verified
  JWT claims set by `AuthGuard`, never from client-supplied body/query
  params. The fix adds a second JWT-derived field (`email`) to the same
  trust boundary that `sub` already came from; it does not introduce any
  new client-controlled input. A member still can only ever resolve
  their *own* Directus row (bridge keys off their own `userId`), so this
  fix does not create a path to another member's profile/consents/skills.
- **No new client input surface:** no new `@Body()`/`@Param()`/`@Query()`
  decorators were added anywhere in this diff. `email` flows
  controller→service entirely from `req.user`, never from request body.
- **No SQL/query injection:** `DirectusUsersBridgeService.ensureLinked`
  (pre-existing, unchanged) uses Drizzle's parameterized `eq()` for the
  local DB lookup and encodes the email via the existing
  `encodeURIComponent` pattern for the Directus REST call — both
  pre-existing, unmodified code paths.
- **No secrets logged:** `resolveDirectusId`'s only log path is the
  pre-existing `DirectusUsersBridgeService.ensureLinked`'s own
  `logger.warn` on failure, which logs the reason string, not tokens or
  credentials — unchanged by this PR.
- **Error handling does not leak information:** `resolveDirectusId`
  throws a generic `NotFoundException('directus profile not found for
  this member')` on bridge failure — does not leak Directus internals,
  Directus ids, or distinguish "no local row" from "Directus API error"
  to the caller (both collapse to the same 404).
- **Rate limiting / CSRF:** unchanged — this fix does not touch any
  route decorators, guards, or the global throttle config.

## Findings

None (BLOCKER, MAJOR, or MINOR). This is a same-trust-boundary
call-site correction: the identity used to scope every Directus query
is still 100% derived from the verified JWT, just resolved through the
correct id-translation step instead of skipping it. The *fix itself*
closes a functional bug (wrong id → 404s), not a security hole — no
member could previously access another member's data through this bug;
they simply got errors trying to access their own.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "No new client input surface, no ownership/tenant-scoping change, no secrets/logging change. Zero BLOCKER/MAJOR/MINOR findings."
```
