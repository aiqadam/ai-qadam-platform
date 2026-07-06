---
code: FR-WORKFLOW-004
name: Agent-driven UAT — live browser sessions that emulate a human tester
status: Implemented
module: Workflow (WORKFLOW)
phase: DevEx
supersedes_execution_model_of:
  - .copilot/agents/uat-runner.md
  - .copilot/workflows/uat-verification.md (Step 3 and Step 3.5)
relates_to:
  - docs/04-development/testing/visual-testing.md
  - docs/04-development/architecture/uat-agent-architecture.md
  - FR-WORKFLOW-003 (fixture reset — precondition)
---

## Description

Today's "UAT" is not UAT. The `uat-verification` workflow's Step 3
(`.copilot/agents/uat-runner.md`) instructs the agent to *author a Playwright
spec with one `test()` per UAT step*, then reports a runner verdict
(`5/12 Playwright tests PASSED`). Every step reaches its screen with a direct
`page.goto(deep-link)` — e.g. BP-UAT-013 Step 005 does
`page.goto(BASE_URL + '/onboard?token=…')` rather than starting on the landing
page and navigating to onboarding the way an invited operator would. Visual
"analysis" happens after the fact, in a separate agent that reads saved PNGs it
never produced, against a structured proof-of-look table that a lightweight
check can satisfy.

This is a **category error**: unit/E2E regression testing wearing a UAT label.
It answers "do these assertions still hold?" — not the question UAT exists to
answer: **"if a real person used this system the way people actually use
systems, would it work and would it look right?"**

A human running a UAT does five things (operator's own words):

1. Starts the application at its **default landing screen** — not a deep link.
2. Enters preliminary data **through the screen forms**, by navigating to them.
3. Interacts with the tested forms as a person would (read the page, find the
   control, click it, type, submit).
4. **Visually compares** the actual rendered screen against the expected state —
   a genuine judgment, not a DOM assertion.
5. Finishes the test — cleans up test data, or leaves it as input for the next
   test — deliberately.

Agents do none of these by default. Under context and cost pressure they
collapse every one of them to the cheapest mechanical substitute, because
nothing in the current system rewards the human-shaped path and much rewards
the shortcut.

**This requirement redefines UAT for this repo as an agent-driven live browser
session.** An AI agent operates a real browser step by step: it perceives the
actually-rendered screen, decides the next human action, performs it through the
UI, and judges the result visually — the same loop a person runs. The existing
Playwright specs, pixel-diff baselines (`toHaveScreenshot`), and
`assertDesignSystem` fixture are **not deleted and not called UAT** any longer:
they are re-cast as a fast, deterministic **regression net** that runs on its own
schedule to catch pixel/DOM drift cheaply. UAT (this FR) and the regression net
are complementary — the regression net answers "did anything change since the
approved baseline?"; UAT answers "does a human's journey through this actually
work and look right?" Neither replaces the other.

### Why "slow and inefficient" is a requirement, not a bug

The operator's explicit instruction: *"I don't want fast and efficient run of
the UAT suite. I want them to emulate human behavior: slow and inefficient."*

This is correct and must be encoded as a first-class acceptance criterion,
because it is the exact property agents optimize away. Fidelity to human
behavior — navigating instead of deep-linking, reading the screen instead of
querying the DOM, looking at the render instead of asserting a class — is the
*point* of UAT. It surfaces a class of defect that fast deterministic tests
structurally cannot see: ISS-UAT-013-6 (a 404 rendering "visually identically"
to a 410 for the DOM assertion) is the canonical example already in this repo's
history. Speed here is not a virtue; it is the failure mode.

## Users

- **The UAT-driving agent** (successor to the current UATRunner) — operates the
  browser, makes the perceive→decide→act→judge decisions.
- **The Orchestrator** — runs the redefined `uat-verification` workflow and its
  gates.
- **BusinessAnalyst** — triages the agent's session log and visual findings into
  issues (unchanged role; new input format).
- **Human operators** — read the persisted session evidence (log + screenshots)
  after the fact to trust or contest a verdict, exactly as they would review a
  human tester's notes.

## Functional scope

### 1. Landing-page start; navigation, not deep links

A UAT session for a BP-UAT script begins at the application's **default landing
screen** (the URL a real user would type — the site root or its documented entry
point). For the BP-UAT-013 pilot that landing URL is the web app root
`http://localhost:4321` (the `environment` declared in the BP-UAT front-matter);
`http://localhost:3000` (the api) is never a landing target — it is reached, if at
all, only as a declared `external_hop`. Every subsequent screen is reached by
**acting on visible UI** (clicking navigation, links, buttons; following an
emailed link by opening it as a user would) — **not** by constructing a deep-link
URL and jumping to it.

- The **only** permitted direct navigation is the initial landing-page visit and
  **declared external hops** the UI genuinely cannot reach by clicking — e.g.
  opening the mail catcher at a different origin, or following a link that only
  exists inside a received email. Each such hop is declared in the BP-UAT
  script's front-matter (`external_hops:`) with a one-line justification.
- An undeclared mid-session jump to a deep link is a **protocol violation** and
  fails the session gate. (Mechanical enforcement is an architecture concern —
  see the companion architecture doc — but the *rule* lives here.)

### 2. Data entry through the UI

Preliminary/test data required by a step is entered **through the application's
own forms**, reached by navigation, wherever a UI path exists. Seeding via
`uat-seed` (FR-WORKFLOW-003) remains the mechanism for *fixtures that have no UI
path* (identity rows, tokens, back-office state) — but data a user would
themselves type is typed, in the UI, by the agent. A step that could be
performed by a user through a form MUST NOT be shortcut with a direct API call
or a seed insert.

### 3. Perceive → decide → act → judge, per step, in one continuous session

Each step is executed as a human would run it:

- **Perceive:** the agent looks at the *actually-rendered screen* (a screenshot
  it just captured) to orient — not the DOM tree, not the text report.
- **Decide:** the agent chooses the next human action from what is visible.
- **Act:** it performs that action through the UI (click/type/submit).
- **Judge:** it visually compares the resulting screen against the step's
  `expected_ui_state` and renders a verdict with reasoning grounded in what is
  on screen.

The whole BP-UAT runs as **one continuous session with persistent browser
state** (cookies, auth, in-progress form data carry across steps), the way a
person's single sitting does — not as N isolated `test()` cases each starting
fresh.

### 4. Visual judgment is the primary verdict, not a secondary check

For each step, the agent's **visual comparison of the rendered screen against
the expected state is the deciding verdict.** A DOM/network assertion may be
recorded as *corroborating evidence*, but a step does not pass on a DOM
assertion alone, and a visual mismatch is a failure even if every DOM assertion
passed. This inverts today's model, where DOM assertions decide and vision is an
afterthought that gets skipped.

Design-system conformance (tokens, Lucide-only icons, brand fonts, no ad-hoc
gradients) is judged as part of the visual verdict, consistent with the existing
design-system rules — but the deterministic `assertDesignSystem` computed-style
walk moves to the **regression net** (scope item 7), where it belongs, rather
than masquerading as visual analysis.

### 5. Deliberate finish: clean up or hand off

Every session ends with an explicit, logged **teardown decision** per the
human's step 5:

- **Clean up** — remove the data this session created (delete registrations,
  reset consumed tokens), OR
- **Hand off** — deliberately leave named state as input for a declared
  downstream BP-UAT.

The choice is stated per BP-UAT script and recorded in the session log with what
was removed or retained. Silent teardown (or none) is a protocol violation.
FR-WORKFLOW-003's `--reset` remains the guaranteed pre-session restore-to-known-
state; this scope item is about the session's own post-condition being
*intentional and recorded*, not about replacing reset.

### 6. Persistent, first-class evidence

Every session persists, and never silently overwrites:

- A **session log** — an ordered, human-readable transcript of every
  perceive/decide/act/judge cycle, with timestamps, the action taken, and the
  visual verdict + reasoning per step. This is the artifact a human reads to
  trust the run.
- The **screenshot corpus** — one capture per meaningful action, retained under
  a **run-scoped path** so a new run cannot clobber a prior run's evidence.
- The **teardown record** (scope item 5).

Evidence retention is an acceptance criterion, not a convention — "agents don't
keep their UAT results" is one of the three stated failures this FR closes.

### 7. Playwright re-cast as the regression net (not deleted, not "UAT")

The existing `apps/e2e` UAT specs, `toHaveScreenshot` pixel-diff baselines, and
`assertDesignSystem` fixture are retained and **relabeled** as a deterministic
regression layer:

- It runs on its own schedule/trigger (e.g. per-PR, or nightly), separate from
  agent-driven UAT.
- Its job is drift detection ("did anything change vs. the approved baseline?"),
  which it does cheaply and deterministically — a job the agent-driven session
  is *bad* at and should not do.
- It is **no longer referred to as UAT** in workflow docs, agent definitions, or
  registries. The word "UAT" means the agent-driven session defined here.
- No test coverage is lost in the relabel: what those specs assert today keeps
  being asserted; it is just correctly named and correctly scheduled.

### 8. Workflow, agent, and registry integration

- `.copilot/workflows/uat-verification.md` Step 3 is rewritten around the
  agent-driven session model; Step 3.5's separate VisualReviewer collapses into
  the in-session judgment of scope item 4 (a session cannot pass without having
  looked — the look is *during* execution, not after).
- `.copilot/agents/uat-runner.md` is rewritten from "author a Playwright spec" to
  "drive a live browser session." VisualReviewer's proof-of-look protocol is
  preserved as the *format* of the in-session visual verdict, not a downstream
  pass.
- `docs/02-business-processes/uat/*.md` scripts gain the fields this model needs
  (`external_hops`, per-step `expected_ui_state` used as the judgment target,
  teardown policy). Migration is incremental (one BP-UAT at a time), piloted on
  **BP-UAT-013** (it has the richest existing evidence corpus).
- Registries (`docs/02-business-processes/uat/registry.md`,
  `docs/03-requirements/requirements-registry.md`) updated to reflect the new
  definition and this FR.

## Acceptance criteria

- [ ] **AC-1 (landing start):** A UAT session for any migrated BP-UAT begins at
      the application's default landing screen. The session log shows the first
      navigation is to the documented entry URL, not a deep link.
- [ ] **AC-2 (navigation, not deep-links):** Across a migrated session, every
      screen after the landing page is reached by acting on visible UI, except
      declared `external_hops`. An undeclared mid-session deep-link jump fails
      the session gate with the offending step named.
- [ ] **AC-3 (UI data entry):** Test data that a user would type is entered
      through the application's forms during the session; the log shows the form,
      the fields, and the submit action. No step that has a UI path is completed
      via a raw API call or seed insert.
- [ ] **AC-4 (visual verdict primary):** Each step records a visual
      comparison of the rendered screen vs. `expected_ui_state` as its deciding
      verdict, with reasoning grounded in on-screen content. A step with a passing
      DOM assertion but a visual mismatch is recorded as a **failure**. (Regression
      test for the ISS-UAT-013-6 404-vs-410 class.)
- [ ] **AC-5 (continuous session):** The whole BP-UAT runs in one browser session
      with persistent state — auth/cookies/in-progress data established in an
      early step are still present in a later step without re-establishing them.
- [ ] **AC-6 (deliberate teardown):** Every session ends with a logged teardown
      decision (clean-up or declared hand-off) naming exactly what was removed or
      retained. A session with no teardown record fails the gate.
- [ ] **AC-7 (persistent evidence):** After a run, the session log, the
      run-scoped screenshot corpus, and the teardown record all exist and are
      committed with the workflow. Re-running the same BP-UAT does not overwrite
      the prior run's evidence (distinct run-scoped paths).
- [ ] **AC-8 (regression net relabel, no coverage loss):** The Playwright
      specs/baselines/`assertDesignSystem` still run and still assert what they
      asserted before, now labeled and scheduled as the regression net; no
      workflow/agent/registry doc refers to them as "UAT."
- [ ] **AC-9 (pilot end-to-end):** BP-UAT-013 runs end-to-end under the
      agent-driven model against the live local stack, producing a session log +
      run-scoped screenshots + teardown record, with at least one step's verdict
      decided by visual judgment that a DOM assertion would have gotten wrong (or
      an explicit note that none occurred this run).
- [ ] **AC-10 (anti-shortcut enforcement):** The mechanical gate defined in the
      architecture doc rejects a session that (a) contains an undeclared
      mid-session deep-link, (b) produces a per-step verdict without a
      corresponding just-captured screenshot, or (c) is missing the teardown
      record. All three are `failed-retry`, not silent passes.

## Non-functional / guardrails

- **Never targets production.** Inherited from the existing UAT scope constraint;
  the session's `environment` MUST resolve to localhost. Human-emulation makes
  this *more* important — the agent writes real state through real forms.
- **Determinism is delegated, not demanded.** The agent-driven session is
  expected to be slower and less bit-reproducible than Playwright; that is
  accepted. Deterministic drift detection is the regression net's job (scope 7),
  not this session's. The architecture doc owns the flake/cost mitigations.
- **Cost is bounded per session,** not per assertion. v1 guard-rail ceilings
  (runaway-guards, not tuned): `max_steps` 40, `max_screenshots` 60, wall-clock
  20 min — replaced by measured values after the BP-UAT-013 pilot (AC-9).
  Exceeding any ceiling ends the session `failed-escalate` with evidence
  retained. Details in the architecture doc §12.4.
- **Verdict flake is retried once, then flagged.** A step whose visual verdict is
  a mismatch is re-run once in the same session; a flip to match is recorded as a
  `flaky-verdict` finding and the session proceeds, a second mismatch is a
  confirmed failure. Architecture doc §12.3 / §9.1.

## Resolved design decisions (2026-07-06)

Recorded so implementation does not reopen them; full rationale in the
architecture doc §12.

| # | Fork | Decision |
|---|---|---|
| 1 | Actuator surface | Playwright-as-actuator (agent decides in human terms; driver resolves to user-facing locators) — not pixel-coordinate computer-use |
| 2 | Loop host | A dedicated UAT-session sub-agent spawned by the Orchestrator; its large screenshot context stays quarantined from the workflow's later steps |
| 3 | Verdict flake | Retry the mismatching step once, then flag a `flaky-verdict` finding — not first-look-final, not best-of-3 |
| 4 | Session budget | Generous v1 guard-rails (40 / 60 / 20 min), calibrated from the BP-UAT-013 pilot |

## Out of scope (v1)

- **Migrating all BP-UAT scripts at once.** v1 migrates the model + tooling +
  pilots BP-UAT-013. The rest migrate incrementally in follow-up workflows
  (same discipline FR-WORKFLOW-003 used for manifests).
- **Removing the Playwright regression net.** It is relabeled and kept, not
  deleted. A future decision may prune redundant specs; not here.
- **Parallel UAT sessions against one stack.** Same constraint as
  FR-WORKFLOW-003 out-of-scope — one session at a time until fixture tenancy is
  namespaced.
- **Choosing the concrete browser-driving harness / computer-use surface.** That
  is the architecture doc's decision (`uat-agent-architecture.md`); this FR
  states the behavior, not the mechanism.
- **A general-purpose "agent operates any website" capability.** Scoped to this
  repo's own app and its documented BP-UAT scripts.
