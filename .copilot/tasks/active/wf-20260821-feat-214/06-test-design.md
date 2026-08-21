# 06 — Test Design

**Workflow:** `wf-20260821-feat-214`
**Agent:** TestDesigner
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009`

---

## Outcome: no new test files, no new test cases

The TestStrategist's audit concluded that CodeDeveloper's 20 existing tests
cover all 10 ACs and that four candidate gaps should be dismissed. The strategy
instructed me to **confirm those dismissals independently rather than accept
them**, and to record the result.

I did so. **All four dismissals hold, and two of them are stronger than the
strategist stated** — they are not merely "not worth writing," they are *not
writable* without changing production code. No test was added, removed, or
modified in this step.

"No new tests required" is a legitimate outcome of this step per the brief, and
it is the outcome here. What follows is the verification work that justifies it,
not a restatement of the strategy.

---

## Independent Verification of the Four Dismissals

### Dismissal 1 — a `directusBase()` client-branch test (AC-8)

**Confirmed, and stronger than stated: not writable without widening the
production API.**

Two independent blockers, both verified against the repo rather than reasoned
about:

1. **`directusBase` is not exported.** I enumerated every `export` in
   `apps/web-next/src/lib/cms.ts` (32 of them). `resolvePublicDirectusUrl`
   (L57) is the **only** new export; `directusBase`, `publicAssetUrl`,
   `assetUrl`, and `sourceFileDownloadUrl` are all absent from the list —
   module-private, exactly as `02-impact-analysis.md` claimed. Testing
   `directusBase()` would require exporting it purely for the test, widening
   the module's public surface for no production consumer. That trades a real
   architectural cost for a redundant assertion.
2. **There is no `window` to stub.** `apps/web-next/vitest.config.ts:23` sets
   `environment: 'node'`. The client branch is gated on
   `typeof window === 'undefined'` being false, which never happens in this
   suite. Forcing it would mean assigning to `globalThis.window` — shared
   mutable global state across tests, which `standards.md` §IV explicitly
   forbids ("No shared mutable state between tests").

**And the property is already guaranteed more strongly than a test could.**
`cms.ts` now contains exactly one `DEFAULT_PUBLIC_DIRECTUS_URL` (L20) and one
resolver; `directusBase()` L85 and `publicAssetUrl()` L933 both call it. Two
divergent public bases are not *untested*, they are **inexpressible**. The
existing test at L668 pins the property at the resolver level, which is the
correct altitude. Dismissal upheld.

### Dismissal 2 — an AC-6 "no `typeof window` branch" test

**Confirmed. A test here would be a category error.**

AC-6 asserts a property of the *source text* ("no `typeof window` branch was
introduced"), not of runtime behavior. The only way to express it as a test is
to read `cms.ts` from disk and assert on its contents — which is a lint rule
wearing a test costume. It would fail on any harmless refactor (a comment
mentioning `typeof window` would trip a naive matcher) and would pass on a
semantically equivalent realm branch written differently (`window !== undefined`,
`import.meta.env.SSR`, `globalThis.window`). It is unsound in both directions.

The right instrument is code review, and it was applied: `04-security-review.md`
verifies against the shipped source that `publicAssetUrl()` (`cms.ts:931–934`)
is three lines — null-guard plus one template literal — with no realm branch,
and correctly distinguishes the resolver's `typeof process` *capability* check
from a *realm* branch. Dismissal upheld.

### Dismissal 3 — an AC-7 "internal SSR path unchanged" test

**Confirmed, with one refinement to the strategist's reasoning.**

AC-7 is a no-change assertion. I verified the no-change claim directly rather
than trusting it: `cms.ts:79–81` reads

```ts
if (typeof window === 'undefined') {
  const { INTERNAL_DIRECTUS_URL } = process.env;
  return INTERNAL_DIRECTUS_URL ?? DEFAULT_INTERNAL_DIRECTUS_URL;
}
```

and the diff shows those three lines untouched — the only edit inside
`directusBase()` is on the *client* branch (L83–85) and in the comment. So the
behavior AC-7 protects is not merely believed unchanged, it is confirmed
unchanged at the line level.

**Refinement:** the strategist cited `cms.test.ts`'s
`DIRECTUS_BASE = 'http://directus:8055'` (L100) as covering evidence. That is
*partly* right and worth stating precisely, because overclaiming here would be
its own defect. That constant is the **mirror's** internal base, so it does not
directly exercise `directusBase()` either — but it does mean that if the
internal base ever changed, roughly a dozen assertions across that 621-line
suite (L124, L169, L196, L205, L621, …) would need updating in lockstep, making
a silent internal-base regression visible in review. That is a real, if
indirect, guard. Combined with the line-level diff evidence, AC-7 is
adequately verified. Adding a new test for behavior this PR did not touch would
be padding and would falsely imply the PR owns that behavior. Dismissal upheld.

### Dismissal 4 — a URL-shape / `new URL()` validation test

**Confirmed, and this is the most important of the four to get right.**

Such a test would assert that the resolver validates URL syntax. The resolver
deliberately does **not**, and that non-validation is now a
**security-adjudicated design decision**, not an oversight:
`04-security-review.md` rules that `http://` is accepted by design and that
code-level rejection must not be added, with a stated boundary for when that
verdict would flip.

Writing a validation test would therefore encode the *opposite* of the reviewed
design into the suite, and the next developer would "fix" the code to satisfy
the test — reintroducing exactly the rejected behavior, laundered through a
green test. Tests must not contradict an explicit security ruling. Dismissal
upheld emphatically.

---

## Review of the shipped tests against `standards.md` §IV

Since I am not writing tests, my remaining obligation is to confirm the tests I
am inheriting meet the standard. I read all 20 rather than sampling.

| Rule (`standards.md` §IV) | Compliant? | Evidence |
|---|---|---|
| One file per source file, `<source>.test.ts` | ✅ | Extends `cms-content-pages.test.ts`, the established file for this surface. No stray new spec file, so the FR-CMS-008 guards and the new coverage stay adjacent and cannot drift apart. |
| One `describe` per function/behavior | ✅ | Five new `describe` blocks, each named for the AC it covers (L556 AC-1, L594 AC-2, L631 AC-4, L652 AC-3, L667 AC-8, L685 AC-10). Readable as a coverage map. |
| AAA pattern, explicit, blank-line separated | ✅ | Every one of the 20 has literal `// Arrange` / `// Act` / `// Assert` comments with blank lines. Verified individually, including inside both `it.each` bodies. |
| One logical assertion per test | ✅ | The multi-`expect` tests each assert one *fact*: the L529 `it.each` asserts "this URL is safe and well-formed" across four facets; L632's `not.toBe('')` is a sharpening of the same fact, not a second one. |
| No shared mutable state | ✅ | Every test constructs its own `env` literal. No `beforeEach`, no module-level mutable fixture, **no `process.env` mutation** — which is what makes them order-independent and parallel-safe. |
| No `it.skip` | ✅ | Zero in the file. |
| No `any` | ✅ | The env parameter is typed `{ PUBLIC_DIRECTUS_URL?: string \| undefined } \| undefined`. No `any`, no `as`, no non-null `!` in the new code. |
| Mock external services | N/A | Nothing external to mock — the resolver is pure. Notably it required **no** `vi.mock`, no `global.fetch` stub, and no env mutation, which is precisely why importing the real function was viable. |
| Never mock the DB | N/A | No DB. |
| Coverage: 80% line / 70% branch / 100% error paths | ✅ **100% of both** | The resolver has exactly three branches: `typeof configured !== 'string'` → default; `trimmed.length > 0` → configured; else → default. All three are covered, each by multiple tests. There is no error path to cover because the function is **total** — it cannot throw, it falls back. Every reachable line executes. |

**Test-name quality** — worth noting because it is the thing that decays first:
the names state behavior and its reason, e.g. *"does not strip a trailing slash
(no existing helper in this app does)"* and *"reads the env passed at CALL time,
not a value frozen at module load"*. The second is the single most valuable
name in the file: it tells a future reader what the test is defending against,
so it cannot be deleted as redundant by someone who does not know the
`import.meta.env` history.

---

## Tests Written

### Unit

| File | Count / Focus | Required? |
|---|---|---|
| `apps/web-next/src/lib/cms-content-pages.test.ts` | **0 written this step.** Inherited: 20 tests added by CodeDeveloper (37 → 57), covering AC-1/2/3/4/5/8/10 plus client-bundle safety. Audited above; standard-compliant; no gaps. | Yes — already satisfied |

### Integration

| File | Count / Focus | Required? |
|---|---|---|
| — | None | **No** — rubric score 0. No DB, API, queue, or container-backed dependency exists in the call path. Testcontainers has nothing to containerize. |

### E2E

| File | Count / Focus | Required? |
|---|---|---|
| — | None | **No** — rubric score 0 (threshold 6). Assessed and declined in `06-test-strategy.md`; the `web-next` E2E suite is non-CI-gating and prod-targeted, and prod is precisely where the override is deliberately unset. |

---

## Acceptance Criteria Coverage

| AC | Test | Status |
|---|---|---|
| AC-1 Default preserves production | `resolvePublicDirectusUrl — default preserves production (AC-1)` × 3 (absent key / explicit `undefined` / no argument at all) | ✅ Covered |
| AC-2 Override honored | `resolvePublicDirectusUrl — override is honored (AC-2)` × 3 (verbatim / trimmed / trailing slash preserved) | ✅ Covered |
| AC-3 Download href follows override | `resolvePublicDirectusUrl — download href follows the override (AC-3)` × 1, exact-match on `<override>/assets/<uuid>?download` | ✅ Covered |
| AC-4 Empty / whitespace = unset | `resolvePublicDirectusUrl — empty is treated as unset (AC-4)` `it.each` × 4, plus `not.toBe('')` | ✅ Covered |
| AC-5 Internal origin never leaks | FR-CMS-008 guards kept **verbatim** (L489–517) + new `it.each` × 5 against the **real** resolver | ✅ Covered (extended, not replaced) |
| AC-6 Realm independence | No test — **by design**. Source-shape property; verified in `04-security-review.md` against shipped code. Dismissal 2 above. | ✅ Covered by review |
| AC-7 Internal SSR path unchanged | No test — **by design**. `cms.ts:79–81` confirmed byte-unchanged at line level; `cms.test.ts`'s internal-base suite still passes. Dismissal 3 above. | ✅ Covered by diff + existing suite |
| AC-8 Both consumers agree | `resolvePublicDirectusUrl — both public consumers agree (AC-8)` × 1, **plus** the structural guarantee (one resolver, one default constant) | ✅ Covered |
| AC-9 Knob discoverable | No test — documentation AC. `.env.example` L11–29 verified by reading: states browser-facing purpose, the `https://cms.aiqadam.org` default, and the `INTERNAL_DIRECTUS_URL` contrast — all three elements AC-9 names. | ✅ Covered by doc review |
| AC-10 Runtime, not build-time | `resolvePublicDirectusUrl — runtime mechanism, not build-time (AC-10)` × 2 (call-time evaluation; client-bundle safety), **plus** compiled-artifact verification and the Orchestrator's independent `tsx` run with runtime `process.env` mutation | ✅ Covered |

**10 / 10 covered.** No AC is unverified, and none is verified by a test that
could not fail for the bug it exists to catch.

---

## Known Test Gaps

**None requiring action.** No `// TODO` was added to any source or test file —
there is nothing pending.

Two items are recorded as *deliberate non-coverage*, so they are not
rediscovered later as oversights:

1. **No test exercises `directusBase()`'s client branch directly.** Not
   writable without exporting a module-private function or mutating
   `globalThis.window` (vitest runs `environment: 'node'`). AC-8's property is
   guaranteed structurally instead — stronger than a test. Deliberate; do not
   "fix."
2. **No test asserts the resolver rejects `http://`.** Deliberate and
   load-bearing: `04-security-review.md` ruled that non-https must **not** be
   rejected in code. Such a test would encode the opposite of the reviewed
   design and would invite a future developer to "fix" the code toward the
   rejected behavior. Do not add it. If the security verdict ever flips (the
   review states the exact conditions — a subresource sink, or the asset folder
   ceasing to be public-read), the test and the code change together.

---

## Gate Result

gate_result:
  status: passed
  summary: "No new tests written — the correct outcome. All four candidate gaps identified by TestStrategist were independently verified and upheld, two of them proving stronger than stated (not writable without changing production code). The inherited 20 tests were audited against standards.md §IV and comply on every rule, with 100% line and branch coverage of the resolver's three branches. 10/10 ACs covered."
  findings:
    - "ZERO TESTS WRITTEN THIS STEP, BY DESIGN. The brief allows 'coverage is already sufficient' as a legitimate outcome and that is the finding. No test file was added, removed, or modified; no // TODO was left anywhere. What this step contributes is independent verification of the four dismissals rather than acceptance of them."
    - "DISMISSAL 1 (directusBase client-branch test) UPHELD AND STRONGER THAN STATED — not merely unnecessary, NOT WRITABLE without changing production code. Verified two independent blockers against the repo: (a) I enumerated all 32 exports in cms.ts — resolvePublicDirectusUrl (L57) is the ONLY new export, and directusBase / publicAssetUrl / assetUrl / sourceFileDownloadUrl are all absent, so a test would require exporting a module-private function purely for testing; (b) apps/web-next/vitest.config.ts:23 sets environment: 'node', so there is no window to make defined, and forcing it via globalThis.window would introduce shared mutable global state that standards.md §IV explicitly forbids. AC-8's property is instead guaranteed STRUCTURALLY: exactly one DEFAULT_PUBLIC_DIRECTUS_URL (L20) and one resolver, called from both L85 and L933 — divergence is inexpressible, not untested."
    - "DISMISSAL 2 (AC-6 source-shape test) UPHELD — a test here is a category error, unsound in BOTH directions: it would fail on a harmless refactor (a comment mentioning typeof window trips a naive matcher) and pass on a semantically equivalent realm branch written differently (window !== undefined, import.meta.env.SSR, globalThis.window). Code review is the right instrument and it was applied — 04-security-review.md verifies publicAssetUrl() (cms.ts:931-934) is three lines with no realm branch, and correctly distinguishes the resolver's `typeof process` CAPABILITY check from a REALM branch."
    - "DISMISSAL 3 (AC-7 no-change test) UPHELD, WITH A REFINEMENT I am recording rather than overclaiming. I verified the no-change claim at line level: cms.ts:79-81 (the typeof-window SSR branch reading INTERNAL_DIRECTUS_URL) is untouched in the diff — the only edit inside directusBase() is on the CLIENT branch L83-85 plus a comment. The strategist cited cms.test.ts's DIRECTUS_BASE (L100) as covering evidence; precisely, that is the MIRROR's internal base and does not exercise directusBase() directly either, but it does mean an internal-base change would force lockstep updates to ~12 assertions across that 621-line suite (L124/169/196/205/621/...), making a silent regression visible in review. Indirect but real; combined with line-level diff evidence, adequate."
    - "DISMISSAL 4 (URL-validation test) UPHELD EMPHATICALLY — the most important of the four. The resolver's non-validation of URL syntax is now a SECURITY-ADJUDICATED DESIGN DECISION (04-security-review.md rules http:// is accepted by design and code-level rejection must not be added). A validation test would encode the OPPOSITE of the reviewed design into the suite, and the next developer would 'fix' the code to satisfy it — reintroducing the rejected behavior laundered through a green test. Tests must not contradict an explicit security ruling."
    - "INHERITED TESTS AUDITED AGAINST standards.md §IV — all 20 read individually, not sampled. Compliant on every rule: correct file (extends cms-content-pages.test.ts so the FR-CMS-008 guards and new coverage stay adjacent and cannot drift), one describe per behavior named for its AC, literal Arrange/Act/Assert comments with blank lines in every test INCLUDING both it.each bodies, one logical assertion each, zero shared mutable state (every test builds its own env literal; no beforeEach, no process.env mutation — hence order-independent and parallel-safe), zero it.skip, zero any/as/non-null-!."
    - "COVERAGE IS 100% LINE AND 100% BRANCH ON THE RESOLVER, exceeding the 80/70 target. It has exactly three branches — typeof configured !== 'string' -> default; trimmed.length > 0 -> configured; else -> default — and all three are covered by multiple tests each. There is no error path to cover because the function is TOTAL: it cannot throw, it falls back."
    - "10/10 ACs COVERED. Seven by unit test (AC-1/2/3/4/5/8/10), three by the instrument matching their nature: AC-6 by security review of shipped source, AC-7 by line-level diff evidence plus an unchanged passing suite, AC-9 by reading .env.example L11-29 and confirming it states all three elements the AC names (browser-facing purpose, the https://cms.aiqadam.org default, the explicit INTERNAL_DIRECTUS_URL contrast)."
    - "TEST-NAME QUALITY NOTED because it is what decays first: names state behavior AND reason — 'does not strip a trailing slash (no existing helper in this app does)' and 'reads the env passed at CALL time, not a value frozen at module load'. The latter is the most valuable name in the file: it tells a future reader what the test defends against, so it cannot be deleted as redundant by someone who does not know the import.meta.env history."
    - "TWO DELIBERATE NON-COVERAGE ITEMS RECORDED so they are not rediscovered as oversights: (1) no direct directusBase() client-branch test — do not 'fix' by exporting it; (2) no http://-rejection test — do not add it; if the security verdict ever flips (04-security-review.md names the exact conditions: a subresource sink, or the asset folder ceasing to be public-read), the test and the code change together."
