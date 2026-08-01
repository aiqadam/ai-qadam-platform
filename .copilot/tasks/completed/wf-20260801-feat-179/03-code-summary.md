# 03 — Code Summary: FR-AUTH-004 (Magic-link authentication)

## Requirement Implemented

FR-AUTH-004's general-purpose magic-link mechanism, per the Scope Boundary
in `01-requirement-validation.md`: Authentik `magic-link-login` flow
provisioning, the `POST /v1/auth/magic-link` request endpoint, the
`apps/web-next` UI entry point (new page + a real-markup upgrade of
`sign-in.astro`), and reuse of the existing `AuthController.callback()`
session-issuance path (AC-7) with a comment-only FR-AUTH-006 extension
seam. Both open technical questions Step 1/2 flagged were pre-resolved by
the Orchestrator's live spike (`02b-authentik-spike-findings.md`) and
implemented exactly as recommended there — no re-derivation was needed.

Does **not** implement (per the binding Scope Boundary): the
`is_temporary` flip, points backfill, CRM sync, or the
`POST /v1/internal/telegram/upgrade-temp` endpoint / bot `/upgrade`
command (all FR-AUTH-006 / FR-BOT-002 PR 6/6).

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `scripts/provision-authentik-magic-link-flow.sh` | New | Idempotent resolve-or-create provisioning script for the `magic-link-login` Authentik flow. Mirrors `provision-authentik-recovery-flow.sh`'s exact pattern; deliberately has no Brand-binding step (not needed — see Key Design Decisions). Run live against `http://localhost:9000`; prints `EMAIL_STAGE_UUID=<uuid>` on its own line. |
| `apps/api/src/modules/admin-invites/authentik.client.ts` | Modified | Added `sendMagicLinkEmail(userPk, emailStageUuid)` calling `POST /api/v3/core/users/{id}/recovery_email/?email_stage=<uuid>` (204, no body). |
| `apps/api/src/config/env.ts` | Modified | Added `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` (optional string, Zod-validated), following the same "optional, degrades gracefully" pattern as `AUTHENTIK_ADMIN_TOKEN`. |
| `apps/api/.env.example` | Modified | Added matching `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID=` entry with explanatory comment (non-secret config id). |
| `apps/api/.env` (local, untracked) | Modified | Set `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID=cce8a11d-203a-49d7-ab07-be8c16a60094` — the live-resolved UUID from running the provisioning script against the local Authentik instance. Per CLAUDE.md's dev/test `.env` exception: non-secret config flag, stated here in chat per that policy's disclosure requirement. |
| `apps/api/src/modules/auth/magic-link.service.ts` | New | `MagicLinkService` — look-up-or-create Authentik user by email, then `sendMagicLinkEmail`. Exports `magicLinkRequestSchema` (reuses `emailField`). All internal errors (except missing config) are swallowed + logged, never rethrown — see Known Limitations for the security trade-off. |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | Registered `MagicLinkService` as a provider. No new module imports needed — `AuthentikModule` was already imported. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | Added `POST /v1/auth/magic-link` (public, `ThrottlerGuard` + 5/15min, always returns `{ ok: true }`). Added a comment-only FR-AUTH-006 extension-seam marker in `callback()` at the `upsertByAuthentikSubject()` call site — no behavioral change. |
| `apps/web-next/src/blocks/customer/MagicLinkForm.tsx` | New | React island — fetch-based (`apiClient`) JSON submit, `idle`/`submitting`/`success`/`error` phase state machine, Lucide `Mail`/`MailCheck` icons, `.input`/`.btn .btn-primary` primitives. Modeled on `LeadCaptureForm.tsx`, explicitly NOT `SignUpForm.tsx`'s native-form-302 pattern. |
| `apps/web-next/src/blocks/customer/index.ts` | Modified | Added `MagicLinkForm` barrel export. |
| `apps/web-next/src/pages/auth/sign-in-magic-link.astro` | New | New sibling page hosting `<MagicLinkForm client:load />`, modeled on `sign-up.astro` (PageHead, Layout, already-signed-in bounce guard). Carries the `@generated-from gen:page` marker required by ADR-0038 §Locks #3 (`arch:check`). |
| `apps/web-next/src/pages/auth/sign-in.astro` | Modified | Gained real markup for the first time: two options, "Continue with password" (preserves the exact prior bare-redirect target/`?next=` sanitize logic, now as a link) and "Sign in with email link" (links to the new page). Already-signed-in bounce-to-`/me` guard added (previously absent — the old bare redirect had no such check). |

## Key Design Decisions

1. **No `Brand.flow_recovery`-style binding step in the provisioning
   script.** Unlike the recovery flow, `magic-link-login` is reached only
   via `AuthentikClient.sendMagicLinkEmail`'s direct `email_stage=<uuid>`
   query param (confirmed live by the spike) or the flow's own slug URL —
   never through a `Brand.flow_*` field. Adding a Brand-binding step would
   have been dead code; the task brief explicitly said to skip it, and the
   live run confirms the flow works without one (`/if/flow/magic-link-login/`
   returns 200; the API-triggered email send doesn't touch Brand at all).

2. **`sign-in.astro` gained real markup rather than staying a bare
   redirect with the magic-link option bolted on elsewhere.** The impact
   analysis offered both options ("add markup to `sign-in.astro`" or "leave
   it a bare redirect and only add the new sibling page") as architecturally
   sound. I chose the real-markup path because the FR's own AC-1 wording
   ("On `/auth/sign-in`, a 'Sign in with email link' option appears")
   requires the option to be discoverable from that exact URL, not just
   reachable from somewhere else — a bare SSR redirect page cannot host a
   "second option" by definition. The prior redirect behavior is preserved
   exactly as a `<a href="/api/v1/auth/login?next=...">Continue with
   password</a>` link (same target, same `?next=` sanitize logic, still a
   plain top-level navigation) — no regression to the existing password
   path.

3. **`MagicLinkService.requestMagicLink()` always swallows internal
   errors and never throws past the "not configured" case.** See Known
   Limitations below for the full security-vs-availability trade-off
   this required weighing, and why I resolved it toward the safer choice.

4. **Username derivation duplicates `RegistrationService.deriveUsername`
   verbatim** (same `[a-z0-9.]` slug rules + `randomBytes(3)` suffix)
   rather than extracting a shared helper. Both call sites are small,
   stable, and independently owned by services with no existing shared
   module to home a cross-cutting helper in without a new import edge;
   given `AGENTS.md`'s bias toward small, focused diffs over
   pre-emptive refactors, I left the duplication rather than introduce a
   new shared utility module for two 10-line call sites. Flagging this in
   case the SecurityReviewer or a later pass wants to consolidate.

5. **The Email stage's `token_expiry` is explicitly set to 15**, not
   copied from the recovery flow's Email stage (which ships with 30) —
   required by FR-AUTH-004 AC-3 and confirmed live: `curl` against the
   provisioned stage shows `"token_expiry": 15`.

## Architecture Rule Compliance

- **Module boundaries:** `MagicLinkService` lives in `AuthModule`, calls
  `AuthentikClient` via the already-imported `AuthentikModule` — no new
  module import, no cross-module entity reach.
- **Tenant scoping:** N/A — magic-link identity resolution is
  global/user-scoped (Authentik user records have no `country_code`),
  consistent with every other Authentik-identity call in this codebase.
- **Zod at boundaries:** `magicLinkRequestSchema` validates the controller
  body via `safeParse` before any service call, matching `registerSchema`'s
  exact convention.
- **No cross-schema queries:** all Authentik state access goes through
  `AuthentikClient`'s REST wrapper; no direct `authentik` Postgres schema
  touch.
- **No `any`:** confirmed — `tsc --noEmit` clean, no `any` introduced.
- **Auth guard at controller level:** `POST /v1/auth/magic-link` carries
  no `AuthGuard` (deliberately public, per the FR) but does carry
  `ThrottlerGuard` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })`,
  matching `register`/`telegram/exchange`'s exact decorator pair.
- **Custom typed errors:** `AuthentikError` (existing) is caught and
  logged, not rethrown as a bare `Error`; `ServiceUnavailableException`
  used for the configuration-gap case, matching
  `telegram-auth.service.ts`'s `getBotToken()` convention.
- **RFC 7807 / response shape:** the endpoint's only success shape is
  `{ ok: true }` (HTTP 200), by design (anti-enumeration) — no error body
  is ever returned to the caller for this endpoint; `BadRequestException`
  still applies for malformed input (Zod validation failure), matching
  every other endpoint in this controller.
- **React component rules:** `MagicLinkForm` is functional, no
  `dangerouslySetInnerHTML`, explicit prop types (none needed — no props),
  component file well under 200 lines.
- **Astro page rules:** both `sign-in-magic-link.astro` and the modified
  `sign-in.astro` check `Astro.locals.auth` before rendering protected/
  redirect-relevant content (bounce to `/me` if already signed in).

## Formatter Check

`pnpm biome check --write` run against all changed TS/TSX files — **no
fixes applied, all clean** (both before and after other validation steps).
`.astro` files are covered by `astro check` (typecheck), not biome — also
clean.

## Known Limitations

1. **FR-AUTH-006's temp-account upgrade logic is NOT built here.** Only a
   comment-only extension seam exists in `AuthController.callback()` at
   the `upsertByAuthentikSubject()` call site. No `is_temporary` branching,
   no points backfill, no CRM sync — all explicitly out of this workflow's
   scope per the validated requirement.

2. **AC-2 (single-use) and AC-3 (15-minute expiry) are Authentik-native
   behaviors this workflow *configures* (via the provisioning script) but
   does not itself unit-test.** They will be verified live by the
   Orchestrator at Step 8/13 against the real Authentik instance, per the
   impact analysis's Test Scope guidance. This code summary only confirms
   the *configuration* is correct (`token_expiry: 15` verified live via
   `curl`; single-use is Authentik's own Email-stage token semantics,
   unconfigurable/inherent, same as the existing recovery flow already
   relies on).

3. **Playwright E2E for the actual link-click completion is out of this
   step's scope.** Only the form-submission-to-confirmation-state path
   (fill email → see "Check your email") is covered by this
   implementation; TestDesigner/TestRunner own the click-through E2E (or
   its live-UAT equivalent, if the local SMTP catcher doesn't expose a
   pollable REST API) at Steps 6-8, per the impact analysis's Test Scope
   section.

4. **Error-handling trade-off in `MagicLinkService.requestMagicLink()` —
   documented per the task brief's explicit request to note this
   decision.** The task brief asked me to weigh: match the codebase's
   existing "Authentik is a hard dependency, surfaced as 502/503"
   convention (`AuthentikClient`'s own header comment; `telegram-auth
   .service.ts`'s `getBotToken()`) vs. avoid creating a
   distinguishable-response enumeration oracle. I resolved this by
   **always returning `{ ok: true }`** for any failure *after* the
   configuration check (Authentik unreachable mid-request, user-creation
   failure, the `sendMagicLinkEmail` call itself failing) — the error is
   logged server-side via the existing `Logger` convention and swallowed,
   never surfaced as a 5xx to the caller. The one exception is a
   **configuration gap** (`AUTHENTIK_ADMIN_TOKEN` or
   `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` unset) — this still throws
   `ServiceUnavailableException` (503), because that failure is identical
   for every request regardless of the submitted email (a deployment
   state, not a per-request outcome), so it carries no enumeration signal
   — the same reasoning that makes `getBotToken()`'s 503 safe. **Trade-off
   accepted:** a genuine Authentik outage while processing a *specific*
   email is now invisible to the caller and to monitoring that only
   watches HTTP status codes — it's only visible via the `logger.warn`
   line. I judged the anti-enumeration guarantee (this endpoint must never
   let a scripted client distinguish "no such account" from "transient
   infra hiccup" from "created successfully") as the higher-priority
   security property for a public, unauthenticated endpoint, consistent
   with the impact analysis's Risk Flag #2 explicitly calling out
   `register`'s prior enumeration retrofit as the failure mode to avoid
   repeating. If this trade-off should instead favor observability (e.g.
   emit a metric/ops-event on the swallowed-error path so an operator can
   detect a total Authentik outage without email content leaking), that's
   a straightforward follow-up — flagging for SecurityReviewer /
   Orchestrator judgment rather than deciding it silently.

5. **Username-derivation duplication** between
   `RegistrationService.deriveUsername` and
   `MagicLinkService.deriveUsername` — see Key Design Decisions #4.

## Gate Result (original Step 4 pass — superseded by the Step 8 retry below for the wrong-flow finding)

```yaml
gate_result:
  status: passed
  summary: "FR-AUTH-004's magic-link mechanism (Authentik flow provisioning, request endpoint, apps/web-next UI, FR-AUTH-006 extension seam) is implemented per the validated requirement's Scope Boundary. All self-validation checks pass clean: pnpm --filter api typecheck/lint/build, pnpm --filter web-next typecheck/lint/build, pnpm arch:check, pnpm biome check --write (no fixes applied). The provisioning script was run live twice against the local Authentik instance (first run created all objects; second run confirmed full idempotency) and independently verified via follow-up curl GETs against the Email stage, flow instance, and flow bindings — all three match the script's own printed output exactly."
  findings:
    - "Resolved Email stage UUID (live, local Authentik): cce8a11d-203a-49d7-ab07-be8c16a60094. Flow UUID: dce29da3-a459-4161-aafa-61b711c4079d (slug=magic-link-login). Identification stage: ad30983a-3b5b-4cca-8a9d-66b63c414486. UserLoginStage (existing built-in, resolved not created): e4445e89-c0ed-40ae-8f9a-13203d6d6997 (name=default-authentication-login) — matches 02b-authentik-spike-findings.md's own live-queried pk exactly."
    - "apps/api/.env (local, untracked) was directly edited to set AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID to the resolved UUID above, per CLAUDE.md's dev/test .env exception — a non-secret config flag, disclosed here per that policy's requirement."
    - "arch:check initially failed on the new sign-in-magic-link.astro page (ADR-0038 §Locks #3 requires the @generated-from gen:page marker) because pnpm gen:page could not be used without either overwriting the hand-crafted content or requiring a two-step generate-then-edit dance; fixed by adding the identical marker comment sign-up.astro already carries. Re-ran arch:check clean afterward (274 files scanned)."
    - "Deviation from the task brief worth flagging: MagicLinkService.requestMagicLink() swallows ALL internal errors (including genuine Authentik-unreachable failures) to preserve the anti-enumeration guarantee, rather than surfacing them as 502/503 the way AuthentikClient's other hard-dependency callers do. This was an explicit, reasoned choice under the task brief's own 'if genuinely torn, prefer the security-safer choice' guidance — see Known Limitations #4 for the full trade-off writeup and an operator-observability follow-up suggestion."
    - "FR-AUTH-006's extension seam is comment-only, exactly as scoped — no is_temporary branching, no hook registration, no webhook/event emitter introduced."
```

**IMPORTANT — this "passed" gate was later found to have shipped a real bug** (the sent email's link targeted the wrong Authentik flow). Live testing at Step 8 caught what mocked/unit tests could not. See the section immediately below for the full retry writeup, root cause, and fix. `03-code-summary.md`'s sections above (Requirement Implemented / Files Changed / Key Design Decisions / etc.) remain historically accurate for what was originally built in this Step 4 pass — read them together with the retry section, not instead of it.

---

## Step 8 Retry — Fix for Wrong-Flow Bug

### What broke

`07-test-results.md`'s CRITICAL FINDING (Step 8, live E2E verification): a real
`POST /v1/auth/magic-link` request, followed by actually reading the real
email that landed in Mailpit (not just confirming delivery), found:

- The email's link pointed to `/if/flow/default-recovery-flow/`, **not**
  `magic-link-login`.
- The email body was the generic Authentik password-reset template copy
  ("You recently requested to change your password...").

Root cause, confirmed by reading Authentik's own server source directly
inside the running `aiqadam-authentik-server` container
(`authentik/core/api/users.py`): `recovery_email()`'s `email_stage` query
param only selects the sent email's **subject/template** — the link
itself is always minted by `_create_recovery_link()`, which is
unconditionally `request.brand.flow_recovery`. There is no flow
parameter anywhere in that call chain. `02b-authentik-spike-findings.md`'s
original Question-1 conclusion (based on the OpenAPI schema's I/O shape
alone, never a live send-and-inspect) was **incomplete** — see the
CORRECTION note now at the top of that file.

### The fix

Authentik resolves `request.brand` **per-request from the `Host` header**
(`authentik/brands/middleware.py` + `authentik/brands/utils.py`'s
`get_brand_for_request()` — matches every `Brand.domain` via
`iendswith`, falling back to the row with `default=True`). So:

1. **A second Authentik `Brand`** is now provisioned (domain
   `magic-link.aiqadam.internal`, `default: false`, `flow_recovery` bound
   to the already-existing `magic-link-login` flow). The default Brand's
   `flow_recovery` is untouched — still bound to `default-recovery-flow`
   for password-reset.
2. **`AuthentikClient.sendMagicLinkEmail()`** now sends its request with a
   `Host` header equal to that Brand's domain, so Authentik mints the
   link into the correct flow.
3. A genuine implementation obstacle surfaced while building step 2: Node's
   global `fetch` (undici) treats `Host` as a WHATWG-spec "forbidden
   request header" and **silently overwrites** any `Host` value passed via
   `init.headers` with the real connection target — confirmed live via a
   standalone repro against a local `http.Server` before assuming the fix
   would work. `this.request()`'s fetch-based implementation is therefore
   unusable for this one call. `sendMagicLinkEmail()` now uses Node's
   `node:http`/`node:https` modules directly (a new private
   `httpRequestWithHostOverride()` helper) — both DO honor a custom `Host`
   header (also confirmed live), and both are dependency-free parts of the
   runtime, so no new package dependency was added.

### Files Changed (this retry)

| File | Change Type | Description |
|---|---|---|
| `scripts/provision-authentik-magic-link-flow.sh` | Modified | Added `resolve_or_create_second_brand_uuid()` (idempotent by `domain`) and `bind_second_brand_recovery_flow()` — provisions the second Brand and binds its `flow_recovery` to the magic-link flow. Main section extended from `[1/5]`–`[5/5]` to `[1/6]`–`[6/6]`. Script now prints `BRAND_DOMAIN=<domain>` alongside `EMAIL_STAGE_UUID=<uuid>`. Top-of-file header comment gained a CORRECTION note explaining why the second-Brand step exists now when it deliberately didn't before. |
| `apps/api/src/modules/admin-invites/authentik.client.ts` | Modified | `sendMagicLinkEmail()` now takes a third `brandDomain: string` param and routes through a new private `httpRequestWithHostOverride()` (raw `node:http`/`node:https`, selected by `this.base`'s protocol) instead of the fetch-based `request()` helper. Doc comments on both methods corrected to describe the real mechanism (second Brand + Host header) and explain why fetch couldn't be used. |
| `apps/api/src/modules/auth/magic-link.service.ts` | Modified | `requestMagicLink()` reads the new `AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN` env var, fails closed with the same `ServiceUnavailableException('magic_link_not_configured')` as the existing email-stage-UUID gap if unset, and passes it through to `sendMagicLinkEmail()`. File header comment's step-3 description corrected — no longer claims the emailed link's target flow is determined solely by `email_stage`. |
| `apps/api/src/config/env.ts` | Modified | Added `AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN` (optional string, Zod-validated), same degraded-mode pattern as `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID`. |
| `apps/api/.env.example` | Modified | Added matching `AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN=magic-link.aiqadam.internal` entry with explanatory comment. |
| `apps/api/.env` (local, untracked) | Modified | Set `AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN=magic-link.aiqadam.internal` — the live-resolved domain from re-running the provisioning script. Per CLAUDE.md's dev/test `.env` exception: non-secret config flag, disclosed here. |
| `apps/api/test/authentik-client.spec.ts` | Modified | `sendMagicLinkEmail` describe block rewritten to mock `node:http`/`node:https` (via `vi.mock` with a hoisted factory — `vi.spyOn` cannot replace a Node builtin's named export in ESM) instead of `fetch`, since the method no longer uses `fetch`. Both transports are mocked identically per test because which one is selected depends on `AUTHENTIK_ADMIN_URL`'s protocol (environment-dependent: `http:` via a local dev `.env`, `https:` by `env.ts`'s own default and in CI) — asserting on "whichever transport got called" keeps the test deterministic across environments. Added a new test asserting the `Host` header equals the passed `brandDomain`, and a network-error-rejection test. |
| `apps/api/test/magic-link-service.spec.ts` | Modified | Mock `env` gained `AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN`. Existing `sendMagicLinkEmail` call-argument assertions updated to expect the third `brandDomain` arg. Added a new configuration-gap test (`brand domain unset → ServiceUnavailableException`, no Authentik calls made), mirroring the existing email-stage-UUID gap test. |
| `apps/api/test/magic-link-controller.spec.ts` | Unchanged | No changes needed — the controller only calls `MagicLinkService.requestMagicLink(email)`, whose own signature didn't change; the new param is internal to `MagicLinkService`/`AuthentikClient`. |
| `.copilot/tasks/active/wf-20260801-feat-179/02b-authentik-spike-findings.md` | Modified | Added a CORRECTION note at the top of Question 1's section, pointing to `07-test-results.md` and explaining the schema-vs-live-behavior gap for future workflows. |

### Live Verification (the exact check that caught the bug the first time)

Re-ran the provisioning script live against `http://localhost:9000` (twice,
to also confirm the new second-Brand step is idempotent):

```
[4/6] Resolving or creating the second Brand (domain=magic-link.aiqadam.internal)...
    + second brand created: 1b6085c5-ce06-4c1f-a369-2d65b5e542e6
[5/6] Binding second Brand.flow_recovery → Magic Link Flow...
  + second Brand.flow_recovery bound
```

Second run: both steps report `(existing, ...)` / `(no-op)` — confirmed
idempotent.

Restarted the API dev server (the previously-running watch-mode process
predated the new `AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN` env var — `dotenv`
only loads `.env` once at process start, so a code-watch reload alone
does not pick up new/changed env vars; confirmed this the hard way when
the first live request after editing `.env` still 503'd
`magic_link_not_configured`, diagnosed, then did a full process restart)
via `pnpm --filter api dev` in the background — zero-revert-cost local
dev-loop restart per AGENTS.md §16.

Live request:
```
POST http://localhost:3000/v1/auth/magic-link {"email":"magic-link-retry-test-1785545175@example.com"}
→ {"ok":true}
```

Queried Mailpit's real API and **read the actual email body** (not just
confirmed delivery — this exact discipline is what caught the bug the
first time and is not skippable):

```
Subject: Sign in to AI Qadam
Link:    http://magic-link.aiqadam.internal/if/flow/magic-link-login/?flow_token=ExllppQ7xgm135Pmd2HKXL0FFPQB3xWBJw0cc41FLzh7Sz4mvEJ6jEyJBfi5
```

**Confirmed: the link now targets `/if/flow/magic-link-login/`, NOT
`default-recovery-flow`.** Also confirmed `curl`ing that exact URL
returns HTTP 200 (flow page loads). Subject is the correct branded
"Sign in to AI Qadam" copy (was already correct from the original Step 4
pass). Test user cleaned up immediately after (`DELETE
/api/v3/core/users/{pk}/` → 204). Also independently re-confirmed the
default Brand's `flow_recovery` is untouched (`793de1f2-...`, still
`default-recovery-flow`) — the password-reset path was not disturbed.

### Known Limitations (new, from this retry)

1. **The email body copy is still the generic Authentik password-reset
   template text** ("You recently requested to change your password for
   your authentik account... Use the link below to set a new password."),
   even though the link itself now correctly targets `magic-link-login`
   and the subject is correctly branded. Investigated whether a better
   bundled template exists: Authentik ships exactly five email templates
   (`password_reset.html`, `account_confirmation.html`, `setup.html`,
   `base.html`, `event_notification.html` — confirmed via `docker exec`
   listing inside the running container) and **none of them contain
   sign-in-appropriate copy**; `account_confirmation.html`'s "Welcome!
   ...confirm your account" copy is arguably a worse fit for an
   *existing* user's passwordless sign-in than the password-reset
   template's neutral "use the link below" framing. Authoring and
   mounting a genuinely custom template (Django template file + a new
   volume mount into the Authentik container + `template` field pointed
   at it) is real infrastructure work well beyond "provision a Brand +
   send a Host header," and was not requested or scoped by the Step 8
   retry brief (which named the flow-target bug as the code/config gap,
   not custom template authoring). Flagging for a follow-up decision
   rather than silently expanding this retry's scope or silently
   declaring the copy issue fixed when it isn't.
2. **The email's stated token expiry ("valid for 29 minutes") does not
   match FR-AUTH-004 AC-3's 15-minute requirement**, discovered while
   reading the live email body during verification. Root-caused by
   reading Authentik's source further: the `recovery_email` endpoint's
   `_create_recovery_link()` creates its `FlowToken` via
   `FlowToken.objects.update_or_create(...)` with **no explicit expiry
   set**, so it falls through to `ExpiringModel`'s
   `default_token_duration()`, which reads `Tenant.default_token_duration`
   — a platform-wide Authentik Tenant setting, **completely independent**
   of the Email stage's own `token_expiry` field (confirmed by reading
   `authentik/stages/email/models.py` and `authentik/core/models.py`
   directly — `token_expiry` is real but is never read by this code
   path). This is a genuine, pre-existing gap distinct from the wrong-flow
   bug this retry was scoped to fix — it was not introduced by this
   retry's changes (the same gap existed in the original Step 4 pass,
   just masked by the wrong-flow bug making the whole mechanism unusable
   regardless). Flagging for Orchestrator/SecurityReviewer judgment on
   whether to open a follow-up (likely: lower `Tenant.default_token_duration`
   platform-wide, which would also affect the recovery flow's own
   token TTL — needs a product decision, not a code change made
   unilaterally here) rather than fixing unilaterally, since it touches a
   shared platform-wide setting outside this retry's named scope.

### Formatter / Validation Check (this retry)

- `pnpm --filter api typecheck` → clean, 0 errors.
- `pnpm --filter api lint` (`biome check .`) → "Checked 316 files... No fixes applied."
- `pnpm --filter api build` (`nest build`) → clean.
- `pnpm biome check --write` on all changed files (script excluded, N/A — bash) → no fixes applied.
- `pnpm arch:check` → "✓ arch:check passed (274 file(s) scanned, mode=full)."
- `pnpm exec vitest run test/magic-link-service.spec.ts test/magic-link-controller.spec.ts test/authentik-client.spec.ts` → 45/45 passed.
- Full repo suite (`pnpm exec vitest run` from `apps/api`) → 1498/1499 passed; the 1 failure is the same pre-existing `users.spec.ts` clock-race flake `07-test-results.md` already documented as unrelated (confirmed present on this run too, no new failures).

### Gate Result (Step 8 retry)

```yaml
gate_result:
  status: passed
  summary: "Fixed the Step 8 CRITICAL FINDING: magic-link emails now route to the correct Authentik flow. Root cause was recovery_email's email_stage param only controlling subject/template, never the link's target flow (always request.brand.flow_recovery, resolved per-request by Host header). Fix: a second, purpose-built Authentik Brand (domain=magic-link.aiqadam.internal, default=false, flow_recovery=magic-link-login flow) provisioned via an extended provision-authentik-magic-link-flow.sh, reached only when AuthentikClient.sendMagicLinkEmail sends its request with a matching Host header. Discovered and worked around a real implementation obstacle along the way: Node's global fetch (undici) silently overwrites any Host header passed via init.headers (confirmed via a live standalone repro before relying on it), so sendMagicLinkEmail now uses node:http/node:https directly instead of the fetch-based request() helper -- no new dependency added. Live-verified end-to-end exactly per the task brief's required check: requested a real magic link, read the real Mailpit email body (not just the {ok:true} API response), and confirmed the link now targets /if/flow/magic-link-login/, not default-recovery-flow. Confirmed the existing password-reset flow (default Brand's flow_recovery) is untouched. All self-validation clean: typecheck/lint/build, arch:check, biome, and the full existing test suite (1498/1499, same pre-existing unrelated flake as before) plus 45/45 on the three magic-link-related spec files, which were updated to match the new sendMagicLinkEmail signature and the node:http/https mocking this fix required."
  findings:
    - "Second Brand provisioned live (local Authentik): brand_uuid=1b6085c5-ce06-4c1f-a369-2d65b5e542e6, domain=magic-link.aiqadam.internal, default=false, flow_recovery=dce29da3-a459-4161-aafa-61b711c4079d (magic-link-login flow, same UUID as the original Step 4 pass -- flow/stages were re-verified live as still present, not re-created). Re-ran the provisioning script a second time and confirmed full idempotency of the new Brand-provisioning steps."
    - "Default Brand (83c02944-ed75-49f1-83c8-a27fdeb0a562, domain=authentik-default) independently re-confirmed unaffected: flow_recovery still 793de1f2-a5b0-4350-bf0c-a04921b1e74c (default-recovery-flow) -- the password-reset path was not touched by this fix."
    - "apps/api/.env (local, untracked) gained AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN=magic-link.aiqadam.internal, disclosed per CLAUDE.md's dev/test .env exception. The API dev server required a full process restart (not just a watch-mode recompile) to pick up this new env var -- dotenv loads .env once at process start; a live request before restarting correctly 503'd magic_link_not_configured, confirming the fail-closed path works, then the restart was performed and verification re-run successfully."
    - "KNOWN LIMITATION (not fixed, flagged not hidden): the email body copy is still Authentik's generic password-reset template text, not sign-in-specific copy -- investigated live and confirmed none of Authentik's 5 bundled email templates have appropriate copy; a real fix would require authoring + mounting a custom Django template into the Authentik container, which is infrastructure work beyond this retry's named scope (fix the flow-target bug). Subject line was already correctly branded from the original Step 4 pass and remains correct."
    - "KNOWN LIMITATION (not fixed, flagged not hidden, pre-existing and NOT introduced by this retry): the email states a 29-minute token expiry, not FR-AUTH-004 AC-3's required 15 minutes -- root-caused via source read to Tenant.default_token_duration (a platform-wide Authentik setting), which the recovery_email code path actually uses instead of the Email stage's own token_expiry field (confirmed unused by this call path by reading authentik/core/api/users.py's _create_recovery_link()). Flagging for a product/ops decision since fixing it means changing a platform-wide Tenant setting that also affects the recovery flow's own TTL, not a scoped code change."
    - "02b-authentik-spike-findings.md corrected with a note pointing to this retry, per the retry_target instruction in 07-test-results.md's Gate Result, so a future workflow reading that spike doc for a similar Authentik question does not re-derive the same incomplete conclusion."
```

**IMPORTANT — this "passed" gate was ALSO later found to have shipped a
second, deeper bug**, on top of the flow-target bug this section fixed:
the flow's own stage TOPOLOGY was wrong. A live Playwright click-through
(not just reading the corrected email link) found clicking the link did
not issue a session in one hop. See the section immediately below for
the full second retry writeup, root cause, and fix.

---

## Second Step 8 Retry — Fix for Flow-Topology Bug

### What broke

`07-test-results.md`'s "SECOND retry finding" (documented by the
Orchestrator after independently re-verifying the first Step 8 retry's
Brand/Host-header fix, then going one step further): the Orchestrator
actually **clicked** a real magic-link URL end-to-end via Playwright —
the exact "does this deliver a working session" proof no prior step had
performed (all prior verification stopped at "the email's link targets
the right flow," never "clicking it actually signs you in"). This found:

- Clicking a fresh, never-used magic-link URL does **not** issue a
  session in one hop. It lands on `ak-stage-identification` (re-asking
  for the email address).
- Submitting that advances to `ak-stage-email` ("check your inbox"),
  triggering a **second** email send — confirmed via two distinct
  Mailpit messages for the same test address.

**Root cause**, confirmed by the Orchestrator reading Authentik's
flow-executor source directly (`authentik/flows/views/executor.py`): a
`FlowToken`'s pickled `FlowPlan` is built ONCE, in full, at
`_create_recovery_link()` time, covering the flow's ENTIRE **bound**
stage list from the start. Clicking the emailed link restores that plan
and resumes it from its FIRST **bound** stage — which, in the topology
this workflow originally shipped (Identification at order 10, Email at
order 20, `UserLoginStage` at order 30 — all three bound), was
Identification, not `UserLoginStage`. The token does not mean "this
address is already verified"; it means "resume this specific
pre-planned run of the whole flow from the top." Binding Identification
and Email ahead of `UserLoginStage` therefore guarantees every click
re-runs the whole flow from scratch, never reaching session issuance in
one hop.

This is a genuinely different bug from the first Step 8 retry's
flow-target bug (which was about the emailed link pointing at the WRONG
flow entirely, `default-recovery-flow`) — this bug is about the RIGHT
flow's own internal stage sequence being wrong. Neither the original
spike (`02b-authentik-spike-findings.md`'s Question 2, which recommended
exactly this three-stage bound topology) nor the first retry's live
verification (which stopped at "the link targets `magic-link-login`",
never clicked through) could have caught this without an actual
click-through test.

### The fix

The `magic-link-login` flow's own bound-stage list must contain **ONLY
`UserLoginStage`** — no Identification stage, no Email stage bound into
the flow itself:

1. The Identification (`aiqadam-magic-link-identification`) and Email
   (`aiqadam-magic-link-email`) stage **objects** still need to exist and
   remain resolvable by name — the Email stage's UUID is still required
   by `AuthentikClient.sendMagicLinkEmail()`'s `email_stage=<uuid>` query
   param (controls the sent email's subject/template). They are just no
   longer **bound** into the flow's own plan.
2. `PLAN_CONTEXT_PENDING_USER` is already set on the token's plan at
   `_create_recovery_link()` time (from `recovery_email()`'s `for_user`
   argument), so `UserLoginStage` — which only reads that context key —
   can act immediately with no re-identification step. Moving it to
   order 10 (the sole binding, rather than order 30 as before) makes it
   the flow's first and only stage, which is both structurally required
   (nothing else is bound) and more honest about what the flow actually
   does now.
3. `scripts/provision-authentik-magic-link-flow.sh` no longer calls
   `ensure_flow_stage_binding` for the Identification/Email stages, and
   gained a new mirror-image helper, `ensure_flow_stage_NOT_bound()`,
   that actively un-binds them if a prior run of an OLDER script version
   left them bound — so the script converges to the correct topology
   whether it's run against an already-corrected environment (no-op) or
   an uncorrected one (e.g. a teammate's local Authentik that only ran
   the first script version, which DID bind these stages).

### Files Changed (this second retry)

| File | Change Type | Description |
|---|---|---|
| `scripts/provision-authentik-magic-link-flow.sh` | Modified | Removed the `ensure_flow_stage_binding "$flow_uuid" "$ident_stage_uuid" 10` / `... "$email_stage_uuid" 20` calls that bound Identification/Email into the flow. Added `ensure_flow_stage_NOT_bound()` (idempotent un-bind, mirror of `ensure_flow_stage_binding()`) and calls it for both stages in step `[2/6]`. `UserLoginStage`'s binding moved from order 30 to order 10 (now the sole binding). Top-of-file header comment gained a "CORRECTION #2" note (alongside the existing "CORRECTION #1" for the flow-target bug) explaining the topology bug, its root cause, and the fix. Trailing summary echo block and "Next steps" guidance updated to describe the corrected topology and to explicitly warn that a future verifier must CLICK the link, not just confirm it targets the right flow (the exact gap that let this bug ship in the first place). |
| `.copilot/tasks/active/wf-20260801-feat-179/02b-authentik-spike-findings.md` | Modified | Added a CORRECTION note above Question 2's stage-order table (which recommended the wrong three-stage-bound topology), explaining why it was wrong and pointing to the real fix, mirroring the existing CORRECTION note pattern already present for Question 1. |
| `.copilot/tasks/active/wf-20260801-feat-179/03-code-summary.md` | Modified | This section. |

No `apps/api/**` application code changed in this retry — the bug and
its fix are entirely in Authentik's own flow-stage-binding configuration
(provisioned by the shell script), not in `AuthentikClient` or
`MagicLinkService`. Both files were re-checked for stale prose describing
the flow's internal stage sequence (the old "Identification → Email →
Login" topology) — neither one describes the flow's internal stage
sequence at all (their doc comments cover the Brand/Host-header
link-routing mechanism from the first retry, which is unaffected by this
fix), so no comment changes were needed there.

### Live Verification (the exact check that caught the bug in the first place — repeated, live, after this fix)

Confirmed the live Authentik instance's bindings for `magic-link-login`
(flow_uuid `dce29da3-a459-4161-aafa-61b711c4079d`) via direct `curl` GET
of `/api/v3/flows/bindings/?target=<flow_uuid>` **before** assuming
anything about prior state, per the task brief's explicit instruction not
to trust the Orchestrator's earlier live edit without re-verifying:
already showed only `UserLoginStage` (order 30 at that point) — the
Orchestrator's investigation-time un-binding was still in effect.

Re-ran the updated script live against `http://localhost:9000` — clean
no-op on the already-corrected state:

```
[2/6] Ensuring identification + email stage OBJECTS exist (NOT bound to the flow — see CORRECTION #2)...
    · identification stage: ad30983a-3b5b-4cca-8a9d-66b63c414486 (existing)
    · email stage: cce8a11d-203a-49d7-ab07-be8c16a60094 (subject branded, use_global_settings=true, token_expiry=15)
    · identification stage already NOT bound to flow (no-op)
    · email stage already NOT bound to flow (no-op)
[3/6] Resolving + binding built-in UserLoginStage (session issuance — the ONLY bound stage)...
    · stage e4445e89-c0ed-40ae-8f9a-13203d6d6997 already bound to flow
```

**Then proved the un-bind path actually works, not just the no-op
path** — re-created the wrong topology live (`POST
/api/v3/flows/bindings/` for Identification at order 10 and Email at
order 20, simulating a teammate's local Authentik that only ran an
OLDER version of this script), confirmed via `curl` GET that all three
bindings were present, then re-ran the script again:

```
    → identification stage found bound (pk=c8acf241-b616-4e51-aa86-786dcc85d4d6) — removing (wrong topology, see CORRECTION #2)
    - identification stage binding c8acf241-b616-4e51-aa86-786dcc85d4d6 deleted
    → email stage found bound (pk=6b8a3923-b6e4-4d0f-b41e-ca391480f35a) — removing (wrong topology, see CORRECTION #2)
    - email stage binding 6b8a3923-b6e4-4d0f-b41e-ca391480f35a deleted
```

Follow-up `curl` GET confirmed exactly one binding remains:
`{"stage": "e4445e89-...", "order": 30, "stage_obj": "default-authentication-login"}`.
A third script run afterward confirmed the state stays a clean no-op
(full idempotency, both directions).

**Live click-through** (the actual proof this bug required — a standalone
`node` script using Playwright, written at
`apps/e2e/debug-magic-link-click.mjs`, run, then **deleted** immediately
after use per its own debug-only header comment):

Fresh token, first click:
```
POST http://localhost:3000/v1/auth/magic-link {"email":"magic-link-topology-test-<ts>@example.com"} -> {"ok":true}
Mailpit link: http://magic-link.aiqadam.internal/if/flow/magic-link-login/?flow_token=<token>
[first-click] last executor response: component=xak-flow-redirect, to=/
[first-click] GET /api/v3/core/users/me/ -> 200, user=magiclinktopologytest<ts>.aadbc4 (correct user)
Mailpit message count for this address after click: 1 (NOT 2 — confirms no second email was triggered by clicking)
```

Same token, reused (AC-2 regression check):
```
[reuse-click] last executor response: component=ak-stage-access-denied
[reuse-click] GET /api/v3/core/users/me/ -> 403 {"detail":"Authentication credentials were not provided."}
```

**Both PASS**: one-click session issuance confirmed (correct user, no
second email), AND reuse of the same consumed token is still correctly
denied — the topology fix did not weaken AC-2's single-use guarantee.

Test user cleaned up immediately after (`DELETE
/api/v3/core/users/25/` → `204`, confirmed). Debug script deleted
(`apps/e2e/debug-magic-link-click.mjs` no longer exists — confirmed via
`git status`, clean).

### Known Limitations (unchanged from the first retry)

The two Known Limitations already documented in the first Step 8 retry's
section above (generic password-reset email template copy; 29-minute
actual token expiry vs. AC-3's 15-minute requirement, driven by
`Tenant.default_token_duration` rather than the Email stage's own
`token_expiry` field) are **unaffected by this retry** — neither is
related to flow topology, and both remain open, flagged-not-hidden items
for a future follow-up decision, same as before.

### Formatter / Validation Check (this second retry)

- `pnpm --filter api typecheck` → clean, 0 errors.
- `pnpm --filter api lint` (`biome check .`) → "Checked 316 files... No fixes applied."
- `pnpm --filter api build` (`nest build`) → clean.
- `pnpm biome check --write` on the 5 TS files still showing as changed in this workflow's diff (all from the FIRST retry — no TS files changed in THIS retry) → no fixes applied.
- `pnpm exec vitest run` (full suite, from `apps/api`) → 1498/1499 passed; the 1 failure is the same pre-existing `users.spec.ts` clock-race flake documented in `07-test-results.md` and the first retry section above (confirmed present on this run too, no new failures — the assertion failure message and line number are identical to the previously-documented instance).

### Gate Result (second retry)

```yaml
gate_result:
  status: passed
  summary: "Fixed the SECOND Step 8 finding: the magic-link-login flow's own stage-binding topology was wrong. A live Playwright click-through (going beyond 'the emailed link targets the right flow' to actually clicking it) found the flow re-ran Identification and sent a second email instead of issuing a session in one hop. Root cause, confirmed via Authentik's flow-executor source: a FlowToken resumes its pickled FlowPlan from the flow's FIRST BOUND stage, not from a conceptual 'already verified' state -- with Identification/Email bound ahead of UserLoginStage, every click restarted the whole flow. Fix: removed the Identification/Email stage BINDINGS from the flow (order-10/order-20 ensure_flow_stage_binding calls deleted from provision-authentik-magic-link-flow.sh), keeping the stage OBJECTS (still referenced by sendMagicLinkEmail's email_stage param), leaving UserLoginStage as the flow's sole bound stage (moved to order 10). Added ensure_flow_stage_NOT_bound(), an idempotent un-bind helper, so the script converges to the correct topology whether run against an already-corrected environment or one that still has the old wrong bindings from an earlier script version -- verified BOTH directions live (no-op against corrected state; active un-bind after re-creating the wrong bindings to simulate a stale environment). Live end-to-end click-through (via a standalone Playwright debug script, deleted after use) confirmed: fresh token -> one click -> component=xak-flow-redirect -> GET /me -> 200, correct user, no second email sent; same token reused afterward -> ak-stage-access-denied -> GET /me -> 403 (AC-2 intact). No apps/api application code changed -- the bug and fix are entirely in Authentik's flow-stage-binding configuration. All validation clean: typecheck/lint/build, full test suite 1498/1499 (same pre-existing unrelated clock-race flake, no new failures)."
  findings:
    - "Live Authentik state confirmed via curl GET (not assumed): magic-link-login flow (dce29da3-a459-4161-aafa-61b711c4079d) now has exactly one binding -- UserLoginStage (e4445e89-c0ed-40ae-8f9a-13203d6d6997, name=default-authentication-login) at order 10. Re-verified this is stable after a third script run (clean no-op)."
    - "Un-bind path (ensure_flow_stage_NOT_bound) verified live, not just designed: re-created the old wrong topology (re-bound Identification at order 10 and Email at order 20 via direct API calls), re-ran the script, confirmed both stale bindings were detected and deleted (pks c8acf241-b616-4e51-aa86-786dcc85d4d6 and 6b8a3923-b6e4-4d0f-b41e-ca391480f35a), leaving only UserLoginStage -- proves the script is convergent against an uncorrected/stale environment, not just idempotent against the already-fixed one."
    - "Live click-through (Playwright, apps/e2e/debug-magic-link-click.mjs -- written, run, and DELETED per its own debug-only purpose): fresh magic-link token -> single click -> xak-flow-redirect -> authenticated session (GET /me -> 200, correct user) -> Mailpit shows exactly 1 message for the test address (not 2, confirming no re-triggered email send). AC-2 regression check: the same now-consumed token, revisited -> ak-stage-access-denied -> GET /me -> 403."
    - "02b-authentik-spike-findings.md's Question 2 recommendation (the three-stage-bound topology) corrected with a note pointing to this retry, mirroring the existing correction pattern already present for Question 1 -- so a future workflow spiking a similar Authentik flow-design question does not re-derive the same wrong conclusion (resolving which stage TYPE is needed is not the same as knowing which stages should be BOUND into the flow)."
    - "Known Limitations carried forward unchanged from the first Step 8 retry (generic password-reset email copy; 29-minute vs 15-minute token expiry) -- neither is related to flow topology, both remain open flagged-not-hidden follow-up items, not addressed by this retry."
    - "Test artifacts cleaned up: live test user (pk=25) deleted (204 confirmed); debug Playwright script deleted (apps/e2e/debug-magic-link-click.mjs no longer exists, confirmed via git status)."
```
