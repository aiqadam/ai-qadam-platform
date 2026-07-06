# Agent-Driven UAT — Architecture

**Status:** Accepted (2026-07-06)
**Implements:** [FR-WORKFLOW-004](../../03-requirements/FR-WORKFLOW-004.md)
**Supersedes execution model of:** `.copilot/agents/uat-runner.md`,
`.copilot/workflows/uat-verification.md` (Step 3 / Step 3.5)
**Related:** `docs/04-development/testing/visual-testing.md` (the layers this
doc re-homes), FR-WORKFLOW-003 (fixture reset — precondition)

---

## 1. What we are building, in one paragraph

A UAT run is an **AI agent operating a real browser, one human action at a
time.** The agent starts at the app's landing page, looks at the actually-
rendered screen, decides the next thing a person would do, does it through the
UI, and judges the result by looking at the new screen. It runs the whole
business process as one continuous session with persistent browser state, then
tears down deliberately. The browser is the agent's *hands and eyes*; Playwright
is demoted from "the test" to "the remote control the hands hold" — a low-level
actuator, not the author of assertions.

The rest of this document is how that loop is wired, why it is wired that way,
and the honest failure modes.

---

## 2. Why the current architecture cannot produce human-like UAT

The failure is structural, not a matter of agents being lazy. Three properties
of today's design make the human-shaped path strictly more expensive than the
shortcut, so the shortcut always wins:

| Today | Consequence |
|---|---|
| UATRunner authors `one test() per step` | Playwright's test isolation gives each step a fresh context → no continuous session → deep-links become the *only* way to reach step N's screen |
| DOM/pixel assertions decide pass/fail; vision runs later in a separate agent | The look is severable from the run, so it gets severed and skipped (documented in `visual-testing.md` §"Why agents ignored the previous instructions") |
| Evidence is a byproduct of the test report | Screenshots nobody opened; results overwritten run-to-run |

You cannot fix this by adding rules to `uat-runner.md`. The 16 `ISS-UAT-013-*`
issues and the four-layer scaffold in `visual-testing.md` are what "add more
rules" looks like, and the run still comes out as `5/12 Playwright tests
PASSED`. The execution *model* has to change: the session must be continuous,
vision must be the verdict (in-line, not downstream), and evidence must be the
primary output rather than a side effect.

---

## 3. The core loop: Perceive → Decide → Act → Judge

One UAT step = one turn of this loop, run by the agent in the main workflow
(not a spec compiled ahead of time):

```
                 ┌───────────────────────────────────────────────┐
                 │  BP-UAT script step N: expected_ui_state, goal │
                 └───────────────────────────────────────────────┘
                                      │
     ┌────────────────────────────────┼────────────────────────────────┐
     ▼                                ▼                                 ▼
 PERCEIVE ─────────────────────► DECIDE ──────────────────────────► ACT
 capture screenshot of the      choose the next *human* action     drive it through
 current rendered screen;        from what is visible on screen      the UI: click a
 Read the PNG into context       (find the control a person would    visible control,
 (native image rendering)        use). NOT: query the DOM for a      type into a field,
                                  test-id and jump to it.            submit a form
     ▲                                                                 │
     │                                                                 ▼
     └────────────────────────── JUDGE ◄──────────────────────── (screen re-renders)
        capture the resulting screen; Read it; compare against
        expected_ui_state. Verdict = MATCH / MISMATCH / PARTIAL
        with reasoning grounded in on-screen content. This verdict
        DECIDES the step. A DOM/network signal is corroborating only.
```

### 3.1 Perceive — the agent looks, it does not query

The agent orients from a **screenshot it just captured**, Read into context. In
this runtime that is a real, verified capability (Claude Code's `Read` tool
renders PNGs natively — the same fact `visual-testing.md` had to keep asserting
because agents kept denying it). Perception is deliberately *not* "dump the DOM
and find the selector," because that is the shortcut that erases human behavior:
a person cannot see `data-testid`, only the rendered button.

### 3.2 Decide — next action from what a human can see

Given the perceived screen and the step's goal, the agent picks the action a
person would take next: "there's a **Sign in** link top-right, click it," "the
form has an **Email** field, type into it." The decision is expressed in
human-visible terms (visible label, role, position), which the actuator then
resolves to a robust locator (`getByRole`, `getByLabel`) — see §4.

### 3.3 Act — through the UI, via the actuator

The chosen action is performed through Playwright as a **dumb actuator**: click
the element the human would click, type what the human would type. Playwright
here holds no assertions and authors no verdict; it is a hand. Crucially, the
actuator carries **one persistent browser context across the entire session**
(§5), so auth/cookies/in-progress form state established in step 3 are still
there in step 9 — the continuity a real sitting has.

### 3.4 Judge — vision is the verdict (FR-WORKFLOW-004 AC-4)

After the action re-renders the screen, the agent captures and Reads the new
screenshot and compares it against the step's `expected_ui_state`. **This visual
comparison is the deciding verdict.** A DOM or network signal may be logged as
corroboration, but:

- A step does **not** pass on a DOM assertion alone.
- A **visual mismatch is a failure even if every DOM assertion passed** — the
  ISS-UAT-013-6 case (404 rendered visually identical to 410) is exactly the
  defect class this inversion catches.

The verdict format reuses VisualReviewer's **proof-of-look fields**
(`visible_elements` with locations, `rendered_text` as-rendered,
`dominant_colors`, `anomalies`) — but produced *in-session, during the step*,
not by a downstream agent reading someone else's PNGs. The proof-of-look fields
survive because they are still the cheapest way to make "I looked" verifiable;
what changes is *when* and *by whom* they are produced.

---

## 4. The actuator: Playwright as hands, not as the test

### 4.1 Locator policy — resolve human intent to robust selectors

The agent decides in human terms ("the Sign in link"); the actuator resolves to
Playwright's user-facing locators, in this priority order, which is also the
order of decreasing human-fidelity:

1. `getByRole(name)` / `getByLabel` / `getByText` — what a user perceives.
2. `getByPlaceholder` / `getByTitle` — visible affordances.
3. `data-testid` — **discouraged**; permitted only for an element with no
   accessible name, and its use is flagged in the log (a `data-testid` reliance
   is a hint the app has an accessibility gap a real user would also hit).

Deep CSS/XPath selectors are disallowed for driving actions — they are the DOM-
query shortcut in disguise.

### 4.2 The one-goto rule (FR-WORKFLOW-004 AC-1/AC-2), mechanically enforced

The actuator permits `page.goto()` exactly once — the **initial landing-page
visit**. Any later navigation must originate from a UI action (`click`) or a
**declared external hop**. Enforcement is not left to prose (prose is what got
ignored):

- **`external_hops`** are declared in the BP-UAT script front-matter with a
  justification. Legitimate hops: opening the mail catcher on a different origin
  (`http://localhost:8025`), or following a link that only exists inside a
  received email (the agent reads the link out of the mail-catcher UI and
  navigates it, exactly as a person clicking a link in their inbox does).
- **`scripts/uat-navigation-check.sh <session-log> <bp-uat-script>`** (to be
  created in this cluster — see §11) parses the session log's action trace and
  fails (`failed-retry`) if a navigation event's URL was reached by neither (a) a
  click on the preceding screen nor (b) a declared hop. It names the offending
  step. The Orchestrator runs it after the session and again at the pre-push gate
  — the same triple-run enforcement pattern the existing `uat-visual-check.sh`
  already uses.

This is the mechanical answer to "agents quietly revert to deep-links."

---

## 5. Session model: one continuous context (FR-WORKFLOW-004 AC-5)

A BP-UAT is **one browser context for the whole script**, created once at the
landing page and reused across every step, then closed at teardown. This is the
single most important departure from the current `one test() per step` model,
and it is what makes human-shaped navigation possible at all:

- Auth established by signing in (step 3) persists to a protected page (step 9)
  with no re-login — because it is the same context, the same cookie jar.
- In-progress form data survives a back-and-forth the way a person's does.
- There is exactly one thing to reason about ("where am I in the app right
  now"), which is how a person experiences it — not N independent fresh tabs.

Implementation note: this is a Playwright `browserContext` held open for the
session's duration, driven imperatively by the agent's loop, **not** a
`test.describe` block of isolated `test()`s. The `apps/e2e` harness gains a thin
"UAT session driver" entry point (a long-lived context + screenshot helper +
action-logger) that the agent calls step by step; it does **not** gain more
spec files.

---

## 6. Evidence: the primary output, not a byproduct (FR-WORKFLOW-004 AC-7)

Everything is written under a **run-scoped directory** so no run ever clobbers
another:

```
apps/e2e/uat-results/<BP-UAT-NNN>/<run-id>/
  session-log.md                 # ordered perceive/decide/act/judge transcript
  step-001-<label>.png           # one capture per meaningful action
  step-002-<label>.png
  ...
  teardown.md                    # what was cleaned up or handed off
```

`<run-id>` = workflow id (or an ISO timestamp for ad-hoc runs). The current flat
`apps/e2e/uat-results/<BP-UAT-NNN>/*.png` layout is the reason prior evidence got
overwritten; run-scoping fixes AC-7 directly.

- **`session-log.md`** is the human-trust artifact: for each step, the perceived
  screen, the decision, the action, and the visual verdict with proof-of-look
  fields and reasoning. A human reads *this* to trust or contest the verdict,
  the way they would read a human tester's notes.
- **Screenshots** are captured by the actuator's helper as **viewport** shots
  (never `fullPage` — the existing size-limit lesson from `visual-testing.md`
  §Layer 2 still holds; oversized PNGs produce genuine read failures that
  historically "confirmed" the can't-read-images excuse).
- **`teardown.md`** records the §7 decision.

Evidence is committed with the workflow (existing Step 5 already stages the
screenshot dir; it now stages the run-scoped tree + logs).

---

## 7. Deliberate teardown (FR-WORKFLOW-004 AC-6)

Two relationships to keep straight:

- **FR-WORKFLOW-003 `--reset`** guarantees the *pre-session* state: restore
  fixtures to declared initial values before the session starts. This is the
  floor the session stands on. Unchanged.
- **This section** is about the session's *own post-condition being
  intentional and logged.* At the end, the agent executes the BP-UAT script's
  declared teardown policy:
  - **clean-up** — undo what this session created (delete the registration it
    made, reset the token it consumed), through the UI where a UI path exists,
    otherwise via the same seed/admin path used for setup; **or**
  - **hand-off** — deliberately leave named state for a declared downstream
    BP-UAT, recording exactly what and why.

`teardown.md` names what was removed or retained. A session with no teardown
record fails the gate. (Silent/no teardown was never noticed before because
nothing looked for it.)

---

## 8. Coexistence with the regression net (FR-WORKFLOW-004 scope 7 / AC-8)

The existing Playwright assets are **kept, relabeled, and rescheduled** — not
deleted. This is the "demote Playwright to a regression net" decision.

| Layer (from `visual-testing.md`) | New home | Runs when |
|---|---|---|
| 1a — `toHaveScreenshot` pixel-diff baselines | **Regression net** | per-PR / nightly, deterministic |
| 1b — `assertDesignSystem` computed-style walk | **Regression net** | per-PR / nightly, deterministic |
| 2 — VisualReviewer (LLM vision) | **Dissolved into the in-session Judge** (§3.4) — vision is now *during* the run, not after | every UAT session |
| 3 — `uat-visual-check.sh` mechanical gate | **Kept**, plus the new `uat-navigation-check.sh` | every UAT session |

Division of labor, stated plainly:

- **Regression net answers:** "did anything change vs. the approved baseline?"
  It is cheap, deterministic, and *bad at judgment* — perfect for drift.
- **Agent-driven UAT answers:** "does a human's journey through this actually
  work and look right?" It is slow, non-deterministic, and *good at judgment* —
  perfect for acceptance.

They are complementary; neither's coverage is dropped. `visual-testing.md` is
updated to point Layer 1a/1b at the regression net and to note that Layer 2 is
now in-session. No spec's assertions are removed in the relabel (AC-8).

---

## 9. The hard problems (honest section)

An architecture doc that pretends agent-driven live UAT is free would be lying.
These are the real costs and the mitigations.

### 9.1 Non-determinism and flake

A live agent looking at pixels and deciding actions is inherently less
reproducible than `expect(x).toBe(y)`. **Mitigation: we do not ask it to be
deterministic.** Deterministic drift detection is the regression net's job
(§8). The UAT session's job is judgment, where some run-to-run variation in
*wording of reasoning* is acceptable as long as the *verdict* is stable and
evidence-backed.

**Verdict-flip policy (decision §12.3):** a step whose verdict is `MISMATCH` is
re-run *once* in the same session context. A flip to `MATCH` is recorded as a
`flaky-verdict` finding and the session continues (BusinessAnalyst decides if the
non-determinism is itself a bug); a second `MISMATCH` is a confirmed failure. One
retry — not first-look-final (too noise-sensitive) and not best-of-3 (which votes
away real intermittent defects and triples cost on contested steps).

### 9.2 Cost / runaway sessions

Vision-per-step and agent turns cost tokens and wall-clock. **Mitigation: a
bounded session budget** declared per BP-UAT and enforced by the driver:
`max_steps`, `max_screenshots`, and a wall-clock ceiling. Exceeding the budget
ends the session as `failed-escalate` with the evidence captured so far — a
human-paced session cannot run away silently. v1 guard-rail values (40 / 60 /
20 min) and their calibration-from-pilot plan are in decision §12.4.

### 9.3 Selector fragility vs. human fidelity

Robust user-facing locators (§4.1) can still miss when the app lacks accessible
names. **Mitigation:** falling back to `data-testid` is *allowed but logged as a
finding* — because if the agent needed a test-id, a real user with a screen
reader hit the same wall. Fragility surfaces an accessibility defect instead of
being hidden by it.

### 9.4 "Did it really look?" — fabrication risk

The oldest failure in this repo's UAT history is agents fabricating that they
looked. **Mitigation (kept from `visual-testing.md`):** the proof-of-look fields
are things only obtainable from the pixels, and `uat-visual-check.sh` mechanically
counts screenshots vs. verdicts and checks required fields. Now that vision is
*in-session*, there is a stronger invariant available: **a per-step verdict must
be accompanied by a screenshot captured in that same step** (matching timestamp/
run-id), which `uat-visual-check.sh` verifies (AC-10b). You cannot judge a screen
you did not capture.

### 9.5 Speed — feature, not defect

The session is slow. That is FR-WORKFLOW-004's stated intent ("slow and
inefficient" = "faithful to human behavior"). We do not optimize the session for
speed; we bound its cost (§9.2) and put all the speed pressure on the regression
net, which is where determinism and throughput belong.

### 9.6 AC-9 is human-verified by design — and that is the one un-gated duty

AC-9 asks the pilot to demonstrate **at least one step whose verdict was decided
by visual judgment that a DOM assertion would have gotten wrong** (the
ISS-UAT-013-6 404-vs-410 class). Unlike the §10 gates, this cannot be checked by
a script: the three enforcement scripts verify the *form* of the evidence
(screenshot-per-verdict, proof-of-look fields present, teardown recorded), not
that a visual-vs-DOM *divergence* actually occurred and was caught. The proof
lives in `session-log.md`, which decision §12.2 deliberately keeps *out* of the
Orchestrator's context (the sub-agent returns only the log path + verdict + gate
result).

This is a real tension with this repo's own thesis — *ungated duties get dropped
under pressure.* We accept it here, consciously, because a script that could
detect "a genuine judgment defect a DOM check would miss" would have to *be* the
judge, which is the whole thing we are saying a script cannot do. The mitigation
is honesty of placement, not a gate: AC-9 is satisfied by a **named line in the
BusinessAnalyst triage** pointing at the specific step + `session-log.md` entry
where the divergence occurred, **or an explicit written note that none occurred
this run** (the AC's own escape hatch). A pilot run that silently produces
neither is incomplete — BusinessAnalyst's Step 4 triage MUST assert one or the
other, which is the closest thing to a gate available for a judgment claim.

---

## 10. Enforcement scripts (the anti-shortcut layer)

Consistent with this repo's hard-won lesson — *gates define behavior, prose
decorates it* — every new duty is coupled to a script the Orchestrator runs
after the session and again at the pre-push gate:

| Script | Fails the gate when | AC | Status |
|---|---|---|---|
| `uat-navigation-check.sh` | an undeclared mid-session deep-link navigation appears in the action trace | AC-2 / AC-10a | **new** — created in this cluster |
| `uat-visual-check.sh` (extended) | a per-step verdict has no same-step screenshot, or proof-of-look fields are missing | AC-4 / AC-10b | **exists, modified** — see below |
| `uat-teardown-check.sh` | `teardown.md` is absent or names no removed/retained state | AC-6 / AC-10c | **new** — created in this cluster |

Only `uat-visual-check.sh` exists today. Extending it is a **behavior change to
an existing script**, not just a new gate: its current form globs
`apps/e2e/uat-results/<BP>/*.png` at `-maxdepth 1` and greps a standalone
`02b-visual-review.md`. The run-scoped tree (`<BP>/<run-id>/…`, §6) and the
in-session verdict (§3.4, no separate `02b` file) both break those assumptions,
so the migration (§11 step 1) must update the path glob and the entry-source
alongside adding the same-step-screenshot invariant (AC-10b).

All three are `failed-retry` (recoverable within the workflow), never silent
passes. They are the mechanical reason an agent cannot quietly collapse back to
`page.goto`-everything, DOM-only verdicts, and no teardown.

---

## 11. Migration path

1. **This cluster (FR-WORKFLOW-004):** the session-driver entry point in
   `apps/e2e`; the two **new** enforcement scripts (`uat-navigation-check.sh`,
   `uat-teardown-check.sh`) plus the **modification** of the existing
   `uat-visual-check.sh` (new run-scoped path glob + in-session entry source +
   the same-step-screenshot invariant, per §10); the rewritten `uat-runner.md` +
   `uat-verification.md` Step 3/3.5 (Step 3.5 folds into the in-session Judge, so
   `02b-visual-review.md` as a separate artifact goes away); the
   `visual-testing.md` relabel; and the BP-UAT-013 pilot (AC-9), which also
   requires adding `external_hops`, per-step `expected_ui_state`, and a teardown
   policy to the pilot script itself before it can run under the new model. No
   product code changes — this is test/workflow infrastructure, same as
   FR-WORKFLOW-003's rollout.
2. **Per-BP-UAT migration (follow-up workflows):** add `external_hops`,
   `expected_ui_state`-as-judgment-target, and teardown policy to each remaining
   BP-UAT script, one workflow at a time (the FR-WORKFLOW-003 discipline for
   manifests).
3. **Regression-net formalization:** give the relabeled Playwright suite its own
   trigger (per-PR + nightly) and its own registry entry, fully separated from
   the word "UAT."
4. **Scheduled nightly UAT:** once BP-UAT-013 + a second BP-UAT are green under
   the model, enable scheduled autonomous UAT sessions (the goal
   `visual-testing.md` Rollout step 4 and FR-WORKFLOW-003 were building toward).

---

## 12. Resolved decisions

The four forks below were reviewed and settled (2026-07-06). Recorded here so
implementation does not reopen them.

1. **Actuator surface → Playwright-as-actuator.** The agent decides in human
   terms ("click the Sign in link"); a thin driver resolves that to Playwright's
   user-facing locators (§4.1) and performs it. Chosen over a pixel-coordinate
   computer-use surface because Playwright is already in the repo, gives robust
   accessible-name locators, and reuses the existing screenshot/logging helpers;
   pixel-clicking is more human-faithful but far more fragile and costly. The
   human-fidelity that matters most — *perception and judgment* — is preserved by
   §3.1/§3.4 (the agent orients and judges from the rendered screenshot, not the
   DOM), so Playwright driving the *action* costs little fidelity.

2. **Loop host → dedicated UAT sub-agent.** The Orchestrator spawns a separate
   UAT-session sub-agent that runs the whole perceive→decide→act→judge session and
   returns only the `session-log.md` path, the verdict, and the gate result. This
   quarantines the large, disposable session context (dozens of screenshots +
   per-step reasoning) inside the sub-agent so it never contaminates the
   Orchestrator's context for the later workflow steps (triage, commit, PR). Cost:
   one handoff + a cold start, accepted. See §5 for the session-driver entry point
   the sub-agent calls.

3. **Verdict-flip policy → retry-once-then-flag.** On a step whose visual verdict
   is `MISMATCH`, the session re-runs *that step once* in the same context. If it
   flips to `MATCH`, the session records a `flaky-verdict` finding (the UI or the
   judgment was non-deterministic) and continues; BusinessAnalyst decides whether
   the flip itself is a bug. If it stays `MISMATCH`, it is a confirmed failure.
   This surfaces genuine flake as its own signal without letting one noisy verdict
   sink a good build, and without voting away a real intermittent defect (which a
   best-of-3 majority would). See §9.1.

4. **Session budget → generous v1 guard-rails, calibrated from the pilot.** The
   ceilings below exist only to stop a runaway session; they are **not** tuned
   numbers and are replaced by measured values after the BP-UAT-013 pilot (AC-9):

   | Guard | v1 value | Basis |
   |---|---|---|
   | `max_steps` | 40 | ~2–3× the largest current BP-UAT step count |
   | `max_screenshots` | 60 | perceive + judge captures across max_steps, with headroom |
   | `wall_clock` | 20 min | a human-paced session ceiling; well above expected |

   Exceeding any ceiling ends the session `failed-escalate` with all evidence
   captured so far retained. These live in the BP-UAT front-matter as overridable
   defaults; the pilot's actual measured step/screenshot/time counts become the
   tuned numbers in a follow-up.
