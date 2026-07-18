---
code: FR-WORKFLOW-005
name: Read-only QA target mode for agent-driven UAT sessions
status: Implemented
module: Workflow (WORKFLOW)
phase: DevEx
relates_to:
  - FR-WORKFLOW-003 (fixture reset — composes with, does not modify)
  - FR-WORKFLOW-004 (agent-driven session model — this FR adds the target axis)
  - .copilot/agents/uat-runner.md
  - .copilot/workflows/uat-verification.md
---

## Description

`FR-WORKFLOW-004` defined UAT as an agent-driven live-browser session, but its
session setup referenced a `landingUrl` variable that was never actually
assigned anywhere in `uat-runner.md`, and its Scope Constraints prose used
"localhost" as a synonym for "non-production" — accurate when written, but no
longer precise once `qa.aiqadam.org` became a real, separately-deployed
environment (fully provisioned 2026-07-18, PR #26/#27).

This requirement adds an explicit `target` selector — `local` (default) or
`qa` (explicit opt-in) — to the `uat-verification` workflow and the UATRunner
agent, closing both gaps at once. `target: local` preserves current behavior
byte-for-byte: Docker/localhost pre-flight, `http://localhost:4321` landing
URL, `pnpm uat:seed [--reset]` seeding. `target: qa` resolves the session's
landing URL to `https://qa.aiqadam.org`, replaces the Docker/localhost
pre-flight with an HTTPS reachability check against `qa.aiqadam.org` and
`auth.qa.aiqadam.org`, and **unconditionally skips all seed/reset
invocations** — a QA UAT session reads and interacts with whatever state
already exists on the QA deployment; it never calls `pnpm uat:seed` (with or
without `--reset`) against QA. This is enforced structurally, not just
documented: the QA pre-flight script contains zero occurrences of the
seed-invocation token anywhere in its source, backed by a regression test.

`target` is general infrastructure — any BP-UAT script can opt into `qa` at
workflow invocation time. It is not wired to one specific script, and no
BP-UAT-*.md file's frontmatter changes as part of this FR (see "Out of
scope" below).

Seeding/reset against QA is explicitly out of scope for this requirement and
is a candidate for a separate future FR.

## Acceptance criteria

- [x] **AC-1 (explicit target selection, local unchanged):** With no `target`
      specified, or `target: local` explicitly, `uat-verification` Step 2
      (pre-flight) and Step 3 (UATRunner session setup) behave byte-identically
      to pre-FR-WORKFLOW-005: Docker Compose health checks, the
      `localhost:4321` / `localhost:3000` curl checks, and
      `pnpm uat:seed [--reset <BP-UAT-NNN>]` all run exactly as before, and the
      session's `landingUrl` resolves to `http://localhost:4321`.
- [x] **AC-2 (QA target resolves the QA landing URL):** With `target: qa`,
      UATRunner's session setup calls `driver.goto(landingUrl)` with
      `landingUrl = https://qa.aiqadam.org` (not a deep link, per
      FR-WORKFLOW-004 AC-1's landing-start rule), and the resolved target is
      visible in the session log's opening metadata block and in
      `02-uat-report.md`'s `**Environment:**` field.
- [x] **AC-3 (QA pre-flight replaces Docker/localhost checks with HTTPS
      reachability, and never seeds):** With `target: qa`, Step 2 pre-flight:
      (a) skips the Docker Compose health check and the
      `localhost:4321`/`localhost:3000` curl checks; (b) runs an HTTPS
      reachability check (2xx/3xx required) against `https://qa.aiqadam.org`
      and `https://auth.qa.aiqadam.org` instead, failing `failed-escalate` if
      either does not respond; (c) never invokes `pnpm uat:seed` (with or
      without `--reset`) — the pre-flight step's own logged output states why
      ("QA target is read-only; seed/reset is out of scope for
      FR-WORKFLOW-005 and is never invoked against QA").
- [x] **AC-4 (Scope Constraints revised to permit `qa`, still hard-block
      everything else):** `uat-verification.md`'s "Scope Constraints" section
      states that sessions may target `local` (default) or `qa` (explicit
      opt-in); no other value is accepted; any invocation with `target` set to
      anything else — including any variant resolving to `aiqadam.org`,
      `www.aiqadam.org`, or the production host — is rejected at Step 0 with
      `failed-escalate` before any browser session starts. The revised prose no
      longer uses "localhost" as a synonym for "non-production."
- [x] **AC-5 (UATRunner's `driver.goto` receives the QA URL when
      `target: qa`):** `.copilot/agents/uat-runner.md`'s Session setup section
      documents the `landingUrl` assignment explicitly for both `local` and
      `qa`, sourced from the resolved target (not a hardcoded `localhost`
      value), before `UATSessionDriver.create()` / `driver.goto()` is called.
- [x] **AC-6 (`handoff.yaml` records the chosen target):** Any
      `uat-verification` workflow run's `handoff.yaml` contains a `uat_target`
      field (`.copilot/schemas/handoff.schema.yaml`) with value `local` or
      `qa`, defaulting to `local` when absent for backward compatibility with
      task directories that predate this field. The field is set once at Step
      0 and read (not re-derived) by Step 2 and Step 3.
- [x] **AC-7 (no regression to FR-WORKFLOW-003 / FR-WORKFLOW-004):** A
      `target: local` session with `--reset <BP-UAT-NNN>` leaves
      FR-WORKFLOW-003's `reset_localhost_guard` and manifest-reset behavior
      unaffected, and every session (local or QA) still runs FR-WORKFLOW-004's
      full perceive/decide/act/judge loop, one-goto rule, teardown requirement,
      and post-session gate scripts (`uat-navigation-check.sh`,
      `uat-visual-check.sh`, `uat-teardown-check.sh`) unchanged regardless of
      `target`.

## Out of scope (v1)

- **Seed/reset writes against QA.** QA UAT sessions are read-only; may become
  a separate future FR.
- **Directus/Authentik admin-API reachability checks against QA.** Not part
  of the UAT-facing surface, and not network-reachable from outside the QA
  host per the frontend-rollout runbook.
- **Running the Playwright regression net (`playwright.uat.config.ts`)
  against QA.** `UAT_BASE_URL` already supports this independently of this
  FR's agent-driven session layer.
- **Multi-target concurrent sessions.**
- **Editing per-BP-UAT-*.md frontmatter.** `target` is chosen at workflow
  invocation, not declared per script — no `environment:` field in any
  `docs/02-business-processes/uat/BP-UAT-*.md` file changes as part of this
  FR.

## Implementation

Shipped in workflow `wf-20260718-feat-121`:

- **New:** `scripts/uat-qa-preflight-check.sh` — HTTPS reachability check
  against `qa.aiqadam.org` and `auth.qa.aiqadam.org`, mirroring the existing
  `uat-preflight-check.sh` idiom (test hook, exit-code contract, `--base-url`
  override). Structurally contains no seed-invocation call.
- **New:** `scripts/tests/uat-qa-preflight-check.bats` — 14 tests covering
  both-hosts-healthy, each host down, the AC-3c read-only message, the
  no-seed structural regression guard, and CLI ergonomics. 14/14 passing.
- **Modified:** `.copilot/agents/uat-runner.md` — explicit `landingUrl`
  resolution from `uat_target` in Session setup; Pre-Flight Checks split into
  `target: local` (unchanged) and `target: qa` (new) branches.
- **Modified:** `.copilot/workflows/uat-verification.md` — Step 0 target
  validation, Step 2 pre-flight branching, and Scope Constraints revised to a
  three-state `local`/`qa`/everything-else allowlist.
- **Modified:** `.copilot/schemas/handoff.schema.yaml` — additive
  `uat_target` field (default `"local"`), backward-compatible with existing
  task directories.

Full file-by-file rationale, design decisions, and verification detail are in
`.copilot/tasks/active/wf-20260718-feat-121/03-code-summary.md` and
`07-test-results.md`.
