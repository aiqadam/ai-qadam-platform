# Impact Analysis — wf-20260718-feat-121

## Validated Requirement

**FR-WORKFLOW-005 — Read-only QA target mode for agent-driven UAT sessions**

Module: Workflow (WORKFLOW) · Phase: DevEx

The `uat-verification` workflow and the UATRunner agent SHALL support an
explicit `target` selector — `local` (default) or `qa` — chosen at workflow
invocation. `target: local` preserves all current behavior byte-for-byte.
`target: qa` resolves the session's landing URL to `https://qa.aiqadam.org`,
replaces the Docker/localhost-curl pre-flight with HTTPS reachability checks
against `qa.aiqadam.org` and `auth.qa.aiqadam.org`, and unconditionally skips
all seed/reset invocations. `uat-verification.md`'s Scope Constraints section
is revised so `qa` is a permitted target while `prod` and any other host
remain hard-blocked. See `01-requirement-validation.md` for full ACs (AC-1
through AC-7), conflict analysis, and cross-refs to FR-WORKFLOW-003/004.

This is a `.copilot/` agentic-workflow-tooling change — no product code, no
API, no DB, no frontend/bot/worker surface. See `AGENTS.md` module-boundary
precedent (confirmed in requirement-validation, "Architectural Feasibility"):
`WORKFLOW` as a module code covers the `.copilot/` layer, which sits outside
the NestJS `apps/api/src/modules/` boundary rules entirely.

---

## Affected Layers

### API (NestJS)

| Layer | Affected? | Detail |
|---|---|---|
| `apps/api/src/modules/*` | No | No module touched. This FR does not add, modify, or call any NestJS endpoint. |
| `apps/api/src/core/*` | No | No auth/tenant/observability change. |

No API surface table is populated below — there is none for this FR (see
"API Surface Changes" section, intentionally empty).

### DB Changes Required

**No.**

No Drizzle schema, migration, table, column, or constraint is touched by
this FR. `handoff.schema.yaml` is a workflow-tooling YAML contract (agent
handoff state), not a Postgres schema — adding a field to it is a docs/config
change, not a DB migration. Confirmed against `docs/04-development/architecture/architecture.md`
"Data ownership" table: the `platform`/`directus`/`authentik`/`twenty`/`listmonk`
Postgres schemas are unaffected; `qa.aiqadam.org` reachability checks are
plain HTTPS `curl` probes against already-deployed infrastructure (PR
#26/#27), not schema-touching operations.

**Routing consequence:** because DB changes = no, the Orchestrator routes
directly from this step to **Step 4 (CodeDeveloper)** and **skips Step 3
(DBMigrationAuthor)** entirely, per the standard `requirement-development`
workflow map.

### Shared Types

Not affected. `packages/shared-types/` holds Zod schemas/TS types for the
product's API/DB contracts (web ↔ API). This FR touches no product-facing
type. (`handoff.schema.yaml`'s new `uat_target` field is a workflow-internal
YAML contract, not a shared-types concern — no code in `packages/` reads
`handoff.yaml`.)

### Frontend

Not affected. No `apps/web/`, `apps/web-next/`, Astro page, React island, or
`apps/web*/src/lib/api.ts` change. `qa.aiqadam.org` is an already-deployed
target (PR #26/#27); this FR does not change what runs there, only how a
UAT session's *test driver* points at it.

### Bot

Not affected. No `apps/bot/` handler, keyboard, or service change.

### Workers

Not affected. No `apps/workers/` BullMQ queue or processor change.

### Workflow Tooling (`.copilot/`) — the actual affected layer

| File | Change | Type |
|---|---|---|
| `.copilot/agents/uat-runner.md` | Session setup: add explicit `landingUrl` resolution keyed on `target` (closes the pre-existing gap — no `landingUrl =` assignment exists anywhere today, confirmed by requirement-validation). Pre-Flight Checks: add a `target: qa` branch that swaps Docker/localhost curl checks for HTTPS reachability checks against `qa.aiqadam.org` / `auth.qa.aiqadam.org` and explicitly skips `pnpm uat:seed`. | Prose + fenced bash/TS snippet edits |
| `.copilot/workflows/uat-verification.md` | Step 2 pre-flight: add a `target: qa` conditional branch parallel to the existing Docker/curl/seed block. Scope Constraints: revise "Never target production... `environment` must be `localhost`" to state three distinct states (local default / qa explicit opt-in / everything else hard-blocked, including prod) per AC-4. | Prose + fenced bash snippet edits |
| `.copilot/schemas/handoff.schema.yaml` | Add additive `uat_target` field (`local` \| `qa`, default `local` when absent) per AC-6. Comment-documented like the existing `expects_registry_update` field's default-when-absent pattern (lines 139–150 of the current schema) — same style, same backward-compatibility posture. | Additive schema field + comment |

**Possible additional file (flagged, not mandated):** a small shell helper
(e.g. `scripts/uat-qa-preflight-check.sh`) mirroring
`scripts/uat-preflight-check.sh`'s pattern, if CodeDeveloper/TestDesigner
judge that inline `curl` in the workflow doc is not independently testable
enough. The ACs (AC-3 in particular) do not require a new script file —
"the equivalent check... are run instead" is satisfiable with inline `curl
-fsS -o /dev/null -w '%{http_code}'` commands in the doc, matching the
existing style of Step 2's other checks. See Risk Flags for the testability
trade-off either way.

**Explicitly confirmed out of scope** (per requirement-validation and this
analysis's own file review):
- `scripts/uat-seed.sh` — untouched. QA mode never calls it (AC-3c);
  `reset_localhost_guard` (FR-WORKFLOW-003, lines ~645-663) remains the
  backstop but is not modified or relaxed.
- `apps/e2e/support/uat-session-driver.ts` — already environment-agnostic.
  Confirmed by reading `goto(url: string)` (line 140): it accepts an
  arbitrary URL string with no localhost assumption baked in. No change
  needed for QA targeting.
- `apps/e2e/playwright.uat.config.ts` — already has an independent
  `UAT_BASE_URL` parameterization for the regression-net layer (separate
  from the agent-driven session layer this FR touches). Out of scope per
  the requirement's explicit exclusion list.
- `scripts/uat-preflight-check.sh` — the existing process-identity probe
  (ISS-UAT-013-2) is inherently a `localhost`-port-binding check
  (`Get-NetTCPConnection -LocalPort`); it has no meaning against a remote
  HTTPS host and is correctly *not* reused for the QA branch. QA pre-flight
  uses plain HTTPS reachability instead, per AC-3b — there is no
  process-identity ambiguity to guard against on a remote host the way
  there is on a shared-localhost dev machine.
- Any DB schema, `apps/api/`, `apps/web*/`, `apps/bot/`, `apps/workers/`
  code — confirmed no matches on any product-code path for this FR's scope.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| — | — | None. This FR adds no endpoint and modifies no existing endpoint, DTO, or contract. | N/A |

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| — | — | None. No cross-module service calls are introduced; the QA pre-flight branch calls `curl` against already-deployed HTTPS endpoints (`qa.aiqadam.org`, `auth.qa.aiqadam.org`), not an internal service interface. |

---

## Risk Flags

### Security Review Required

**Low, but not zero — flag for a light-touch SecurityReviewer pass, not a
full review.**

- The core security property this FR must not weaken: QA must remain
  provably read-only from the UAT tooling's side. AC-3c requires this to be
  enforced structurally (QA branch never invokes `pnpm uat:seed` at all —
  belt-and-suspenders on top of FR-WORKFLOW-003's `reset_localhost_guard`
  backstop), not just documented as a convention. SecurityReviewer should
  confirm the actual diff has no code path where `target: qa` can reach the
  seed invocation line.
- No secrets are introduced. QA HTTPS reachability checks are unauthenticated
  `curl` probes against public-facing URLs (`https://qa.aiqadam.org/`,
  `https://auth.qa.aiqadam.org/`) — no credential, token, or admin-API access
  is added. Directus (`127.0.0.1:3119`) and Authentik's admin surface remain
  host-bound and are correctly excluded from this FR's pre-flight scope
  (confirmed via `docs/04-development/infrastructure/runbooks/pro-data-tech-frontend-rollout.md`
  lines 28-31).
- AC-4's Scope Constraints rewrite must be checked carefully: the revised
  prose has to hard-block production (`aiqadam.org`, `www.aiqadam.org`,
  `212.20.151.29`) by construction, not just by omission. A reviewer should
  confirm the `failed-escalate` gate at Step 0 actually validates the
  `uat_target` value against an allowlist (`local`, `qa`) rather than a
  denylist — an allowlist is the safer shape for this and should be what
  CodeDeveloper implements.

### Architecture Rule Risks

**None identified.** Per requirement-validation's "Architectural Feasibility"
section (re-verified independently in this analysis):
- Module boundary rules (`architecture.md` "Module boundaries") apply to
  `apps/api/src/modules/`, not `.copilot/` workflow tooling — no violation
  possible here because no NestJS module is touched.
- No cross-schema query risk — no DB access of any kind is introduced.
- No new dependency — `driver.goto(url)` already accepts an arbitrary URL
  (confirmed at `apps/e2e/support/uat-session-driver.ts:140`); this FR
  supplies a different string, not a new capability.
- Small-PR discipline (AGENTS.md §4): three files (two agent/workflow docs +
  one schema), well under the 400-line/5-file ceiling, even counting an
  optional fourth file if a helper script is added.

### Testability Risk — flagged honestly per Orchestrator instruction

**This is a documentation/config change with no unit-test framework wrapping
`.copilot/` markdown files.** There is no Jest/Vitest suite that parses
`uat-runner.md` or `uat-verification.md` prose, so "AC-3's pre-flight
correctly skips Docker checks and never calls `pnpm uat:seed`" cannot be
verified by an automated unit test in the conventional sense unless a
concrete script is introduced. Two honest paths, both viable, neither fake:

1. **If CodeDeveloper adds a small shell script** (e.g.
   `scripts/uat-qa-preflight-check.sh`) rather than pure inline `curl` in the
   doc, it becomes testable the same way `scripts/uat-preflight-check.sh` is
   tested today — a `.bats` regression test under `scripts/tests/` (see
   `scripts/tests/uat-preflight-check.bats` referenced in the existing
   script's header) with `curl`/HTTP mocked or a `UAT_*_PROBE_OUTPUT`-style
   test hook. This is the only path to genuine automated coverage for this
   FR.
2. **If the ACs are satisfied via inline `curl` in the workflow doc**
   (equally valid per the AC-3 text — "the equivalent check... are run
   instead" does not mandate a script), there is **no automated test
   coverage possible** for the pre-flight branch logic itself. Verification
   in that case is necessarily manual/live: an operator or the
   TestRunner/Orchestrator verification step runs the documented `curl`
   commands by hand (or via a throwaway workflow invocation with
   `target: qa`) against the real `qa.aiqadam.org` and
   `auth.qa.aiqadam.org` and observes a 2xx/3xx response, matching AC-3b.
   This is **live infrastructure verification, not unit-test coverage** —
   it should be reported as such and not conflated with an automated test
   passing.

**Recommendation to the Orchestrator:** ask CodeDeveloper to make the
call on script-vs-inline based on how much branching logic ends up in the
QA pre-flight step. If it stays to 2-3 `curl` lines + a skip-seed
conditional, inline-in-doc is proportionate and matches this FR's stated
small-PR framing. If it grows (e.g. retry/backoff logic, multiple endpoint
checks with distinct failure messages), a script + `.bats` test pays for
itself. Either way, **do not report synthetic/fabricated automated test
results for the prose-only path** — Test Scope below reflects this
honestly.

---

## Test Scope

**This is primarily a documentation/config change.** Testability comes from
two different tracks depending on the script-vs-inline decision above (see
Testability Risk):

### Unit tests

- **None possible** for the `uat-verification.md` / `uat-runner.md` prose
  changes themselves — there is no parser/runner that executes workflow
  markdown as code.
- **Conditional:** if a new helper script is introduced (e.g.
  `scripts/uat-qa-preflight-check.sh`), a `.bats` unit/regression test
  should accompany it under `scripts/tests/`, following the existing
  pattern of `scripts/uat-preflight-check.sh` + its `.bats` counterpart —
  mock the `curl` calls or use an environment-variable test hook
  (`UAT_*_PROBE_OUTPUT`-style, matching the convention already established
  in `uat-preflight-check.sh` lines 39-47) so the test suite doesn't require
  real network access to `qa.aiqadam.org`.

### Integration tests (Testcontainers)

- **Not applicable.** No DB, no service, nothing Testcontainers would spin
  up. This FR does not touch anything Testcontainers-testable.

### E2E (Playwright)

- **Not applicable to this FR directly.** `apps/e2e/playwright.uat.config.ts`
  and its `UAT_BASE_URL` parameterization are explicitly out of scope
  (already independently supports pointing at QA; this FR's `target` axis
  is for the separate agent-driven session layer, not the Playwright
  regression net).
- **However**, AC-2 and AC-5 (landing URL resolves correctly per target) and
  AC-3 (QA pre-flight branch behavior) are best confirmed via a **live
  verification run**: an actual `uat-verification` workflow invocation with
  `target: qa` against a real BP-UAT script, driven through Step 2/3, with
  the Orchestrator/TestRunner observing:
  - Step 2 pre-flight logs show the HTTPS `curl` checks against
    `qa.aiqadam.org` and `auth.qa.aiqadam.org` (not the Docker/localhost
    checks) and explicitly log the "QA target is read-only... never
    invoked against QA" message from AC-3c.
  - No `pnpm uat:seed` invocation appears in the pre-flight output for the
    `target: qa` run (a `grep`/log-absence check the Orchestrator can run
    against the captured pre-flight output — this is the closest thing to
    an automated assertion available without a new script, and satisfies
    AC-3c's "a test asserting `pnpm uat:seed` was not exec'd... must pass"
    requirement even in the inline-doc path, since the Orchestrator's own
    Step 2 execution transcript is the artifact being asserted against).
  - `02-uat-report.md`'s `**Environment:**` field shows `https://qa.aiqadam.org`
    per AC-2.
- This live verification should happen once during the TestRunner/Orchestrator
  verification step of **this FR's own implementation workflow** (i.e. a
  dry-run of the new QA-target machinery), not as a permanent addition to
  CI (no CI job should be routinely hitting `qa.aiqadam.org` on every PR —
  that would be scope creep beyond this FR and a possible availability
  dependency for unrelated PRs).

### Manual / live verification (primary testability track for this FR)

Given the "no unit-test framework wraps `.copilot/` markdown" constraint
stated by the Orchestrator, the dominant verification method here is manual
or live-run confirmation, performed once during this FR's own
TestRunner/Orchestrator step:
1. Confirm `target: local` (default and explicit) is byte-identical to
   current behavior (AC-1) — diff the pre-flight transcript against a
   pre-FR baseline run.
2. Confirm `target: qa` resolves `landingUrl` correctly and the pre-flight
   branch fires HTTPS checks against the real `qa.aiqadam.org` /
   `auth.qa.aiqadam.org` (AC-2, AC-3a, AC-3b) — this requires those hosts to
   be actually reachable at verification time (they are, per PR #26/#27
   already merged and deployed as of `e6a9cfe`).
3. Confirm the skip-seed behavior and its logged rationale (AC-3c).
4. Confirm the revised Scope Constraints prose rejects any non-`local`/`qa`
   target at Step 0 before a browser session starts (AC-4) — this can be a
   dry-run/inspection check (attempt an invocation with, e.g., `target: prod`
   and confirm `failed-escalate` fires before Step 1).

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-005 impact fully analyzed — three .copilot/ files in scope (uat-runner.md, uat-verification.md, handoff.schema.yaml), no product-code/DB/API/frontend/bot/worker surface affected. DB Changes Required: no — routes directly to Step 4 (CodeDeveloper), Step 3 (DBMigrationAuthor) skipped."
  findings:
    - "No NestJS module, Drizzle schema, shared-types entry, Astro/React surface, aiogram handler, or BullMQ processor is touched — confirmed by re-checking each layer independently against architecture.md's module map, not just accepting the requirement-validation's framing."
    - "DB Changes Required: no. handoff.schema.yaml's new uat_target field is a workflow-internal YAML contract addition, not a Postgres migration — Orchestrator should skip Step 3 (DBMigrationAuthor) entirely."
    - "Confirmed apps/e2e/support/uat-session-driver.ts:140 (driver.goto(url: string)) already accepts an arbitrary URL with no localhost assumption — no driver change needed, matching the requirement-validation's claim."
    - "Confirmed via docs/04-development/infrastructure/runbooks/pro-data-tech-frontend-rollout.md (lines 28-31) that Directus is host-bound at 127.0.0.1:3119 and Authentik now runs on its own subdomain auth.qa.aiqadam.org (real, not a loopback stub) — validates AC-3b's two-endpoint HTTPS reachability scope and confirms admin-API surfaces are correctly excluded."
    - "scripts/uat-preflight-check.sh's process-identity probe (ISS-UAT-013-2) is inherently localhost-port-bound (Get-NetTCPConnection -LocalPort) and has no meaning against a remote HTTPS host — correctly not reused for the QA branch; flagged so CodeDeveloper doesn't try to force-fit it."
    - "Security risk is low but not zero: the read-only guarantee (AC-3c) must be structural (QA branch's code path never reaches the pnpm uat:seed line), not just documented prose — flagged for a light SecurityReviewer pass, and the AC-4 target-value check should be an allowlist (local, qa), not a denylist, for safety."
    - "Testability is honestly limited: no unit-test framework wraps .copilot/ markdown. Real automated coverage is only possible if CodeDeveloper introduces a new helper script (bats-testable, mirroring uat-preflight-check.sh's pattern) rather than inline curl in the doc. Both paths are AC-compliant; the analysis does not mandate a script and does not fabricate automated coverage for the prose-only path — see Risk Flags and Test Scope for the honest breakdown and the recommended live-verification checklist against the real qa.aiqadam.org / auth.qa.aiqadam.org during this FR's own TestRunner/Orchestrator step."
```
