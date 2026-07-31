# Requirement Validation — FR-BOT-001

workflow: wf-20260731-feat-171
agent: RequirementAnalyst

---

## Raw Input

`docs/03-requirements/FR-BOT-001.md` (status: `Planned`, module BOT, phase Roadmap
Sprint 6, GitHub issue #137) — existing formalized FR being validated for
implementation readiness, not a raw new ask. Summary of its text:

> The AI Qadam Telegram bot is a Python/aiogram service that serves as the
> primary mobile interface for community members. It handles inbound commands
> from members and operators, calling the NestJS API for all business logic.
> ... Middleware stack ... auth middleware (calls `POST
> /v1/internal/telegram/lookup` → resolves `directusUserId, isTemp, country`)
> ...

Handoff (`handoff.yaml`) restates this as: "Telegram bot scaffold and
deployment — Python/aiogram long-polling service in `apps/bot/` (git
submodule, `aiqadam/aiqadam-telegram-bot`) ... Requires a new `POST
/v1/internal/telegram/lookup` endpoint on the API side (does not yet exist)."

Orchestrator-supplied context flagged four things to verify before
formalizing: (1) the lookup endpoint's absence and nearest-existing
alternatives, (2) `apps/bot/` submodule state, (3) FR-AUTH-002 as adjacent
context, (4) ADR-0034 as the architectural design of record. All four were
independently re-verified below; two of the four supplied claims turned out
to be materially wrong (see Completeness Issues Found #2 and #3).

---

## Analysis

### Completeness Issues Found

**1. `POST /v1/internal/telegram/lookup` genuinely does not exist — confirmed independently.**

Grepped `apps/api/src/modules/**` for `lookup` and `internal/telegram`. Only
two related surfaces exist, neither of which is this endpoint:

- `POST /v1/internal/telegram/upsert-temp-user`
  (`apps/api/src/modules/auth/auth.controller.ts`, class
  `TelegramInternalController`, guarded by `InternalAuthGuard`) — upsert-only
  (creates-or-returns an Authentik user), returns `{ authentikUserId,
  directusUserId: null, isNew }`. **`directusUserId` is a hardcoded `null`
  stub today** (`telegram-auth.service.ts` `UpsertTempUserResult` interface
  and both return paths) — it does not resolve to a real Directus user id.
  No `country` field at all.
- `GET /v1/telegram/members/by-tg/:id` (`apps/api/src/modules/telegram/telegram.controller.ts`,
  class `TelegramController`) — guarded by `TelegramAuthGuard` (`Authorization:
  Bearer <service-token>`, backed by `tg_config` DB row / `TELEGRAM_BOT_SERVICE_TOKEN`
  env fallback — a **different token and header convention** than
  `InternalAuthGuard`'s `x-internal-auth` / `INTERNAL_API_TOKEN`). Returns
  `{ member_id, tenant, display_name, telegram_user_id,
  telegram_opted_out_at }` — no `directusUserId`/`isTemp`/`country` shape,
  and `member_id` is not documented as equivalent to `directusUserId`.

Neither returns the exact `{directusUserId, isTemp, country}` triple the FR's
middleware section names. **This confirms the endpoint must be built new.**
Per the Orchestrator's explicit instruction, this is in-scope work for this
workflow, not a blocker — see Formalized Requirement below for how it's now
made explicit instead of a silent assumption.

**2. `apps/bot/` is NOT currently a submodule on this branch or on `main` — the task brief's claim is out of date.**

Independently verified via `git ls-tree`, `.gitmodules`, and `git log --all`:

- `apps/bot/` in the current working tree (and on `main` at `4803053`) is an
  ordinary tracked directory containing only `.gitkeep` (`git ls-tree` mode
  `040000`, a plain tree — not `160000`, the gitlink mode a real submodule
  uses). `.gitmodules` does not exist / is empty on `main`.
- The submodule bootstrap work does exist — commit `b61e347` "chore(bot):
  bootstrap aiqadam-telegram-bot repo as submodule at apps/bot/" — but it
  lives on branch `fix/BOT-001-bot-repo-bootstrap`, submitted as **PR #194,
  currently `OPEN`, `mergedAt: null`**, base `main`. It is not merged.
- This workflow's own branch, `feature/BOT-001-telegram-bot-scaffold`, forked
  from `main` at `4803053` — **before** #194 — so it also does not have the
  submodule. `git merge-base --is-ancestor b61e347 HEAD` → `NO`.

Net effect: task-brief claim #2 ("apps/bot/ is now a git submodule... set up
in a prior workflow (PR #194, already merged to main)") is **false as of
this validation pass**. PR #194 exists and does the right thing (adds
`.gitmodules` + the gitlink, per its commit message also fixes stale
personal-repo-path / `viktordrukker`-namespace references in ADR-0034 and
`architecture.md`), but it has not landed. This is a real, load-bearing
sequencing dependency for implementation (see Gate Result) — CodeDeveloper
cannot commit bot-side code into `apps/bot/` as a submodule until #194 merges
(or this workflow's branch is rebased onto a `main` that includes it).

**3. `architecture.md` §"Bot architecture (Python)" (lines 256–297) is stale relative to ADR-0034 and still describes the pre-ADR-0034 in-monorepo design.**

It shows `apps/bot/` as a first-class Python package living inside this
monorepo with its own `pyproject.toml`, and lists it under "What runs on the
host" alongside `apps/api`/`apps/web`. ADR-0034 (accepted design) instead
puts the bot in a **separate public repo**
(`aiqadam/aiqadam-telegram-bot`), vendored back in only as a submodule, with
its own Coolify resource, CI, and deploy boundary — `apps/bot/` and
`apps/workers/` are explicitly named in the ADR as "unused stubs to be
removed... or kept as `.gitkeep` markers." The now-empty `apps/bot/.gitkeep`
directory on `main` is consistent with the ADR's stub-marker option, but the
prose in `architecture.md` was never updated to match. Per this ADR's own
commit-message trail, fixing this doc is bundled into the still-open PR #194,
not this workflow. **Flagging, not blocking** — the *decision* (separate
repo, submodule) is unambiguous from ADR-0034 §Decision/Q1 and the registry;
only the architecture.md prose lags. CodeDeveloper/DocWriter should not
re-derive bot layout from `architecture.md`'s Python-monorepo section; ADR-0034
is the source of truth here and this validation formalizes that explicitly.

**4. FR-BOT-001's acceptance criteria never mention the lookup endpoint as a build target.**

The FR's own ACs test only bot-observable behavior ("Bot calls `POST
/v1/internal/telegram/lookup` on every command and resolves the user
context") — phrased as if the endpoint is a given. None of the ACs assert
anything about the endpoint's own contract (request/response shape, auth
guard, error modes, idempotency). This is the gap the Orchestrator asked me
to correct: the formalized requirement below adds the endpoint as an
explicit build target with its own ACs.

**5. Two incompatible internal-auth conventions already coexist for bot↔API calls, and FR-BOT-001/002/003 don't agree with ADR-0034 on which one the bot uses.**

- `InternalAuthGuard` — header `x-internal-auth`, secret `env.INTERNAL_API_TOKEN`,
  `timingSafeEqual` comparison. Currently used only by
  `POST /v1/internal/telegram/upsert-temp-user`.
- `TelegramAuthGuard` — header `Authorization: Bearer <token>`, secret
  resolved from `tg_config` DB row (operator-rotatable) falling back to
  `env.TELEGRAM_BOT_SERVICE_TOKEN`. Used by the entire existing, already-built
  `TelegramController` surface (20+ endpoints: `/v1/telegram/events`,
  `/registrations`, `/checkin/:token`, `/me/*`, `/feedback`, `/link/start`,
  `/link/confirm`, `/audit`, `/opt-out`, `/members/by-tg/:id`, etc.) — this
  is ADR-0034's designed sync surface, built ahead of the bot itself.
- FR-BOT-001 §2 names `INTERNAL_API_TOKEN` as the bot's one shared secret.
  FR-BOT-002's Notes say "All API calls use the `INTERNAL_API_TOKEN` shared
  secret header `X-Internal-Token`" (note: even the header name there,
  `X-Internal-Token`, doesn't match the guard's actual `x-internal-auth`
  header — a second, smaller inconsistency inside FR-BOT-002 itself, out of
  scope to fix under this FR but worth a forward-note).
  ADR-0034 §"NestJS-side endpoints" instead specifies `Authorization: Bearer
  <service-token>` issued by an Authentik m2m client, i.e. the
  `TelegramAuthGuard` convention, for the entire bot-facing sync surface.

  This is a real, unresolved architectural tension, not just a naming typo:
  FR-BOT-001 through 003 consistently assume one shared internal token
  (`INTERNAL_API_TOKEN`) for everything the bot calls, while ADR-0034 (and
  the code actually built against it) uses `TelegramAuthGuard`
  (`TELEGRAM_BOT_SERVICE_TOKEN`) for the member/operator command surface and
  reserves `InternalAuthGuard` (`INTERNAL_API_TOKEN`) for exactly one
  endpoint so far (`upsert-temp-user`).

  **Resolution for this FR's scope only** (does not re-litigate FR-BOT-002/003):
  the new `POST /v1/internal/telegram/lookup` endpoint is scaffold-layer
  identity resolution, architecturally the same class of call as
  `upsert-temp-user` (both: "resolve/create identity before any
  business-logic call can happen"), and FR-BOT-001 §2 already commits to
  `INTERNAL_API_TOKEN` as the bot's one documented credential at scaffold
  time — the bot does not yet have an Authentik m2m client or a
  `TELEGRAM_BOT_SERVICE_TOKEN` wired up in this FR's scope (that surface is
  provisioned for a *different, already-built* consumer). Building the
  lookup endpoint under `InternalAuthGuard`, alongside its sibling
  `upsert-temp-user`, keeps this FR internally consistent and matches the
  one credential FR-BOT-001 actually names. **This does not resolve the
  FR-BOT-002/FR-BOT-003 question** of which guard the full member/operator
  command surface should use once those FRs are implemented — that decision
  is out of scope here and should be raised explicitly when FR-BOT-002 is
  validated, since it will need to either (a) also use `InternalAuthGuard`
  (in which case ADR-0034's `TelegramAuthGuard` surface becomes dead code
  the bot never calls), or (b) switch to `TelegramAuthGuard` (in which case
  the bot needs an Authentik m2m client provisioned, contradicting FR-BOT-002's
  Notes). Flagging as a forward-looking scope note in the Formalized
  Requirement below.

### Conflicts with Existing Features

No direct conflict — `POST /v1/internal/telegram/lookup` is additive, a new
route under the existing `TelegramInternalController`
(`v1/internal/telegram` prefix), sibling to `upsert-temp-user`. No existing
endpoint claims this path or verb. No schema/table conflicts anticipated:
resolving `{directusUserId, isTemp, country}` from a `telegram_id` is a
read/compose over already-existing data (Authentik user attributes
`telegram_id` / `is_temporary`, plus the Directus bridge that
`AuthController.callback` already uses via `DirectusUsersBridgeService`,
plus `country_preference`) — no new source-of-truth table required.

### Architectural Feasibility

- **Separate-repo bot + submodule vendoring** — ADR-0034 §Decision Q1 is
  accepted (`Status: Proposed, 2026-05-21`, header says Proposed but content,
  registry, and the in-flight PR #194 all treat it as the operative design;
  flagging the stale `Proposed` header as a minor doc hygiene item, not a
  blocker). Fits current stack: `apps/bot/` becomes a `.gitkeep` stub /
  submodule mount point in this repo, real code lives in
  `aiqadam/aiqadam-telegram-bot`. No monorepo module-boundary violation —
  Python code never enters the pnpm workspace graph.
- **New API endpoint** — fits the existing `apps/api` module-per-domain
  layout (Drizzle schema co-located per module, NestJS controller/service
  split). The natural home is the existing `TelegramInternalController` in
  `apps/api/src/modules/auth/auth.controller.ts` (already hosts
  `upsert-temp-user` under the same `v1/internal/telegram` prefix and same
  `InternalAuthGuard`) — no new module needed, this is one new route + one
  new service method on `TelegramAuthService` (or a focused sibling
  service if `TelegramAuthService` is judged to be taking on too much;
  CodeDeveloper's call).
- **No cross-schema query risk** — resolution needs Authentik (via
  `AuthentikClient`, already injected in `TelegramAuthService`) plus the
  existing Directus-bridge lookup pattern already used in
  `auth.controller.ts`'s OIDC `callback` handler. No new direct DB
  cross-schema join.
- **Bot process itself** — Python 3.12 + aiogram 3 + uv, long-polling, no
  public FQDN: matches `architecture.md`'s stack list and ADR-0034 Q4
  (single bot account, long-poll only, no notifier in this FR's scope per
  FR-BOT-001's own Notes section deferring outbound to FR-NTF-004).
- **No inviolable-rule violations found**: single monorepo boundary
  preserved (bot code lives outside it via submodule, this repo only holds
  the mount point + the new API route); module boundaries preserved (new
  route added to an existing, appropriately-scoped internal-auth module).

**Overall: architecturally feasible**, with one real external
sequencing dependency (PR #194 merging or being rebased onto) that the
implementation step must account for — not a design conflict, a landing-order
issue.

---

## Formalized Requirement

**FEAT-BOT-1** (module `BOT` per `requirements-registry.md` §Module Abbrev
table; this is the implementation-track formalization of already-registered
`FR-BOT-001`, cross-referenced below — not a new registry entry)

> Ship the Telegram bot inbound-command scaffold end-to-end: (a) a new,
> internal-only API endpoint `POST /v1/internal/telegram/lookup` on
> `apps/api`, guarded by the existing `InternalAuthGuard`
> (`x-internal-auth` header / `INTERNAL_API_TOKEN` secret — the same
> convention as its sibling `upsert-temp-user` endpoint), that resolves a
> raw `telegram_id` to `{ directusUserId: string | null, isTemp: boolean,
> country: string | null }`; and (b) the Python/aiogram 3 bot scaffold in
> `apps/bot/` (vendored as a submodule pointing at
> `aiqadam/aiqadam-telegram-bot`) implementing the middleware stack,
> `/start` smoke-test command, rate limiting, structured logging, and
> Coolify deployment described in FR-BOT-001, calling the new endpoint from
> its auth middleware on every inbound update.

**In scope for this workflow (explicit, corrects FR-BOT-001's silent
assumption):**

1. `POST /v1/internal/telegram/lookup` — new route, new service logic,
   guarded by `InternalAuthGuard`. NEW work, not previously built anywhere.
2. Bot project scaffold per FR-BOT-001 §"Project structure" (handlers/,
   services/, middlewares/, keyboards/, states/, locales/, main.py,
   pyproject.toml, tests/) inside the `aiqadam-telegram-bot` submodule.
3. Middleware stack: rate-limit (10 req/min per `telegram_id`), auth
   (calls the new lookup endpoint), tenant (sets country from
   `country_preference`), structured JSON logging to stdout.
4. `/start` smoke-test handler (static welcome message, works before full
   signup flow is wired — FR-BOT-001 §7).
5. Coolify service definition (`aiqadam-bot`, no public FQDN, long-polling).

**Explicitly out of scope for this FR (unchanged from FR-BOT-001's own
Notes, re-confirmed):**

- Outbound/notifier flows — FR-NTF-004.
- Full member command set (`/events`, `/register`, `/me`, `/leaderboard`,
  etc.) — FR-BOT-002.
- Operator runtime commands (`/attendance`, `/scan`, `/approvals`,
  `/announce`) — FR-BOT-003.
- Account linking UI, temp-account upgrade flow — FR-AUTH-005 / FR-AUTH-006.
- Resolving the `InternalAuthGuard` vs. `TelegramAuthGuard` question for
  FR-BOT-002/003's full command surface (Completeness Issue #5) — carried
  forward as an open question for FR-BOT-002's own requirement validation,
  not decided here.
- Fixing `architecture.md`'s stale "Bot architecture (Python)" section or
  ADR-0034's `Proposed`→`Accepted` header — bundled in the still-open PR
  #194, not this workflow's responsibility, but CodeDeveloper/DocWriter
  should treat ADR-0034 (not `architecture.md` §256-297) as authoritative
  for bot layout while both PRs are in flight.

**Sequencing dependency (blocking for implementation, not for this
validation gate):** PR #194 (`fix/BOT-001-bot-repo-bootstrap`, currently
open) adds the `.gitmodules` entry and the `apps/bot` gitlink that makes
`apps/bot/` an actual submodule. This workflow's branch,
`feature/BOT-001-telegram-bot-scaffold`, forked from `main` before #194 and
does not have it. CodeDeveloper cannot write real submodule content into
`apps/bot/` until either (a) #194 merges to `main` and this branch rebases
onto the new `main`, or (b) this workflow itself merges #194's changes
first. This is an Orchestrator-level sequencing decision at the next step,
not a reason to fail this validation — flagged here so it isn't
rediscovered as a surprise mid-implementation.

**Cross-references:**
- `docs/03-requirements/FR-BOT-001.md` — source FR (status `Planned`,
  unchanged by this validation; this document is the implementation-ready
  formalization layered on top of it).
- `docs/03-requirements/FR-AUTH-002.md` — `upsert-temp-user` origin;
  confirms `directusUserId` is currently a stub `null` there, which the new
  lookup endpoint must resolve for real (via the same Directus-bridge
  pattern `AuthController.callback` already uses).
- `docs/adr/0034-telegram-bot-and-sender.md` — architectural design of
  record (separate repo, submodule vendoring, bot-owns-no-state, sync/async
  surface split). Authoritative over `architecture.md` §"Bot architecture
  (Python)" for bot layout until PR #194 lands.
- `apps/api/src/modules/internal/internal-auth.guard.ts` — guard to reuse.
- `apps/api/src/modules/auth/auth.controller.ts` (`TelegramInternalController`)
  — home for the new route.
- `apps/api/src/modules/auth/telegram-auth.service.ts` — home for the new
  resolution logic; note existing `UpsertTempUserResult.directusUserId` is
  hardcoded `null` — the new lookup service method needs real resolution,
  it cannot just delegate to `upsertTempUser`'s existing return shape.
- `apps/api/src/modules/telegram/telegram-auth.guard.ts` +
  `telegram.controller.ts` — the parallel, already-built `TelegramAuthGuard`
  surface; NOT reused by this FR's scope (see Completeness Issue #5), but
  CodeDeveloper should be aware it exists so as not to duplicate any of its
  20+ endpoints under a different guard by mistake.

---

## Acceptance Criteria (draft)

**API endpoint — `POST /v1/internal/telegram/lookup`**

- **AC-1**: Given a request with a valid `x-internal-auth` header matching
  `INTERNAL_API_TOKEN` and a `telegram_id` for a Telegram user with an
  existing, linked Directus member, when `POST
  /v1/internal/telegram/lookup` is called, then the response is `200` with
  `{ directusUserId: <real uuid/id>, isTemp: false, country: <the member's
  country> }`.
- **AC-2**: Given a `telegram_id` that only has a temporary Authentik user
  (created via `/start` → `upsert-temp-user`, no full registration yet),
  when the lookup endpoint is called, then the response is `200` with
  `{ directusUserId: null (or the pending id, per implementation choice —
  CodeDeveloper to confirm which and update this AC), isTemp: true, country:
  <country_preference if set, else null> }`.
- **AC-3**: Given a `telegram_id` with no Authentik user at all (never
  hit `/start`), when the lookup endpoint is called, then the response is
  `404` with a structured error body (not a bare 500), so the bot's auth
  middleware can distinguish "unknown user, prompt /start" from "API
  down, retry."
- **AC-4**: Given a request missing or with an incorrect `x-internal-auth`
  header, when the lookup endpoint is called, then the response is `401`
  and no user data is returned (mirrors `InternalAuthGuard`'s existing
  `timingSafeEqual` behavior — verify by reusing the guard, not
  reimplementing the check).
- **AC-5**: Given two rapid, identical lookup requests for the same
  `telegram_id`, when both are handled, then both return the same result
  with no side effects (read-path idempotency — this is a resolve, not an
  upsert; confirm it does not itself create any user record, unlike
  `upsert-temp-user`).

**Bot scaffold**

- **AC-6**: Given the bot process is started with valid
  `TELEGRAM_BOT_TOKEN`, `INTERNAL_API_URL`, `INTERNAL_API_TOKEN` env vars,
  when a user sends `/start`, then the bot responds with a static welcome
  message within 3 seconds (FR-BOT-001 AC, re-confirmed).
- **AC-7**: Given any inbound command, when the bot's auth middleware
  runs, then it calls `POST /v1/internal/telegram/lookup` exactly once per
  update and attaches the resolved `{directusUserId, isTemp, country}` to
  the handler context (verifiable via a mocked API client in bot-side
  tests).
- **AC-8**: Given an unknown command, when received, then the bot responds
  with "I don't know that command — try /help" (FR-BOT-001 AC, re-confirmed).
- **AC-9**: Given 10+ rapid messages from one `telegram_id` within the
  rate-limit window, when the threshold is crossed, then the bot responds
  with a "slow down" message instead of processing further commands
  (FR-BOT-001 AC, re-confirmed).
- **AC-10**: Given the bot's runtime environment, when inspected, then
  `DIRECTUS_TOKEN`, `AUTHENTIK_API_TOKEN`, and `TWENTY_API_TOKEN` are
  absent (FR-BOT-001 AC, re-confirmed — thin-bot guarantee).
- **AC-11**: Given the bot is deployed to Coolify, when logs are checked,
  then structured JSON logs appear in Grafana/Loki (FR-BOT-001 AC,
  re-confirmed).

TestDesigner: AC-2's exact `directusUserId` value for the temp-user case is
flagged as an open implementation choice (`null` vs. a pending/synthetic id)
— resolve with CodeDeveloper before finalizing the formal test, don't guess
silently.

---

## Gate Result

```yaml
gate: requirement-analyst
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  FR-BOT-001 formalized as FEAT-BOT-1. Specific, testable, non-conflicting,
  architecturally feasible — passes on its own merits. The endpoint gap the
  Orchestrator flagged (POST /v1/internal/telegram/lookup missing) is now
  explicit in-scope build work with its own ACs, not a silent assumption.
  Two additional discrepancies found during independent verification and
  documented above, neither of which blocks this gate:
    1. apps/bot/ is NOT yet a submodule on main or on this workflow's branch
       (task brief was wrong on this point) — PR #194 doing that work is
       still OPEN. This is a real sequencing dependency for the
       implementation step, not a requirement-quality problem.
    2. FR-BOT-001/002/003 assume one shared INTERNAL_API_TOKEN for all
       bot-API calls; ADR-0034's already-built TelegramAuthGuard surface
       uses a different convention for the (larger, not-yet-consumed)
       member/operator command set. Resolved for THIS FR's scope only
       (lookup + upsert-temp-user both use InternalAuthGuard, consistent
       with FR-BOT-001's own stated credential) — left open for FR-BOT-002.
completeness_check:
  specific: true
  testable: true
  non_conflicting: true
  scoped_to_one_module_layer: true
  referenced: true
needs_clarification: false
blocking_dependencies:
  - description: >
      apps/bot/ is not yet a git submodule on main or on this workflow's
      branch. PR #194 (fix/BOT-001-bot-repo-bootstrap) does this work and is
      currently OPEN/unmerged. Implementation of the bot-scaffold half of
      this FR needs #194 merged (and this branch rebased) or its changes
      folded in before CodeDeveloper writes submodule content.
    owner: Orchestrator
    resolution_required_before: code-developer (bot-side work specifically;
      the API-side endpoint has no such dependency and can proceed
      independently)
open_questions_for_next_workflow:
  - FR-BOT-002 validation must decide InternalAuthGuard vs. TelegramAuthGuard
    for the full member command surface (see Completeness Issue #5).
next_agent: impact-analyzer
```
