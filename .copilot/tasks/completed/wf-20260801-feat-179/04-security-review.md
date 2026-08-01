# 04 — Security Review: FR-AUTH-004 (Magic-link authentication)

## Code Changes Reviewed

- `apps/api/src/modules/auth/magic-link.service.ts` (new)
- `apps/api/src/modules/admin-invites/authentik.client.ts` (modified — new `sendMagicLinkEmail` method)
- `apps/api/src/config/env.ts` (modified — new `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` env var)
- `apps/api/.env.example` (modified)
- `apps/api/src/modules/auth/auth.controller.ts` (modified — new `POST /v1/auth/magic-link` endpoint + comment-only seam in `callback()`)
- `apps/api/src/modules/auth/auth.module.ts` (modified — `MagicLinkService` provider registration)
- `apps/web-next/src/blocks/customer/MagicLinkForm.tsx` (new)
- `apps/web-next/src/blocks/customer/index.ts` (modified — barrel export)
- `apps/web-next/src/pages/auth/sign-in-magic-link.astro` (new)
- `apps/web-next/src/pages/auth/sign-in.astro` (modified — gained real markup)
- `scripts/provision-authentik-magic-link-flow.sh` (new)

Also read for comparison/precedent: `apps/api/src/modules/auth/registration.service.ts`,
`apps/api/src/modules/auth/telegram-auth.service.ts`, `apps/web-next/src/lib/api-client.ts`,
`apps/web-next/src/lib/errors.ts`.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | Magic-link identity resolution is global/user-scoped — Authentik user records carry no `country_code`. No tenant-scoped `platform` table is touched by any new code in this diff. Consistent with every other Authentik-identity call in this codebase. |
| INV-2 Secrets by reference | Yes | Pass | No `password`/`secret`/`apiKey`/`token`/`Bearer` literal in any new/changed line. `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` is a non-secret config identifier (a stage UUID, not a credential), same class as the already-accepted `AUTHENTIK_ADMIN_TOKEN` env-var *name* (the token itself is never in the diff). `.env.example` carries only the empty-value placeholder. The provisioning script reads `AK_API_TOKEN` from env or a file path, never hardcodes it. |
| INV-3 Auth at controller level | Yes (with deliberate-public-endpoint exception) | Pass | `POST /v1/auth/magic-link` has no `@UseGuards(AuthGuard)` by design — structurally identical posture to the existing `register` and `telegram/exchange` endpoints in the same controller (both established precedent). What must gate a public endpoint like this — rate limiting and anti-enumeration response design — is present and verified below (INV-6, and the anti-enumeration finding). `GET /v1/auth/callback`'s only change is a comment; no guard behavior touched. |
| INV-4 Validation at boundaries | Yes | Pass | `magicLinkRequestSchema.safeParse(body)` runs first in `AuthController.magicLink()` (auth.controller.ts:528); on failure throws `BadRequestException` before `MagicLinkService` is ever called. `parsed.data.email` (not raw `body`) is the only value passed to `requestMagicLink()`. `magicLinkRequestSchema` reuses the existing `emailField(200)` helper — same trim/lowercase/max-length rules as `registerSchema.email`. |
| INV-5 No cross-schema queries | Yes | Pass | All Authentik access goes through `AuthentikClient`'s REST wrapper (`getUserByEmail`, `createUser`, `sendMagicLinkEmail`). No direct Postgres `authentik` schema touch anywhere in the diff. `sendMagicLinkEmail` is a thin `POST` via the existing private `request()` helper — same pattern as `createRecoveryLink`. |
| INV-6 Rate limiting | Yes | Pass | `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })` is present on `magicLink()` (auth.controller.ts:525-526), byte-for-byte matching the decorator pair on `telegramExchange()` (lines 431-432) and `register()` (lines 469-470). Matches `security.md`'s "Auth endpoints: stricter — 5 attempts per 15 minutes per IP" rule. |
| INV-7 CSRF protection | Yes | Pass | State-changing `POST` uses Authorization-header-free, cookie-free, JSON body auth (no session cookie involved in the request itself — it's a pre-session anonymous request). Naturally CSRF-resistant per `security.md`'s "Bearer token in Authorization header... naturally CSRF-resistant" framing extended to this case: there is no ambient credential (cookie) an attacker's cross-site form could ride on to make this endpoint do something on the victim's behalf that the victim didn't intend — worst case a CSRF'd request just causes an unwanted email to be sent to an address the attacker already controls or knows, which is bounded by the same per-IP rate limit as any other caller. `MagicLinkForm.tsx` submits via `apiClient` (fetch, `credentials: 'include'`), not a `<form action=... method=POST>` that a third-party site could trivially replicate with more effect than a normal browser would already allow. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences in `MagicLinkForm.tsx` or any other changed file. The submitted email is never echoed back into the DOM — `SuccessPanel` renders static copy only; the `error` phase renders `errorMsg` (a `.message` string from `ApiError`/generic `Error`) via JSX text interpolation (escaped by React), not raw HTML. |
| INV-9 No N+1 queries | Yes | Pass | `requestMagicLink()` makes at most two sequential Authentik calls per request (`getUserByEmail` then either `sendMagicLinkEmail` or `createMagicLinkUser` + `sendMagicLinkEmail`) — no loop, no batching concern. |
| INV-10 Drizzle parameterization | No | N/A | No Drizzle/SQL touch anywhere in this diff — confirmed, no DB migration, no `sql\`...\`` tag, no `db.execute()` call in any changed file (matches the impact analysis's "DB Changes Required: NO" finding). |
| INV-11 HttpOnly tokens (web) | Yes | Pass | No token of any kind is ever received or stored by `MagicLinkForm.tsx` — the endpoint's only success payload is `{ ok: true }`. No `localStorage`/`sessionStorage` write anywhere in the new frontend code. The actual session-issuing cookie (`aiqadam-refresh`) is set later, in the unmodified `callback()` handler, already HttpOnly/Secure/SameSite=Lax per the existing, unchanged `COOKIE_BASE` config — untouched by this diff. |

---

### Anti-enumeration design — detailed verification (the load-bearing security property of this PR)

Read `MagicLinkService.requestMagicLink()` (magic-link.service.ts:80-103) line by line:

- The only paths that throw past the controller are the two `ServiceUnavailableException` cases at the top (`authentik_not_configured`, `magic_link_not_configured`) — both are **deployment-state** conditions, identical for every request regardless of the submitted email (no distinguishing signal by design, matches the accepted `getBotToken()` precedent).
- Once past the config checks, the lookup (`getUserByEmail`), the create-if-absent branch (`createMagicLinkUser`), and the send (`sendMagicLinkEmail`) are **all** wrapped in a single `try { ... } catch (err) { ...logger.warn...; }` block (lines 89-102). There is no early `return` inside the `try`, no distinguishing status set, no rethrow on any branch. Whether the email resolved to an existing user, a newly-created one, or the whole sequence failed partway through, control falls through identically to the end of the method with nothing thrown.
- `AuthController.magicLink()` (auth.controller.ts:523-534) calls `await this.magicLinkService.requestMagicLink(parsed.data.email)` and unconditionally returns `{ ok: true }` on the next line — no branch reads a result from the service (the service returns `void`), so there is no way for controller-level code to leak an outcome distinction even by accident.
- Confirmed (a): endpoint always returns `{ ok: true }` for existing, newly-created, or internally-failed cases. Confirmed (b): no branch anywhere returns a different status/body based on email existence — the only alternate HTTP status the endpoint can ever emit is `400` (Zod validation failure on malformed input, e.g. not-an-email) or `503` (config gap), neither of which varies with whether a *valid-looking* email exists as an account.
- Timing: verified there is no obvious early-return-on-not-found shortcut. The lookup-only path (existing user) does `getUserByEmail` + `sendMagicLinkEmail` (2 HTTP calls to Authentik); the create path does `getUserByEmail` + `createUser` + `sendMagicLinkEmail` (3 calls). This is the same, structurally unavoidable timing variance the task brief already flagged as acceptable (not a strict constant-time requirement) — there's no additional shortcut beyond this inherent 2-vs-3-call difference, and it matches the same shape `TelegramAuthService.exchangeWidgetPayload`'s existing lookup-or-create pattern already has.

**Verdict: anti-enumeration design is correctly implemented, designed in from the start as required by the impact analysis's Risk Flag #2 — no retrofit needed.**

### No secret/link leakage — detailed verification

- `AuthentikClient.sendMagicLinkEmail()` (authentik.client.ts:298-303) calls `this.request<unknown>('POST', ...)` and **discards the return value entirely** — the method's return type is `Promise<void>` and the awaited result is never assigned to a variable, read, or returned. Confirmed by direct code read: there is no `.link`, `.token`, or any field access on the Authentik response anywhere in this method or its caller. The method's own doc comment (lines 283-297) states the endpoint "returns 204 No Content" and this is consistent with the code discarding the response — even if Authentik's actual response body were non-empty, nothing in this code path would read or forward it.
- `MagicLinkService`'s `logger.warn` call (line 101) logs only `email` (the submitted address) and `reason` (an `err.message` string, or `String(err)` for non-`AuthentikError` throwables) — no full user object, no token, no Authentik response body. This matches `registration.service.ts`'s own established convention throughout (e.g. `registration.duplicate_check_failed`, `registration.create_user_failed`, and multiple `logger.warn` calls all log `email` plaintext alongside a `reason` derived the same `err instanceof Error ? err.message : String(err)` way — see registration.service.ts:143-148, 194-198, 262-267). Logging an email address in an auth-adjacent flow's log line is this codebase's accepted, pre-existing convention, not a new exposure introduced by this PR.
- One residual note (not a finding, informational only): `reason = err instanceof AuthentikError ? err.message : String(err)` — if `AuthentikError.message` were ever populated with response-body content from Authentik in some future change, that could theoretically include more than a status code. Checked `AuthentikError`'s current definition (imported alongside `AuthentikClient`) — out of scope for this diff (not modified here) and not something this PR introduces; flagging only for completeness, not as a finding against this PR.

### User-creation path abuse potential

`MagicLinkService.createMagicLinkUser()` self-registers a new Authentik user for any not-yet-existing email, gated only by the per-IP rate limit (5/15min) and Authentik's own Email-stage click-to-complete requirement — no email-ownership verification occurs at creation time. Assessed as an accepted residual risk, not a BLOCKER/MAJOR, for the following reasons:

1. No session is ever granted without the recipient clicking the emailed link — an attacker mass-requesting magic links for arbitrary/harvested emails cannot access any of the resulting accounts without inbox control.
2. The rate limit is per-IP, not per-email, so a single attacker is bounded to 5 account-creation attempts per 15 minutes per IP (trivially bypassable with many IPs, same limitation the existing `register` endpoint already has — not a new gap this PR introduces).
3. This directly mirrors `register`'s own already-accepted no-email-verification-gate-at-creation-time precedent (a self-registered Authentik user via `register` is likewise unverified until the registrant uses the emailed recovery link).
4. Worst case of unclicked created accounts: inert Authentik user records for emails that never engage — a data-hygiene/cost concern, not an account-takeover or data-exposure vector.

**This is a Note, not a BLOCKER or MAJOR.** No action required to pass the gate; consider a future follow-up (out of this PR's scope) if inert-account volume becomes an operational concern.

### Frontend UI surface (`MagicLinkForm.tsx`)

- No `dangerouslySetInnerHTML`.
- Uses `apiClient` (the approved `fetch`-based abstraction, `credentials: 'include'`), not a native `<form method="POST">` — cannot be redirected to an attacker-controlled or Authentik one-time URL, matching the impact analysis's explicit safety requirement that this form must never behave like `SignUpForm.tsx`'s native-form-302 pattern.
- The submitted email is never echoed back into raw HTML anywhere — `SuccessPanel` is static copy; the `error` phase renders `errorMsg` as JSX text (React-escaped).
- No token/link value is ever received or stored client-side (endpoint returns only `{ ok: true }`).

### Provisioning script (`scripts/provision-authentik-magic-link-flow.sh`)

Lighter operational-tooling review, consistent with `provision-authentik-recovery-flow.sh`'s already-reviewed precedent:

- Token sourced from `AK_API_TOKEN` env var or `/tmp/aiqadam-secrets-AK_API_TOKEN` file — never hardcoded, never echoed to stdout.
- Host allowlist enforced (`localhost`, `127.0.0.1`, `auth.aiqadam.org`) before any write call — refuses to run against an arbitrary host, matching the recovery-flow script's own safety guard.
- `set -euo pipefail`; all POST/PATCH bodies built via `jq -nc --arg`/`--argjson` (parameterized, not string-interpolated into JSON — avoids injection via a maliciously-named env override).
- No secrets committed in the script itself or in `.env.example`.

No findings.

---

### BLOCKER Findings

None.

### MAJOR Findings

None.

### MINOR / Notes (non-blocking)

1. **User-creation path abuse potential** (magic-link.service.ts `createMagicLinkUser`) — accepted residual risk, see detailed assessment above. No action required; optional follow-up if inert-account volume becomes an operational concern.
2. **Error-handling trade-off** in `requestMagicLink()` (swallowing genuine Authentik-outage errors to preserve the anti-enumeration guarantee) is a reasoned, documented, security-favoring choice per the code summary's Known Limitations #4. Confirmed correctly implemented. Consider an operator-facing metric/ops-event on the swallowed-error path (distinct from per-request response shape) as a future observability follow-up — not a security gap, just a monitoring gap, and explicitly out of scope for this PR.
3. **Username-derivation duplication** between `RegistrationService.deriveUsername` and `MagicLinkService.deriveUsername` (noted in code summary Key Design Decision #4) — a maintainability observation, not a security finding.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-AUTH-004's magic-link mechanism passes security review with zero BLOCKER or MAJOR findings. All 9 applicable invariants (INV-2 through INV-9, INV-11) confirmed Pass; INV-1 and INV-10 confirmed N/A (no tenant-scoped data, no DB/SQL touch). The endpoint's deliberate public posture (no AuthGuard) is correctly offset by rate limiting (ThrottlerGuard, 5/15min, matching register/telegram-exchange exactly) and a correctly-implemented anti-enumeration design verified line-by-line: MagicLinkService.requestMagicLink() has no early-return-on-not-found shortcut, wraps lookup/create/send in a single try/catch with no distinguishing outcome, and the controller unconditionally returns { ok: true }. AuthentikClient.sendMagicLinkEmail() confirmed to discard its response entirely — no link/token value ever exists in this process to leak. Logging matches existing convention (email + generic reason, no tokens/secrets). Frontend form has no dangerouslySetInnerHTML, uses the approved apiClient abstraction, never receives or stores a token. Provisioning script matches its reviewed precedent's safety conventions (host allowlist, no hardcoded secrets, parameterized jq bodies)."
  findings:
    - "No BLOCKER findings."
    - "No MAJOR findings."
    - "MINOR/Note: MagicLinkService.createMagicLinkUser() self-registers a new Authentik user for any not-yet-existing email with no email-verification gate at creation time, bounded by per-IP (not per-email) rate limiting and Authentik's own click-to-complete session issuance — accepted residual risk, mirrors register's own already-accepted precedent. No action required."
    - "MINOR/Note: requestMagicLink()'s error-swallowing trade-off (never surfacing a genuine Authentik outage as 5xx, to preserve anti-enumeration) is correctly implemented and reasoned; an operator-facing metric on the swallowed-error path is a reasonable future observability follow-up, not a security gap."
    - "MINOR/Note: username-derivation logic is duplicated between RegistrationService and MagicLinkService — maintainability observation only, no security implication."
```
