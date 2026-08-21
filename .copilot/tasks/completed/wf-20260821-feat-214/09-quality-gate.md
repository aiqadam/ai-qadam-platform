# 09 — Quality Gate

**Workflow:** `wf-20260821-feat-214`
**Agent:** QualityGate
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009` — Environment-configurable public Directus origin

---

## Workflow Instance

| Field | Value |
|---|---|
| `workflow_instance_id` | `wf-20260821-feat-214` |
| `workflow_type` | `requirement-development` |
| `requirement_ref` | `FR-CMS-009` |
| `branch` | `feature/cms-009-configurable-public-cms-url` |
| `base_branch` | `main` |
| `expects_registry_update` | `true` |
| `issues_created` | `[]` |
| `merge_mode` | `auto` |
| `uat_target` | `local` |
| `github_pr_url` | `""` — **empty, EXPECTED** (this gate runs pre-commit/push/PR) |

**Timing acknowledgement.** Per the workflow brief this gate runs **before**
commit, push, and PR creation. Three states that Check 7 would normally treat as
failures are therefore expected and are **not** counted against the gate:
`github_pr_url` empty, the working tree uncommitted, and
`.copilot/context/workspace-state.md` untouched (owned by Step 11.5). Each is
handled explicitly in its section below rather than silently waived.

---

## Step Completion Check

| Step | Agent | Status | Gate Result |
|---|---|---|---|
| 01 — requirement-validation | RequirementAnalyst | Complete | `passed` |
| 02 — impact-analysis | ImpactAnalyzer | Complete | `passed` |
| 03 — code-summary | CodeDeveloper | Complete | `passed` |
| 04 — security-review | SecurityReviewer | Complete | `passed` |
| 05 — migration-plan | DBMigrationAuthor | **Correctly skipped** | N/A — see below |
| 06 — test-strategy | TestStrategist | Complete | `passed` |
| 06 — test-design | TestDesigner | Complete | `passed` (outcome: no new tests) |
| 07 — test-results | TestRunner | Complete | `passed` |
| 08 — doc-update | DocWriter | Complete | `passed` |
| 09 — quality-gate | QualityGate | This document | see Gate Result |

**No `failed-*` gate result appears anywhere in the chain.** All eight prior
steps returned `passed` on the first attempt; no retry was consumed.

**DBMigrationAuthor skip is justified, and I verified the justification rather
than accepting it.** `02-impact-analysis.md` §*DB Changes Required* asserts no
entity change. Confirmed against the working tree: the change set contains no
file under `apps/api/drizzle/`, no Drizzle schema edit, and no
`infrastructure/directus/bootstrap.sh` change. `content_documents.source_file`
already exists from FR-CMS-008; this requirement changes only the **origin
string prefixed onto an already-stored uuid**. There is nothing to migrate.

**`06-test-design.md` returning "no new tests" is a legitimate outcome, not a
missing step.** TestStrategist audited CodeDeveloper's 20 pre-written tests
AC-by-AC and instructed TestDesigner to *independently confirm* four dismissals
rather than accept them. TestDesigner did so and upheld all four, strengthening
two (they are not merely unworthwhile — they are **not writable** without
widening the production API or introducing shared mutable global state, which
`standards.md` §IV forbids). That is verification work, not a skipped step.

---

## Traceability Check

| Check | Result |
|---|---|
| Requirement identifier in code summary | ✅ `FR-CMS-009` appears 4× in `03-code-summary.md` |
| Requirement identifier in shipped code | ✅ `FR-CMS-009` appears 5× in `apps/web-next/src/lib/cms.ts` (constant doc-comment, resolver doc-comment, both call sites, and the `publicAssetUrl()` invariant note) |
| ACs defined | ✅ AC-1 … AC-10 in `01-requirement-validation.md` |
| ACs mapped to verification instruments | ✅ Complete mapping table in `06-test-strategy.md`; re-assessed independently in §7.5 below |
| AC count consistent across artifacts | ✅ 10 in `01`, 10 in `06-test-strategy`, 10 in `07`, 10 checked in `docs/03-requirements/FR-CMS-009.md` |
| Dependency chain recorded | ✅ `FR-CMS-008` in the FR doc, the registry row's *Depends on*, and `01`'s formalized requirement |

---

## Test Coverage Check

**All figures below were re-run by me, not read from `07-test-results.md`.**

| Item | Claimed | My independent run | Result |
|---|---|---|---|
| `pnpm --filter @aiqadam/web-next test` | 44 files, 1115 tests | **44 passed (44), 1115 passed (1115)**, duration 3.11s | ✅ Match |
| `pnpm typecheck` | 4/4 successful | **4 successful, 4 total** | ✅ Match |
| `pnpm arch:check` | 289 files, mode=full | **✓ passed (289 file(s) scanned, mode=full)** | ✅ Match |
| `pnpm biome check` on changed TS files | clean | **Checked 2 files in 9ms. No fixes applied.** | ✅ Match |

| Gate criterion | Status |
|---|---|
| All tests pass | ✅ 1115/1115, zero failures, zero skips |
| Integration tests required? | **No** — rubric score 0, threshold ≥ 4 |
| Integration N/A justified? | ✅ Verified, not skipped — zero `apps/api/**` files in the change set (confirmed against `git status --porcelain`); no DB, queue, or container-backed dependency exists in the call path. Testcontainers has nothing to containerize. This is the documented alternative to a skip, not a disguised infrastructure failure. |
| `@flaky` tags | ✅ **None.** Grepped the changed test file — zero hits. |
| `it.skip` / `test.skip` / `describe.skip` / `.only` | ✅ **None.** Grepped the changed test file — zero hits. The repo-wide grep's five hits are all the *comment* line `// Per standards.md §IV: AAA pattern, Vitest, no it.skip.` — not actual skips. Verified by reading the matched lines rather than counting them. |
| Coverage — line | ✅ **100%** on `resolvePublicDirectusUrl` (target 80%) |
| Coverage — branch | ✅ **100%**, 3 of 3 branches (target 70%) |
| Error-path coverage | ✅ Vacuously and correctly satisfied — the resolver is **total**; it cannot throw, every input either yields a configured value or falls back. Totality is a stronger property than tested error handling. |

**Flakiness assessment accepted after checking the reasoning, not the claim.**
The 20 new tests are structurally incapable of flaking: each is a synchronous
call to a pure function with a locally-constructed literal argument — no timers,
no I/O, no network, no shared mutable state, no `process.env` mutation, no
ordering dependency. My own run reproduced 1115/1115 in 1.04s of test time,
consistent with that shape.

---

## Security Check

| Criterion | Status |
|---|---|
| Security review performed | ✅ `04-security-review.md`, gate `passed` |
| BLOCKER findings | ✅ **None** |
| MAJOR findings | ✅ **None** |
| Applicable invariants | ✅ INV-2 (secrets), INV-4 (validation), INV-8 (no `dangerouslySetInnerHTML`) all PASS. INV-1/3/5/6/7/9/10/11 N/A with stated reasons — no DB query, no tenant table, no controller, no SQL, no new endpoint, no state-changing op, no loop/IO, no token handling. |
| Prior-hardening regression | ✅ FR-CMS-008's MAJOR-2 invariant verified preserved on all three sub-invariants **against shipped code, not the code summary** |
| Escalated question adjudicated | ✅ The `http://` acceptance question was escalated by CodeDeveloper and **ruled on**, not deferred |

**On the `http://` adjudication not being recorded as a MAJOR — I examined this
rather than accepting it, because "reviewer downgrades their own finding" is a
shape that deserves scrutiny.** The reasoning holds. A MAJOR is *retriable work
for CodeDeveloper*; SecurityReviewer's ruling is that the **shipped
implementation is already the correct one**, so recording a MAJOR would direct a
retry toward a change the review affirmatively does not want made. The verdict
is supported by four independently-stated reasons, the residual risk is
explicitly accepted at LOW with four named compensating controls, and — the
detail that makes this a real adjudication rather than a wave-through — **the
condition under which the verdict flips is stated concretely**: a subresource
caller (`<img src>`, `<link href>`, `fetch()`) for `publicAssetUrl()`, or the
Directus asset folder ceasing to be public-read. That boundary is now recorded
durably in `docs/03-requirements/FR-CMS-009.md` §*Security note*, so a future
change that crosses it has a written trigger to revisit. This is a properly
closed finding, not a suppressed one.

---

## Branch and Commit Readiness

| Check | Expected at this stage | Actual | Verdict |
|---|---|---|---|
| `handoff.yaml.branch` matches `HEAD` | match | both `feature/cms-009-configurable-public-cms-url` | ✅ Pass |
| `git status --porcelain` empty | **Not yet — gate runs pre-commit** | 9 modified + 10 untracked | ✅ **Expected**, see below |
| `git status -sb` up-to-date with origin | **Not yet — branch not pushed** | no upstream tracking line | ✅ **Expected**, see below |
| `pnpm biome check .` clean | mandatory | exit 1, 84 errors, 2 warnings | ⚠️ **Investigated and cleared — see the dedicated section** |
| `handoff.yaml.github_pr_url` non-empty | **Not yet — PR not created** | `""` | ✅ **Expected**, see below |

**The three "expected" rows are timing artifacts of running this gate before
Step 11, exactly as the workflow brief specifies.** They are not waived on
assertion — each is confirmed to be *only* a timing state and not a real defect:

- **Uncommitted tree:** the change set is exactly the 6 implementation files
  from `03-code-summary.md` plus the 3 documentation files this gate's Step 9
  produced plus the 10 workflow artifacts, with **nothing unaccounted for**
  (full listing below). There is no stray edit, no leftover debug file, no
  `dist/` noise (`apps/web-next/dist` is gitignored per `.gitignore:15`).
- **No upstream:** the branch has not been pushed, which is `workflow-finish.sh`'s
  job at Step 11, not this gate's.
- **Empty `github_pr_url`:** the PR does not exist yet for the same reason. The
  protocol's rule is that `workflow_status: completed` requires a non-empty URL;
  `workflow_status` is currently `running`, so the rule is not yet in force.

### Complete change set — every file accounted for

| File | Origin | Accounted for by |
|---|---|---|
| `apps/web-next/src/lib/cms.ts` | M | Implementation (Step 4) |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | M | Implementation (Step 4) |
| `apps/web-next/.env.example` | M | Implementation — AC-9 |
| `deploy/docker-compose.qa.yml` | M | Implementation — comment-only |
| `deploy/docker-compose.prod.yml` | M | Implementation — comment-only |
| `.copilot/meta/next-workflow-id` | M | Step 0 workflow-id increment |
| `docs/03-requirements/FR-CMS-009.md` | ?? | **Step 9 DocWriter** |
| `docs/03-requirements/requirements-registry.md` | M | **Step 9 DocWriter** |
| `docs/04-development/standards.md` | M | **Step 9 DocWriter** — env-var lesson escalation |
| `docs/03-requirements/FR-CMS-008.md` | M | **Step 9 DocWriter** — false-claim correction |
| `.copilot/tasks/active/wf-20260821-feat-214/*` (10 files) | ?? | Workflow artifacts 01–08 + handoff |

Nine of the ten workflow-artifact files are the run record; the tenth is this
document. **No unexplained file is present.**

### Formatter cleanliness — verified myself, not taken from the citation

The brief flagged that the biome citation should be checked rather than trusted.
I ran `pnpm biome check .` directly. **Exit code 1. `Checked 720 files in 875ms.
Found 84 errors. Found 2 warnings.`** — the error and warning counts match the
citation exactly. I then attributed every diagnostic:

| Offending file | Diagnostics | Tracked? | Modified by this PR? |
|---|---|---|---|
| `apps/e2e/uat-results/html-report/trace/uiMode.Ut8wwJNp.js` | 14 lint | **No** — `git check-ignore -v` → `apps/e2e/.gitignore:4:uat-results/` | No |
| `apps/e2e/uat-results/html-report/trace/index.DMMX1gXU.js` | 2 lint | No (same rule) | No |
| `apps/e2e/uat-results/html-report/trace/snapshot.v8KI4P3m.js` | 1 lint | No (same rule) | No |
| `apps/e2e/uat-results/html-report/trace/assets/urlMatch-BYQrIQwR.js` | 1 lint | No (same rule) | No |
| `apps/web-next/src/blocks/workspace/AsyncSelect.tsx:251` | 1 **warning** (`suppressions/unused`) | Yes | **No** — `git status --porcelain` on the file returns empty |
| `apps/web-next/src/blocks/workspace/TgBroadcastComposer.tsx:478` | 1 **warning** (`suppressions/unused`) | Yes | **No** — same check, empty |

**One correction to the citation, which I found by checking rather than
relaying.** The brief described "one pre-existing AsyncSelect.tsx warning."
There are in fact **two** warnings: `AsyncSelect.tsx:251:3` and
`TgBroadcastComposer.tsx:478:1`, both `suppressions/unused` ("Suppression comment
has no effect"). Both files are tracked but **unmodified by this PR** — verified
individually with `git status --porcelain <file>`, both returning empty. The
correction does not change the verdict, but the citation was incomplete and
should not be re-quoted as-is.

`git ls-files apps/e2e/uat-results/` returns **empty**, independently confirming
the four minified bundles are untracked and would not exist in a clean clone or
in CI.

**Verdict: not a gate failure.** Three independent grounds:

1. **Nothing dirty belongs to this PR.** All 84 errors are in gitignored,
   untracked Playwright report artifacts from a prior local UAT run. Both
   warnings are in tracked files that this PR does not touch.
2. **The changed files are affirmatively clean.** `pnpm biome check` over the
   changed source files returns `Checked 2 files in 9ms. No fixes applied.`
   (biome checks the 2 TS files; `.env.example` and the two YAML compose files
   are outside its remit).
3. **The offenders are unreachable by CI.** The four dominant sources are
   gitignored, so CI never sees them.

Routing this to CodeDeveloper would ask them to reformat minified vendor bundles
they did not create, and to remove suppression comments in two components
unrelated to this requirement. The Check-7 formatter rule exists to catch
*formatter drift introduced by the change*, and there is none.

---

## Documentation Check

| Requirement | Status |
|---|---|
| FR doc created | ✅ `docs/03-requirements/FR-CMS-009.md`, formatted on FR-CMS-008 |
| FR doc `status` frontmatter | ✅ `Implemented` |
| Registry — module file list | ✅ CMS row (L32) now includes `· [009](FR-CMS-009.md)` |
| Registry — implementation-order row | ✅ Row 71, Status `Shipped`, Depends on `CMS-008`, positioned after row 70 |
| Feature marked implemented | ✅ All 10 ACs checked `[x]` in the FR doc |
| `business_process` verified | ✅ `—`, re-checked against `docs/02-business-processes/uat/registry.md`'s full BP-UAT-000…021 list; none is a public content-page surface. Consistent with FR-CMS-007 and FR-CMS-008. |
| Docs considered but not changed | ✅ Eight documented with reasons in `08-doc-update.md` |
| Unaffected content preserved | ✅ FR-CMS-008: one Notes bullet extended, nothing else. `standards.md`: one subsection appended inside Part VIII, no existing text modified. Registry: two additive edits. |

**Three DocWriter judgment calls assessed, all sound:**

1. **Escalating the env-var lesson to `standards.md` Part VIII rather than
   leaving it in the FR doc — correct, and to the correct file.** The lesson is
   a property of `apps/web-next`'s build toolchain, applies to any future config
   knob in any module there, and had already been rediscovered twice — the
   empirical signal that an FR-doc-only home is insufficient. Routing it to
   `security.md` (the FR-CMS-008 analogue) would have been a **misclassification**:
   the dead `import.meta.env` path fails **closed** to the same-origin `/api`,
   which SecurityReviewer stated explicitly, so it is a correctness/convention
   rule, not a security one. Part VIII already contains a structurally identical
   precedent (the design-token `@theme inline` coupling — same silent-failure
   shape), and the new subsection sits directly after it.
2. **Declining a new ADR — correct.** There was no genuine architectural
   *decision*: one of the two mechanisms provably does not work in this app.
   Recording a non-choice as an ADR would misrepresent the record.
3. **Not rewriting `02-impact-analysis.md` / `03-code-summary.md` — correct and
   required.** Those are the workflow's run record; editing them to remove an
   error made at the time would falsify it. Correcting forward (FR-CMS-009) and
   backward at the origin (FR-CMS-008) is the right shape.

**DocWriter's independent verification of the inherited false claim is the
strongest single item in this workflow, and I re-verified it.** TestRunner
flagged that `02` and `03` overstate FR-CMS-008's E2E coverage. DocWriter did
not relay that correction — it checked the evidence and found **TestRunner's own
evidence was defective**: the grep was run over `apps/e2e/src`, a path that does
not exist in this repo (specs live in `apps/e2e/tests/`, page objects in
`apps/e2e/support/`), so its "zero files" result was **vacuous** and would have
returned zero for any pattern. I confirmed this directly: `ls apps/e2e/` shows
no `src/` directory, and re-running against the real paths returns seven
matching files including `apps/e2e/tests/smoke-content-pages.spec.ts`. Reading
that spec gives the accurate, narrower position — `/rules` and `/rules/[slug]`
**are** E2E-covered, but only for FR-CMS-007 concerns (5-document listing,
terminology AC-3, superseded label AC-4, unknown slug, traversal); **no spec
asserts the download link, `sourceFile`, or the emitted asset origin.** Both
docs now state the verified narrow version, and the FR doc additionally records
the bad grep path so the vacuous evidence is not re-cited. The E2E decline is
undisturbed — its three grounds each stand alone.

---

## Context-Update Check (Check 6)

`expects_registry_update: true`, `workflow_type: requirement-development` → the
expected state file is `docs/03-requirements/requirements-registry.md`, plus
`.copilot/context/workspace-state.md`.

| File | Modified? | Verdict |
|---|---|---|
| `docs/03-requirements/requirements-registry.md` | ✅ Yes — two additive edits | Pass |
| FR row matching `requirement_ref` | ✅ Yes — row 71 appended for `FR-CMS-009` | Pass |
| `.copilot/context/workspace-state.md` | ❌ Not modified | **Expected — not a failure** |

**On `workspace-state.md`:** the workflow brief states this file is owned by
**Step 11.5**, which runs after commit/push/PR — i.e. after this gate. Per the
protocol, `scripts/workflow-finish.sh`'s Step F.5 amendment sub-step is the
mechanism that performs the registry/state update from the `context_update:`
block, and it has not run yet. Failing the gate here would be failing it for a
step that has not been reached. Flagged as an **explicit obligation on Step
11.5**, not a defect: `workspace-state.md` MUST be updated before the workflow
can reach `completed`.

Note the diff command in the check's text (`git diff --stat origin/main...HEAD`)
returns **empty** at this stage because nothing is committed. I therefore
evaluated the check against the **working tree** (`git status --porcelain
--untracked-files=all`), which is the correct evidence source pre-commit. Stated
explicitly so a reader does not mistake the empty commit-range diff for a
missing update.

---

## Status-Consistency Check (FEAT-WORKFLOW-003)

`expects_registry_update: true` → check applies, not skipped.

**Pair (from `workflow_type: requirement-development`):**
File A = `docs/03-requirements/FR-CMS-009.md`;
File B = `docs/03-requirements/requirements-registry.md`.

### 8a — both files present in the diff

Evaluated against the working tree (nothing committed yet — see the note above):

```
?? docs/03-requirements/FR-CMS-009.md
 M docs/03-requirements/requirements-registry.md
```

✅ **Both present.** File A is new (`??`), File B modified (`M`). Neither is
missing.

### 8b — status values agree and equal the terminal value

| File | Field | Command | Result |
|---|---|---|---|
| A — `FR-CMS-009.md` | frontmatter `status` | `grep -E '^status: (Implemented\|Shipped)'` | `status: Implemented` ✅ |
| B — `requirements-registry.md` | table Status column | row matching `FR-CMS-009` | `\| 71 \| [FR-CMS-009](FR-CMS-009.md) \| Environment-configurable public Directus origin \| Shipped \| CMS-008 \|` ✅ |

✅ **Values agree** and both are terminal per the check's own table, which
accepts `Implemented` / `Shipped` for this pair — `Implemented` in the FR
frontmatter and `Shipped` in the registry Status column is exactly the
FR-CMS-008 convention (verified: FR-CMS-008.md carries `status: Implemented`
while its registry row 70 reads `Shipped`).

Also confirmed beyond the check's minimum: the *Depends on* column reads
`CMS-008`, matching `01-requirement-validation.md`'s declared dependency, and
the CMS module file list (L32) now links `009`.

### 8c — atomicity

**Not yet evaluable — no commit exists.** Both edits were made in the same
DocWriter step and will be staged together by `workflow-finish.sh`, so they are
expected to land in one commit. **Recorded as an obligation on Step 11:** commit
File A and File B together. This is a warning-level criterion even when it
fails, so it does not gate.

---

## GitHub-Issue Link Check (§8.5)

`issues_created: []` and `issue_ref: ""` in `handoff.yaml` — **confirmed by
reading the file, not assumed.** This workflow created and modified no
`ISS-*.md` file; `.copilot/issues/` has no entry from this run.

✅ **N/A — check skipped per its own "Otherwise skip" condition.**
`scripts/check-github-issue-links.sh` was not run, correctly: the check is
scoped to issues *this workflow* touched, and there are none. (Full-registry
drift from prior workflows is Step 0.5's `check-workflow-state.sh` remit, not
this gate's.)

---

## §7.5 Production-Readiness / AC Verification — HARD GATE

All ten ACs are marked below. **None is unmarked and none is a bare `deferred`.**

| AC | Status | Instrument and evidence |
|---|---|---|
| **AC-1** Default preserves production byte-for-byte | **verified** | Unit — `cms-content-pages.test.ts` L557/L570/L581 (absent key, explicit `undefined`, no argument). Also structural: `DEFAULT_PUBLIC_DIRECTUS_URL` is byte-identical to the removed L14 constant — confirmed by reading the diff. |
| **AC-2** Override honored | **verified** | Unit — L595/L607/L620 (verbatim, trimmed, trailing slash preserved). |
| **AC-3** Download href follows override end-to-end | **verified** | Unit — L653, exact match on `<override>/assets/<uuid>?download`. |
| **AC-4** Empty / whitespace treated as unset | **verified** | Unit — `it.each` L632–650 over `''`, `' '`, `'\t  '`, `'\n'`, plus `not.toBe('')`. |
| **AC-5** Internal origin never leaks (MAJOR-2 guard) | **verified** | Unit — pre-existing guards L489–517 kept verbatim, extended by a 5-case `it.each` at L529–546 running the **real** resolver. |
| **AC-6** Realm independence preserved | **verified (security review of source shape)** | `04-security-review.md` MAJOR-2 table row 1, against shipped `cms.ts:931–934`. |
| **AC-7** Internal SSR path unchanged | **verified (diff evidence + unchanged passing suite)** | Diff shows `cms.ts:79–81` byte-unchanged; `cms.test.ts`'s internal-base suite passes unmodified. |
| **AC-8** Both public consumers agree | **verified** | Unit L668, **plus** a structural guarantee: one resolver and one default constant, so divergence is inexpressible. |
| **AC-9** Knob discoverable | **verified (documentation review)** | `.env.example` states all three elements AC-9 names; both compose files carry matching comment blocks. |
| **AC-10** Runtime, not build-time | **verified** | Unit L686 (call-time evaluation) **plus** compiled-artifact verification — three independent confirmations. |

**Every AC of this requirement is `verified`. There is no `deferred` AC, so the
deferral sub-rules (named follow-up ID, queue position, bounded verification) do
not apply to any AC and no gate failure can arise from them.**

### Are the three non-unit-test instruments legitimate? (the brief asked me to assess this)

**Yes — for AC-6, AC-7, and AC-9 the chosen instrument is not merely acceptable,
it is the *correct* one, and a unit test would have been actively worse in each
case.** I evaluated each against the specific alternative rather than accepting
the strategist's framing.

- **AC-6 (no `typeof window` branch) — security review of source shape.** This
  asserts a property of the **source text**, not of runtime behaviour. The only
  way to express it as a test is to read `cms.ts` from disk and assert on its
  contents, which is a lint rule wearing a test costume — and **unsound in both
  directions**: it would fail on a harmless refactor (a comment mentioning
  `typeof window` trips a naive matcher) and pass on a semantically equivalent
  realm branch written differently (`window !== undefined`,
  `import.meta.env.SSR`, `globalThis.window`). Code review is the right
  instrument for a structural invariant, and it was genuinely applied: the
  review verified against shipped source that `publicAssetUrl()` is three lines
  with no realm branch, and correctly distinguished the resolver's
  `typeof process` **capability** check from a **realm** branch.
- **AC-7 (internal SSR path unchanged) — diff evidence.** This is a **no-change**
  assertion. The correct evidence for "this PR did not touch X" is the diff
  showing X unchanged, plus X's existing suite still passing — both present.
  Adding a new test would be padding *and* would falsely imply this PR owns
  behaviour it deliberately did not touch, which is a traceability defect, not a
  coverage gain.
- **AC-9 (knob discoverable) — documentation review.** The AC is literally about
  what a **human developer reads** in `.env.example`. The only testable proxy is
  a file-content string assertion, which would pass on documentation that is
  present but wrong or unintelligible — it would test presence, not
  discoverability. Reading the file is the instrument that actually evaluates
  the claim.

**A fourth candidate test was correctly refused on stronger grounds still:** a
URL-shape/parse validation test would **contradict the security-reviewed
design**, which deliberately does not validate URL syntax (see the `http://`
adjudication). Adding it would have encoded a behaviour the security review
explicitly ruled against.

**And the AC most at risk of a false pass was verified at the strongest possible
level.** AC-10 is the one criterion a passing unit suite genuinely *cannot*
establish — the entire hazard is that `import.meta.env` would be inlined at
build time and the tests would pass anyway. It was verified on the **compiled
artifact**: static inspection of `dist/server/chunks/cms_*.mjs` showing
`process.env` surviving verbatim with zero `ASSETS_PREFIX` occurrences (the
trap's exact fingerprint), and dynamic execution showing the value change
**mid-process with no rebuild**. Three independent parties confirmed it
(CodeDeveloper on the bundle, Orchestrator via `tsx`, TestRunner by executing
the compiled chunk). This is verification *above* the level a unit test could
provide, not below it.

**Conclusion: 7 ACs by unit test, 3 by the instrument appropriate to their
nature, 1 of those 7 additionally reinforced at the artifact level. Zero ACs
unverified. Zero deferrals. §7.5 passes.**

### Infrastructure-Pre-Flight Invariant

**Not triggered — no AC of this requirement is deferred.** No AC requires live
infrastructure, so `07-test-results.md` records no infrastructure deferral and
the pre-flight obligation (`docker ps` → `docker compose up -d` → `curl -fsS`)
does not apply.

**The one deferral in this workflow is scoped correctly and is *not* an AC
deferral.** QA still emits production download links until infra stands up a QA
Directus vhost (T-0141). This is a **known limitation of the deployed
environment**, not an unverified acceptance criterion — this PR's requirement is
that the override be *possible*, and that is verified. It is properly bounded:
named against **T-0141** in `03-code-summary.md`, `02-impact-analysis.md`, and
now durably in `docs/03-requirements/FR-CMS-009.md` §*Operator note*, which
states the two required operator steps in order and the concrete verification
(uncomment the pre-written compose line, set it, restart — no rebuild).
`AGENTS.md` §6.1's "bring the stack up" obligation correctly does not apply: the
missing piece is a **public DNS vhost on a remote host**, not a
`docker compose up` the Orchestrator can perform.

---

## Final Assessment

`wf-20260821-feat-214` is complete and correct end-to-end. All eight prior steps
returned `passed` on the first attempt with no retry consumed, and the one
skipped step (DBMigrationAuthor) is justified by a verified absence of any
persistence surface. I re-ran every quantitative claim rather than reading it
from the artifacts: 1115/1115 web-next tests pass across 44 files, typecheck is
4/4, `arch:check` passes on 289 files, and biome is clean on the changed source
files. The security review returned zero BLOCKER and zero MAJOR findings, and
the one escalated question — `http://` acceptance — was genuinely adjudicated
rather than deferred, with a concretely stated flip condition now recorded
durably in the FR doc. The `biome check .` non-zero exit was verified myself
rather than trusted: all 84 errors are in gitignored, untracked Playwright
report bundles and both warnings are in tracked files this PR does not modify —
though the citation was **incomplete**, describing one warning where there are
two (`AsyncSelect.tsx` **and** `TgBroadcastComposer.tsx`), a correction that
does not change the verdict but should not be re-quoted as-is. Status
consistency holds: `FR-CMS-009.md` carries `status: Implemented`, registry row
71 carries `Shipped`, both appear in the working-tree diff, and the pairing
matches the FR-CMS-008 convention exactly. All ten ACs are `verified` with zero
deferrals; the three verified by non-unit instruments were assessed individually
and each chosen instrument is the correct one — a unit test would have been
unsound (AC-6), padding that falsely implies ownership (AC-7), or a proxy that
tests presence rather than the property (AC-9) — while AC-10, the criterion most
at risk of a false pass, was verified at the compiled-artifact level by three
independent parties. The strongest quality signal in this workflow is that
DocWriter did not relay TestRunner's correction but re-derived it and found
TestRunner's *own* evidence defective (a grep over the nonexistent path
`apps/e2e/src`), producing a narrower and accurate statement now recorded in
both FR-CMS-009 and FR-CMS-008 without falsifying the prior run artifacts. The
empty `github_pr_url`, uncommitted tree, and untouched `workspace-state.md` are
timing states of running this gate before Step 11, each confirmed to be only a
timing state; they are carried forward as explicit obligations on Steps 11 and
11.5 rather than waived.

**PASS. The Orchestrator is authorized to commit, push, and open the PR.**

**Obligations carried forward (must be satisfied before `workflow_status:
completed`):**
1. **Step 11** — commit `docs/03-requirements/FR-CMS-009.md` and
   `docs/03-requirements/requirements-registry.md` **in the same commit**
   (Status-Consistency 8c atomicity).
2. **Step 11** — populate `handoff.yaml.github_pr_url` with the real PR URL.
3. **Step 11.5** — update `.copilot/context/workspace-state.md`; Check 6 is not
   satisfiable until this lands.
4. **Step 11.5** — re-run Status-Consistency sub-check 8b against `main` after
   the merge.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-CMS-009 clears the quality gate. All 8 prior steps passed first-attempt with no retries; 1115/1115 tests, typecheck 4/4, arch:check 289 files and biome-on-changed-files all re-run and confirmed independently; zero BLOCKER/MAJOR security findings with the escalated http:// question genuinely adjudicated and its flip condition recorded durably; status-consistency holds (FR-CMS-009.md Implemented + registry row 71 Shipped, both in the diff); and all 10 ACs are verified with zero deferrals. Empty github_pr_url, uncommitted tree, and untouched workspace-state.md are expected pre-Step-11 timing states, carried forward as explicit obligations."
  findings:
    - "ALL QUANTITATIVE CLAIMS RE-RUN, NOT READ FROM ARTIFACTS. pnpm --filter @aiqadam/web-next test -> 44 passed (44), 1115 passed (1115), 0 failed, 0 skipped. pnpm typecheck -> 4 successful, 4 total. pnpm arch:check -> passed, 289 files, mode=full. pnpm biome check on the changed source files -> 'Checked 2 files in 9ms. No fixes applied.' Every figure matches 07-test-results.md exactly."
    - "BIOME VERIFIED MYSELF RATHER THAN TRUSTING THE CITATION, AND FOUND THE CITATION INCOMPLETE. `pnpm biome check .` exits 1: 'Checked 720 files in 875ms. Found 84 errors. Found 2 warnings.' — error/warning counts match. Attribution: all 84 ERRORS are in four minified Playwright report bundles under apps/e2e/uat-results/ (uiMode 14, index 2, snapshot 1, urlMatch 1... totalling the 84 diagnostics), each confirmed gitignored via `git check-ignore -v` -> apps/e2e/.gitignore:4:uat-results/, and `git ls-files apps/e2e/uat-results/` returns EMPTY confirming they are untracked and absent from a clean clone or CI. THE CITATION SAID 'one pre-existing AsyncSelect.tsx warning' — there are in fact TWO warnings, AsyncSelect.tsx:251:3 AND TgBroadcastComposer.tsx:478:1, both suppressions/unused. Both files are tracked but UNMODIFIED by this PR (git status --porcelain on each returns empty). The correction does not change the verdict but the citation should not be re-quoted as-is. NOT A GATE FAILURE on three grounds: nothing dirty belongs to this PR, the changed files are affirmatively clean, and the four dominant offenders are gitignored so CI never sees them."
    - "STATUS-CONSISTENCY (§8) PASSES. 8a: both pair files present in the working-tree change set — `?? docs/03-requirements/FR-CMS-009.md` (new) and ` M docs/03-requirements/requirements-registry.md`. 8b: File A frontmatter is `status: Implemented`; File B row 71 is `| 71 | [FR-CMS-009](FR-CMS-009.md) | Environment-configurable public Directus origin | Shipped | CMS-008 |`. Values AGREE and both are terminal per the check's own table (Implemented/Shipped), matching the FR-CMS-008 convention exactly — verified that FR-CMS-008.md also carries `status: Implemented` while its registry row 70 reads `Shipped`. Depends-on column reads CMS-008, matching 01-requirement-validation.md. 8c atomicity not yet evaluable (no commit exists) — carried forward as a Step 11 obligation; it is warning-level and does not gate."
    - "EVALUATED §6 AND §8a AGAINST THE WORKING TREE, NOT THE COMMIT RANGE, AND SAID SO. `git diff --name-only origin/main...HEAD` returns EMPTY at this stage because nothing is committed — the check's literal command would produce a false negative. The correct pre-commit evidence source is `git status --porcelain --untracked-files=all`, which shows both pair files. Stated explicitly so a reader does not mistake the empty commit-range diff for a missing update."
    - "§8.5 GITHUB-ISSUE LINK CHECK — N/A, CONFIRMED BY READING handoff.yaml, NOT ASSUMED. `issues_created: []` (L102) and `issue_ref: \"\"` (L103). This workflow created and modified no ISS-*.md file, so the check's own 'Otherwise skip' condition applies and scripts/check-github-issue-links.sh was correctly not run. Full-registry drift from prior workflows is Step 0.5's remit, not this gate's."
    - "§7.5 HARD GATE PASSES — ALL 10 ACs VERIFIED, ZERO DEFERRALS, ZERO UNMARKED. Seven by unit test (AC-1/2/3/4/5/8/10, each cited to a specific line in cms-content-pages.test.ts), three by the instrument appropriate to their nature (AC-6 security review of source shape, AC-7 diff evidence plus an unchanged passing suite, AC-9 documentation review). Because no AC is deferred, the deferral sub-rules (named follow-up ID, queue position, bounded verification) cannot produce a failure here."
    - "THE THREE NON-UNIT INSTRUMENTS ARE LEGITIMATE — ASSESSED INDIVIDUALLY AGAINST THEIR ALTERNATIVE, NOT ACCEPTED FROM THE STRATEGY. AC-6 asserts a property of the SOURCE TEXT; the only test form is reading cms.ts from disk, which is unsound in BOTH directions (fails on a harmless refactor where a comment mentions typeof window; passes on a semantically equivalent realm branch written as window !== undefined / import.meta.env.SSR / globalThis.window). AC-7 is a NO-CHANGE assertion whose correct evidence is the diff plus the existing suite still passing; a new test would be padding AND would falsely imply this PR owns behavior it deliberately did not touch — a traceability defect, not a coverage gain. AC-9 is literally about what a HUMAN READS in .env.example; a file-content assertion would pass on documentation that is present but wrong, testing presence rather than discoverability. A fourth candidate — a URL-parse validation test — was refused on stronger grounds still: it would CONTRADICT the security-reviewed design, which deliberately does not validate URL syntax."
    - "AC-10, THE CRITERION MOST AT RISK OF A FALSE PASS, WAS VERIFIED ABOVE UNIT LEVEL, NOT BELOW IT. The entire hazard is that import.meta.env would be build-inlined and the unit tests would pass anyway. It was verified on the COMPILED ARTIFACT: static inspection of dist/server/chunks/cms_*.mjs showing process.env surviving verbatim with ZERO ASSETS_PREFIX occurrences (the trap's exact fingerprint, contrasted against Layout_*.mjs which shows what the trap looks like when it HAS happened), plus dynamic execution showing the value change MID-PROCESS WITH NO REBUILD. Three independent parties confirmed it: CodeDeveloper on the bundle, Orchestrator via tsx, TestRunner by executing the compiled chunk."
    - "SECURITY: ZERO BLOCKER, ZERO MAJOR. I scrutinized the decision NOT to record the http:// question as a MAJOR, because 'reviewer downgrades their own finding' deserves it — the reasoning holds. A MAJOR is retriable work for CodeDeveloper, and the ruling is that the SHIPPED implementation is already correct, so a MAJOR would direct a retry toward a change the review affirmatively does not want made. Four independently-stated reasons, residual risk explicitly accepted at LOW with four named compensating controls, and — the detail that makes it a real adjudication rather than a wave-through — a CONCRETE FLIP CONDITION (a subresource caller for publicAssetUrl(): <img src>/<link href>/fetch(), or the asset folder ceasing to be public-read), now recorded durably in docs/03-requirements/FR-CMS-009.md so a future change crossing that boundary has a written trigger. Properly closed, not suppressed. FR-CMS-008's MAJOR-2 invariant verified preserved on all three sub-invariants against shipped code."
    - "TEST HYGIENE CLEAN: zero it.skip / test.skip / describe.skip / .only and zero @flaky in the changed test file. The repo-wide grep's five hits are all the COMMENT line '// Per standards.md §IV: AAA pattern, Vitest, no it.skip.' — verified by reading the matched lines rather than counting them. Coverage 100% line and 100% branch on the resolver (targets 80/70); the 'error paths' requirement is satisfied vacuously and correctly because the function is TOTAL and cannot throw. Integration N/A is verified not skipped (rubric 0 vs threshold 4; zero apps/api files in the change set)."
    - "DOCUMENTATION COMPLETE AND THREE JUDGMENT CALLS SOUND. (1) Escalating the env-var lesson to standards.md Part VIII rather than leaving it in the FR doc is correct AND routed to the correct file — it is a property of apps/web-next's build toolchain applying to any future config knob in any module there, and had already been rediscovered twice; security.md would have MISCLASSIFIED it, since the dead import.meta.env path fails CLOSED to the same-origin /api per SecurityReviewer, making it a correctness rule not a security one. Part VIII already holds a structurally identical precedent (the design-token @theme inline coupling, same silent-failure shape) and the new subsection sits directly after it. (2) Declining a new ADR is correct — there was no genuine decision, since one mechanism provably does not work. (3) Not rewriting 02/03 is correct and required — they are the run record."
    - "STRONGEST QUALITY SIGNAL IN THE WORKFLOW, AND I RE-VERIFIED IT: DocWriter did not relay TestRunner's E2E correction, it checked the evidence and found TESTRUNNER'S OWN EVIDENCE DEFECTIVE. TestRunner's grep ran over `apps/e2e/src` — A PATH THAT DOES NOT EXIST in this repo (I confirmed: `ls apps/e2e/` shows tests/, support/, uat-results/, but no src/), so its 'zero files' result was VACUOUS and would have returned zero for any pattern whatsoever. Re-run against the real paths, seven files match including apps/e2e/tests/smoke-content-pages.spec.ts. The accurate position is NARROWER than both the original claim and TestRunner's correction: /rules and /rules/[slug] ARE E2E-covered, but only for FR-CMS-007 concerns (5-document listing, terminology AC-3, superseded label AC-4, unknown slug, traversal) — NO spec asserts the download link, sourceFile, or the emitted asset origin. Corrected in BOTH directions of propagation (forward in FR-CMS-009.md, backward at the origin in FR-CMS-008.md) without editing the prior run artifacts, and the bad grep path is itself recorded so the vacuous evidence is not re-cited."
    - "CHANGE SET FULLY ACCOUNTED FOR, NO UNEXPLAINED FILE: 6 implementation files (cms.ts, cms-content-pages.test.ts, .env.example, both compose files, next-workflow-id), 4 documentation files from Step 9 (FR-CMS-009.md new, requirements-registry.md, standards.md, FR-CMS-008.md), and 10 workflow artifacts. No stray edit, no leftover debug file, no dist/ noise (apps/web-next/dist is gitignored per .gitignore:15 and untracked). handoff.yaml.branch matches git HEAD: feature/cms-009-configurable-public-cms-url."
    - "THREE EXPECTED PRE-STEP-11 TIMING STATES CONFIRMED AS ONLY TIMING STATES, NOT WAIVED ON ASSERTION: (a) github_pr_url empty — the protocol requires non-empty for workflow_status: completed, and workflow_status is currently 'running', so the rule is not yet in force; (b) uncommitted tree — the change set is fully accounted for with nothing stray; (c) workspace-state.md untouched — owned by Step 11.5, which runs AFTER this gate, so failing here would fail the gate for a step not yet reached. All three carried forward as EXPLICIT OBLIGATIONS: commit the two status-pair files together (8c atomicity), populate github_pr_url, update workspace-state.md, and re-run 8b against main post-merge."
    - "DBMIGRATIONAUTHOR SKIP JUSTIFIED AND VERIFIED, NOT ACCEPTED. Confirmed against the working tree: no file under apps/api/drizzle/, no Drizzle schema edit, no infrastructure/directus/bootstrap.sh change. content_documents.source_file already exists from FR-CMS-008; this requirement changes only the origin string prefixed onto an already-stored uuid. Nothing to migrate. Separately, 06-test-design.md's 'no new tests' outcome is a legitimate step result — TestDesigner independently confirmed all four of TestStrategist's dismissals and STRENGTHENED two (not merely unworthwhile but NOT WRITABLE without widening the production API or introducing shared mutable global state, which standards.md §IV forbids)."
