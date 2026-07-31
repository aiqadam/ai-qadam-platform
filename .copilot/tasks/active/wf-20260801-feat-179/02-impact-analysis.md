# 02 — Impact Analysis: FR-AUTH-004 (Magic-link authentication)

## Validated Requirement

**FEAT-AUTH-4** (`FR-AUTH-004`). A user (Telegram-only temp account OR any
existing member) requests a one-time email sign-in link from
`apps/web-next`'s `/auth/sign-in` page. The API triggers Authentik's
`magic-link-login` flow (Email stage; no password-set stages; session-issuing
on completion) via a link-minting mechanism CodeDeveloper must resolve
empirically (open question, not guessable from static reading — see Risk
Flags). Authentik emails the link using the existing SMTP/Listmonk
connection — no new delivery infra, no `InteractionsService` dispatch call
(this differs from `registration.service.ts`'s explicit
`dispatchWelcomeEmail`; Authentik's own Email stage sends natively, same as
the recovery flow already does for `telegram/exchange` and `register`).
Clicking the link, within 15 minutes and only once, completes the OIDC flow
through the existing `AuthController.callback()` funnel exactly as
password/Telegram sign-in already do, issuing the standard
`aiqadam-refresh` session and landing at `/me`.

**Scope boundary (binding):** ships ONLY the general-purpose magic-link
mechanism — Authentik flow provisioning, the request endpoint, the
`apps/web-next` UI entry point, and reuse of the existing session-issuance
completion path. Does **not** ship: the `is_temporary=false` flip, real-email
replacement, points backfill, CRM sync (FR-AUTH-006), or
`POST /v1/internal/telegram/upgrade-temp` / bot `/upgrade` (FR-AUTH-006 pt.
3 / FR-BOT-002 PR 6/6). Does leave a comment-only extension seam near
`AuthController.callback()` / `UsersService.upsertByAuthentikSubject()` for
FR-AUTH-006 to build on.

---

## Affected Layers

### API (NestJS)

| Component | File | Change |
|---|---|---|
| `AuthModule` (module wiring) | `apps/api/src/modules/auth/auth.module.ts` | No new imports needed — `AuthentikModule` (for `AuthentikClient`) is already imported (line 69: `AuthentikModule`). No new providers beyond what's implied by the new endpoint living on the existing `AuthController`/`AuthService`. |
| `AuthController` | `apps/api/src/modules/auth/auth.controller.ts` | Add `POST /v1/auth/magic-link` handler (new). Modify `callback()` (lines 182–252) only to add a **comment-only** extension-seam marker near the `UsersService.upsertByAuthentikSubject()` call (line 210) — no behavioral change. |
| Request-body schema | `apps/api/src/modules/auth/auth.controller.ts` (inline, matching `registerSchema`'s existing convention at lines 65–90) OR a new small file `apps/api/src/modules/auth/magic-link.schema.ts` if CodeDeveloper prefers separating it — either is consistent with this codebase; `telegram-auth.service.ts` keeps its schemas in the service file, `auth.controller.ts` keeps `registerSchema` inline. Recommend inline in `auth.controller.ts` to match `registerSchema`'s direct sibling. | New `magicLinkRequestSchema = z.object({ email: emailField(200) })` — reuses the existing `emailField` helper from `apps/api/src/lib/email-schema.ts` (already imported by `auth.controller.ts` line 21), same trim/lowercase/max-length/no-plus-addressing rules as `registerSchema.email`. |
| `AuthService` or a new `MagicLinkService` | `apps/api/src/modules/auth/auth.service.ts` (extend) or new `apps/api/src/modules/auth/magic-link.service.ts` | Service logic: look up-or-create the Authentik user by email (mirrors `TelegramAuthService.exchangeWidgetPayload`'s `getUserByEmail` → create-if-absent pattern), then mint a magic-link-flow token via a **new** `AuthentikClient` method (shape TBD — see Risk Flags). Recommend a **new file** `magic-link.service.ts` rather than growing `auth.service.ts` (which is OIDC-flow-only today) or `telegram-auth.service.ts` (which is Telegram-identity-only) — magic-link is a third, distinct identity-resolution path and deserves its own service, consistent with how `registration.service.ts` and `telegram-auth.service.ts` are already split out as siblings of `auth.service.ts` rather than folded in. |
| `AuthentikClient` | `apps/api/src/modules/admin-invites/authentik.client.ts` | Add a new method, e.g. `createFlowLink(userPk: number, flowSlug: string): Promise<string>` (or `mintMagicLinkToken(...)` — exact name/shape is CodeDeveloper's call). **Shape TBD, content depends on CodeDeveloper's live spike** against the running Authentik instance (2024.12.x) — see Step 1's Architectural Feasibility point 2 and this doc's Risk Flags. `createRecoveryLink()` (lines 275–281) is confirmed NOT reusable as-is (hardcoded to `/api/v3/core/users/{pk}/recovery/`, which is tied to `Brand.flow_recovery`). |

### DB Changes Required: **NO**

Confirmed, not just assumed. Reasoning:
- Authentik is the sole state owner for the magic-link flow itself (the
  flow definition, the Email stage, the one-time token, its 15-minute TTL,
  and single-use consumption all live in Authentik's own `authentik`
  Postgres schema, which per `architecture.md`'s Data ownership table is
  owned exclusively by Authentik — "Cross-schema queries are forbidden,"
  and this workflow does not need to read/write it directly, only call
  Authentik's admin REST API, exactly as `createRecoveryLink()` already
  does for the recovery flow).
- The `platform` schema's `users` table (`apps/api/src/modules/users/schema.ts`)
  needs no new column. `upsertByAuthentikSubject()` (users.service.ts:61-94)
  already handles create-or-update by `authentikSubject` with no
  magic-link-specific field — the completion path is identical to every
  other OIDC sign-in.
- No `is_temporary` column touch — that's `attributes.is_temporary` on the
  **Authentik** user object (confirmed at `telegram-auth.service.ts:553`,
  `authentikUser.attributes.is_temporary === true`), not a platform-schema
  column, and this workflow doesn't branch on it at all (FR-AUTH-006's job).
- **This means Step 3 (DBMigrationAuthor) does NOT run for this workflow.**

### Shared Types (`packages/shared-types/`)

Confirmed via `Glob`: the package contains only a `.gitkeep` file — it is an
empty, unused placeholder, exactly as `auth.controller.ts`'s own comment
(lines 65–68) states: *"packages/shared-types is an empty, unused
placeholder; every sibling endpoint defines its Zod schema inline."*
**No shared-types change is warranted** — the new `magicLinkRequestSchema`
follows the established inline-Zod-in-controller/service convention (same
as `registerSchema`, `telegramWidgetPayloadSchema`, `upsertTempUserBodySchema`).

### Frontend (`apps/web-next`)

| Component | File | Change |
|---|---|---|
| Sign-in page | `apps/web-next/src/pages/auth/sign-in.astro` | Currently a bare SSR redirect to `/api/v1/auth/login` (no markup at all — lines 1–31). Per Step 1's Architectural Feasibility point 3, needs real markup for the first time: a "Sign in with email link" option. CodeDeveloper's implementation-detail choice: either add markup directly to this file (keeping the existing redirect as a secondary/fallback "or continue with password" path) or create a new sibling page. **Recommend**: keep `sign-in.astro`'s existing bare-redirect behavior UNCHANGED (it's `/api/v1/auth/login`'s Authentik-hosted-form entry, used today, no reason to disturb it) and add a new sibling page `apps/web-next/src/pages/auth/sign-in-magic-link.astro` modeled directly on `sign-up.astro`'s real-markup shape (`PageHead`, `Layout`, already-signed-in bounce-to-`/me` guard, React island). This avoids any regression risk to the existing password-path redirect and matches the FR's framing of magic-link as an *additional* entry point, not a replacement. If CodeDeveloper instead adds inline markup to `sign-in.astro` itself, that is also architecturally sound per Step 1 — just confirm the existing `?next=` passthrough and already-authenticated bounce logic (there isn't one currently — bare redirect only) are preserved either way. |
| Magic-link form (React island) | `apps/web-next/src/blocks/customer/MagicLinkForm.tsx` (new) | Modeled on `SignUpForm.tsx`'s shape (`idle`/`submitting`/`success`/`error` phase state machine, `.input`/`.btn .btn-primary` primitives, Lucide `Mail`/`MailCheck` icons per Step 1's design-system compliance note). **Key difference from `SignUpForm`**: `SignUpForm` submits a native `<form method="POST">` and relies on following the server's 302 redirect to an Authentik one-time URL directly in the browser. Magic-link must NOT do this — the whole point is the link goes to the user's **email**, not back to the requesting browser tab as a redirect target (a same-tab redirect to the Authentik one-time link would let anyone who submits any email address immediately sign in as that email's owner, without ever proving inbox ownership — a critical distinction from `SignUpForm`'s pattern, which is safe there specifically because the redirect target is the *registrant's own* fresh account). Confirm the new endpoint (see API Surface Changes) returns **JSON** `{ ok: true }` on success (not a redirect), and the form uses a `fetch()`-based submit (like `LeadCaptureForm.tsx`'s or `OnboardingForm.tsx`'s pattern — worth CodeDeveloper checking those as the closer precedent instead of `SignUpForm.tsx`), transitioning to a `success` phase that renders a static "Check your email" confirmation state in-page, with no navigation. |
| Barrel export | `apps/web-next/src/blocks/customer/index.ts` | Add `export { MagicLinkForm } from './MagicLinkForm';` (line 28 is the existing `SignUpForm` export — same pattern). |
| API client | No `apps/web-next/src/lib/api.ts`-equivalent typed client call is required if the form does a direct same-origin `fetch('/api/v1/auth/magic-link', ...)` POST, matching `LeadCaptureForm`/`OnboardingForm`'s pattern rather than `SignUpForm`'s native-form pattern (confirm which convention `apps/web-next` actually uses for fetch-based forms during implementation — not fully enumerated in this pass, CodeDeveloper should grep `apps/web-next/src/blocks/customer/LeadCaptureForm.tsx` for the exact fetch shape to copy). | N/A — client-side fetch call, no shared typed-client layer to extend (confirmed no `packages/shared-types` usage). |

### Bot (`apps/bot`)

**No changes.** FR-AUTH-004's own functional-scope point 5 (bot-triggered
`/upgrade` → `POST /v1/internal/telegram/upgrade-temp`) is explicitly out of
scope for this workflow (FR-AUTH-006 / FR-BOT-002 PR 6/6 territory, per Step
1's Completeness Issue #2). This workflow touches only the general
passwordless mechanism, which has no bot surface.

### Workers (`apps/workers`, BullMQ)

**No changes.** No new async job is needed — Authentik's Email stage sends
the email synchronously/natively (its own internal job, not ours), matching
how the existing recovery-flow email already works with zero BullMQ
involvement from this codebase.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| `/v1/auth/magic-link` | `POST` | **New.** Public (no `AuthGuard` — anonymous caller by definition, same posture as `POST /v1/auth/register` and `POST /v1/auth/telegram/exchange`). Body: `{ email: string }` validated by new `magicLinkRequestSchema`. Rate-limited via `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })` — matches the existing 5-req/15-min convention on `telegram/exchange` (line 421-422) and `register` (line 459-460), and `security.md`'s documented "Auth endpoints: stricter — 5 attempts per 15 minutes per IP" rule (`docs/04-development/security/security.md:169`). Response: **JSON** `{ ok: true }` (HTTP 200) on success — deliberately NOT a redirect (see Frontend row above for why a redirect-to-Authentik-link pattern is unsafe here, unlike `register`'s and `telegram/exchange`'s redirect-based responses, both of which redirect to a URL that is safe to hand back to the *same* browser that just proved control of that flow's context). Same-response-for-all-outcomes anti-enumeration posture (mirroring `register`'s "same literal redirect for success, duplicate, honeypot" fix) should be considered: return `{ ok: true }` whether or not the email matches an existing/creatable account, so this endpoint cannot be used to enumerate registered emails. | No — net-new endpoint, no existing contract touched. |
| `/v1/auth/callback` | `GET` | **Comment-only change.** No behavioral/contract change — this workflow reuses the existing funnel unmodified (AC-7). Add a doc comment at the `UsersService.upsertByAuthentikSubject()` call site (line 210) marking the FR-AUTH-006 extension seam (see below). | No. |

No modification to `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/sign-out`,
`/v1/auth/me`, `/v1/auth/register`, `/v1/auth/telegram/exchange`, or any
`/v1/internal/telegram/*` route.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `AuthController.magicLink()` (new) | `MagicLinkService` (new, or `AuthService` extension) | Direct injection, same module (`AuthModule`) — no cross-module boundary crossed. |
| `MagicLinkService` (new) | `AuthentikClient` | Direct injection — `AuthentikClient` lives in `AuthentikModule` (`apps/api/src/modules/admin-invites/authentik.module.ts`), already imported into `AuthModule` (`auth.module.ts:69`) for the existing recovery-link / Telegram-widget flows. No new module import required. |
| `AuthController.callback()` (existing, unmodified logic) | `UsersService.upsertByAuthentikSubject()` | Already-existing call (line 210) — this workflow adds a comment only, no new call. |
| (Future — FR-AUTH-006, NOT this workflow) `AuthController.callback()` | `UsersService`/upgrade-hook | Marked by the comment-only seam this workflow leaves; not wired here. |

No new cross-schema queries, no new tenant-scoped data touch (magic-link
identity resolution is global/user-scoped, not country-scoped — consistent
with `UsersService`/Authentik user records having no `country_code`).

---

## Risk Flags

### Security Review Required

1. **Rate limiting is mandatory and must match the existing convention.**
   `POST /v1/auth/magic-link` MUST carry `@UseGuards(ThrottlerGuard)` +
   `@Throttle({ default: { limit: 5, ttl: 900_000 } })`, identical to
   `telegram/exchange` and `register`. This is a concrete, non-negotiable
   Risk Flag per `security.md`'s explicit "Auth endpoints: stricter — 5
   attempts per 15 minutes per IP" rule (`docs/04-development/security/security.md:169`)
   and Step 1's own Architectural Feasibility point 5. SecurityReviewer
   should verify this decorator pair is present, not just assumed.
2. **Email-enumeration oracle.** Unlike `register` (which had to be
   retrofitted post-SecurityReviewer-finding to collapse success/duplicate/
   honeypot into one identical redirect), this endpoint should be designed
   correctly from the start: always respond `{ ok: true }` regardless of
   whether the email resolves to an existing Authentik user, a
   newly-creatable one, or neither — never a distinguishable error for
   "no such account." Flag for SecurityReviewer to explicitly verify during
   this workflow (don't repeat the `register` retrofit pattern).
3. **This endpoint MUST be public (unauthenticated).** Confirmed necessary
   — it's how an anonymous, not-yet-signed-in user requests a sign-in link.
   Same posture as `POST /v1/auth/register`. No `AuthGuard` should be
   applied. (Not a vulnerability — a design confirmation SecurityReviewer
   should check is deliberate, not an oversight.)
4. **No secret/PII leakage via response body.** The new endpoint's JSON
   response must never include the minted Authentik link/token itself —
   only `{ ok: true }`. The link travels exclusively through Authentik's own
   outbound email (SMTP/Listmonk), never through this endpoint's HTTP
   response, mirroring `registration.service.ts`'s existing "the ONLY place
   the real recoveryUrl is ever transmitted" discipline (registration.service.ts:317-318)
   — except here Authentik sends the email itself rather than this codebase
   dispatching it via `InteractionsService`, so there is no `recoveryUrl`
   value in our process at all if CodeDeveloper's resolved link-minting
   mechanism triggers Authentik's own send rather than returning a URL to
   us. This depends on which of the two candidate mechanisms (see below)
   resolves correct — flag for SecurityReviewer to re-check once
   CodeDeveloper's spike lands.

### Architecture Rule Risks

**None found.** No module-boundary crossing (new logic stays inside
`AuthModule`, calling `AuthentikClient` via the already-imported
`AuthentikModule`), no cross-schema query (all Authentik state access goes
through `AuthentikClient`'s REST wrapper, per the existing pattern), no
stack deviation (NestJS + Zod + Authentik REST API — all already-approved
stack per `architecture.md`). This does not rise to `failed-escalate`.

### Open Technical Question (not a blocker, flagged per Step 1's instruction)

**Link-minting mechanism is genuinely undetermined from static reading.**
Confirmed by direct code read: `AuthentikClient` has no existing method that
mints a token for an arbitrary flow slug — `createRecoveryLink()`
(`authentik.client.ts:275-281`) is hardcoded to
`POST /api/v3/core/users/{pk}/recovery/`, itself hardcoded server-side (by
Authentik) to whatever flow is bound as `Brand.flow_recovery`. Reusing it
unmodified for `magic-link-login` would either repoint that binding (breaking
FR-AUTH-002/password-reset) or silently mint recovery-flow links instead of
magic-link-flow links. CodeDeveloper must resolve, via a live spike against
the running local Authentik instance (2024.12.x), which of Step 1's two
candidate mechanisms works:
  (a) flow-executor API (`/api/v3/flows/executor/<slug>/`) driven
      server-side with a pre-authenticated bootstrap context, or
  (b) a not-yet-identified generic per-flow token-minting admin endpoint
      (possibly under `/api/v3/stages/email/` or `/api/v3/flows/`).

This is the single largest technical-risk item in the FR and gates the
`AuthentikClient` new-method signature, the `MagicLinkService` logic, and
whether the email is sent by Authentik natively (no response body payload
for us) or whether we get a URL back and must dispatch it ourselves via
`InteractionsService` (in which case the Frontend/API-response-shape
guidance above would need revisiting for a `recoveryUrl`-style value,
though it would still never appear in the magic-link **request** endpoint's
own response — only in an outbound email, exactly like `registration.service.ts`).
**This is a Risk Flag for CodeDeveloper's spike, not a blocker to gating
this analysis `passed`** — Step 1 already classified it as empirically
resolvable, not a design ambiguity requiring `needs-clarification`.

A second, smaller open question travels with it: whether Authentik's
`magic-link-login` flow needs an explicit `UserLoginStage` bound at order 30
to force session issuance, or whether `designation: authentication` on a
2-stage (Identification + Email) flow auto-completes into a session on link
click. Also CodeDeveloper's live-spike territory, same discipline as the
recovery flow script's own documented stages-30/40 empirical fix.

---

## Test Scope

### Unit

- `magicLinkRequestSchema` — valid email, invalid email, plus-addressed
  email rejection (mirrors `emailField`'s existing behavior, already unit
  tested elsewhere — confirm coverage isn't duplicated needlessly).
- `MagicLinkService` (or wherever the lookup-or-create + link-mint logic
  lands) — mock `AuthentikClient`: existing user found by email → mint
  called with that pk; no user found → create-then-mint path; Authentik
  error surfaces as the same generic 5xx posture `AuthentikClient`'s other
  callers already use.
- New `AuthentikClient` method — unit test with a mocked `fetch`, matching
  the existing test style for `createRecoveryLink`/`getUserByEmail` (find
  and confirm the existing test file, e.g.
  `apps/api/src/modules/admin-invites/authentik.client.spec.ts` if it
  exists — CodeDeveloper should locate and extend it rather than creating a
  parallel one).

### Integration (Testcontainers — AGENTS.md §3, "Use Testcontainers for
tests that need Postgres/Redis — never mock the database")

- `POST /v1/auth/magic-link` full controller-to-service integration test
  against a real Postgres (Testcontainers) for the `users` table read path
  (if any) and a mocked/stubbed Authentik HTTP layer (Authentik itself is
  external infra, not something Testcontainers spins up here — same
  pattern as existing `telegram/exchange`/`register` integration tests,
  which CodeDeveloper should locate and mirror, e.g. search for
  `*.e2e-spec.ts` or `*.integration.spec.ts` under
  `apps/api/src/modules/auth/`).
- Rate-limit enforcement: 6th request within 15 minutes from the same IP
  returns 429 (mirrors whatever existing test already covers this for
  `register`/`telegram/exchange` — extend that pattern, don't
  reinvent it).
- Response-shape test: confirm `{ ok: true }` is returned identically for
  an existing-user email and a not-found email (enumeration-resistance
  regression test, per Risk Flag #2 above).

### E2E / Live UAT verification (mandatory before this workflow can close —
AGENTS.md §6.1, "no deferred tests")

Testcontainers-based integration tests are necessary but **not sufficient**
here, because the core mechanism (Authentik flow completion → session
issuance) cannot be verified against a mock — it depends on the live
Authentik instance's actual flow-execution behavior, which is also this
FR's single biggest open technical question (see Risk Flags). A live E2E/UAT
pass against the real local Authentik instance (`http://localhost:9000` per
`architecture.md`'s Local URLs table) is mandatory before this workflow
closes. The Orchestrator will run this live verification itself at Step
8/13 per AGENTS.md §6.1 — flagging here what it must prove:

1. Request a magic link for a known test email via the new
   `/auth/sign-in-magic-link` (or equivalent) UI form.
2. Confirm the email arrives in Mailpit (or whatever local SMTP catcher
   this repo's Docker Compose stack uses — confirm the actual catcher name;
   `architecture.md`'s Local URLs table lists Listmonk at
   `localhost:9090` but Listmonk is the newsletter/transactional sender,
   not necessarily the dev-mode SMTP catcher — CodeDeveloper/Orchestrator
   should confirm whether local dev routes Authentik's SMTP through
   Mailpit, MailHog, or Listmonk's own local capture before UAT, since this
   determines where AC-1's "receive an email... within 60 seconds" is
   actually observed).
3. Click the link within the TTL window → confirm Authentik completes the
   flow and the browser is redirected through `GET /v1/auth/callback` (no
   parallel/duplicate session-issuance path — AC-7).
4. Confirm the browser holds a valid `aiqadam-refresh` cookie (ADR-0016)
   and lands at `/me`, showing the correct profile (AC-4).
5. Click the same link a second time → confirm Authentik shows an error,
   no new session (AC-2).
6. (Time-permitting / may be deferred to a documented follow-up per
   AGENTS.md §6.1's "named, queued follow-up" exception if 15 minutes is
   impractical to wait out live) — expired-link behavior (AC-3).
7. A member with an existing password requests + completes magic-link →
   succeeds identically, both methods coexist on the account (AC-5).
8. Rate-limit: 6th request in a 15-minute window from one IP → 429 (AC-6).

### Playwright (apps/e2e)

A new Playwright smoke spec (or an addition to the existing auth smoke
suite, if one exists under `apps/e2e/`) covering the happy path: fill email
on the magic-link form → see "check your email" confirmation state. Cannot
click a real emailed link in an automated Playwright run without an SMTP-
catcher API integration (Mailpit/MailHog expose a REST API some Playwright
suites poll) — if the local stack's catcher supports this, CodeDeveloper
should wire a full click-through E2E; otherwise the form-submission-to-
confirmation-state path is what Playwright covers, and the actual link-click
completion is verified via the live UAT pass above instead.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-AUTH-004's impact is fully scoped to AuthModule (apps/api/src/modules/auth/) + a new apps/web-next auth surface, with zero DB/shared-types changes and no bot/workers surface. No architecture-rule violation found — all new calls stay within already-imported module boundaries (AuthentikModule via AuthModule) and the existing Authentik-owns-its-schema data-ownership rule is respected. One genuine open technical question (Authentik link-minting mechanism) is carried forward from Step 1 as a Risk Flag for CodeDeveloper's live spike, not a blocker."
  findings:
    - "DB Changes Required: NO, confirmed (not just assumed) — Authentik's own authentik-schema Postgres tables are the sole state owner for the flow/token/TTL/single-use semantics; platform.users needs no new column since upsertByAuthentikSubject()'s existing create-or-update-by-authentikSubject logic already covers magic-link-originated sessions identically to every other OIDC completion. Step 3 (DBMigrationAuthor) does not run for this workflow."
    - "New endpoint POST /v1/auth/magic-link must return JSON { ok: true }, NOT a redirect — this is a material difference from the register/telegram-exchange precedent's redirect-based response shape, because redirecting the requesting browser directly to a one-time Authentik link (as those two endpoints safely do for their own use cases) would let anyone sign in as any email address without proving inbox control. This is the most important implementation-shape finding in this analysis and should be called out explicitly to CodeDeveloper."
    - "Email-enumeration resistance should be designed in from the start (always { ok: true }, whether or not the email resolves to an account) rather than retrofitted the way register.ts's honeypot/duplicate-email collapse was — flagged as a concrete SecurityReviewer checklist item."
    - "AuthentikClient.createRecoveryLink() is confirmed (by direct code read, not inference) hardcoded to POST /api/v3/core/users/{pk}/recovery/, which Authentik itself binds to Brand.flow_recovery — cannot be reused unmodified for magic-link-login without breaking the existing recovery/password-reset flow. A new AuthentikClient method is required; its exact signature is genuinely undetermined pending CodeDeveloper's live spike against the local Authentik instance, carried forward as this workflow's single largest technical-risk item, consistent with Step 1's own flagging."
    - "Recommended new files: apps/api/src/modules/auth/magic-link.service.ts (new service, sibling to registration.service.ts/telegram-auth.service.ts rather than folded into auth.service.ts), apps/web-next/src/pages/auth/sign-in-magic-link.astro (new sibling page, preserving sign-in.astro's existing bare-redirect behavior unchanged), apps/web-next/src/blocks/customer/MagicLinkForm.tsx (new React island, fetch-based JSON submit — NOT SignUpForm.tsx's native-form-302 pattern), scripts/provision-authentik-magic-link-flow.sh (new provisioning script in scripts/, confirmed as the correct location per provision-authentik-recovery-flow.sh's existing precedent, not inside apps/api)."
    - "Extension seam for FR-AUTH-006 is comment-only in this workflow: a doc comment at AuthController.callback()'s existing UsersService.upsertByAuthentikSubject() call site (auth.controller.ts:210), no new code path, no webhook/event emitter — matches Step 1's explicit recommendation against over-engineering a same-process synchronous concern."
    - "No module-boundary violation, no cross-schema query, no unapproved stack deviation found — gate is passed, not failed-escalate."
