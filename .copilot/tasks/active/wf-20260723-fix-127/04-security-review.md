# Step 4 — Security Review

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002 (blocker, api/auth registration)
**Agent:** SecurityReviewer

---

## Code Changes Reviewed

- `apps/api/src/modules/auth/registration.service.ts` (full file read, current
  state — not a diff) — the only file changed by CodeDeveloper for this fix.
- `apps/api/src/modules/admin-invites/authentik.client.ts` (full file read) —
  read to confirm the exact contents of `AuthentikError.message` and to
  confirm the `request()` wrapper never logs the `Authorization` header.
- `apps/api/src/modules/auth/auth.controller.ts` (full file read) — read to
  confirm the controller's `register()` handler has no try/catch of its own,
  so whatever `RegistrationService.register()` throws is what NestJS's
  exception layer actually renders to the HTTP client.
- `apps/api/test/registration-service.spec.ts` (partial read, header +
  fixtures) — context only; TestDesigner owns new regression cases for this
  fix in a later step, not reviewed for coverage completeness here.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | No tenant-scoped table query added or touched; no DB access added by this change at all. |
| INV-2 Secrets by reference | Yes | Pass | See detailed analysis below. No secret literal, bearer token, or `Authorization` header value appears in any new code, log call, or exception. `AuthentikError.message` (`authentik.client.ts:23`) is built from `status` + `path` + the **response body** (truncated to 200 chars) — never from the request's `Authorization` header, which is never included in any thrown error or log line in `authentik.client.ts`'s `request()` method. All three new/extended catch blocks in `registration.service.ts` (Steps 2, 3, 5) log only `err.message` via `this.logger.log`/`.warn`, matching the file's pre-existing Step 4 pattern exactly — no new logging surface was introduced. |
| INV-3 Auth at controller level | N/A | N/A | `POST /v1/auth/register` is an intentionally unauthenticated, anonymous public endpoint (self-registration — there is no user yet). This is unchanged by this fix and was already correct per the prior review; no new controller method was added. |
| INV-4 Validation at boundaries | N/A | N/A | No new external input introduced. `input: RegisterInput` is already validated by `registerSchema` (Zod) in `auth.controller.ts` before `RegistrationService.register()` is ever called; this fix touches only internal error-handling around existing, already-validated calls. |
| INV-5 No cross-schema queries | N/A | N/A | No DB query added; no JOIN of any kind touched. |
| INV-6 Rate limiting | N/A | N/A | `@Throttle({ default: { limit: 5, ttl: 900_000 } })` on `POST /v1/auth/register` is pre-existing and untouched by this fix (`auth.controller.ts:435-438`). |
| INV-7 CSRF protection | N/A | N/A | Bearer-token-equivalent public POST with no session cookie involved in the request; CSRF posture unchanged, no state-changing browser-session flow altered. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences in the diff (backend-only change, no JSX/React touched). |
| INV-9 No N+1 queries | N/A | N/A | No query added; `resolveGroupNames` (Step 5) already existed pre-fix and is unchanged — its own internal `Promise.all` fan-out (one HTTP call per group name) is pre-existing and out of scope for this bug fix. |
| INV-10 Drizzle parameterization | N/A | N/A | No SQL, no Drizzle call added or touched — this fix only wraps existing external HTTP calls in try/catch. |
| INV-11 HttpOnly tokens (web) | N/A | N/A | No token issuance or cookie handling touched — unrelated to this endpoint's failure-mode fix. |
| **Enumeration-oracle regression check** (codebase-specific precedent, BLOCKER-tier weight per task instructions) | Yes | Pass | See detailed analysis below. No variant of the prior Location-header oracle (MAJOR-1, wf-20260718-fix-122) is reintroduced. |

---

### Detailed analysis — enumeration-oracle regression check

**Question:** Does the new Step 2 (`getUserByEmail` failure) response look
distinguishable, in status code/body/timing-class, from the Step 3/Step 5
failure responses, or from the existing duplicate-email success-shaped
response?

**Finding: No new email-existence oracle is introduced.**

1. **Steps 2, 3, and 5's new/extended failure paths are byte-identical to
   each other.** Confirmed by direct read of all three throw sites
   (`registration.service.ts:148`, `:182`, `:240`) plus the pre-existing
   Step 4 site (`:206`): all four are the literal expression
   `throw new BadRequestException('registration_failed')` with **no**
   interpolation of `err`, Authentik's status code, or Authentik's response
   body into the exception itself. `err` (and its `.message`) is used
   **only** inside the preceding `this.logger.log(...)`/`.warn(...)` calls,
   which are server-side-only (Nest `Logger`, never serialized into the HTTP
   response). Since the controller (`auth.controller.ts:439-465`) has **no
   try/catch around `this.registration.register(...)`**, whatever
   `RegistrationService.register()` throws is exactly what NestJS's default
   exception filter renders — and `BadRequestException('registration_failed')`
   always renders the same `400 { "statusCode": 400, "message":
   "registration_failed", "error": "Bad Request" }` body regardless of which
   of the four call sites threw it, and regardless of what the underlying
   Authentik/network failure actually was. There is no code path by which
   Steps 2, 3, 4, or 5's failures could be told apart from one another by an
   external caller inspecting status/body.

2. **This 400 response is a new, fourth response *class*, but it is not an
   email-existence oracle** — it is orthogonal to the invariant the prior
   fix established. The prior MAJOR-1 fix's invariant is: for any given
   email, "already exists" and "just registered" must be indistinguishable
   (both → `302 Found` / `Location: /v1/auth/login`). The new `400
   registration_failed` path is **not conditioned on whether the target
   email exists** — Step 2's failure fires when the `getUserByEmail` HTTP
   call itself errors (Authentik unreachable, 401/5xx, network fault), which
   is a property of Authentik's/the network's availability at request time,
   not a property of the specific email being probed. A scripted client
   sending the *same* candidate email twice in a row, when Authentik is
   healthy, gets `302` both times (duplicate-check succeeds, existing user
   found or not, same terminal redirect either way) — the only way to
   observe `400` is to catch Authentik itself in a failure window, which
   affects all emails equally and carries no per-email signal. This does
   not reopen or create a variant of the enumeration oracle; it is a
   generic "upstream dependency is down" signal, already an accepted/
   expected shape for a hard external dependency (matches this codebase's
   own stated convention of surfacing hard-dependency failures as a generic
   4xx, e.g. `admin-invites` flows surfacing Authentik outages as 502/400
   rather than silently succeeding).

3. **Step 8 (`createRecoveryLink`) still never throws**, exactly as
   specified: on failure it logs loudly (`this.logger.warn`, server-side
   only) and falls through to `return this.fakeSuccessResult()` unchanged
   — the same `302` / `Location: /v1/auth/login` as every other successful
   or duplicate/honeypot outcome. Confirmed no `throw` was added in this
   branch (`registration.service.ts:296-313`).

4. **Timing-class check:** Steps 2/3/5's new catch blocks add no new
   `await` beyond the ones the original (uncaught) code already performed —
   they wrap the *same* calls, they don't add a second round-trip or a
   delay. No new artificial timing asymmetry was introduced relative to the
   pre-existing duplicate-email branch (`existing` truthy → immediate
   `fakeSuccessResult()`) vs. a genuine-failure branch (now: immediate
   `BadRequestException` after the same single failed call). This matches
   the shape the prior review already accepted for Step 4's existing
   orphan-mitigation catch (which also does one extra best-effort
   `disableUser` call before throwing) — Step 5 duplicates that exact same
   shape, so it introduces no new asymmetry class, only doubles a pattern
   the prior review already passed.

**Conclusion:** all new failure paths converge on one indistinguishable
`400 registration_failed` shape, are not conditioned on per-email
existence, and do not reintroduce the Location-header oracle or any
variant of it.

---

### Detailed analysis — INV-2 (secrets in logs)

**Question:** Could an underlying library ever put a bearer token or
`Authorization` header into an `Error`'s message string in a way that would
land in a log?

Read `authentik.client.ts:247-270` (`private async request<T>`) in full:

- The `Authorization: Bearer ${this.token}` header (`:252`) is only ever
  passed into `fetch(url, init)` (`:260`) as a request header — it is never
  read back out, logged, or interpolated into any string anywhere in this
  method.
- On non-2xx (`:261-265`): `this.logger.warn(...)` logs `method`, `path`,
  `res.status`, and `text` (the **response body**, Authentik's own reply,
  truncated to 200 chars) — never the request headers, never the token.
- `AuthentikError`'s constructor (`:17-26`) builds `message` from `status` +
  `path` + `body.slice(0, 200)` — same story, response body only, never the
  token or the `Authorization` header.
- Native `fetch()` failures (DNS/connection refused/timeout) throw a plain
  `TypeError`/`DOMException` whose `.message` is a generic runtime string
  (e.g. `"fetch failed"`, `"ECONNREFUSED"`) — Node's `fetch` implementation
  does not echo request headers into these errors either.

So the only way a secret could land in a log via this path would be if
Authentik's own API **echoed the caller's Authorization header value back
in its response body** (e.g. in a verbose error/debug payload) — that would
be a bug in Authentik itself, not in this codebase, and is unchanged by
this fix (the existing `AuthentikError` construction has always captured
response-body text this way, since before this workflow). This fix does not
add any new call site that logs anything beyond what Steps 3/4 already
logged in the same shape; Steps 2 and 5's new log lines follow the
identical `err instanceof Error ? err.message : String(err)` pattern already
used by Steps 3 and 4. No regression, no new exposure surface.

**Conclusion:** no secret is logged by this change, and no new mechanism by
which a secret could leak into logs was introduced.

---

### BLOCKER Findings

None.

### MAJOR Findings

None.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Reviewed the full current state of registration.service.ts (and its
    authentik.client.ts dependency, and auth.controller.ts's calling
    context) against all 11 numbered invariants plus the codebase-specific
    enumeration-oracle regression check called out as BLOCKER-tier for this
    review. All applicable invariants pass; INV-1/3/4/5/6/7/9/10/11 are N/A
    (no DB, no new controller method, no new external input, no new
    endpoint, no CSRF-relevant surface, no query, no Drizzle call, no
    token/cookie handling touched by this fix). INV-2 (secrets in logs) and
    INV-8 (no dangerouslySetInnerHTML) both pass directly. The
    enumeration-oracle check — the review's stated top priority given the
    prior MAJOR-1 finding on this exact method — passes: all of Steps
    2/3/4/5's failure throws are the literal, non-interpolated
    `BadRequestException('registration_failed')`, rendered identically by
    NestJS regardless of which call site or underlying cause fired it
    (confirmed the controller has no try/catch of its own around
    RegistrationService.register(), so the service's throw is exactly what
    reaches the HTTP client); the new 400 failure class is conditioned on
    upstream-dependency health, not on per-email existence, so it does not
    reintroduce a variant of the Location-header enumeration oracle fixed
    in wf-20260718-fix-122. Step 8 still never throws, preserving the
    byte-identical 302/Location:/v1/auth/login response for genuine
    success, duplicate-email, and honeypot alike. No secret (Authentik
    bearer token or Authorization header) is ever included in any thrown
    error or log line in authentik.client.ts's request() wrapper or in any
    of the new/extended catch blocks — only the Authentik response body
    (already the pre-existing AuthentikError.message shape) and
    err.message (server-side Logger calls only) are used, matching the
    file's pre-existing Step 3/4 convention exactly. Zero BLOCKER, zero
    MAJOR findings.
  findings:
    - "Steps 2, 3, 4, 5 all throw the literal, non-interpolated BadRequestException('registration_failed') (registration.service.ts:148,182,206,240) — confirmed byte-identical status/body across all four call sites, none leaks Authentik's internal status/body/err.message to the HTTP response."
    - "auth.controller.ts's register() handler (auth.controller.ts:439-465) has no try/catch around this.registration.register(...) — whatever the service throws is exactly what NestJS's default filter renders to the client, confirming no controller-level divergence could reintroduce distinguishability."
    - "The new 400 registration_failed failure class is conditioned on Authentik/network availability, not on whether the target email exists — sending the same email twice while Authentik is healthy still yields 302 both times (duplicate-check succeeds either way); this is not a variant of the Location-header email-enumeration oracle (MAJOR-1, wf-20260718-fix-122)."
    - "Step 8 (createRecoveryLink) confirmed to still never throw (registration.service.ts:296-313) — failure logs loudly server-side and falls through to the same fakeSuccessResult() as every other outcome, preserving the byte-identical 302/Location response invariant."
    - "authentik.client.ts's request() wrapper (authentik.client.ts:247-270) never logs or echoes the Authorization/bearer-token header into any Error, log line, or response — AuthentikError.message and the warn-log both derive only from Authentik's own response status+body (truncated to 200 chars), never from the outgoing request. No new logging surface was added by this fix beyond the pre-existing Step 3/4 err.message pattern, replicated identically at Steps 2 and 5."
    - "No DB/tenant/CSRF/rate-limit/validation/XSS surface touched — INV-1,3,4,5,6,7,9,10,11 are N/A for this change; only INV-2 and INV-8 are directly applicable and both pass."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
