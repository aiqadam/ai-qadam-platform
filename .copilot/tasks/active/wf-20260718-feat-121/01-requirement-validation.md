# Requirement Validation — wf-20260718-feat-121

## Raw Input

> Add a read-only QA-environment target mode to the uat-verification workflow
> and UATRunner agent so UAT sessions can be driven against qa.aiqadam.org
> instead of only localhost, without enabling seed/reset writes against QA.

Source: `handoff.yaml.requirement_text` (no GitHub issue; user-originated
scope request routed as a `requirement-development` workflow).

Decisions already made by the user, binding on this analysis (not
re-litigated below):

1. QA UAT mode is **read-only** — no `--reset`, no seed writes against QA.
   UATRunner drives whatever state already exists on `qa.aiqadam.org`.
2. This is **general infrastructure** — a `target: local | qa` concept usable
   by any BP-UAT script that opts in at invocation time, not wired to one
   specific script.
3. Seeding/reset against QA is **explicitly out of scope** for this
   requirement (candidate for a separate future FR).

---

## Analysis

### Completeness Issues Found

None that block formalization. Two clarifications were needed and are
resolved by reasonable assumptions below (both consistent with existing
patterns in this repo and neither contradicts a user decision above):

1. **Where does `landingUrl` come from today?** `.copilot/agents/uat-runner.md`
   (Session setup + Navigation rules, current FR-WORKFLOW-004 version)
   instructs `driver.goto(landingUrl)` but never defines the variable's
   source — confirmed by reading the file: no `landingUrl =` assignment
   exists anywhere in `uat-runner.md`, `uat-verification.md`, or
   `uat-session-driver.ts`. `driver.goto(url: string)` (line 140 of
   `apps/e2e/support/uat-session-driver.ts`) already accepts any URL — the
   driver itself is environment-agnostic, exactly as the Orchestrator's
   context noted. **Assumption:** `landingUrl` is resolved once, at session
   setup, from the chosen `target` — `http://localhost:4321` for
   `target: local` (matching `apps/e2e/playwright.uat.config.ts:28`'s
   existing `UAT_BASE_URL` fallback and `architecture.md`'s documented local
   URL table) or `https://qa.aiqadam.org` for `target: qa`. This requirement
   formalizes that resolution as an explicit step in both `uat-runner.md`
   and `uat-verification.md`, closing the gap the Orchestrator flagged.

2. **Is QA Directus/Authentik reachability relevant to this FR at all?**
   `scripts/uat-seed.sh:645-663` (`reset_localhost_guard`) already hard-exits
   (code 4, zero writes) unless `DIRECTUS_URL`/`AK_URL` resolve to
   localhost/127.0.0.1. Since seeding is explicitly out of scope for QA mode
   (decision 3 above), this requirement does not touch `uat-seed.sh` at all —
   QA pre-flight checks HTTP(S) reachability of the **UAT-facing surfaces**
   (`qa.aiqadam.org`, `auth.qa.aiqadam.org`) only, and explicitly does not
   attempt to reach Directus/Authentik admin APIs (which are bound to
   `127.0.0.1` on the QA host per the deploy runbook and are not
   network-reachable from wherever the workflow runs anyway). This keeps the
   FR's surface area to the two files the Orchestrator scoped
   (`uat-runner.md`, `uat-verification.md`) plus the handoff schema, per
   decision 2.

No `needs-clarification` flag is required — both points above are resolved
by an assumption that is stated, testable, and consistent with existing
conventions (not a guess that changes behavior of anything already shipped).

### Conflicts with Existing Features

Checked `docs/03-requirements/` (all `FR-WORKFLOW-*` files) for conflicts:

- **FR-WORKFLOW-001** (context drift guard) — no overlap; orthogonal
  concern (registry/state-file sync).
- **FR-WORKFLOW-003** (UAT fixture state reset, `--reset` flag, localhost
  guard) — **adjacent, not conflicting.** FR-WORKFLOW-003's
  `reset_localhost_guard` is the exact mechanism that already prevents
  writes against a non-localhost target; this FR does not modify it, weaken
  it, or attempt to make it accept `qa.aiqadam.org`. The two FRs compose
  cleanly: FR-WORKFLOW-003 governs `pnpm uat:seed --reset`, which this FR's
  QA target never calls (see AC-3 below). No edit to `scripts/uat-seed.sh`
  is in scope here.
- **FR-WORKFLOW-004** (agent-driven live-browser UAT, perceive/decide/act/judge
  model) — **this FR builds directly on top of it, no conflict.** FR-WORKFLOW-004
  already made `uat-runner.md`/`uat-verification.md` environment-parametric
  in spirit (the whole session model is browser-driven, not
  deep-link/localhost-coded) but left the actual `landingUrl` source
  undefined, and its Scope Constraints section ("Never target production...
  `environment` in the UAT script must be `localhost`") was written before
  QA existed as a real, separately-deployed environment (QA went from
  API-only to fully provisioned only on 2026-07-18 per the frontend-rollout
  runbook — the same day as this requirement). This FR is best read as a
  **small, additive amendment** to FR-WORKFLOW-004's execution model (adding
  a `target` axis it didn't anticipate), not a new independent mechanism. No
  AC of FR-WORKFLOW-004 is weakened: sessions are still one continuous
  browser context, still perceive/decide/act/judge, still produce a session
  log + teardown record — only the resolved `landingUrl` and pre-flight
  checks vary by `target`.
- **No existing FR governs QA as a UAT target.** The QA infrastructure FRs
  (deploy/nginx work in PR #26/#27, commit `4c3fca5`/`e6a9cfe`) are
  infrastructure-provisioning changes, not `docs/03-requirements/FR-*`
  entries — they shipped as workflow PRs without a formal FR (consistent
  with `OPS`-module precedent: `FR-OPS-001` is the only entry, and QA
  hardening/deploy work has generally landed via runbook + PR rather than a
  dedicated FR). No conflict; this FR is the first to formalize QA as a UAT
  execution target.

**Numbering check:** `docs/03-requirements/` contains `FR-WORKFLOW-001`,
`FR-WORKFLOW-003`, `FR-WORKFLOW-004` (`FR-WORKFLOW-002` was never created in
this directory — a pre-existing gap in the sequence, not something this
workflow should backfill). `requirements-registry.md` line 37 confirms the
same three files are the only registered `WORKFLOW` entries. **`FR-WORKFLOW-005`
is free and correctly the next number** — confirmed by `Glob` over
`docs/03-requirements/FR-WORKFLOW-*` and by grep over the registry.

### Architectural Feasibility

**Fits within the current stack — no architectural violation.**

- **Module boundary:** `WORKFLOW` is an already-established module code
  (`architecture.md`'s module list is product-code-scoped, but `WORKFLOW`
  as used by FR-WORKFLOW-001/003/004 covers the `.copilot/` agentic-workflow
  layer, which is explicitly outside the NestJS module-boundary rules —
  those apply to `apps/api/src/modules/`, not to workflow tooling). This FR
  stays within that same precedent: it touches `.copilot/agents/uat-runner.md`,
  `.copilot/workflows/uat-verification.md`, and the `handoff.yaml` schema —
  no product code, no DB schema, no cross-schema query concern.
- **No new dependency.** `driver.goto(url)` already accepts an arbitrary
  URL (`apps/e2e/support/uat-session-driver.ts:140`) — QA-targeting is a
  matter of *which URL string* is resolved and passed in, not a driver
  change. `playwright.uat.config.ts:28` already parameterizes `UAT_BASE_URL`
  for the regression-net layer; this FR's `target` concept is a parallel
  resolution for the agent-driven session layer, following the same
  precedent rather than inventing a new one.
- **No production risk.** QA is explicitly not production
  (`architecture.md`'s "Production deployment — active" section describes
  `aiqadam-web` at `212.20.151.29` as the production host; QA runs on
  separate `pro-data-tech-qa`/`pro-data-tech-prod` hosts per the runbook —
  `qa.aiqadam.org` is neither of those). The existing Scope Constraints
  prose ("Never target production... must be `localhost`") conflates
  "not localhost" with "production," which was accurate until QA was a real
  target and is no longer precise — this FR corrects that without loosening
  the actual constraint (still hard-blocks prod).
- **Read-only is enforceable, not just documented.** The mechanism already
  exists: `scripts/uat-seed.sh`'s `reset_localhost_guard` (FR-WORKFLOW-003)
  will `exit 4` with zero writes if ever pointed at QA's Directus/Authentik
  URLs — but this FR's design goes further and simply never invokes
  `uat-seed.sh` at all when `target: qa` (belt-and-suspenders: the guard is
  a backstop, not the enforcement point). QA's Directus (`127.0.0.1:3119`)
  and the Authentik admin surface are host-bound and not network-reachable
  from outside the QA host in any case, per the frontend-rollout runbook —
  so even a hypothetical bypass attempt would fail on connectivity before
  reaching the guard.
- **Small-PR discipline (AGENTS.md §4):** implementation is two `.copilot/`
  markdown files + one schema comment/field addition — well under the
  400-line / 5-file ceiling. No code-developer/DB-migration involvement
  expected; this is a docs+shell-conditional change, consistent with the
  Orchestrator's own risk framing.

**Conclusion: architecturally feasible, low risk, no conflicts.**

---

## Formalized Requirement

**FR-WORKFLOW-005 — Read-only QA target mode for agent-driven UAT sessions**

Module: Workflow (WORKFLOW) · Phase: DevEx

The `uat-verification` workflow and the UATRunner agent SHALL support an
explicit `target` selector — `local` (default) or `qa` — chosen at workflow
invocation. `target: local` preserves all current behavior byte-for-byte
(Docker pre-flight, `http://localhost:4321` landing URL, `pnpm uat:seed`
seeding). `target: qa` resolves the session's landing URL to
`https://qa.aiqadam.org`, replaces the Docker/localhost-curl pre-flight with
HTTPS reachability checks against `qa.aiqadam.org` and
`auth.qa.aiqadam.org`, and **unconditionally skips all seed/reset
invocations** — QA UAT sessions read and interact with whatever state
already exists on the QA deployment; they never call `pnpm uat:seed` (with
or without `--reset`) against QA. The `uat-verification.md` Scope
Constraints section is revised so `qa` is a permitted target while `prod`
and any other host remain hard-blocked, unchanged from today's intent.

**Cross-refs:**
- Builds on `FR-WORKFLOW-004` (agent-driven live-browser session model —
  perceive/decide/act/judge; this FR adds the `target` axis to that
  model's landing-URL resolution and pre-flight step, no other change).
- Composes with, does not modify, `FR-WORKFLOW-003` (`--reset` /
  `reset_localhost_guard`) — QA mode never reaches that code path.
- Relates to the QA deployment topology documented in
  `deploy/nginx/qa.aiqadam.org.conf` and
  `docs/04-development/infrastructure/runbooks/pro-data-tech-frontend-rollout.md`
  (merged in PR #26/#27, commits `4c3fca5`/`e6a9cfe`).

**Explicitly out of scope (v1):** seed/reset writes against QA (may become a
separate future FR per the user's decision); Directus/Authentik admin-API
reachability checks against QA (not part of the UAT-facing surface, and not
network-reachable from outside the QA host); running the Playwright
regression-net (`playwright.uat.config.ts`) against QA (`UAT_BASE_URL`
already supports this independently and is not part of this FR's session
layer); multi-target concurrent sessions.

---

## Acceptance Criteria (draft)

- **AC-1 (explicit target selection, local unchanged):**
  Given the `uat-verification` workflow is invoked with no `target`
  specified, or with `target: local` explicitly, when the workflow runs
  Step 2 (pre-flight) and Step 3 (UATRunner session setup), then behavior is
  byte-identical to pre-FR-WORKFLOW-005 behavior — Docker Compose health
  checks, `http://localhost:4321` / `http://localhost:3000` curl checks,
  and `pnpm uat:seed [--reset <BP-UAT-NNN>]` all run exactly as documented
  today, and the session's `landingUrl` resolves to
  `http://localhost:4321`.

- **AC-2 (QA target selection resolves the QA landing URL):**
  Given the workflow is invoked with `target: qa`, when UATRunner performs
  session setup, then `driver.goto(landingUrl)` is called with
  `landingUrl = https://qa.aiqadam.org` (not a deep link, not a path-prefixed
  URL, per FR-WORKFLOW-004 AC-1's landing-start rule — unchanged) and the
  resolved target is visible in the session log's opening metadata block
  and in `02-uat-report.md`'s `**Environment:**` field.

- **AC-3 (QA pre-flight replaces Docker/localhost checks with HTTPS
  reachability, and never seeds):**
  Given `target: qa`, when Step 2 pre-flight runs, then: (a) the Docker
  Compose health check and the `localhost:4321`/`localhost:3000` curl
  checks are skipped; (b) `curl -fsS -o /dev/null -w '%{http_code}'
  https://qa.aiqadam.org/` and the equivalent check against
  `https://auth.qa.aiqadam.org/` are run instead, and pre-flight fails
  (`failed-escalate`) if either does not return a 2xx/3xx status; (c) no
  invocation of `pnpm uat:seed` (with or without `--reset`) occurs — the
  pre-flight step's own logged output states explicitly *why*: "QA target
  is read-only; seed/reset is out of scope for FR-WORKFLOW-005 and is never
  invoked against QA." A test asserting `pnpm uat:seed` was not exec'd
  during a `target: qa` pre-flight run must pass.

- **AC-4 (Scope Constraints revised to permit `qa`, still hard-block
  everything else):**
  Given `uat-verification.md`'s "Scope Constraints" section as revised by
  this FR, when read, then it states: sessions may target `local` (default)
  or `qa` (explicit opt-in via `target: qa`); no other value is accepted;
  any workflow invocation with `target` set to anything other than `local`
  or `qa` (including any variant resolving to `aiqadam.org`,
  `www.aiqadam.org`, or the production host `212.20.151.29`) is rejected at
  Step 0 with `failed-escalate` before any browser session starts. The
  revised prose must not use the word "localhost" as a synonym for
  "non-production" — the two are now distinct concepts (QA is non-production
  but not localhost).

- **AC-5 (UATRunner's `driver.goto` receives the QA URL when `target: qa`):**
  Given `target: qa`, when `.copilot/agents/uat-runner.md`'s Session setup
  section is followed, then the documented `landingUrl` assignment reads
  the resolved target's URL (not a hardcoded `localhost` value) before
  `UATSessionDriver.create()` / `driver.goto()` is called — i.e. the
  variable's source, which the Orchestrator's context confirmed was
  previously undefined in the agent file, is now explicit for both `local`
  and `qa`.

- **AC-6 (`handoff.yaml` records the chosen target):**
  Given any `uat-verification` workflow run, when `handoff.yaml` is
  inspected after Step 0, then it contains a `uat_target` field (schema:
  `.copilot/schemas/handoff.schema.yaml`) with value `local` or `qa`,
  defaulting to `local` when absent for backward compatibility with
  in-flight/historical workflow directories that predate this field. The
  field is set once at Step 0 and read (not re-derived) by Step 2 and
  Step 3.

- **AC-7 (no regression to FR-WORKFLOW-003 / FR-WORKFLOW-004):**
  Given the changes in this FR, when a `target: local` session with
  `--reset <BP-UAT-NNN>` is run, then FR-WORKFLOW-003's
  `reset_localhost_guard` and manifest-reset behavior are unaffected, and
  when any session (local or QA) runs, FR-WORKFLOW-004's perceive/decide/act/judge
  loop, one-goto rule, teardown requirement, and post-session gate scripts
  (`uat-navigation-check.sh`, `uat-visual-check.sh`, `uat-teardown-check.sh`)
  all still apply unchanged regardless of `target`.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-005 formalized — read-only QA target mode for uat-verification/UATRunner; no conflicts, architecturally feasible, numbering confirmed free."
  findings:
    - "FR-WORKFLOW-005 is the correct next number: docs/03-requirements/ has FR-WORKFLOW-001/003/004 only (002 is a pre-existing gap, not backfilled here); requirements-registry.md line 37 confirms the same three entries."
    - "No conflict with FR-WORKFLOW-003 (--reset/localhost guard) — this FR never calls pnpm uat:seed against QA, so the two compose without either modifying the other."
    - "This FR is best understood as a small additive amendment to FR-WORKFLOW-004's already-current agent-driven session model (perceive/decide/act/judge) — it only adds the target axis to landingUrl resolution and pre-flight, all other FR-WORKFLOW-004 ACs are untouched."
    - "Resolved one genuine gap the Orchestrator flagged: landingUrl was referenced in uat-runner.md's Session setup / Navigation rules but never assigned anywhere — AC-2 and AC-5 close this for both local and qa targets, not just qa."
    - "uat-verification.md's Scope Constraints currently conflates 'not localhost' with 'production' (accurate when written, pre-dates QA's 2026-07-18 full provisioning) — AC-4 requires the revised prose to treat local/qa/prod as three distinct states, hard-blocking only prod (and anything else)."
    - "QA pre-flight scope is deliberately narrow: HTTPS reachability of qa.aiqadam.org and auth.qa.aiqadam.org only. Directus/Authentik admin surfaces are host-bound (127.0.0.1) and out of scope per the frontend-rollout runbook and the user's seed/reset exclusion."
    - "handoff.schema.yaml has no target-like field today; AC-6 proposes a new uat_target field (default local) rather than overloading an existing field, to keep the schema change additive and backward-compatible with existing task directories."
```
