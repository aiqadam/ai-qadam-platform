# Test Design — wf-20260703-fix-065-onboarding-copy

**Agent:** TestDesigner
**Workflow type:** issue-resolution
**Issue:** [ISS-UAT-013-13](../../issues/ISS-UAT-013-13.md) — OnboardingForm welcome copy
**Branch:** `fix/ISS-UAT-013-13-onboarding-copy`
**Producer note:** The test file was authored in Step 4 (CodeDeveloper,
Retry 2) by relocating the helper to `OnboardingForm.helpers.ts` and
writing 5 cases at `apps/web/src/components/OnboardingForm.test.ts`.
This document assesses that file against the Step-6 strategy and the
AGENTS.md §9 honesty baseline. No new test file was written; no edit
to the existing test file was needed.

---

## Tests Written

The test file already exists at the correct location and needs no
modification. Provenance and footprint:

| File | Type | Count | Required by strategy? |
|---|---|---|---|
| `apps/web/src/components/OnboardingForm.test.ts` | Unit (vitest, `environment: 'node'`) | 5 cases over `roleGroupsText` | Yes (AC-3) |
| `apps/web/src/components/OnboardingForm.test.tsx` | Component render (jsdom) | — | No (out of scope — see §"Optional levels") |

### Inventory trace to strategy

| # | Strategy's required case | Test file's `it()` | Status |
|---|---|---|---|
| 1 | empty array → `'an operator'` | `it('returns the fallback for an empty array', () => expect(roleGroupsText([])).toBe('an operator'))` | Present, identical assertion |
| 2 | undefined → `'an operator'` | `it('returns the fallback for undefined', () => expect(roleGroupsText(undefined)).toBe('an operator'))` | Present, identical assertion |
| 3 | null → `'an operator'` | `it('returns the fallback for null (nullish-safety)', () => expect(roleGroupsText(null)).toBe('an operator'))` | Present, identical assertion |
| 4 | single-element → that element | `it('returns the single role when role_groups has one element', () => expect(roleGroupsText(['aiqadam-staff'])).toBe('aiqadam-staff'))` | Present, identical assertion |
| 5 | multi-element → comma-joined | `it('joins multiple roles with ", "', () => expect(roleGroupsText(['aiqadam-staff', 'aiqadam-editor'])).toBe('aiqadam-staff, aiqadam-editor'))` | Present, identical assertion |

All five cases the strategy required are present with the same
assertion forms. Coverage is complete.

---

## Acceptance Criteria Coverage

| AC | Text (abbrev.) | Test | Status |
|---|---|---|---|
| AC-1 | empty / undefined → `"You're being added as an operator."` | Cases 1, 2, 3 (plus a `null` belt-and-braces check) | Covered by code-level helper test; **execution deferred** to `wf-20260703-fix-066-vitest-bump` (ISS-TEST-WEB-001) |
| AC-2 | one / many roles — no regression | Cases 4, 5 | Covered; execution deferred as above |
| AC-3 | unit test exists | File present at `apps/web/src/components/OnboardingForm.test.ts` | **File present**; runtime pass/fail deferred |
| AC-4 | visual re-run of BP-UAT-013 Neg 005 | (visual / optional per issue author) | Deferred optional — visual audit against existing screenshot is acceptable |

Honesty note on the "execution deferred" rows: the assertions are
written against the real helper exported from
`OnboardingForm.helpers.ts` (verified by reading both files), not
against a re-implementation in the test file. When vitest is bumped
by `wf-20260703-fix-066-vitest-bump`, the assertions will run against
production code and the result will be real — not a locally-passing
fake gate.

---

## Honesty Audit (AGENTS.md §9)

| Check | Required | Observed | Verdict |
|---|---|---|---|
| Tests the production code via direct import | Yes | `import { roleGroupsText } from './OnboardingForm.helpers';` | **PASS** |
| Does not re-implement the helper in the test | Yes | No local `function roleGroupsText(...) {}` body; only the import | **PASS** |
| Does not assert "tests pass" without running them | Yes | The 5 cases are real `expect(...).toBe(...)` calls awaiting `vitest` execution | **PASS** |
| Comments explain WHY, not WHAT | Yes | Header comment names the issue (ISS-UAT-013-13) and why a `.ts` sibling file was chosen over a `.tsx` render test. The `null` case has a 3-line WHY comment ("belt-and-braces because `null` is a common JSON shape for missing arrays"). | **PASS** |
| No `it.skip` | Yes | Zero `it.skip` / `xit` / `describe.skip` in the file | **PASS** |
| No `any` | Yes | No type annotations need `any`; signature is concrete | **PASS** |
| No `as` casts | Yes | None in the test file | **PASS** |
| AAA pattern | Recommended | Each `it()` is one-line Arrange/Act/Assert on a pure function; explicit sections would be ceremony for a 1-line pure-function case | **PASS (functional)** |
| Precedent alignment | Recommended | Mirrors the `apps/web/src/lib/utm.test.ts` "import from sibling `.ts`" footprint under `environment: 'node'` | **PASS** |

The CodeDeveloper's Step-4 retry summary already called out the
honesty trade-off for this exact decision (see
`03-code-summary.md` §"Why I did NOT work around this by inlining the
helper into the test file" — the orchestrator deserves the truthful
infra-blocked signal rather than a fake-pass gate). That stance holds:
the test asserts against production code; the import line, not a
copy, ties the assertions to the real implementation.

---

## Optional levels — explicit non-decisions

The strategy marked three test levels as optional or non-required. No
work was done on them and none should be added.

| Level | Strategy disposition | Why no addition here |
|---|---|---|
| Integration (Testcontainers) | Not required (rubric 0) | Pure frontend render-text fix. No backend, no DB. |
| E2E (Playwright, Neg 005 spec extension) | Optional, deferred per issue author | Issue author marked the visual re-run as optional; visual audit against the existing `neg-005-no-authentik-user-409.png` is acceptable. AGENTS.md §3 still requires E2E for user-facing flows, but this fix is a 1-line copy correction inside an existing component — no new flow is added. Adding a new E2E spec for a copy-only correction would be over-testing (orchestrator prompt §4). |
| Component render test (jsdom) | Optional, not wired | `apps/web/vitest.config.ts` declares `environment: 'node'`; jsdom is not installed. Wiring jsdom just to render a 1-line helper would expand scope into infra (forbidden by orchestrator prompt §5) and would require resolving ISS-TEST-WEB-001 to run anyway. The pure-function unit test already exercises the logic that produces the broken text. |

---

## Execution status (and infra deferral)

Per orchestrator prompt §3, running the test is **blocked** by
[ISS-TEST-WEB-001](../../issues/ISS-TEST-WEB-001.md) — the pre-existing
`vitest 2.1.9 ↔ vite 8.1.0` SSR-transform skew that surfaces as
`ReferenceError: __vite_ssr_exportName__ is not defined` when any test
imports a sibling source file. The CodeDeveloper's Retry-2 ran
`pnpm --filter web exec vitest run` and observed:

| Test file | Outcome |
|---|---|
| `src/lib/utm.test.ts` | `45 passed (45)` — run fine because it inlines its helper |
| `src/components/OnboardingForm.test.ts` | `1 failed` suite (no tests ran) — `__vite_ssr_exportName__` undefined at `OnboardingForm.helpers.ts:1:1` |

The follow-up workflow `wf-20260703-fix-066-vitest-bump` is already
queued and references `OnboardingForm.test.ts` in its `context_refs`.
The deferral is bounded and named. ISS-TEST-WEB-001 owns the bump; this
workflow does not.

Per AGENTS.md §6.1, the QualityGate will mark each AC as either
`verified` or `deferred-with-followup-workflow-ID-and-queue-position`
— here, AC-1/AC-2/AC-3 carry a deferred-with-queue-ref tag pointing
at `wf-20260703-fix-066-vitest-bump`. The Resolution section of the
issue should mirror this.

### What `wf-20260703-fix-066-vitest-bump` will verify (handed off)

- `pnpm --filter web exec vitest run OnboardingForm.test.ts` →
  `5 passed (5)`, exit 0.
- `pnpm --filter web exec vitest run` → `utm.test.ts` still
  `45 passed (45)`, no regression.
- `pnpm --filter api exec vitest run` and
  `pnpm --filter web-next exec vitest run` execute without the
  `__vite_ssr_exportName__` error.

Once those commands return the expected output, the deferral closes
retroactively. **This workflow does not flip ISS-UAT-013-13 to
`resolved` based on the deferral alone.**

---

## Known Test Gaps (none — with reasoning)

There are no genuine gaps. The 5-case assertion set is the truth
table of a 1-line pure function:

```
[]                  → 'an operator'
undefined           → 'an operator'
null                → 'an operator'
['aiqadam-staff']   → 'aiqadam-staff'
['a', 'b']          → 'a, b'
```

That is the full input space given the branch shape
`groups && groups.length > 0 ? groups.join(', ') : FALLBACK`. Three
distinct branch inputs (`[]`, `undefined`/`null`, `['aiqadam-staff']`)
plus a multi-element case that exercises the `join` runtime path are
covered. Adding a sixth case (e.g. `'returns the same reference for
the fallback string'`) would be over-testing — the function returns a
string literal; there is no reference identity to assert.

No `// TODO` comments are needed inside the test file; no
`deferred_to_feature` is needed for this workflow — the inflight
infra deferral is recorded in `deferrals` of `handoff.yaml`, not as a
test-code TODO.

---

## Self-Check (per TestDesigner role §6)

- [x] All new public functions have unit tests (happy path + at least
      one failure path). `roleGroupsText` is the only new public
      function; 5 cases cover all three branches (empty, single,
      multi) plus 2 nullishness guards.
- [x] Integration tests use Testcontainers. Not required (rubric 0) —
      no backend touched.
- [x] No `it.skip`. Verified by `grep` against the file (zero hits).
- [x] No `any`. Verified by reading the file (no type annotations).
- [x] Coverage target: 80% line / 70% branch / 100% error paths.
      With 3 branch arms exercised by cases 1–3, 4, 5 the
      **branch coverage is 100%** on the production helper. The
      branch is the only error path. Targets exceeded; not relaxed.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  timestamp: 2026-07-03T18:40:00Z
  summary: Test file already exists at apps/web/src/components/OnboardingForm.test.ts (authored in CodeDeveloper Retry 2); assessor's verdict is 'no edits needed'. All 5 strategy-required cases (empty/undefined/null → 'an operator'; single → that element; multi → comma-joined) are present with identical assertions. Honesty audit clean: test imports the production helper from OnboardingForm.helpers.ts (no re-implementation), comments explain WHY (ISS-UAT-013-13 reference + .ts-sibling rationale + null belt-and-braces), no it.skip, no any, no as. Execution blocked by pre-existing ISS-TEST-WEB-001 (vitest 2.1.9 ↔ vite 8.1.0 SSR skew) — deferral is bounded and named, owned by queued follow-up wf-20260703-fix-066-vitest-bump; this workflow does not flip ISS-UAT-013-13 to resolved on the strength of deferred verification alone.
  output_file: .copilot/tasks/active/wf-20260703-fix-065-onboarding-copy/06-test-design.md
```
