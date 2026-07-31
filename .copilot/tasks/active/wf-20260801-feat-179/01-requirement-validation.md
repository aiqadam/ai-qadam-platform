# 01 — Requirement Validation: FR-AUTH-004 (Magic-link authentication)

## Raw Input

An already-written requirement, not a raw idea. Source file:
`docs/03-requirements/FR-AUTH-004.md`, status `Planned`,
`github_issue: https://github.com/aiqadam/ai-qadam-platform/issues/127`.

> Users who signed up only via Telegram (no password set) can sign in to
> the web app by receiving a one-time magic link by email. This is the
> step-2 upgrade path for temporary accounts (see FR-AUTH-006) and also a
> recurring passwordless sign-in option for any user. Implemented via
> Authentik's built-in Email stage.

Functional scope as written (5 points): (1) Authentik `magic-link-login`
Email-stage flow, (2) `/auth/sign-in` entry point, (3) email delivery via
existing SMTP/Listmonk, (4) completion issues a session and lands at
`/me`, (5) bot-triggered upgrade via `POST /v1/internal/telegram/upgrade-temp`.

Task framing for this workflow: **this is workflow 1 of a 3-workflow
chain** — FR-AUTH-004 (this workflow, mechanism only) → FR-AUTH-006
(temp-account upgrade semantics, separate later workflow) → FR-BOT-002 PR
6/6 (bot `/upgrade` command, separate later workflow). This validation
covers ONLY FR-AUTH-004's own scope: the magic-link mechanism as a
general passwordless sign-in method. FR-AUTH-006's temp-account upgrade
business logic (points backfill, `is_temporary` flip, CRM sync) is
explicitly out of scope here and is not designed, gated, or ACC'd by this
document.

---

## Analysis

### Completeness Issues Found

1. **AC-5 conflates two workflows' scope.** The FR's own acceptance
   criteria list includes: *"For a temp account, completing the
   magic-link flow removes the `is_temporary=true` flag and awards
   retroactive points for past attended events (see FR-AUTH-006)."* This
   criterion cannot be verified or built in this workflow — the
   `is_temporary` flip and points backfill are FR-AUTH-006's functional
   scope (its own points 4–5), not FR-AUTH-004's. The FR text itself
   acknowledges the dependency ("see FR-AUTH-006") but leaves the AC
   worded as if it belongs here. **Resolution:** the Formalized
   Requirement and draft ACs below narrow this to "AC verified only for
   the non-temp-account / general passwordless case in this workflow; the
   temp-account upgrade behavior itself ships in FR-AUTH-006." CodeDeveloper
   and QualityGate must not attempt to implement the `is_temporary` flip
   or points backfill under this workflow.

2. **Functional-scope point 5 ("Bot-triggered upgrade") is also
   out of scope for this workflow.** It describes the
   `POST /v1/internal/telegram/upgrade-temp` endpoint and bot `/upgrade`
   command — that is FR-BOT-002 PR 6/6's deliverable, gated on
   FR-AUTH-006 shipping first. This workflow only needs to leave the
   extension point FR-AUTH-006 will call into (see Architectural
   Feasibility below); it must not build the internal endpoint itself.

3. **Link-minting mechanism is genuinely ambiguous from static reading
   alone** (see Architectural Feasibility, point 2) — flagged as an open
   question CodeDeveloper must resolve empirically against the live
   Authentik instance before implementation, not guessed here.

4. **No explicit statement of what happens for a user who already has a
   password** when they request a magic link (FR's own AC-6 says "both
   methods work on the same account" but doesn't say whether requesting a
   magic link while already authenticated, or requesting one for an
   email with an existing password, needs special handling). Resolved as
   a reasonable assumption in the Formalized Requirement below: magic-link
   request is keyed purely on email lookup/creation, identical to the
   Telegram Login Widget's own `exchangeWidgetPayload` pattern — no
   special-casing for "has password" needed, since Authentik's Email
   stage authenticates the *account*, not a credential type.

None of these rise to `needs-clarification` — all are resolvable with
reasonable assumptions consistent with the existing Telegram/recovery-flow
precedent, so this stays on the `passed` track rather than `failed-retry`.

### Conflicts with Existing Features

- No conflict with `FR-AUTH-001` (email/password OIDC sign-in, Shipped) —
  magic-link is an additive, alternative sign-in mechanism on the same
  account, not a replacement. FR-AUTH-004's own AC-6 makes this explicit
  and BP-UAT-009 (which covers FR-AUTH-001's flow) already documents the
  password path as one branch of the same "Auth sign-in and sign-out"
  business process.
- No conflict with `FR-AUTH-002` (Telegram sign-in, In Progress) — that
  flow uses `createRecoveryLink()` bound to Authentik's **recovery**
  flow slug (`default-recovery-flow`, or whatever `Brand.flow_recovery`
  is bound to). FR-AUTH-004 needs a **separate** flow slug
  (`magic-link-login`, per the FR's own functional-scope point 1). These
  are two distinct Authentik flow objects; provisioning one does not
  disturb the other, provided the link-minting call for magic-link (once
  resolved — see below) does not require repointing `Brand.flow_recovery`
  away from the existing recovery flow.
- No conflict with `FR-AUTH-005` (Telegram account linking, Planned) —
  different mechanism (deep-link token via bot `/start` payload, not
  email), no shared code path except both ultimately mint an Authentik
  session.
- `requirements-registry.md` confirms FR-AUTH-004's only registry
  dependency is `AUTH-001` (row 10, "Magic-link sign-in"); FR-AUTH-006
  (row 57) separately lists `AUTH-002, AUTH-004, GAM-001` as ITS
  dependencies — consistent with the workflow-chain framing in the task
  brief. No registry edit is needed for FR-AUTH-004 itself; its
  dependency row is already correct as `AUTH-001`.
- No duplicate feature identifier issue — `FR-AUTH-004` is already
  assigned (this is a validation pass on an existing FR, not a new
  assignment).

### Architectural Feasibility

**1. Authentik flow design for `magic-link-login`.**

Modeled directly on `scripts/provision-authentik-recovery-flow.sh`'s
proven shape, with one structural difference driven by the FR's own
description ("no custom code required beyond configuration and the API
trigger call" + completion "issues a session" — no password is ever
set):

| Stage | Recovery flow (existing script) | `magic-link-login` (this FR) |
|---|---|---|
| 10 | IdentificationStage (email lookup) | IdentificationStage (email lookup) — reuse the same pattern, likely a **new** stage instance (`aiqadam-magic-link-identification`) rather than sharing the recovery flow's stage object, since Authentik stages can be bound into multiple flows but keeping them flow-scoped avoids one flow's config change silently affecting the other |
| 20 | EmailStage (send email, `activate_user_on_success: true`) | EmailStage (send email) — same stage type, own instance (`aiqadam-magic-link-email`), own branded subject (e.g. "Sign in to AI Qadam") |
| 30 | PromptStage — new password | **absent** |
| 40 | UserWriteStage — persist password | **absent** — replaced by nothing; the Email stage's own link-click completion is the terminal step |

The key structural difference: the recovery flow's stages 30/40 exist
because password-reset must *end* with the user setting a new credential.
Magic-link has no credential to set — clicking the verified link IS the
authentication event. In Authentik's flow model, an Email stage's
generated link, once clicked, already authenticates the flow's session as
that user; if no further stage is bound, the flow's own
`designation` (e.g. `authentication`) combined with the flow executor's
default behavior on flow completion is what should issue the session
directly. This matches the FR's Notes: *"Depends on Authentik's Email
stage — no custom code required beyond configuration and the API trigger
call."*

**Open question for CodeDeveloper (flagged, not guessed):** whether flow
`designation` should be `authentication` (so completing it natively
mints an Authentik session the OIDC provider then picks up) or whether an
explicit `UserLoginStage` needs to be bound at order 30 to force session
issuance before the flow considers itself complete. The recovery flow's
`designation: "recovery"` works there because its terminal state is a
password write, not a login; magic-link's terminal state IS a login, so
this is the one point in the flow topology that is NOT a mechanical
copy of the recovery-flow script and needs live verification against the
running Authentik instance (2024.12.x per the script's own comments) —
specifically, whether `UserLoginStage` must be explicitly bound at order
30, or whether Email-stage completion on an `authentication`-designated
flow auto-logs-in. This should be resolved empirically (spin up the flow,
click a test link, inspect whether a session cookie is set) before
CodeDeveloper writes the provisioning script, analogous to how the
existing recovery-flow script's own header comments document a prior
empirically-discovered gap (stages 30/40 were added after live testing
showed the 2-stage version fell through to a default redirect instead of
completing).

**2. Link-minting mechanism — confirmed vs. open.**

*Confirmed from reading the code:* `AuthentikClient.createRecoveryLink()`
(`apps/api/src/modules/admin-invites/authentik.client.ts:275-281`) calls
`POST /api/v3/core/users/{pk}/recovery/`, which is a **fixed Authentik
endpoint tied to whatever flow is bound as `Brand.flow_recovery`** (per
`provision-authentik-recovery-flow.sh`'s own `bind_brand_recovery_flow`
step and Authentik's documented behavior — the recovery endpoint always
mints a link for the recovery-designated flow). It is not
flow-parameterized: there is no `flow_slug` argument on that endpoint or
that client method. `telegram-auth.service.ts`'s
`exchangeWidgetPayload()` confirms this is the only existing pattern in
the codebase for "mint a one-time Authentik link and hand it to a
caller" — and it is hardcoded to the recovery flow via that same
endpoint.

*Conclusion:* magic-link auth **cannot** reuse `createRecoveryLink()`
as-is, because doing so would mint a link into the recovery flow
(password-reset), not the new `magic-link-login` flow — using it
unmodified would either require repointing `Brand.flow_recovery` to the
magic-link flow (breaking FR-AUTH-002's/password-reset's own use of that
same endpoint — an unacceptable regression) or would silently send users
into the wrong flow.

*Open question for CodeDeveloper (genuinely ambiguous from static
reading, flag per task instructions rather than guess):* Authentik's
admin API does not appear (from the code read here) to expose a generic
"mint a stage-flow token for an arbitrary flow slug" endpoint analogous to
`/recovery/`. Two candidate mechanisms exist and need to be verified live
against the running Authentik instance:
  - (a) Authentik's flow-executor API (`/api/v3/flows/executor/<slug>/`)
    can potentially be driven server-side with a pre-authenticated
    context (e.g. via an impersonation/token-based bootstrap) to
    generate a stage-flow token equivalent to what the Email stage would
    normally produce interactively — this is speculative and needs a
    live spike.
  - (b) Authentik may expose (in 2024.12.x specifically — the version
    this repo's scripts target) a more generic per-flow "trigger" or
    token-minting admin endpoint under `/api/v3/stages/email/` or
    `/api/v3/flows/` that isn't yet used anywhere in this codebase, and
    which would need a **new** `AuthentikClient` method (e.g.
    `createFlowLink(userPk, flowSlug)`) rather than repurposing
    `createRecoveryLink()`.
  - A pragmatic fallback if neither (a) nor (b) pans out: mint the link
    by constructing the flow's public inflow URL
    (`/if/flow/magic-link-login/?...`) with a pre-filled/pre-verified
    identification step — but this likely still requires the Email
    stage's own internal token generation, which is not currently
    exposed as a standalone admin-API primitive in the code read here.

  **This is explicitly called out as an item CodeDeveloper must resolve
  empirically against the live Authentik instance (same "verified live"
  discipline the existing recovery-flow script and
  `AuthentikClient.createRecoveryLink()`'s own regression-fix comment
  both document — e.g. the `res.recovery_link` → `res.link` field-name
  fix was only caught by direct curl against the real API) before
  writing the magic-link request endpoint's service logic.** This is the
  single largest technical-risk item in this FR and should be the first
  thing CodeDeveloper spikes, since the rest of the implementation (API
  endpoint shape, UI form) is straightforward and well-precedented
  regardless of which minting mechanism resolves correct.

**3. Web surface — `apps/web-next` confirmed as the target.**

Evidence: `apps/web-next/src/pages/auth/` already has `sign-up.astro`
(real markup, a `SignUpForm` React island posting to
`/api/v1/auth/register` — added for `ISS-USR-REG-001`) which
`apps/web/src/pages/auth/` lacks entirely (that directory only has
`sign-in.astro` + `signed-out.astro`, both bare redirects). Git history
confirms `apps/web-next`'s auth pages (`feat(MIG-017): /auth/sign-in +
/auth/signed-out pages`, `9a6bc67`) postdate and superseded the
`apps/web` equivalents (`a42f263`, `188d0c4` "finalize artifacts for
FR-MIG-031" — a production-cutover commit). `BP-UAT-009`'s own
`environment: "http://localhost:4321"` and its Step 005 documentation
explicitly describe `apps/web-next`'s SSR rendering as "the current
production surface... since FR-MIG-018 merged." This is unambiguous:
**`apps/web-next/src/pages/auth/sign-in.astro` is the target**, and per
the `sign-up.astro` precedent, this FR requires it to gain real markup
for the first time (currently a bare `Astro.redirect` per the task
brief's framing) — either as new content directly in `sign-in.astro` (a
"Sign in with email link" option alongside/below whatever password-path
entry the FR eventually needs — note FR-AUTH-004 doesn't ask this
workflow to also build a password-entry UI; today's bare-redirect
behavior to Authentik's own hosted login form can stay for the password
path) or as a small addition scoped narrowly to the magic-link form +
its own confirmation state. A new sibling page
(e.g. `sign-in-magic-link.astro`) is an alternative CodeDeveloper could
choose if keeping `sign-in.astro`'s existing redirect-only behavior
intact is preferred — either is architecturally sound; this is an
implementation-detail choice left to CodeDeveloper, not a blocking
ambiguity.

**4. Extension point for FR-AUTH-006.**

FR-AUTH-006's functional-scope point 4 needs: *"User clicks magic link →
Authentik Email stage verifies → API hook fires to: (a) set
`is_temporary=false`, (b) set the real email... (c) trigger retroactive
points backfill."* For FR-AUTH-006 to bolt this on cleanly later without
reopening FR-AUTH-004's code, this workflow's magic-link **completion**
path (wherever the OIDC callback / session-issuance lands after the
Authentik flow finishes) should expose a clean seam. Recommended shape,
without designing FR-AUTH-006's actual hook logic:

- The magic-link completion almost certainly terminates through the
  **same** `AuthController.callback()` OIDC code-exchange path every
  other Authentik-issued session already uses (`GET /v1/auth/callback`)
  — Authentik's Email-stage-completed flow, once it issues a session,
  still needs to hand off to the platform's own OIDC provider/RP flow
  for the API to mint its own `aiqadam-refresh` cookie, exactly as
  password sign-in and Telegram sign-in already do. If so, **no new
  callback endpoint is needed at all** — the existing `callback()` method
  is already the single funnel every auth mechanism converges on.
- The clean extension point is therefore a **service-method boundary
  inside `AuthController.callback()`'s existing call chain** (likely
  inside or adjacent to `AuthService.completeAuthorization()` or the
  `UsersService.upsertByAuthentikSubject()` call at line 210) where a
  future FR-AUTH-006 hook can check `attributes.is_temporary` on the
  resolved Authentik user and branch into upgrade logic — conceptually
  an injectable post-authentication hook (e.g. a
  `postAuthenticationHooks: PostAuthHook[]` array the callback loops
  over after minting the session, or simply a documented "if
  `is_temporary===true` on this resolved user, FR-AUTH-006 branches
  here" comment marking the seam) rather than a webhook or event emitter
  — webhooks/events would be over-engineering for a same-process,
  same-request synchronous hook with no cross-service boundary to cross.
- CodeDeveloper should leave an explicit code comment at that seam
  (mirroring this codebase's own convention of writing forward-looking
  comments referencing the future FR, e.g. how `telegram-auth.service.ts`
  and `auth.controller.ts` already reference FR-AUTH-006/FR-BOT-002 in
  comments ahead of those workflows shipping) so FR-AUTH-006's
  CodeDeveloper finds it without re-deriving the callback's control flow
  from scratch.
- This workflow does **not** need to build the hook itself, an event
  bus, or any `is_temporary` branching — only to land the callback path
  in a state where FR-AUTH-006 can add one `if` branch or one hook
  registration cleanly.

**5. Rate limiting and security posture.**

The magic-link request endpoint (analogous to `POST
/v1/auth/telegram/exchange` and `POST /v1/auth/register`) must follow
the same `ThrottlerGuard` + `@Throttle({ default: { limit: 5, ttl:
900_000 } })` convention (security.md's "5 requests per 15 minutes per
IP" rule for auth endpoints) — both existing public auth-adjacent
endpoints in `auth.controller.ts` already apply this. No new security
posture is needed beyond matching this existing pattern, and the FR's
own AC (15-minute TTL, single-use link) matches Authentik's native Email
stage token semantics already relied upon by the recovery flow.

**6. Design-system compliance.**

The magic-link form (email input + submit) and its confirmation state
("check your email") are straightforward compositions of existing
primitives already used by `SignUpForm` — `.input`, `.btn .btn-primary`,
Lucide icons only (e.g. `Mail` icon for the input, `MailCheck` or similar
for the confirmation state), no raw hex, no gradients, no new tokens.
Fully compatible with the design system as read; no new component
classes are needed.

### Assessment against the 5 completeness criteria

- **Specific:** Yes, after narrowing AC-5's scope per Completeness Issue
  #1 above.
- **Testable:** Yes — each AC below maps to an observable, checkable
  outcome (email received, link works once, expires at 15 min, session
  established, dual-method coexistence).
- **Non-conflicting:** Yes — see Conflicts section; additive to
  FR-AUTH-001/002/005, correctly scoped against FR-AUTH-006.
- **Scoped to one module/layer:** Yes — Auth module only (Authentik
  config + `AuthModule` API changes + `apps/web-next` auth page), no
  cross-module reach beyond the existing `AuthentikClient` /
  `AuthController` boundary.
- **Referenced:** Yes — `github_issue` already present (#127);
  `business_process: [BP-UAT-009]` now added to frontmatter (was
  missing; added by this validation per the Orchestrator's confirmed
  judgment — magic-link is an alternative entry into the same "Auth
  sign-in and sign-out" journey BP-UAT-009 already documents, not a
  distinct business process).

---

## Formalized Requirement

**FEAT-AUTH-4** (existing code `FR-AUTH-004`, no renumbering needed —
this is a validation pass, not a new assignment).

**Statement:** A user (Telegram-only temp account OR any existing member)
can request a one-time email sign-in link from `apps/web-next`'s
`/auth/sign-in` page. The API triggers Authentik's `magic-link-login`
flow (Email stage, no password-set stages, session-issuing on
completion) via a to-be-resolved link-minting mechanism (see
Architectural Feasibility point 2 — open question for CodeDeveloper).
Authentik emails the link (existing SMTP/Listmonk connection, no new
delivery infra). Clicking the link, within 15 minutes and only once,
completes the OIDC flow through the platform's existing
`AuthController.callback()` funnel exactly as password and Telegram
sign-in already do, issuing the standard `aiqadam-refresh` session and
landing the user at `/me`.

**Scope boundary (binding for this workflow):** This workflow ships ONLY
the general-purpose magic-link mechanism — the Authentik flow, the
request endpoint + UI entry point, and the session-issuance completion
path. It explicitly does **not** ship:
- The `is_temporary=false` flip, real-email replacement, retroactive
  points backfill, or CRM sync (all FR-AUTH-006's functional scope,
  points 4–6).
- The `POST /v1/internal/telegram/upgrade-temp` internal endpoint or bot
  `/upgrade` command (FR-AUTH-006 point 3 / FR-BOT-002 PR 6/6).
- It DOES leave the extension seam described in Architectural
  Feasibility point 4 for FR-AUTH-006 to build on.

**Cross-refs:** Depends on `FR-AUTH-001` (Shipped — OIDC callback
funnel, cookie/session model per ADR-0016). Upstream-of (not
depended-on-by) `FR-AUTH-006` (temp-account upgrade) and, transitively,
`FR-BOT-002` PR 6/6 (bot `/upgrade` command). `business_process:
[BP-UAT-009]` (Auth sign-in and sign-out).

---

## Acceptance Criteria (draft)

- **AC-1:** Given a user on `/auth/sign-in` (apps/web-next), when they
  choose "Sign in with email link" and submit a valid email address,
  then they receive an email containing a working sign-in link within 60
  seconds (verifiable via Mailpit/SMTP catcher in dev/UAT).
- **AC-2:** Given a magic-link email has been sent, when the recipient
  clicks the link a second time (after already using it once), then
  Authentik shows an error and no new session is issued.
- **AC-3:** Given a magic-link email has been sent and 15 minutes have
  elapsed unused, when the recipient clicks the link, then Authentik
  shows an expired-link error and no session is issued.
- **AC-4:** Given a user completes the magic-link flow (non-temp-account
  / general passwordless case — see Scope Boundary), when the flow
  finishes, then the browser holds a valid `aiqadam-refresh` session
  (per ADR-0016) and lands at `/me`, which correctly shows that user's
  profile. **This AC is verified only for the general/non-temp case in
  this workflow; the temp-account `is_temporary` flip and points
  backfill are FR-AUTH-006's own AC, not re-verified here.**
- **AC-5:** Given a member who already has a password set on their
  account, when they instead request and complete a magic-link sign-in,
  then it succeeds and establishes a session identically to AC-4 — both
  sign-in methods work on the same account without conflict.
- **AC-6:** Given the magic-link request endpoint, when it receives more
  than 5 requests from the same IP within 15 minutes, then subsequent
  requests are throttled (429), matching the existing
  `telegram/exchange` and `register` endpoints' rate-limit convention.
- **AC-7 (architecture/extension, not user-facing):** The OIDC callback
  completion path for magic-link sign-in reuses the existing
  `AuthController.callback()` funnel (no parallel/duplicate
  session-issuance code path is introduced), and a clearly marked
  extension seam exists for FR-AUTH-006 to branch on
  `attributes.is_temporary` post-authentication.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-AUTH-004 is specific, testable, non-conflicting, and architecturally feasible for apps/web-next + AuthModule; one genuine open question (Authentik link-minting mechanism for a non-recovery flow) is flagged for CodeDeveloper to resolve empirically, not guessed."
  findings:
    - "AC-5 in the source FR conflates FR-AUTH-006 scope (is_temporary flip, points backfill) into this workflow's AC list; narrowed in the Formalized Requirement / draft ACs to explicitly exclude that behavior from this workflow's build and verification."
    - "AuthentikClient.createRecoveryLink() (POST /api/v3/core/users/{pk}/recovery/) is confirmed hardcoded to the flow bound at Brand.flow_recovery and cannot be reused unmodified for a separate magic-link-login flow without either repointing that binding (which would break the existing recovery/password-reset flow) or adding a new client method against a not-yet-identified Authentik admin-API primitive. This is the single largest technical-risk item and must be resolved by CodeDeveloper via a live spike against the running Authentik instance before the request endpoint's service logic is written."
    - "Authentik flow topology for magic-link-login differs from the recovery flow at exactly one point: whether an explicit UserLoginStage must be bound after the Email stage to force session issuance, or whether flow designation=authentication auto-completes into a session. Flagged for live verification, following the same empirical-discovery discipline the existing recovery-flow script's own stages-30/40 fix and AuthentikClient.createRecoveryLink()'s res.link field-name fix both document from this codebase's history."
    - "apps/web-next confirmed (not apps/web) as the target surface for the new 'Sign in with email link' entry point, based on git history, BP-UAT-009's own environment/Step-005 documentation, and the sign-up.astro precedent (real-markup React-island form pattern to follow)."
    - "business_process: [BP-UAT-009] added to FR-AUTH-004.md's frontmatter (previously absent); github_issue was already present, no change needed there."
    - "Recommended FR-AUTH-006 extension point: a service-method-boundary seam inside AuthController.callback()'s existing call chain (near UsersService.upsertByAuthentikSubject), not a new webhook or event emitter — this workflow should leave a marked comment there but must not build FR-AUTH-006's branching logic itself."
