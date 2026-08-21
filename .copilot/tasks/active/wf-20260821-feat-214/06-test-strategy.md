# 06 — Test Strategy

**Workflow:** `wf-20260821-feat-214`
**Agent:** TestStrategist
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009`

---

## Requirement

**`FR-CMS-009` — Environment-configurable public Directus origin.**

The hardcoded `PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org'` in
`apps/web-next/src/lib/cms.ts` becomes an exported, pure, injectable
`resolvePublicDirectusUrl(env?)` reading `process.env.PUBLIC_DIRECTUS_URL` at
**SSR runtime**, defaulting to the production value when unset / empty /
whitespace-only. Both public consumers (`directusBase()`'s client branch,
`publicAssetUrl()`) call the one resolver. `publicAssetUrl()` stays
realm-independent, preserving FR-CMS-008's MAJOR-2 invariant.

Ten ACs (AC-1..AC-10) are defined in `01-requirement-validation.md`.

---

## Rubric Score

| Criterion | Applies? | Points |
|---|---|---|
| Touches tenant-scoped data | No — no DB access at all | 0 |
| New API endpoint | No — `apps/api` entirely untouched | 0 |
| Business rule with edge cases | No — no capacity/waitlist/date logic. The empty/whitespace/trim cases are *input-normalization* edge cases of a pure function, not business-rule edge cases. | 0 |
| Cross-module service call | No — no new service call; the emitted URL is a browser navigation target, not a server-to-server call | 0 |
| New database query | No | 0 |
| Pure function / utility | **Yes — this is exactly what the change is** | 0 |
| UI-only change (no logic) | Partially (the rendered `href` origin) | 0 |

**Score: 0.**

**Required level: Unit tests only** (score < 4). Integration and E2E are not
merely "not required" — they have nothing to exercise. There is no container to
start, no schema to migrate, no endpoint to call.

This is the lowest-scoring change shape the rubric can produce, and correctly
so: the entire diff is one total, synchronous, side-effect-free string function
plus two call sites and three comment/doc files.

---

## Required Test Levels

- [x] **Unit (Vitest)** — required, and sufficient.
- [ ] Integration (Testcontainers) — **not required.** Score 0 (< 4). No DB,
      no API, no queue, no container-backed dependency exists in the call path.
      Nothing to spin up; an integration test here would assert a pure function
      through an irrelevant container.
- [ ] E2E (Playwright) — **not required.** Score 0 (< 6). Reasoning expanded in
      the E2E section below, because the brief asked for it to be assessed
      rather than assumed.

---

## Assessment of CodeDeveloper's existing 20 tests

CodeDeveloper wrote tests before this step (37 → 57 in
`cms-content-pages.test.ts`). The strategist's job here is therefore not to
plan from zero but to **audit that coverage against the 10 ACs and identify
genuine gaps**. I mapped every AC to the shipped test file line by line.

### Verdict: coverage is sufficient. No additional tests are required.

That is a substantive finding, not a rubber stamp — the mapping below shows
which specific test covers each AC, and the three ACs that have *no direct
test* are explained rather than glossed over.

### The convention departure — importing the real resolver instead of mirroring

**Judged SOUND. Endorsed. This is the correct call and it should be kept.**

The directory's `local re-implementation mirror` convention exists for one
narrow reason, stated at `cms.test.ts:14–15`: the real module reads
`process.env` inside `directusBase()` and calls the real global `fetch`, so
importing it would force `vi.mock` of both. The convention is a workaround for
*untestable dependencies*, not a value in itself.

`resolvePublicDirectusUrl` has neither dependency. It is pure, synchronous,
performs no I/O, and takes its env as an **injectable parameter** — so
importing it costs nothing the convention was designed to avoid. No `vi.mock`,
no `global.fetch` stub, no `process.env` mutation. The stated precondition for
mirroring is simply absent.

More decisively: **mirroring would have been actively harmful here**, and this
is not a stylistic point. The entire subject of FR-CMS-009 is *which mechanism
the function reads* — `process.env` (live) versus `import.meta.env`
(build-frozen). A mirrored copy would necessarily be written with whichever
mechanism the test author chose, and would pass regardless of what the shipped
module does. That is precisely the failure mode documented in
`01-requirement-validation.md` R3 and re-flagged in `02-impact-analysis.md`
("the code would review cleanly, the unit tests could even pass if they mocked
`import.meta.env`, and QA would still emit `https://cms.aiqadam.org`"). A
mirror here would be a test that *cannot fail for the bug it exists to catch* —
the worst possible test.

The departure is also correctly **scoped and documented**: exactly one import,
a comment block at the file head (L8–16) explaining why, every other helper
still mirrored, and `PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test'` (the
deliberate `.test`, not `.org`) preserved so a base regression in the mirrored
half stays visible.

**No action.** I explicitly considered mandating a mirror for consistency and
reject it: consistency with a convention would here defeat the purpose of the
test.

---

## Unit Test Plan

| Target | Happy Path | Failure / Edge Paths | Status |
|---|---|---|---|
| `resolvePublicDirectusUrl(env)` — override | Configured origin returned verbatim (`https://cms.qa.aiqadam.org`) | Surrounding whitespace trimmed; trailing slash **not** stripped (pinned as intended behavior, not incidental) | ✅ Covered — `describe` at L594, 3 tests |
| `resolvePublicDirectusUrl(env)` — default | Absent key → `https://cms.aiqadam.org` | Explicit `undefined` value → default; **no argument at all** → default (exercises the real `process.env` path without mutating it, since CI sets no override) | ✅ Covered — `describe` at L556, 3 tests |
| `resolvePublicDirectusUrl(env)` — degenerate input | — | `''`, `' '`, `'\t  '`, `'\n'` → default, **and** explicitly `not.toBe('')` so a relative-URL regression fails loudly | ✅ Covered — `describe` at L631, `it.each` × 4 |
| `resolvePublicDirectusUrl(undefined)` — client-bundle safety | — | `env = undefined` (simulating absent `process`) returns the default without throwing | ✅ Covered — L710 |
| Call-time (not load-time) evaluation | Two calls with different env objects return different results; a third call re-returns the first | — | ✅ Covered — L686, the AC-10 unit half |
| End-to-end href derivation | `<override>/assets/<uuid>?download` exact-match | — | ✅ Covered — L652 |
| MAJOR-2 negative guards vs. the **real** resolver | — | `it.each` × 5 (unset / undefined / empty / whitespace / overridden), each asserting no `directus:8055`, no `//directus`, `^https://`, and `?download$` intact | ✅ Covered — L529 |
| FR-CMS-008 mirrored guards (regression) | Pre-existing derivation tests | Pre-existing negative guards **kept verbatim** | ✅ Unchanged — L430, L480 |

**Totals:** 57 tests in `cms-content-pages.test.ts` (was 37). 1115 tests
repo-wide in `web-next`.

### Gaps considered and dismissed (with reasons — this is where padding would go)

I looked for genuinely missing coverage and found four candidates. All four are
correctly absent. Recording them so a later reviewer does not "helpfully" add
them.

1. **A test for `directusBase()`'s client branch returning the resolver's
   value.** Not writable, and shouldn't be forced. `directusBase()` is
   module-private (not exported) and gated on `typeof window === 'undefined'`;
   testing it would require either exporting it purely for the test (widening
   the module's public surface for no production reason) or stubbing `window`
   in a `environment: 'node'` vitest config. AC-8 is satisfied
   **structurally** — there is now exactly one resolver and one
   `DEFAULT_PUBLIC_DIRECTUS_URL` in the file, so two divergent public bases are
   *impossible to express*, not merely untested. A structural guarantee is
   strictly stronger than a test.
2. **A test asserting `publicAssetUrl()` has no `typeof window` branch (AC-6).**
   This is a property of the source text, not of runtime behavior. A test that
   greps its own source file is a lint rule wearing a test costume, and it
   would break on any harmless refactor. AC-6 is verified by SecurityReviewer
   against the shipped code (`04-security-review.md`, MAJOR-2 table) — the
   right instrument for a structural invariant.
3. **A test for `directusBase()`'s SSR branch (AC-7).** AC-7 is a
   *no-change* assertion. The correct evidence is the diff, which shows
   `cms.ts:79–81` byte-unchanged, plus `cms.test.ts`'s existing
   `DIRECTUS_BASE = 'http://directus:8055'` mirror (L100) and its 621-line
   suite still passing. Adding a new test for behavior this PR did not touch
   is padding, and would falsely imply the PR owns that behavior.
4. **A URL-shape/parse test (e.g. `new URL(base)` succeeds).** Deliberately
   not added. The resolver intentionally does **not** validate URL syntax —
   see the `http://` adjudication in `04-security-review.md`. A test asserting
   validation would contradict the shipped, security-reviewed design.

---

## Integration Test Plan

| Scenario | Infrastructure | Key Assertions |
|---|---|---|
| — | — | **None. Not required and nothing to test.** |

Rubric score 0 (< 4). No database, no API endpoint, no queue, no external
service in the call path. `apps/api/**` has zero files in the diff, confirmed
directly. Testcontainers has nothing to containerize here.

Per the TestRunner protocol, "integration tests are mandatory" means *not
silently skipped* — this is a reasoned N/A with the rubric score and the
verified absence of an API surface behind it, which is the documented
alternative to a skip.

---

## E2E Test Plan

| User Flow | Entry Point | Exit Assertion |
|---|---|---|
| — | — | **None. Assessed and declined.** |

The brief asked for this to be *assessed*, not assumed, and noted FR-CMS-008's
precedent. Assessment:

- **Rubric:** score 0, threshold is ≥ 6. Not close.
- **CI would exercise only the default path.** CI sets no `PUBLIC_DIRECTUS_URL`,
  so an E2E run would assert `https://cms.aiqadam.org/assets/<uuid>?download` —
  byte-identical to pre-change behavior, i.e. it would duplicate AC-1 at
  container-startup cost and prove nothing about the *new* code path.
- **Making it prove something requires CI infrastructure this PR must not
  add.** To exercise AC-2/AC-3 end-to-end, the E2E job would need
  `PUBLIC_DIRECTUS_URL` injected into the web-next container *and* a reachable
  Directus at that origin. That is new CI config plus the very QA vhost that is
  the named out-of-scope infra dependency (T-0141). Building it here would pull
  the deferred infra work into this PR through the back door.
- **The rendered `href` is already E2E-covered by FR-CMS-008**, whose test
  asserts the download link on `/rules/<slug>`. That test continues to pass and
  continues to guard the sink.
- **FR-CMS-008's precedent is sound and applies unchanged.** It declined E2E
  because the `web-next` E2E suite is **non-CI-gating and prod-targeted** — it
  runs against the deployed production site, not a CI-local stack. A
  prod-targeted suite structurally *cannot* verify an override, since prod is
  exactly the environment where the override is deliberately unset. Re-deriving
  the same conclusion from the same facts confirms it rather than inheriting it.

**Declined for merge.** Behavioral verification of AC-2/AC-3 in a real browser
belongs to the T-0141-adjacent infra follow-up, where a QA Directus vhost will
exist to point at — recorded as a named deferral in `02-impact-analysis.md`,
not a silent drop.

---

## Acceptance Criteria → Test Mapping

| AC | Test Level | Test Description | Covered by |
|---|---|---|---|
| **AC-1** Default preserves production | Unit | Absent key, explicit `undefined`, and no-argument all → `https://cms.aiqadam.org`. The no-argument case exercises the real `process.env` path. | `cms-content-pages.test.ts` L557, L570, L581 |
| **AC-2** Override honored | Unit | Configured origin returned verbatim; whitespace trimmed; trailing slash preserved. | L595, L607, L620 |
| **AC-3** Download href follows override end-to-end | Unit | Exact match on `https://cms.qa.aiqadam.org/assets/<uuid>?download` — origin swapped, `?download` (FR-CMS-008 AC-6) intact. | L653; reinforced by the AC-5 `it.each`'s `?download$` assertion |
| **AC-4** Empty / whitespace treated as unset | Unit | `it.each` over `''`, `' '`, `'\t  '`, `'\n'` → default, plus `not.toBe('')` guarding the relative-URL failure mode. | L632–650 |
| **AC-5** Internal origin never leaks (MAJOR-2 guard) | Unit | Pre-existing mirrored guards **kept verbatim** (L489–517), **extended** by a 5-case `it.each` running the **real** resolver under unset/undefined/empty/whitespace/overridden — each asserting no `directus:8055`, no `//directus`, `^https://`. | L489–517 (kept) + L529–546 (new) |
| **AC-6** Realm independence preserved | **Structural** (not unit-testable) | `publicAssetUrl()` gained no `typeof window` branch. Verified by SecurityReviewer against shipped code (`04-security-review.md` MAJOR-2 table row 1) — a source-shape property, not a runtime behavior. See dismissed-gap #2. | `04-security-review.md` |
| **AC-7** Internal SSR path unchanged | **Diff evidence + existing suite** | A no-change assertion. `cms.ts:79–81` is byte-unchanged in the diff; `cms.test.ts`'s `DIRECTUS_BASE = 'http://directus:8055'` mirror and its full suite still pass. See dismissed-gap #3. | Diff + `cms.test.ts` (unchanged, passing) |
| **AC-8** Both public consumers agree | Unit + **Structural** | Test at L668 pins the property; more strongly, both consumers now call the single resolver and only one `DEFAULT_PUBLIC_DIRECTUS_URL` exists in the module, so divergence is inexpressible. | L668 + `cms.ts:85`, `cms.ts:933` |
| **AC-9** Knob discoverable | **Documentation review** | `apps/web-next/.env.example` L11–29 states purpose (browser-facing), the `https://cms.aiqadam.org` default, and the explicit contrast with `INTERNAL_DIRECTUS_URL` — all three elements AC-9 names. Verified by reading the file. Both compose files carry matching comment blocks. Not unit-testable and should not be faked with a file-content assertion. | `.env.example`; `docker-compose.qa.yml` L262–276; `docker-compose.prod.yml` L110–117 |
| **AC-10** Runtime, not build-time | Unit + **compiled-artifact verification** | Unit half: L686 proves call-time evaluation (different env objects → different results, order-independent). The decisive half is artifact-level — the compiled `dist/server/chunks/cms_*.mjs` contains a live `process.env` read with no Vite-inlined frozen literal, and mutating `process.env` mid-process changed the result with **no rebuild**. Independently re-verified by the Orchestrator by executing the real module via `tsx`. | L686 + `03-code-summary.md` §1 + Orchestrator's independent `tsx` run |

**All 10 ACs are covered.** Seven by unit tests (AC-1/2/3/4/5/8/10), and three
by the instrument appropriate to their nature — structural/security review
(AC-6), diff evidence plus an unchanged passing suite (AC-7), and documentation
review (AC-9). None is unverified, and none is verified by a test that could
not fail.

---

## Notes for TestDesigner

**Write no new tests.** The existing 20 are sufficient and correctly targeted;
the four candidate gaps above are each dismissed with a reason. Adding tests
for AC-6/AC-7/AC-9 would produce source-grepping assertions, no-change padding,
or a test contradicting the security-reviewed design.

Confirm the four dismissals independently rather than accepting them, then
record the outcome. "No new tests required" is the expected result of this
step, not a failure of it.

---

## Gate Result

gate_result:
  status: passed
  summary: "Rubric score 0 — unit tests only, which is both required and sufficient. CodeDeveloper's 20 existing tests were audited AC-by-AC against the shipped file: all 10 ACs are covered, 7 by unit tests and 3 by the instrument appropriate to their nature. No additional tests are needed; four candidate gaps were considered and each dismissed with a reason. The real-resolver import is endorsed as sound."
  findings:
    - "RUBRIC SCORE 0 (unit only). Zero on every criterion: no tenant data, no API endpoint (apps/api has zero files in the diff — verified directly), no business-rule edge cases (the empty/whitespace cases are input normalization of a pure function, not business logic), no cross-module call (the emitted URL is a browser navigation target, not a server-to-server call), no DB query. The whole diff is one total synchronous side-effect-free string function plus two call sites and three comment/doc files — the lowest-scoring shape the rubric can produce, correctly."
    - "COVERAGE IS SUFFICIENT — NO NEW TESTS REQUIRED. This is an audited conclusion, not a rubber stamp: every AC is mapped to a specific line in the shipped test file. AC-1 (L557/570/581), AC-2 (L595/607/620), AC-3 (L653), AC-4 (L632-650), AC-5 (L489-517 kept + L529-546 new), AC-8 (L668), AC-10 (L686). 57 tests in the file, 1115 repo-wide in web-next."
    - "THE THREE ACs WITH NO DIRECT UNIT TEST ARE COVERED BY THE RIGHT INSTRUMENT, NOT UNCOVERED. AC-6 (no typeof-window branch in publicAssetUrl) is a source-SHAPE property — a test grepping its own source file is a lint rule in a test costume that breaks on harmless refactors; SecurityReviewer verified it against shipped code. AC-7 is a NO-CHANGE assertion whose correct evidence is the diff (cms.ts:79-81 byte-unchanged) plus cms.test.ts's existing internal-base mirror still passing; a new test would be padding and would falsely imply this PR owns that behavior. AC-9 is a documentation AC verified by reading .env.example L11-29, which states all three elements it names (browser-facing purpose, the default, the INTERNAL_DIRECTUS_URL contrast)."
    - "FOUR CANDIDATE GAPS CONSIDERED AND DISMISSED WITH REASONS (recorded so a later reviewer does not helpfully add them): (1) a directusBase() client-branch test would require exporting a module-private function purely for testing or stubbing window in a node-environment vitest config — AC-8 is satisfied STRUCTURALLY instead, since one resolver and one DEFAULT constant make divergent bases inexpressible, which is strictly stronger than a test; (2) an AC-6 source-shape test — see above; (3) an AC-7 no-change test — see above; (4) a URL-parse/validation test would CONTRADICT the security-reviewed design, which deliberately does not validate URL syntax."
    - "THE REAL-RESOLVER IMPORT IS SOUND — ENDORSED, KEEP IT. The mirror convention exists for one stated reason (cms.test.ts:14-15): the real module reads process.env and calls global fetch, so importing forces vi.mock of both. resolvePublicDirectusUrl has NEITHER dependency — pure, synchronous, env injected as a parameter — so the convention's precondition is simply absent. Decisively, mirroring would have been ACTIVELY HARMFUL: the entire subject of this FR is WHICH MECHANISM the function reads, so a local copy would assert the mirror's mechanism and pass regardless of what ships — exactly the 'tests pass, QA still emits the production URL' failure documented in 01/R3. A mirror here would be a test that cannot fail for the bug it exists to catch. The departure is correctly scoped: one import, a documented comment block at L8-16, every other helper still mirrored, and PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test' (deliberate .test not .org) preserved."
    - "INTEGRATION NOT REQUIRED — reasoned N/A, not a skip. Score 0 (<4). No DB, no API, no queue, no container-backed dependency; Testcontainers has nothing to containerize. apps/api/** has zero files in the diff, verified directly."
    - "E2E ASSESSED AND DECLINED (the brief asked for assessment, not assumption). Score 0 vs a threshold of 6. Four independent reasons: CI sets no override so an E2E run would assert the byte-identical default path, duplicating AC-1 at container cost while proving nothing about the new code; making it meaningful would require injecting the var into the CI web-next container AND a reachable Directus at that origin — i.e. pulling the deferred T-0141 QA-vhost infra into this PR through the back door; FR-CMS-008's E2E already covers the rendered href and still passes; and FR-CMS-008's precedent is sound on re-derivation — the web-next E2E suite is non-CI-gating and PROD-TARGETED, and a prod-targeted suite structurally cannot verify an override because prod is precisely where the override is deliberately unset. Behavioral AC-2/AC-3 verification belongs to the T-0141-adjacent follow-up, already a named deferral."
    - "AC-10's decisive evidence is artifact-level, not unit-level, and that is correct. The unit test at L686 proves call-time evaluation (different env objects yield different results, order-independent), but only inspecting the COMPILED bundle can prove the import.meta.env trap was avoided. That was done by CodeDeveloper on dist/server/chunks/cms_*.mjs and independently re-verified by the Orchestrator executing the real module via tsx with runtime process.env mutation and no rebuild."
