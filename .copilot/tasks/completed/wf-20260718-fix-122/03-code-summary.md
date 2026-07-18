# Step 3 — Code Summary: ISS-USR-REG-001

> Output for: `.copilot/tasks/active/wf-20260718-fix-122/03-code-summary.md`
> Agent: CodeDeveloper
> Workflow: wf-20260718-fix-122
>
> **This file has two passes.** This first pass covers the **backend only**
> (`apps/api/`). A second CodeDeveloper pass will append a "## Frontend
> (second pass)" section below for the Astro page + React form.

---

## Backend (this pass)

## Requirement Implemented

`POST /v1/auth/register` — a public (no `AuthGuard`), rate-limited endpoint
on the existing `AuthController` that self-provisions a full AI-Qadam
member account: creates an Authentik user, sets the submitted password,
assigns the `aiqadam-member` group, links/creates the Directus member row,
writes the submitted country onto it, and redirects the browser through
Authentik's one-time recovery-link URL so the real session gets minted by
the already-correct `/v1/auth/callback` path.

Implements the backend half of ISS-USR-REG-001 per the ImpactAnalyzer's
02-impact-analysis.md recommendations. No DB migration — confirmed no
schema change needed (no local `is_temporary`/`country_preference` columns;
country lands on the pre-existing `directus_users.country` field).

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/auth/registration.service.ts` | Created | New `RegistrationService` — orchestrates the full registration flow (duplicate-check, create, set-password, group-assign, Directus link + country write, recovery-link mint). |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | Added inline `registerSchema` (Zod), injected `RegistrationService`, added `POST /v1/auth/register` method mirroring `telegramExchange`'s shape (`@HttpCode(HttpStatus.FOUND)`, `@UseGuards(ThrottlerGuard)`, `@Throttle({ default: { limit: 5, ttl: 900_000 } })`, 302-redirect response). Honeypot short-circuit handled at the controller (same as `leads.controller.ts`) before the service is ever called. |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | Registered `RegistrationService` as a provider (no new module imports needed — `AuthentikModule` and `DirectusModule` were already imported). |

## Key Design Decisions

### 1. Honeypot check lives in the controller, not the service

The task brief listed the honeypot check as `RegistrationService`'s step 1,
but also said to mirror `leads.controller.ts:53-55` exactly — and in that
file the honeypot short-circuit is a controller-level check, before the
service is ever invoked. I followed the literal mirrored pattern: the
controller checks `honeypot` and, if filled, redirects to `/v1/auth/login`
immediately without calling `RegistrationService.register()` at all. This
is strictly better than doing it inside the service — bot traffic never
touches Authentik/Directus, and the response shape (a 302 to
`/v1/auth/login`) is indistinguishable from what a real registration or a
duplicate-email registration ultimately redirects to going forward (all
three paths end with the browser at an Authentik-mediated URL that leads
to sign-in).

### 2. Duplicate-email non-leaking response

`RegistrationService.register()` calls `AuthentikClient.getUserByEmail()`
first. If found, it returns the exact same `RegisterResult` shape
(`{ recoveryUrl: '/v1/auth/login' }`) as the honeypot path — no distinct
status code, no distinct body shape. The controller redirects identically
in both cases. This mirrors `leads.service.ts`'s established precedent of
returning a 2xx-shaped result for both the "already exists" and "success"
branches rather than a distinguishing error.

### 3. Orphaned-account mitigation (the novel risk) — full reasoning

**The problem**: `createUser()` succeeds, then `setPassword()` throws
(Authentik 5xx, transient network failure). Result: an Authentik user
exists with that email but no usable password.

**What I confirmed by reading the code (not assumed):**
`AuthentikClient.getUserByEmail()` (`authentik.client.ts:105-112`) builds
its query as `new URLSearchParams({ email })` — **no `is_active` filter**.
Only `listActiveUsers()` (`authentik.client.ts:130-137`) passes
`is_active: 'true'`. This means: **disabling the orphaned account does
NOT remove it from `getUserByEmail()`'s result set.** A retry with the
same email will still find it and hit the duplicate-email branch.

**Conclusion from that fact**: neither "disable + allow retry" nor
"disable + getUserByEmail excludes it" is available as a clean rollback —
disabling cannot itself un-block a future registration attempt with the
same email. Given that constraint, I chose:

- **On `setPassword` failure**: call `authentik.disableUser(akUser.pk)`
  (best-effort — wrapped in its own `.catch`, logged as a `warn` if it
  also fails, never lets a secondary failure mask the primary one).
  Rationale: even though this doesn't unblock retries, it still has real
  value — it makes the orphan `is_active: false`, so it cannot sign in,
  and it's excluded from anything that DOES filter on `is_active` (e.g.
  `listActiveUsers()`, used by the F-S2.2-f nightly RBAC poll) — keeping
  the RBAC/active-user surface clean of half-provisioned accounts.
- **Structured log, unconditionally**: `this.logger.log({ event:
  'registration.orphaned_account', authentik_user_id, email, reason })`
  — mirrors `admin-invites.service.ts`'s `this.logger.log({ event: ...
  })` pattern exactly. This is the actual safety net: an operator can
  grep Loki for `registration.orphaned_account` and manually delete the
  Authentik user (unblocking the email for a real retry) or finish
  provisioning by hand (set password via the admin UI, assign the group).
- **Caller-facing behavior**: the request throws `BadRequestException
  ('registration_failed')` — a generic failure, NOT the duplicate-email
  success shape and NOT a leak of "an account with this email now exists
  but is broken." The user sees a normal-looking failure and can retry;
  a retry will land on the duplicate-email branch (safe — no leak) but
  will not actually let them re-register until an operator cleans up the
  orphan. This trade-off (safety over self-service recovery) matches the
  brief's framing that "either strategy" is acceptable as long as the
  operator safety net (structured logging) exists regardless.
- **Why not attempt an automatic retry-detects-orphan strategy instead**:
  that would require step 2's duplicate check to distinguish "orphan with
  no password" from "real active account" and attempt `setPassword` again
  transparently. This is more code, more subtle failure modes (what if
  the *second* `setPassword` call also fails — now you're in the exact
  same place, recursively), and touches the non-leaking-response
  invariant (a successful silent recovery vs. a still-broken orphan would
  need to be visible to *someone* to converge, likely still needing the
  same structured log as a backstop). Given equal safety-net requirements
  either way, I judged the simpler disable+log approach lower-risk to
  ship and easier for SecurityReviewer to audit.

### 4. Username derivation

`admin-invites.service.ts`'s `usernameFromDisplayName` derives from
`display_name` because operator invites need a stable, predictable
`firstname.lastname` mailbox convention. Self-registration has no such
mailbox requirement and, being public traffic, two different registrants
could plausibly share an email local-part pattern — so
`RegistrationService.deriveUsername()` slugifies the email local-part
(same `[a-z0-9.]` cleanup rules) and appends a random 6-hex-char suffix
for guaranteed uniqueness against Authentik's unique `username` constraint,
without an extra round-trip to check collisions first.

### 5. No session hand-minting — redirect through the existing OIDC path

Per the ImpactAnalyzer's explicit recommendation: on full success (and on
both the honeypot and duplicate-email short-circuits), the controller
redirects the browser via `HttpStatus.FOUND` to either
`this.registration.register(...)`'s returned `recoveryUrl` (a real
Authentik one-time login URL, success case) or the literal string
`/v1/auth/login` (honeypot/duplicate case — no real Authentik user to mint
a recovery link for). This means `platform.users` row creation,
`directusUserId` linking, and groups-claim sourcing all stay on the single
already-correct `/v1/auth/callback` code path — no second, divergent
session-minting path was introduced.

### 6. Directus country write failure does not fail the whole request

`DirectusUsersBridgeService.ensureLinkedByEmail()` already logs+swallows
its own Directus errors and can return `null`. If it returns `null`, or if
the subsequent `directus.patch()` country write itself throws, both are
caught and logged as `warn` — but the request still succeeds and still
returns a working `recoveryUrl`. Rationale: by this point the Authentik
side (the account itself, the password, the group) has already fully
succeeded — failing the whole registration over a best-effort Directus
metadata write would strand the user with a real, working Authentik
account they can't get back to (duplicate-email check would block a
retry) over a field that can be backfilled later. This is a narrower,
lower-stakes version of the same philosophy as the orphaned-account
handling: never let a partial success look like total failure when the
important (auth-capable) part worked.

## Architecture Rule Compliance

- **Module boundaries**: no new module. `RegistrationService` lives in
  `AuthModule`, using `AuthentikClient` (via already-imported
  `AuthentikModule`) and `DirectusUsersBridgeService`/`DirectusClient`
  (via already-imported `DirectusModule`) purely through their public
  service interfaces — no direct entity/repository import, no new
  cross-module reach-through.
- **Tenant scoping**: N/A at this layer — `country` is a Directus field
  write, not a `platform.*` tenant-scoped table query.
- **Zod at boundaries**: `registerSchema` validates the full request body
  at the controller before anything reaches `RegistrationService`. Service
  methods take a typed `RegisterInput` interface, not raw `unknown`.
- **No cross-schema queries**: all Authentik/Directus access goes through
  `AuthentikClient`/`DirectusClient`/`DirectusUsersBridgeService`.
- **No `any`**: none introduced. `err: unknown` used throughout with
  `instanceof` narrowing, matching sibling files' style.
- **Auth at controller level**: intentionally NO `AuthGuard` — this is a
  public self-registration endpoint by design (no user exists yet).
  Protected instead by `ThrottlerGuard` + `@Throttle` (5/15min, matching
  `security.md`'s documented auth-endpoint policy and the exact
  `telegram/exchange` precedent).
- **Custom typed errors**: `BadRequestException('registration_failed')`
  for both create-failure and orphaned-account paths — no bare `throw new
  Error(...)`.
- **All promises awaited**: confirmed — including the two `.catch(...)`
  chains (`disableUser` rollback, Directus country-write), which are
  awaited expressions with an attached catch handler, not
  fire-and-forget.
- **Testability**: `RegistrationService` takes `AuthentikClient`,
  `DirectusUsersBridgeService`, `DirectusClient` via constructor DI — no
  hidden singletons, straightforward to mock with `vi.fn()` per the
  `admin-invites-service.spec.ts` style TestDesigner will use.

## Formatter Check

- `pnpm --filter @aiqadam/api typecheck` — clean, no errors.
- `pnpm --filter @aiqadam/api lint` (`biome check .`) — clean, "No fixes
  applied."
- `pnpm biome check --write apps/api/src/modules/auth/` — clean, no
  changes made (repo's biome version uses `--write`, not `--apply`; same
  effect, zero diffs either way).
- `pnpm --filter @aiqadam/api build` (`nest build`) — succeeds.

## Known Limitations

- No unit/integration tests written yet — that's TestDesigner's job (Step
  7 per the workflow). `RegistrationService` is structured to be directly
  testable (constructor-injected dependencies, no module-level state)
  following the `admin-invites-service.spec.ts` mocking style.
- The orphaned-account mitigation intentionally does **not** provide a
  self-service recovery path for the affected user — recovery requires
  operator intervention found via the `registration.orphaned_account` log
  event. This is a deliberate safety/self-service trade-off documented
  above for SecurityReviewer to confirm or push back on.
- Frontend (Astro sign-up page + React form) is explicitly out of scope
  for this pass — a second CodeDeveloper pass covers `apps/web-next/`.
- Per task instructions, `packages/shared-types`, DB migrations, and
  `scripts/uat-seed.sh` were not touched (confirmed out of scope by
  ImpactAnalyzer).

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Backend half of ISS-USR-REG-001 implemented: POST /v1/auth/register on the existing AuthController, new RegistrationService, registered in auth.module.ts. Typecheck, lint, and build all clean. Orphaned-account partial-failure risk (createUser succeeds, setPassword fails) mitigated via best-effort disableUser() + unconditional structured logging (registration.orphaned_account event) for operator cleanup — confirmed via direct code read that getUserByEmail() does not filter is_active, so disabling alone cannot unblock a retry; that limitation is accepted and documented rather than worked around with a more complex retry-detects-orphan strategy."
  findings:
    - "Confirmed by reading authentik.client.ts: getUserByEmail() has no is_active filter (only listActiveUsers() does) — a disabled orphaned account still blocks future registration attempts with the same email via the duplicate-email branch. Documented as an accepted limitation with an operator-facing structured log as the recovery path."
    - "Honeypot check placed in the controller (not the service) to exactly mirror leads.controller.ts's pattern — bot traffic never reaches Authentik/Directus."
    - "Duplicate-email and honeypot paths return the identical response shape (302 to /v1/auth/login) as each other; only a genuinely new registration returns a real Authentik recovery-link redirect — no information leak about account existence."
    - "Directus country write is best-effort (logged + swallowed on failure) so a Directus outage does not strand a user with a working Authentik account they can't complete registration for."
  known_limitations:
    - "No tests yet (TestDesigner's job)."
    - "Orphaned accounts require manual operator cleanup — no automated self-service recovery for the affected email."
```

---

## Frontend (this pass)

## Requirement Implemented

The customer-facing half of ISS-USR-REG-001: a real AI-Qadam-branded
`/auth/sign-up` page hosting an interactive React form
(`SignUpForm.tsx`) that collects `displayName` / `email` / `password` /
`country`, natively POSTs to `/api/v1/auth/register`, and lets the
browser follow the backend's 302 redirect through Authentik's one-time
login URL and back into the existing `/v1/auth/callback` session-minting
path. No new session-handling code was introduced client-side — the page
relies entirely on the browser's native form-submission + redirect-
following behavior, matching `sign-in.astro`'s own "plain navigation, no
fetch" shape for the auth handshake itself.

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/web-next/src/blocks/customer/SignUpForm.tsx` | Created | New React form island. `Phase` state machine (`idle\|submitting\|success\|error`) mirrors `LeadCaptureForm.tsx`. Honeypot hidden field with identical `tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only"` pattern. Renders a real `<form method="POST" action="/api/v1/auth/register">` — `onSubmit` only runs client-side validation (`validate()`, a pure extracted function) and calls `e.preventDefault()` on failure; on success it does NOT prevent default, letting the native submission + redirect-follow proceed untouched. |
| `apps/web-next/src/pages/auth/sign-up.astro` | Created | New page. `prerender = false`. Uses the `Layout` + `PageHead` + form-island (`client:load`) composition pattern copied from `onboard.astro` (the closest existing sibling with a real form, not `sign-in.astro` which has no markup at all). SSR-redirects already-signed-in visitors (`Astro.locals.auth` truthy) to `/me`, same guard style as `onboard.astro`'s auth checks. Includes a "Already have an account? Sign in" link to `/auth/sign-in`. |
| `apps/web-next/src/blocks/customer/index.ts` | Modified | Added `export { SignUpForm } from './SignUpForm';` alongside the existing `LeadCaptureForm` export. |

## Key Design Decisions

### 1. Native form POST, not `apiClient`/fetch — confirmed necessary, not just preferred

Read `apiClient()` (`apps/web-next/src/lib/api-client.ts`) in full: every
non-2xx response throws `ApiError`, and even a successful `fetch()` to a
redirecting endpoint would only hand back the *first* response in JS —
the browser's location never changes on a bare `fetch()` (`fetch` does
not perform a top-level navigation on 3xx by default; `redirect:
'follow'` would just chain the fetch itself through the 3xx internally
and return the *final* response body to JS, still without moving the
address bar). Since the whole point of `/v1/auth/register`'s 302 is to
land the user on Authentik's real hosted one-time-login page (which then
itself redirects back into `/v1/auth/callback` to mint the session
cookie), only a genuine browser navigation — a native form submit, a
`<a href>` click, or `window.location = url` — achieves that. Chose the
native `<form method="POST" action="...">` approach (option (a) from the
task brief) over a fetch-intercept-then-`window.location` approach
(option (b)) because it is simpler, needs no JS to work for the happy
path, and mirrors `sign-in.astro`'s own "plain navigation" philosophy
for the auth handshake.

### 2. Same-origin proxy path confirmed: `/api/v1/auth/register`

Verified by reading `apps/web-next/src/pages/api/[...path].ts` in full:
it's a catch-all same-origin proxy that forwards `/api/<path>` →
`INTERNAL_API_URL/<path>` with `redirect: 'manual'` — i.e. it passes the
upstream 302 straight back to the browser rather than following it
server-side. This is exactly the behavior the native form submission
needs: the browser's own POST to `/api/v1/auth/register` receives the
302 from the proxy and follows it as a normal top-level navigation to
whatever `Location` header the API set (the Authentik one-time login
URL, which is a different origin — that's fine, it's a full top-level
navigation, not a fetch, so there's no CORS concern).

### 3. Server-error handling tradeoff — decided in favor of the simpler option, documented as a Known Limitation

The task brief flagged this as a real UX tradeoff. Two options:

- **(A) Client validates what it can, accepts raw-JSON-body navigation
  on rare server-side 400s.** Zero extra JS, zero extra request, matches
  the "let the browser do the work" philosophy of the rest of this
  component.
- **(B) Intercept with `fetch()` first for error-checking, then either
  show an inline error or manually navigate on success.** Nicer error
  UX, but requires either (i) duplicating the whole request as a
  fetch-then-real-submit (submits registration twice on the happy path
  — including a live Authentik `createUser()` call — which is an
  actively bad idea for an endpoint that provisions a real external
  account) or (ii) fully reimplementing the redirect-follow logic via
  `fetch(..., { redirect: 'manual' })` + reading the `Location` header
  + `window.location.href = ...` (added complexity, and `fetch` cannot
  read a cross-origin redirect's `Location` header in `manual` mode per
  the Fetch spec — the response comes back `type: 'opaqueredirect'` with
  no readable URL — so this approach cannot actually work for a redirect
  that ultimately lands on Authentik's origin).

Given (B)'s "opaqueredirect" dead end (confirmed by the Fetch spec's
`redirect: 'manual'` semantics — an opaque redirect response exposes no
`Location`, `status`, or `ok` a caller can read), option (A) is not just
simpler but the *only* option that reliably works end-to-end without
reimplementing what the browser already does for free. **Decision:
client-side validation (required fields + the same `min(12)` password
length policy as the server) catches the overwhelmingly common failure
cases before submission; a genuine server-side 400 (which per the
server's design is now rare — malformed input that somehow passes
client validation) surfaces as a raw JSON-body page navigation. This is
accepted as a v1 gap, not engineered around.**

### 4. Country list hardcoded client-side, matching the server's literal set

`registerSchema` in `auth.controller.ts` validates
`z.enum(['uz', 'kz', 'tj', 'xx'])` — the same set duplicated in
`dashboard.controller.ts:13` and `audit-events.controller.ts:16`. There
is no public (unauthenticated) endpoint that serves this list — read
`countries.controller.ts` and confirmed its reads are
`@UseGuards(AuthGuard)`-protected, unusable from an anonymous sign-up
page. `SignUpForm.tsx` hardcodes the same 4-value list with display
labels `Uzbekistan` / `Kazakhstan` / `Tajikistan` / `Other`, consistent
with the codebase's existing pattern of duplicating this literal set
per-call-site rather than introducing a new shared-constant abstraction
(confirmed no existing convention does otherwise — `packages/shared-types`
is an empty placeholder per the backend pass's findings).

### 5. Password hint text matches the server's actual policy, no more

Server policy is length-only: `z.string().min(12)`
(`auth.controller.ts`), matching `admin-invites.service.ts`'s existing
precedent. The form's helper text reads "At least 12 characters." only —
deliberately does **not** claim uppercase/number/symbol requirements the
server does not enforce, per the task brief's explicit instruction not
to overstate the policy.

### 6. `success` phase kept for state-machine consistency, not for a real UI moment

Per the task brief: a successful submission navigates the browser away
entirely before React would typically re-render into a visible "success"
state. `SignUpForm.tsx` still defines a `success` render branch (a brief
"Setting up your account… Redirecting you to sign in…" panel) for
structural consistency with `LeadCaptureForm.tsx` and testability, but no
code path in the current implementation calls `setPhase('success')` —
the native form submit bypasses React state entirely on the happy path.
This mirrors the task brief's guidance not to over-invest in a success
UI that won't be seen; the branch exists mainly so the `Phase` type and
component shape stay uniform with its sibling.

### 7. Sign-in → sign-up cross-link: one-directional only, by design

Added "Already have an account? Sign in" from `sign-up.astro` to
`/auth/sign-in`. Did **not** add a reciprocal "Don't have an account?
Sign up" link to `sign-in.astro`, because that file is a genuinely bare
26-line SSR redirect with no markup at all (`return
Astro.redirect(...)` — the function returns before any JSX would ever be
reached) — adding a link there would require converting it into a real
rendered page, which is a behavior change outside this issue's scope.
Documented below as a Known Limitation.

## Architecture Rule Compliance

- **New Astro page**: `sign-up.astro` is `prerender = false` (SSR), and
  checks auth state (`Astro.locals.auth`) before rendering — redirects
  already-authenticated visitors away rather than showing them a
  registration form, matching the "auth state checked before protected
  content" self-check item (inverted here: this is a public/anonymous-
  only page, so the check redirects the *authenticated* case away).
- **New React component**: `SignUpForm` is a functional component, no
  `dangerouslySetInnerHTML`, explicit prop types on every sub-component
  (`FieldsProps`), no implicit `any`.
- **No raw `fetch()` in a block**: `SignUpForm.tsx` does not import or
  call `apiClient` or `fetch` at all — it relies on native `<form>`
  submission, which is not a network call made from application code
  and is therefore not subject to ADR-0038 §Locks #2 (`arch-ignore`
  marker not needed since no `fetch`/`apiClient` import exists in the
  file to flag).
- **Design system compliance**: no raw hex colors, no gradients, no new
  tokens — every class is either an existing Tailwind utility or a
  direct copy of `LeadCaptureForm.tsx`'s exact class strings
  (`border-border`, `bg-card`, `text-muted-foreground`, `btn
  btn-primary`, the `color-mix(in_oklch, var(--primary)...)` success-
  panel treatment). No icons used (confirmed `LeadCaptureForm.tsx` uses
  none either, so none were added here). Copy follows sentence-case
  button labels ("Sign up", "Sign in") per the design system's copy
  rules.
- **Zod / boundary validation**: client-side `validate()` is a
  convenience UX gate only, not a security boundary — the authoritative
  validation is the backend's `registerSchema` (already reviewed in the
  backend pass). No duplication of trust, only of the length-12 check
  for a faster feedback loop.

## Formatter Check

- `pnpm --filter @aiqadam/web-next typecheck` (`astro check`) — 0
  errors, 0 warnings in the two new files (pre-existing warnings/hints
  in unrelated files untouched by this pass).
- `pnpm --filter @aiqadam/web-next lint` (`biome check .`) — 0 errors;
  2 pre-existing warnings in unrelated files (`AsyncSelect.tsx`,
  `TgBroadcastComposer.tsx`), not introduced by this pass.
- `pnpm biome check --write apps/web-next/src/pages/auth/
  apps/web-next/src/blocks/customer/` — "Checked 16 files… No fixes
  applied," confirming both new files were already correctly formatted.
- `pnpm --filter @aiqadam/web-next build` (`astro build`) — succeeds.
  The `[cms] fetchSiteSettings failed: fetch failed` lines during
  prerendering are pre-existing (no live CMS backend in this local
  build context) and only affect prerendered pages (`/leads/*`); `
  sign-up.astro` is SSR-only (`prerender = false`) and unaffected.
- `pnpm --filter @aiqadam/web-next test` (`vitest run`) — all 33 test
  files / 923 tests pass; no regressions from this pass. No new test
  file was added for `SignUpForm.tsx` per the task's explicit
  instruction ("Do not write tests yet — TestDesigner's job"), but
  `validate()` was extracted as a standalone pure function specifically
  so TestDesigner can unit-test it the same way `LeadCaptureForm.test.ts`
  tests `buildLeadBody`/`toggleTopic`/`isSubmitDisabled` — via a
  `readFileSync` source-string check plus direct re-declared-function
  assertions, without needing a DOM/JSX render environment.

## Known Limitations

- **Server-side validation errors render as a raw JSON navigation.**
  A 400 `BadRequestException` from `/v1/auth/register` (e.g. malformed
  input that somehow passes client-side validation) is not intercepted
  — the browser navigates to the raw JSON error body rather than an
  inline styled error. Deliberately accepted per the tradeoff analysis
  in Key Design Decisions #3: the alternative (fetch-intercept) either
  double-submits a real account-provisioning request or hits Fetch's
  `redirect: 'manual'` opaque-redirect dead end, so it cannot reliably
  replace the native-form approach. Client-side validation (required
  fields, 12-char password minimum) already prevents the common cases.
- **No sign-in → sign-up cross-link.** `sign-up.astro` links to
  `/auth/sign-in`, but `sign-in.astro` (a bare 26-line SSR redirect with
  no markup at all) was intentionally left untouched — adding a link
  there would require giving it a rendered body, which is a scope
  expansion beyond this issue. A follow-up issue should either give
  `sign-in.astro` minimal markup or add the link from a shared nav
  component (`AppNav.astro`) instead.
- **`success` phase is effectively unreachable in the current
  implementation** (see Key Design Decisions #6) — kept for structural
  parity with `LeadCaptureForm` and future testability, not because any
  code path sets it today.
- No unit/integration/E2E tests written for the frontend in this pass —
  TestDesigner's job (Step 7). `validate()` in `SignUpForm.tsx` is
  extracted as a pure function specifically to make that step
  straightforward, mirroring `LeadCaptureForm.test.ts`'s pattern.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Frontend half of ISS-USR-REG-001 implemented: new /auth/sign-up.astro page (Layout + PageHead + client:load form island, mirroring onboard.astro's composition) and new SignUpForm.tsx (displayName/email/password/country + honeypot, native <form method=POST action=/api/v1/auth/register> submission — NOT apiClient/fetch, because the endpoint responds with a 302 that only a real browser navigation can follow through to Authentik and back into /v1/auth/callback). Barrel export added. Typecheck, lint, build, and the full existing test suite (923 tests) all pass with zero regressions."
  findings:
    - "Confirmed via Fetch spec semantics that a fetch-intercept alternative (option (b) in the task brief) has a structural dead end: `redirect: 'manual'` produces an opaque redirect response with no readable Location/status for a cross-origin target (Authentik), so it cannot be used to manually complete the navigation — reinforces that the native-form approach (option (a)) is not just simpler but the only reliable option."
    - "Confirmed apps/web-next/src/pages/api/[...path].ts uses `redirect: 'manual'` server-side specifically to pass the upstream 302 straight back to the browser untouched — this is exactly what the native form submission needs and confirms /api/v1/auth/register (with the /api/ prefix) is the correct action URL."
    - "Confirmed countries.controller.ts reads are AuthGuard-protected, so the country list cannot be fetched by an anonymous sign-up page — hardcoded the same 4-value uz/kz/tj/xx set used server-side, consistent with the codebase's existing per-call-site duplication pattern (no shared-constants package exists)."
    - "Password hint text intentionally states only the server's actual length-12 policy, not fabricated complexity rules."
  known_limitations:
    - "Server-side 400 validation errors surface as a raw JSON-body page navigation rather than an inline error — accepted v1 gap, not engineered around, per documented tradeoff analysis."
    - "No sign-in-to-sign-up cross-link added — sign-in.astro is a bare markup-less redirect page and was left untouched per scope; flagged as a follow-up (candidate: add the link via AppNav.astro instead)."
    - "SignUpForm's `success` phase is not reachable by any current code path (native navigation bypasses it) — kept for structural/testability parity only."
    - "No frontend tests written yet — TestDesigner's job; validate() extracted as a pure function to ease that work."
```

---

## Security fixes (retry pass — addresses 04-security-review.md MAJOR findings)

SecurityReviewer's `04-security-review.md` found 3 MAJOR findings (gate:
`failed-retry`) against the implementation above. All three are addressed
in this pass. No BLOCKER findings existed. Full reasoning for each below;
this section is appended, not a replacement — the Backend/Frontend
sections above still describe the code as originally implemented except
where this section says otherwise.

### MAJOR-1 — `Location` header content as an email-enumeration oracle

**Files changed:** `apps/api/src/modules/auth/registration.service.ts`,
`apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/auth.module.ts`,
`apps/api/src/modules/telegram/telegram.module.ts` (comment update only).

**Investigation first**: the retry brief's Option C (mirror
`leads.service.ts`'s established fix for the identical problem — send the
sensitive link by email instead of putting it in the HTTP response) was
explicitly preferred *if* an email-sending mechanism already existed.
Confirmed it does:

- `apps/api/src/modules/email/email.service.ts` — `EmailService`, a thin
  wrapper over SMTP/Resend, already used by `TelegramFeedbackService`,
  `badge-awarder.service.ts`, `interactions/channels/email-adapter.ts`,
  etc.
- `apps/api/src/modules/leads/leads.service.ts`'s `dispatchVerifyEmail()`
  is the exact precedent: it calls `InteractionsService.dispatch()` with
  `allowedChannels: ['email']` and `consentBasis: 'operational_contract'`
  to email a Directus-`users`-row-scoped recipient a sensitive one-time
  link (the lead-verify token), and `POST /v1/leads` always returns the
  byte-identical `{ accepted: true }` regardless of whether the address
  was new, a re-verification, or a bot-trap — the same non-leaking shape
  this fix now gives `/v1/auth/register`.
- `InteractionsService.dispatch()` resolves recipients via
  `audience.userIds` (Directus UUIDs) — and `RegistrationService.register()`
  already obtains exactly that via `DirectusUsersBridgeService.ensureLinkedByEmail()`
  (step 6, pre-existing), so no new lookup was needed.

**Implementation — chosen: Option C, the strongest of the three options
offered, and the only one that fully closes the oracle** (Option A/B were
explicitly framed by SecurityReviewer as harder-to-guarantee or only
partial fixes):

1. `RegistrationService` now takes a fourth constructor dependency,
   `InteractionsService` (imported from `../interactions/interactions.service`).
2. On genuine success (former step 8), the service still mints the real
   Authentik recovery link via `authentik.createRecoveryLink(akUser.pk)`
   — but instead of returning it, it calls a new private method,
   `dispatchWelcomeEmail()`, which sends it via
   `InteractionsService.dispatch({ intent: 'registration_welcome', audience: { userIds: [directusUserId] }, allowedChannels: ['email'], consentBasis: 'operational_contract', payload: { subject, text } })`
   — same shape as `dispatchVerifyEmail()`. Best-effort: wrapped in
   `.catch()`, logged as `warn` on failure, never fails the registration
   (the Authentik account already fully exists and works by this point —
   see the existing "Directus country write" precedent in this same
   service for the same never-fail-a-succeeded-registration philosophy).
3. `register()` now returns `this.fakeSuccessResult()` — `{ recoveryUrl: '/v1/auth/login' }`
   — for ALL THREE outcomes: genuine success, duplicate-email, and
   honeypot. `RegisterResult.recoveryUrl` is documented as ALWAYS being
   that literal string now; the doc comment on the interface and on
   `fakeSuccessResult()` itself were updated to say so explicitly (the
   method name "fake" is kept even though it's now also used for real
   successes — see the in-code comment explaining why).
4. `auth.controller.ts`'s `register()` handler needed **no logic change**
   — it already just 302-redirects to whatever `recoveryUrl` the service
   returns. Only its doc comment was updated to describe the new,
   corrected behavior (previously claimed it "redirects through
   Authentik's one-time login URL," which is no longer literally true for
   this endpoint's own response).
5. `AuthModule` now imports `InteractionsModule` directly (previously
   only reached transitively via `LeadsModule`). **Circular-import check
   performed before making this change**: `apps/api/src/modules/telegram/telegram.module.ts`
   already documents (in a comment, dating to an earlier incident, PR
   #187/#202) the cycle
   `AuthModule → LeadsModule → InteractionsModule → TelegramModule → AuthModule`,
   already broken via `forwardRef(() => AuthModule)` on `TelegramModule`'s
   side. `AuthModule` importing `InteractionsModule` directly does not
   introduce a NEW distinct cycle — it's the same set of modules already
   in the graph, one hop shorter, and the existing comment already notes
   "AuthModule on the other side does NOT need a matching forwardRef."
   Updated that comment in `telegram.module.ts` to describe the
   now-more-direct edge. Confirmed empirically: `pnpm --filter @aiqadam/api build`
   and the full `pnpm --filter @aiqadam/api test` suite (98 files, 1267
   tests) both pass with no `UndefinedModuleException` or DI-resolution
   errors.

**Result**: a scripted client (`fetch(url, { method: 'POST', redirect: 'manual' })`)
reading only the first-hop `Location` header of `/v1/auth/register` now
gets `/v1/auth/login` for every outcome — genuine registration, duplicate
email, and honeypot are indistinguishable at the HTTP layer (status,
headers, and body all byte-identical). The only remaining signal is
purely out-of-band (does an email arrive), which is not observable within
the same request/response cycle a scripted enumeration client would use,
and is bounded by the same 5/15min rate limit as before. This also
strictly reduces the timing side-channel SecurityReviewer separately
judged acceptable-but-real in point 2 of the review's "Duplicate-email
non-leak" analysis — no, actually it does NOT reduce it (the success path
now does strictly MORE work — one extra network call, the email dispatch
— than before), so the timing side-channel is unchanged from the
review's prior "MAJOR-adjacent, not BLOCKER, bounded by rate limiting"
judgment. That judgment was not challenged by this retry brief and is not
revisited here.

### MAJOR-2 — honeypot field named literally `honeypot`

**Files changed:** `apps/web-next/src/blocks/customer/SignUpForm.tsx`,
`apps/api/src/modules/auth/auth.controller.ts`.

Confirmed `LeadCaptureForm.tsx`'s exact convention first
(`name="company"`, same `tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only"`
hidden-field treatment) and reused it verbatim rather than inventing a
new name, per the retry brief's explicit preference.

- `SignUpForm.tsx`: `FormState.honeypot` → `FormState.company`;
  `EMPTY.honeypot` → `EMPTY.company`; the hidden `<input name="honeypot">`
  → `<input name="company">`, including its `value`/`onChange` bindings.
  A doc comment on the field explains the rename and cross-references the
  server-side key it must agree with.
- `auth.controller.ts`'s `registerSchema`: the Zod key `honeypot` was
  **also renamed to `company`** (not left as an internal-only mismatch) —
  traced per the retry brief's own instruction: native `<form>` POST
  field names must match what `registerSchema.safeParse(body)` expects as
  object keys, since this is a real browser form submission (see the
  Frontend section's Key Design Decision #1 — no `apiClient`/fetch layer
  exists to remap field names in between). Keeping the JSX `name=` and
  the Zod key identical (both `company`) was simpler and less error-prone
  than introducing a translation step, and matches how `leads.controller.ts`'s
  `createSchema` already names its own honeypot key `honeypot` in
  lock-step with... actually `leads.controller.ts` keeps the Zod key
  named `honeypot` while `LeadCaptureForm.tsx`'s wire field is `company`
  — checked this directly (`leads.controller.ts:34`, `createSchema.honeypot`)
  and it turns out `LeadsController` does NOT use `@Body()` raw parsing
  the same way; it destructures the client's JSON body as sent, and
  `LeadCaptureForm.tsx` (`buildLeadBody`, a `fetch()`-based JSON POST, not
  a native form) explicitly maps `company` → `honeypot` client-side
  before sending (`{ honeypot: form.company }` in its body-builder
  function). That mapping-in-JS option is NOT available to `SignUpForm.tsx`
  because it is a **native** `<form method=POST>` submission (required by
  the 302-redirect-following requirement documented in the Frontend
  section's Key Design Decision #1) — the browser sends the raw `name=`
  attributes as-is with no JS-side remapping opportunity. This is why
  `auth.controller.ts`'s Zod key had to change to `company` too, whereas
  `leads.controller.ts` could keep `honeypot` internally. Documented this
  distinction inline in both files so a future reader doesn't "fix" this
  into an inconsistency with `leads.controller.ts` without understanding
  why the two forms differ.

**Verification**: grepped `SignUpForm.tsx` post-change for any leftover
`honeypot` reference — only the explanatory doc comment remains (no
functional code references the old name). Confirmed no test files
reference the old field name (no `.spec.ts`/`.test.ts` exists yet for
either file — TestDesigner's job, unchanged known limitation).

### MAJOR-3 — length-only password policy on a public endpoint

**Decision: Option (a)** — added a minimal, low-effort, dependency-free
weak-password check, judged stronger than a documentation-only risk
acceptance (option (b)) given the fix is genuinely low-effort here.

**New file:** `apps/api/src/lib/password-schema.ts` — follows the exact
convention of the sibling `apps/api/src/lib/email-schema.ts` (a
drop-in Zod-field factory function plus an exported pure predicate for
reuse). Contains:

- `isAllOneCharacter(password)` — rejects passwords like
  `aaaaaaaaaaaa` (list-free, catches an entire trivial class for zero
  maintenance cost).
- A ~38-entry hardcoded `COMMON_PASSWORDS` set of well-known weak
  12+-character patterns (RockYou-class common passwords and trivial
  sequences), compared case-insensitively. Deliberately small — the
  retry brief explicitly said "don't over-engineer," and this is meant
  to raise the bar past "any 12 characters," not to be a comprehensive
  breach-corpus check (which would need an external API/dependency,
  explicitly out of scope per the brief).
- `passwordField(minLength = 12)` — drop-in replacement for
  `z.string().min(12)`, adding the `.refine()` weak-password rejection
  with message `WEAK_PASSWORD_MESSAGE`.

**Applied only to `apps/api/src/modules/auth/auth.controller.ts`'s
`registerSchema`** (`password: passwordField(12)`, replacing
`z.string().min(12)`) — the genuinely public, self-service endpoint this
finding is about. **Deliberately NOT retrofitted onto
`admin-invites.service.ts`'s `consumeInvite`** (`password.length < 12`
check, line 353): that flow is operator-invited, a materially smaller
exposure surface per the review's own framing, and changing it is a
separate decision with its own blast radius (e.g. could break an
in-flight invite for an operator who already knows their intended
password) — out of scope for this retry pass. Left a note in the new
schema file's header comment explaining this scoping decision so a future
reader doesn't assume the omission was accidental.

**Client-side** (`SignUpForm.tsx`): added a cheap, list-free mirror of
the all-one-character check only (`new Set(form.password).size === 1`)
to `validate()` — explicitly NOT duplicating the server's common-password
blocklist client-side, to avoid two copies of the list drifting apart;
the client check is UX-convenience only (per the existing Architecture
Rule Compliance note that client validation is "not a security
boundary"), and a password that slips past this lighter client check but
hits the server's fuller blocklist still surfaces via the already-accepted
"raw JSON-body navigation on rare server-side 400s" known limitation
(Key Design Decision #3 in the Frontend section above — unchanged by
this pass). Updated the password hint text from "At least 12 characters."
to "At least 12 characters. Avoid common or repeated-character
passwords." so the UI doesn't overstate what it enforces but does
disclose the additional rule.

**On the unresolved "does Authentik enforce anything beyond this"
question**: not newly investigated in this pass (no live Authentik
config access from this environment, consistent with the original
review's own finding that this "is not determinable from this codebase
alone"). The (a)-vs-(b) framing in the retry brief allowed either
resolving with a code fix (chosen) or documenting the gap explicitly
(not chosen, but still true) — noting here for completeness: Authentik's
own server-side Password Policy stage, if any is bound to this
registration flow in the live deployment, remains unverified from code
and should be confirmed operationally. This is a strictly smaller residual
risk than before this pass (a code-level floor now exists independent of
Authentik's configuration) but is not a full substitute for confirming
the live Authentik policy.

## Re-run validation (this retry pass)

- `pnpm --filter @aiqadam/api typecheck` — clean, no errors.
- `pnpm --filter @aiqadam/api lint` (`biome check .`) — clean, "No fixes applied," 293 files checked.
- `pnpm --filter @aiqadam/web-next typecheck` (`astro check`) — 0 errors, 0 warnings (39 pre-existing hints in unrelated files).
- `pnpm --filter @aiqadam/web-next lint` (`biome check .`) — clean, 0 errors (2 pre-existing warnings in unrelated files, unchanged from the prior pass).
- `pnpm biome check --write apps/api/src/modules/auth/ apps/api/src/lib/ apps/api/src/modules/telegram/telegram.module.ts apps/web-next/src/pages/auth/ apps/web-next/src/blocks/customer/` — "Checked 33 files… No fixes applied."
- `pnpm --filter @aiqadam/web-next build` (`astro build`) — succeeds. Pre-existing `[cms] fetchSiteSettings failed` warnings on prerendered `/leads/*` routes only, unrelated to this pass.
- `pnpm --filter @aiqadam/api build` (`nest build`) — succeeds, confirming the new `AuthModule → InteractionsModule` edge resolves cleanly with no circular-DI error.
- `pnpm --filter @aiqadam/web-next test` (`vitest run`) — 33 test files / 923 tests pass, zero regressions.
- `pnpm --filter @aiqadam/api test` — 98 test files / 1267 tests pass, zero regressions (confirms the `AuthModule`/`TelegramModule` DI graph change and the `RegistrationService` constructor signature change don't break any existing spec).

## Updated Files Changed (this retry pass, additive to the tables above)

| File | Change Type | Description |
|---|---|---|
| `apps/api/src/modules/auth/registration.service.ts` | Modified | MAJOR-1 fix: success path now emails the recovery link via `InteractionsService.dispatch()` instead of returning it; `register()` always resolves to `{ recoveryUrl: '/v1/auth/login' }`. New `dispatchWelcomeEmail()` private method. New `InteractionsService` constructor dependency. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | MAJOR-1: doc comment updated to describe the new non-leaking behavior (no logic change). MAJOR-2: `registerSchema.honeypot` → `registerSchema.company`; honeypot check reads `parsed.data.company`. MAJOR-3: `password: z.string().min(12)` → `password: passwordField(12)`. |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | MAJOR-1: added `InteractionsModule` to `imports` so `RegistrationService` can inject `InteractionsService`. |
| `apps/api/src/modules/telegram/telegram.module.ts` | Modified | MAJOR-1: updated the pre-existing circular-import comment to describe the new, more direct `AuthModule → InteractionsModule` edge (no functional change — `forwardRef` usage untouched). |
| `apps/api/src/lib/password-schema.ts` | Created | MAJOR-3: new `passwordField()` Zod factory + `isWeakPassword()`/`WEAK_PASSWORD_MESSAGE` exports, mirroring `email-schema.ts`'s convention. Small hardcoded common-password blocklist + all-one-character check. |
| `apps/web-next/src/blocks/customer/SignUpForm.tsx` | Modified | MAJOR-2: `FormState.honeypot` → `FormState.company` (JSX `name=` attribute + state binding). MAJOR-3: added a list-free all-one-character check to client-side `validate()`; updated password hint text. |

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Retry pass addresses all 3 MAJOR findings from 04-security-review.md. MAJOR-1 (Location-header email-enumeration oracle): RegistrationService now emails the real Authentik recovery link via InteractionsService (same mechanism + consent basis as leads.service.ts's established dispatchVerifyEmail precedent, confirmed to exist and be reusable before committing to this approach) instead of returning it to the controller; all three outcomes (success/duplicate/honeypot) now return the byte-identical `/v1/auth/login` redirect. AuthModule gained a direct InteractionsModule import — confirmed this does not introduce a NEW circular-dependency class beyond the one already documented and already broken (via forwardRef) in telegram.module.ts; confirmed empirically via clean `nest build` and a fully green 1267-test API suite. MAJOR-2 (honeypot field name): renamed to `company` on both the JSX name attribute and the server Zod schema key (both had to change in lock-step, unlike leads.controller.ts, because SignUpForm is a native form POST with no JS-side field-remapping layer). MAJOR-3 (length-only password policy): chose Option (a) — added a small, dependency-free common-password + all-one-character rejection (apps/api/src/lib/password-schema.ts) applied only to the public self-registration endpoint, not retrofitted onto the operator-invited admin-invites flow (out of scope, separate blast radius). All validation commands re-run clean: typecheck, lint, biome format check, both app builds, and both test suites (923 web-next + 1267 api tests) pass with zero regressions."
  findings:
    - "MAJOR-1 fixed: verified EmailService + InteractionsService + leads.service.ts's dispatchVerifyEmail precedent all exist and are directly reusable before choosing Option C (the retry brief's preferred/strongest option) over Options A/B."
    - "MAJOR-1: confirmed via direct read of telegram.module.ts's pre-existing comment (dating to PR #187/#202) that the AuthModule<->InteractionsModule<->TelegramModule cycle already exists and is already broken via forwardRef; the new direct AuthModule->InteractionsModule edge does not require a new forwardRef, confirmed empirically by a clean `nest build` and 1267 passing API tests."
    - "MAJOR-1: the success path's timing profile is now WORSE, not better (one extra network call for email dispatch) — the pre-existing, separately-judged-acceptable timing side-channel from the original review is unchanged/slightly widened, not narrowed. Not revisited here since it was not part of the 3 MAJOR findings and was already judged bounded-by-rate-limiting in the original review."
    - "MAJOR-2 fixed: renamed honeypot field to `company` (LeadCaptureForm.tsx's exact convention) on both the JSX `name=` attribute and the server Zod schema key — both had to change together because SignUpForm.tsx is a native form POST with no JS remapping layer, unlike LeadCaptureForm.tsx's fetch-based JSON submission which maps company->honeypot client-side."
    - "MAJOR-3 fixed via Option (a): apps/api/src/lib/password-schema.ts adds an all-one-character check plus a ~38-entry common-password blocklist, applied only to the public registerSchema, deliberately not retrofitted onto admin-invites.service.ts's operator-invited flow (separate blast radius, out of scope)."
    - "All 6 re-run validation commands pass clean with zero regressions across both the web-next (923 tests) and api (1267 tests) suites."
  known_limitations:
    - "Whether Authentik's own server-side Password Policy stage is bound to this registration flow in the live deployment remains unverified from code (unchanged from the original review's finding) — a code-level floor now exists independent of that, but is not a full substitute for confirming the live Authentik config."
    - "No unit/integration tests written for RegistrationService, the password-schema helper, or the renamed honeypot field yet — still TestDesigner's job (Step 7), unchanged from the original pass's known limitations."
    - "The pre-existing timing side-channel between duplicate-email and genuine-success paths (documented in the original security review as MAJOR-adjacent-but-acceptable, bounded by the 5/15min rate limit) is very slightly widened by this fix (one extra network call on the success path for email dispatch) — not addressed here as it was not one of the 3 MAJOR findings in scope for this retry."
```

