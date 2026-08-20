# Quality Gate — wf-20260821-feat-213 (FR-CMS-008)

## Workflow Instance

| Field | Value |
|---|---|
| Workflow ID | `wf-20260821-feat-213` |
| Workflow type | `requirement-development` |
| Requirement ref | `FR-CMS-008` |
| Branch | `feature/cms-008-rules-document-downloads` |
| Base branch | `main` |
| `expects_registry_update` | `true` |
| `issues_created` | `[]` (empty) |
| Retry counts | `code-developer: 1` (SecurityReviewer MAJOR-1 + MAJOR-2) |
| Gate run point | **Step 10 — BEFORE Step 11 (commit/push/PR)** |

**Timing context (explicit, so no check below is misread as a failure):** this
gate runs at Step 10, ahead of Step 11's commit/push/PR. Therefore
`handoff.yaml.github_pr_url` is empty and the working tree carries uncommitted
changes. Both are the **expected** pre-commit state, not gate failures. §7's
"`github_pr_url` must be non-empty" is read as a condition on the **final
completed state after Step 11**, per the Orchestrator's standing instruction and
this project's step ordering. What IS verified here instead: branch identity,
diff scope, and formatter cleanliness — all independently re-run below rather
than taken from `07-test-results.md`'s citation.

---

## Step Completion Check

| Step | Agent | Status | Gate Result |
|---|---|---|---|
| 01 | RequirementAnalyst | complete | `passed` |
| 02 | ImpactAnalyzer | complete | `passed` |
| 03 | CodeDeveloper | complete (retry 1) | `passed` (retry: 1) |
| 04 | SecurityReviewer | complete (retry 1) | `passed` (retry: 1) |
| 05 | DBMigrationAuthor | **not run — correctly** | N/A |
| 06 | TestStrategist | complete | `passed` (rubric score **1**) |
| 06 | TestDesigner | complete | `passed` |
| 07 | TestRunner | complete | `passed` |
| 08 | DocWriter | complete | `passed` |
| 09 | QualityGate | this file | see Gate Result |

**No `failed-*` gate was left un-retried.** The one retry cycle (CodeDeveloper
retry 1, driven by SecurityReviewer's two MAJOR findings) closed with both
findings `RESOLVED` and independently re-verified by SecurityReviewer — the
reviewer explicitly treated the developer's verification table as a hypothesis
and reproduced every claim itself, including negative cases the developer had
not run. Retry limit for `code-developer` is 3; 1 used.

**DBMigrationAuthor correctly not run.** No entity change exists to migrate.
The `content_documents → directus_files` relation lives entirely inside the
Directus-managed schema, mutated via `bootstrap.sh`'s REST calls against
Directus's own metadata API — not a Drizzle/Postgres migration. Confirmed by
the impact analysis's grep across all 17 migrations and by the working-tree
diff, which contains no migration file. `pnpm db:migrate` is not implicated.

---

## Traceability Check

| Check | Result |
|---|---|
| Feature identifier in code summary | ✅ `FEAT-CMS-8 / FR-CMS-008` stated in the summary's first section (2 occurrences) |
| Requirement doc exists | ✅ `docs/03-requirements/FR-CMS-008.md` created this workflow |
| ACs map to tests | ✅ `06-test-design.md` § Acceptance Criteria Coverage carries an explicit AC → test table for all 10 ACs plus a MAJOR-2 regression row |
| Parent requirement cross-referenced | ✅ FR-CMS-008 → FR-CMS-007 (Description + Notes); FR-CMS-007 → FR-CMS-008 (Functional scope §2, added by DocWriter) |

**AC → test mapping (from `06-test-design.md`, verified present):** AC-5, AC-6,
AC-7, AC-8 and the MAJOR-2 guard are covered by the 15 new unit tests. AC-1,
AC-2, AC-3, AC-4, AC-9 and the server half of AC-6 are covered but **not
automated** — each with a stated reason, not an omission. See §Production-
Readiness below for the per-AC verification verdict.

---

## Test Coverage Check

| Check | Result |
|---|---|
| Rubric score | **1** (`06-test-strategy.md` L25) — unit tests sufficient |
| Integration tests required? | **No** — score 1 < 4 threshold |
| Integration tests present? | None. Correctly N/A: no `apps/api`/NestJS surface exists in this diff (confirmed independently by grep in `02-impact-analysis.md` and by `git status` showing no `apps/api` file) |
| E2E present? | None — deliberate strategy decision, not an omission (see below) |
| All tests pass? | ✅ **1096/1096** across 44 files in `apps/web-next`; 15 new this workflow; 0 failed, 0 skipped |
| `it.skip` / `describe.skip` / `test.skip` | ✅ **0** — re-verified by me: `grep -c "it\.skip\|describe\.skip\|test\.skip" apps/web-next/src/lib/cms-content-pages.test.ts` → `0` |
| `@flaky` tags | ✅ **0** — re-verified by me: `grep -c "@flaky"` → `0` |
| Coverage (80% line / 70% branch) | ✅ 100% branch coverage of both new helpers (`publicAssetUrl`, `sourceFileDownloadUrl`) per `06-test-design.md`; target file 23 → 38 tests |
| Typecheck | ✅ `pnpm typecheck` repo-wide, 4/4 turbo tasks, 0 errors |
| `pnpm arch:check` | ✅ 289 files, mode=full, 0 violations |
| `pnpm build` | ✅ 4/4 turbo tasks (one pre-existing storybook turbo-outputs warning, present before this branch) |

**E2E omission accepted as a reasoned decision, not a gap.** The strategy
explicitly *recommends against* adding one rather than merely calling it
optional: `apps/e2e` has been un-wired from CI since 2026-07-26 per its own
README, and its `/rules` specs target production, where `source_file` stays null
until an operator seeds. A download-link assertion would therefore fail for an
indeterminate window and then start passing with no code change —
flaky-by-construction, which §3's own `@flaky` prohibition exists to prevent.
The existing `smoke-content-pages.spec.ts` already exercises the null-`source_file`
path (AC-8) for free. Accepted.

**Test-quality note worth recording:** MAJOR-2 is guarded **negatively** (the
emitted URL must not contain `directus:8055` or `//directus`, and must match
`^https://`), not only positively against a mirrored constant. A positive-only
assertion would have been near-tautological; the negative one is what actually
catches a regression back to `directusBase()`. This is the right construction.

---

## Security Check

| Check | Result |
|---|---|
| All 11 invariants | ✅ **PASS** — re-checked by SecurityReviewer against the retry diff, not just the original |
| BLOCKER findings | ✅ **None**, in either pass |
| MAJOR findings | ✅ **None outstanding.** Both raised in the original pass, both **RESOLVED** in retry 1 |
| New findings introduced by the fix | ✅ **None** |
| Gate status | `passed` (retry: 1), `blocking_acs: []` |

**MAJOR-1 (anonymous `/assets/:id` returned 403) — RESOLVED and independently
re-verified.** This finding disproved the premise the feature was originally
built on: `bootstrap.sh` had twelve `directus_files` *relation* blocks and zero
*permission* grants, and the cited "precedent" collections are all empty so the
path had never been exercised. The fix is a dedicated `public-documents` folder
plus a `directus_files` read grant **filtered to that folder** with an explicit
six-field allowlist. SecurityReviewer had warned that a blunt fix would itself be
a security finding, then **designed and ran eight bypass probes of its own** to
confirm the scoping actually holds: filter inversion (`_null`, `_neq`),
`fields=*`, explicit private-field requests (`storage`, `filename_disk`,
`uploaded_by`, `metadata` → 403), `limit=-1`, `aggregate[count]` (constrained —
no count-oracle side channel), and relational traversal through `source_file`.
None widened the exposure. Net anonymous surface: six non-sensitive metadata
fields on operator-placed files in one named folder.

**MAJOR-2 (internal Docker hostname in the public `href`) — RESOLVED, zero
regression.** `publicAssetUrl()` uses an unconditional module constant with no
`process.env` read and no `typeof window` branch. SecurityReviewer verified the
no-regression claim **mechanically** rather than from the summary: `git diff -U0`
on `cms.ts` contains zero `-` lines touching `assetUrl` or any of its call sites,
and `assetUrl()`'s body is byte-identical.

**Two non-blocking items correctly dispositioned, not swept:**
- `assetUrl()` retains the internal-base flaw for its pre-existing callers.
  Pre-existing and currently unexercised (all four collections empty), explicitly
  **not** raised against this PR by SecurityReviewer, and documented in Known
  Limitations with a named trigger. **Now also recorded in FR-CMS-008.md's Notes**
  ("should be fixed before any of those collections ships real data — worth a
  tracked follow-up issue"). Not blocking; see Final Assessment for the one
  recommendation this gate makes.
- `ensure_perm_for_policy` compares only (policy, collection, action), so it
  would not *tighten* a pre-existing broader grant. Pre-existing helper behaviour
  used by dozens of existing grants; verified no such grant exists on any
  instance. Advisory only.

**Environment hygiene verified twice.** SecurityReviewer checked restoration
**before** touching anything (so it reflects the state CodeDeveloper actually
left: 0 files, 0 folders, 0 `directus_files` perms, allowlist back to 8 fields,
5 rows intact), then removed and re-verified its own artifacts afterwards. No
repo file, `.env`, or seed data was modified.

---

## Branch and Commit Readiness

| Check | Result | Verdict |
|---|---|---|
| `handoff.yaml.branch` matches `git rev-parse --abbrev-ref HEAD` | `feature/cms-008-rules-document-downloads` = `feature/cms-008-rules-document-downloads` | ✅ **PASS** |
| `pnpm biome check` on this PR's changed files | **Re-run by me, not trusted from the citation:** `pnpm biome check` on `cms.ts`, `cms-content-pages.test.ts`, `en.json`, `ru.json` → `Checked 4 files in 8ms. No fixes applied.` | ✅ **PASS** |
| `.astro` scoping justified? | **Verified independently:** `biome.json` L14/L20 exclude `.astro/**` and `**/*.astro` repo-wide. The changed `.astro` file is genuinely not a Biome target — the scoping in `07-test-results.md` is legitimate, not a convenient narrowing | ✅ **PASS** |
| Shell scripts | Not Biome targets; `bash -n` clean on both (`shellcheck` unavailable on this machine — but both scripts were *executed* against live Directus, materially stronger evidence than a static lint pass) | ✅ **PASS** |
| No unrelated / unexpected files in the diff | **Verified file-by-file below** | ✅ **PASS** |
| `git status --porcelain` empty | **Not empty — EXPECTED at Step 10.** Commit happens at Step 11 | ⏭️ Deferred to Step 11 |
| `git status -sb` shows `[up to date with origin/<branch>]` | Branch not yet pushed — **EXPECTED at Step 10** | ⏭️ Deferred to Step 11 |
| `handoff.yaml.github_pr_url` non-empty | Empty — **EXPECTED at Step 10.** Populated by `workflow-finish.sh` at Step 11 | ⏭️ Deferred to Step 11 |

### Diff-scope audit (every path accounted for)

| Path | Expected? | Why |
|---|---|---|
| `infrastructure/directus/bootstrap.sh` | ✅ | AC-1, AC-2 + MAJOR-1 folder/grant |
| `infrastructure/directus/seed-content-documents.sh` | ✅ | AC-3, AC-4 |
| `apps/web-next/src/lib/cms.ts` | ✅ | AC-5, AC-6 + MAJOR-2 |
| `apps/web-next/src/pages/rules/[slug].astro` | ✅ | AC-5, AC-7, AC-8 |
| `apps/web-next/src/locales/en.json` / `ru.json` | ✅ | `rules.download_source` i18n key |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | ✅ | 15 new tests + mirror sync |
| `docs/03-requirements/FR-CMS-008.md` (new) | ✅ | Step 9 |
| `docs/03-requirements/requirements-registry.md` | ✅ | Step 9 |
| `docs/03-requirements/FR-CMS-007.md` | ✅ | Step 9 — one-line forward cross-reference |
| `docs/04-development/security/security.md` | ✅ | Step 9 — corrected Directus asset-permission rule |
| `.copilot/tasks/active/wf-20260821-feat-213/*` | ✅ | Workflow artifacts (01–08 + handoff.yaml) |

**No stray file.** Specifically confirmed absent from the diff, satisfying AC-9
and the scope boundary: no `/about`, `/history`, or `/partners` page; no
`apps/api`, `apps/bot`, `apps/workers`, or `packages/shared-types` file; no
`.env`; no migration file; no `portal-content/` binary (correctly gitignored).

---

## Documentation Check

| Check | Result |
|---|---|
| Required docs updated | ✅ `FR-CMS-008.md` (new), `requirements-registry.md` (2 places) |
| Feature marked implemented | ✅ `status: Implemented` in FR-CMS-008.md frontmatter; `Shipped` in the registry row |
| All 10 ACs present in the FR doc, checked | ✅ One `[x]` per AC-1…AC-10, wording traceable to `01-requirement-validation.md` |
| Format matches FR-CMS-007 | ✅ Same frontmatter key set and section ordering |
| `business_process` | ✅ `—`, **verified against the BP-UAT registry, not copied.** All 21 entries (BP-UAT-000…021) cover auth, events, registration, admin/ops, points, or referral flows; none is a public content/marketing surface |
| Operator note captured durably | ✅ Own top-level heading in FR-CMS-008.md — the two-step order (bootstrap.sh **then** seed script) plus the explicit statement that label-only rendering until both run is **AC-8's correct behaviour, not a defect** |
| Optional cross-reference (a) | ✅ Taken — one additive sentence in FR-CMS-007 Functional scope §2. Correctly minimal: FR-CMS-007's own ACs were never wrong, only incomplete without the pointer |
| Optional correction (b) | ✅ Handled — see below |

**On the disproved claim (candidate b).** DocWriter grepped `docs/` and
`.copilot/` and established the claim exists **only** in this workflow's own
untracked run artifacts (01, 02, and 04 where it is quoted in order to be
refuted) — **not in any tracked doc**, and notably not in FR-CMS-007, which never
made it. Leaving the run artifacts intact is the right call: rewriting a prior
step's artifact would falsify the workflow record, and the disproof already sits
beside them in the same directory.

The response taken is better than a strike-through would have been. Since no
tracked doc stated the *correct* rule either, the gap is what let the assumption
in — so the verified rule was written **positively** into
`docs/04-development/security/security.md` § File uploads → Serving, a file on
CLAUDE.md's mandatory session-start reading list. It records the empirical 403,
that relations are not permissions, that the cited "precedent" collections are
empty and proved nothing, and the six-point scoped-grant pattern. This gate
endorses that as the correct disposition: it closes the inheritance path rather
than only annotating one instance of it.

**Docs correctly NOT updated** (each with a stated reason in `08-doc-update.md`):
`architecture.md` (no module boundary changed; FR-CMS-007's binding note remains
accurate verbatim), no new ADR (the hardcoded folder UUID follows an established
repo precedent — the 8 RBAC policy UUIDs already in the same `bootstrap.sh` —
rather than being a novel architectural decision; the reusable rule went to
`security.md` instead), `standards.md`, `docs/api/`,
`packages/shared-types/README.md`, `docs/runbooks/`, and the BP-UAT registry.
All defensible.

**Pre-existing drift flagged, correctly not fixed:**
`requirements-registry.md:41` reads "All 61 FR files" while the table held 69
rows before this change (70 after). Predates this workflow by many iterations;
fixing it would add unrelated noise to this diff. Recorded so it is not
mistaken for a regression introduced here. **Not a gate failure.**

---

## Status-Consistency Check (FEAT-WORKFLOW-003)

`expects_registry_update: true` → check performed in full. Pair for
`requirement-development`: File A `docs/03-requirements/FR-CMS-008.md`,
File B `docs/03-requirements/requirements-registry.md`.

**8a — both files in the pair appear in the diff.** ✅ **PASS.** Verified against
the **working tree** (the diff that will be committed at Step 11), since
`origin/main...HEAD` currently shows only the handoff/ID-counter commit — the
correct comparison at this step:

```
?? docs/03-requirements/FR-CMS-008.md          (new file)
 M docs/03-requirements/requirements-registry.md
```

Both present.

**8b — status values agree and equal the terminal value.** ✅ **PASS.**

| File | Check | Observed |
|---|---|---|
| A | `grep -E '^status: (Implemented\|Shipped)' FR-CMS-008.md` | `status: Implemented` ✅ |
| B | row matching `FR-CMS-008` in the implementation-order table | `\| 70 \| [FR-CMS-008](FR-CMS-008.md) \| Community Rules & Documents — original source-file download link \| **Shipped** \| **CMS-007** \|` ✅ |
| B | CMS module file list (L32) | includes `· [008](FR-CMS-008.md)` ✅ |

Values agree and both are terminal (`Implemented` / `Shipped`). `Depends on` is
`CMS-007`, matching the requirement's actual parent, and the row is positioned
immediately after row 69 (FR-CMS-007) so dependency order reads correctly.

**8c — atomicity.** ⏭️ **Not yet assessable — no failure.** Neither file is
committed yet; both will land in Step 11's single `workflow-finish.sh` commit,
which satisfies atomicity by construction. Nothing to warn about.

**`.copilot/context/workspace-state.md` not touched.** ✅ Expected. This project
updates it at **Step 11.5 (archive time)**, not at Step 9 — per the standing
convention and confirmed by the Orchestrator's note. **Not counted as a gap.**

---

## GitHub-Issue Link Check (§8.5)

⏭️ **N/A — skipped, condition confirmed absent.** `handoff.yaml.issues_created`
is `[]` and `issue_ref` is `""`. No `ISS-*.md` file was created or modified by
this workflow (confirmed against the working-tree diff — no `.copilot/issues/`
path appears). `scripts/check-github-issue-links.sh` is therefore not applicable
per the check's own scoping rule, which covers only issues this workflow itself
touched.

---

## Production-Readiness / AC Verification (§7.5 — HARD GATE)

Every one of FR-CMS-008's 10 ACs is marked below. **Zero unmarked. Zero
unbounded deferrals.**

| AC | Verdict | Evidence |
|---|---|---|
| **AC-1** — `source_file` field (uuid, nullable) + relation, `SET NULL` | ✅ **verified** | Live Directus 11. SecurityReviewer recreated the full shipping schema and confirmed the field, relation, and `SET NULL` semantics; `GET /fields/content_documents` used for the before/after comparison |
| **AC-2** — `source_file` in the public-read allowlist | ✅ **verified** | Live: anonymous `GET /items/content_documents?filter[slug][_eq]=manifesto&fields=slug,source_file` → `[{"slug":"manifesto","source_file":"00ca7633-…"}]`. The uuid serialises to an anonymous caller, which is precisely what the allowlist append exists to enable |
| **AC-3** — 5 files uploaded and linked by the seed script | ✅ **verified (mechanism)** / operator-run per environment | The `attach_source_file` / `find_existing_file_id` functions were extracted **verbatim via `sed`** from the edited script (not retyped) and executed against live Directus: upload → `200`, asset lands with `folder` set, row's `source_file` PATCHed and readable. The mechanism is proven; running it per environment is the operator step, documented (see below) |
| **AC-4** — re-run creates no duplicate assets | ✅ **verified** | `attach_source_file` run **twice** against live Directus — file count stayed `1`. Additionally SecurityReviewer planted a decoy (two assets both named `Decoy Doc.docx`, one in-folder one out): the shipping folder-scoped query returned the in-folder id while the old unscoped query returned the decoy, confirming the scoping is a real correctness fix |
| **AC-5** — real, working download link, design-system compliant | ✅ **verified** | Live: anonymous `GET /assets/<in-folder-id>?download` → **`HTTP/1.1 200 OK`** with the correct docx `Content-Type`. Design-system compliance: `pnpm arch:check` 0 violations (`no-inline-style` lock holds on the changed `.astro`); classes used are all existing utilities; plain link, no icon (AC-5 makes the icon optional); no raw hex, no new tokens |
| **AC-6** — real filename preserved | ✅ **verified** | Live: **`Content-Disposition: attachment; filename="AI Qadam Manifesto.docx"`**. Client half additionally unit-tested (`?download` asserted both inside the exact-URL equality and standalone) |
| **AC-7** — existing label still rendered, additive | ✅ **verified** | Unit: `keeps sourceDocumentLabel intact alongside the derived URL` + `leaves every other mapped field untouched`. Structural: the label `<p>` is unchanged in the diff, the `<a>` is a sibling |
| **AC-8** — null `source_file` renders as today | ✅ **verified** | Unit: **4 tests across 3 describe blocks** (derivation null→null, normalizer label-survives-without-URL, detail fetcher returns the document not null with `bodyMd` intact). Structural: the wrapper `<div>` is itself guarded on `(sourceDocumentLabel \|\| sourceFileUrl)`, so a row with neither renders byte-identically — no stray `mb-8` spacer |
| **AC-9** — other 3 FR-CMS-007 pages unmodified | ✅ **verified** | Diff audit above: no `/about`, `/history`, or `/partners` file present. Re-confirmed by me via `git status --porcelain` |
| **AC-10** — `arch:check` / `astro check` / `build` pass | ✅ **verified** | `pnpm arch:check` 289 files 0 violations; `pnpm typecheck` 4/4 tasks 0 errors (272 files in web-next, covering `astro check`'s surface); `pnpm build` 4/4 tasks |

### On live-Directus verification counting as legitimate (assessed, not assumed)

Several ACs (1, 2, 3, 4, 5, 6) were verified by SecurityReviewer against a live
Directus rather than by automated tests. **This gate assesses that as genuine
verification under §7.5**, which requires "confirmed by an actual run (test,
curl, manual click, etc.) … Cite the command output" — it does **not** require
the run to be automated. Four properties make this particular evidence
acceptable rather than a dressed-up assertion:

1. **It produced concrete command output**, cited verbatim: HTTP status codes,
   the exact `Content-Disposition` header with the real filename, the exact
   Directus `FORBIDDEN` error body, and per-probe results.
2. **It tested the shipping code, not a paraphrase.** The bootstrap folder and
   permission blocks and the seed script's two new functions were extracted
   **verbatim via `sed` from the edited files** rather than retyped — the single
   most common way live verification goes wrong, explicitly avoided.
3. **It is independent.** SecurityReviewer treated CodeDeveloper's verification
   table as a **hypothesis** and reproduced every claim itself, then went further
   with eight bypass probes and a planted decoy that CodeDeveloper had not run.
   Two of the developer's supporting claims (multipart part ordering; folder-
   scoped filename lookup) were re-tested and independently confirmed real.
4. **Negative cases were included** — out-of-folder `403`, `?download` is not a
   bypass, `GET /folders` `403`, aggregate counts constrained. Verification that
   only checks the happy path is weak; this did not.

**Correctly NOT claimed as regression coverage.** `06-test-strategy.md` and
`07-test-results.md` both state explicitly that this evidence is point-in-time
and the environment has since been torn down, so it proves the ACs **now** but
guards nothing **later**. That honesty is what makes it acceptable here. The
durable guard that remains is the 15 unit tests (notably the negative MAJOR-2
assertion) plus the FR doc's operator note. Accepted.

### Infrastructure-Pre-Flight Invariant

✅ **Satisfied — and it is what produced MAJOR-1.** Local Directus was not
running; SecurityReviewer brought it up per `AGENTS.md` §6.1
(`docker compose up -d postgres directus`, port 8200) **rather than deferring
the check**. The instance retained prior bootstrap state (the `$t:public_label`
policy plus 14 collection grants), which is exactly what made the 403 result
conclusive instead of a fresh-install artifact. Had the deferral been taken, the
feature would have shipped broken-by-default. **No AC is deferred on
infrastructure grounds**, so the deferral-validity branch of this invariant is
not reached.

### Deferral audit

**Zero ACs marked `deferred`.** No follow-up workflow ID is required, and none
is claimed. The operator obligation (run `bootstrap.sh`, then
`seed-content-documents.sh`) is **not a deferred AC** — it is the same
operational class as FR-CMS-007's own `body_md` seeding, it is deliberately
outside the CI path, and the pre-seed state is *itself* an acceptance criterion
(AC-8) that is verified. It is nonetheless documented durably under its own
top-level heading in `docs/03-requirements/FR-CMS-008.md`, and must be repeated
in the PR description at Step 11.

---

## Final Assessment

This workflow is complete and correct at every step, and its most valuable
outcome is one the requirement did not anticipate. The feature was designed on a
premise — that Directus serves `/assets/:id` to anonymous callers without a
`directus_files` permission — that SecurityReviewer disproved empirically by
bringing up live infrastructure rather than deferring the check. Without that,
FR-CMS-008 would have shipped a link that rendered correctly and 403'd on every
click. The fix was then held to a higher bar than the finding demanded: the
reviewer had warned that a blunt `directus_files` grant would itself be a
security finding, and it verified the folder-scoped, field-allowlisted
replacement against eight bypass probes of its own design — filter inversion,
`fields=*`, private-field requests, `limit=-1`, aggregate counts, relational
traversal — none of which widened the exposure. MAJOR-2's no-regression claim was
checked mechanically on the diff rather than read from the summary, and the test
environment was verified restored **before** the reviewer touched anything, so
the restoration claim reflects reality rather than a post-hoc reconstruction.

All 10 ACs are verified with cited evidence; none is deferred. Tests are
1096/1096 with 15 new, zero `it.skip`, zero `@flaky`; typecheck, `arch:check`,
and `build` are clean; and I re-ran `pnpm biome check` on this PR's four changed
TS/JSON files myself rather than trusting the citation — clean, with the
`.astro` scoping independently confirmed legitimate against `biome.json`'s own
repo-wide exclusion. Documentation is complete: FR-CMS-008.md carries
`status: Implemented`, the registry carries a `Shipped` row depending on
CMS-007, and both agree. The operator's two-step obligation is captured under
its own heading with the explicit note that label-only rendering until then is
AC-8's correct behaviour rather than a defect — the single most likely thing to
be misread as a bug after merge. DocWriter also closed the path by which the
false premise entered: finding it in no tracked doc, it wrote the *correct* rule
into `security.md`, which is on the mandatory session-start reading list.

**PASS.** The Orchestrator may proceed to Step 11 (commit, push, PR). Three
carry-forwards for that step, none blocking:

1. **The PR description MUST state the operator sequence** — `bootstrap.sh`
   **then** `seed-content-documents.sh`, and that downloads 403 without the
   first. Both CodeDeveloper and SecurityReviewer flag this as the highest-value
   line in the description.
2. **Recommended follow-up issue** (not blocking, pre-existing, currently
   unexercised): `assetUrl()` retains the internal-base flaw for its existing
   callers. It should be fixed before `marketing_assets`, `event_materials`,
   `event_photos`, or `sponsors.logo` ships real data. Recorded in FR-CMS-008's
   Notes; worth registering as an `ISS-*` so it is not lost.
3. **Step 11.5** must update `.copilot/context/workspace-state.md` per this
   project's archive-time convention, and re-run sub-check 8b against `main`
   after the merge lands.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    All checks pass. Steps 01-08 complete with every gate `passed`; the
    one retry (code-developer 1/3, driven by two SecurityReviewer MAJOR
    findings) closed with both RESOLVED and independently re-verified.
    DBMigrationAuthor correctly not run — the relation is Directus-schema,
    not Drizzle. All 10 ACs are marked `verified` with cited evidence and
    ZERO are deferred, so §7.5's hard gate is satisfied outright. The
    live-Directus verification behind AC-1/2/3/4/5/6 was assessed rather
    than assumed and accepted as legitimate: it produced concrete command
    output (HTTP codes, the exact Content-Disposition header, the exact
    FORBIDDEN body), it exercised code extracted VERBATIM via sed from the
    edited files rather than retyped, it was performed independently by
    SecurityReviewer treating CodeDeveloper's table as a hypothesis, and
    it included negative cases and eight self-designed bypass probes. It
    is correctly NOT claimed as regression coverage — that role is held by
    the 15 new unit tests including a negative MAJOR-2 guard. I re-ran
    `pnpm biome check` on the four changed TS/JSON files myself (clean)
    and independently confirmed biome.json excludes .astro repo-wide, so
    the scoped result is legitimate rather than a convenient narrowing.
    Branch matches handoff.yaml; the diff contains no unrelated file.
    Status-consistency 8a/8b PASS (FR-CMS-008.md `status: Implemented` +
    registry row 70 `Shipped` / depends on `CMS-007`, both in the
    working-tree diff, values agreeing). Empty github_pr_url, uncommitted
    tree, un-pushed branch, untouched workspace-state.md, and unassessable
    8c atomicity are all EXPECTED at Step 10 and are deferred to Steps 11
    / 11.5, not counted as failures. §8.5 skipped — issues_created is
    empty, confirmed.
  findings:
    - "§7.5 HARD GATE SATISFIED — all 10 ACs marked `verified`, zero deferred, zero unmarked. No follow-up workflow ID is required because nothing was deferred."
    - "Live-Directus verification ASSESSED AS LEGITIMATE (not rubber-stamped). §7.5 requires 'an actual run (test, curl, manual click) … cite the command output' and does not require automation. Four properties earn the acceptance: concrete cited output (HTTP 200, Content-Disposition: attachment; filename=\"AI Qadam Manifesto.docx\", the verbatim FORBIDDEN error body); the SHIPPING code was tested (bootstrap blocks and the seed script's two new functions extracted verbatim via sed from the edited files, not retyped — the commonest failure mode of live verification, explicitly avoided); independence (SecurityReviewer treated CodeDeveloper's table as a hypothesis and reproduced every claim, adding eight bypass probes and a planted decoy the developer never ran); and negative cases (out-of-folder 403, ?download is not a bypass, GET /folders 403, aggregates constrained)."
    - "Correctly NOT counted as regression coverage — both 06-test-strategy.md and 07-test-results.md state the evidence is point-in-time with the environment since torn down. That honesty is what makes it acceptable. The durable guard is the 15 unit tests, notably the NEGATIVE MAJOR-2 assertion (URL must not contain directus:8055 or //directus, must match ^https://), which is what would actually catch a regression to directusBase() — a positive-only assertion against a mirrored constant would have been near-tautological."
    - "Infrastructure-Pre-Flight Invariant satisfied and load-bearing: local Directus was not running and SecurityReviewer brought it up per AGENTS.md §6.1 instead of deferring. That decision is what produced MAJOR-1. The instance retained prior bootstrap state (the $t:public_label policy + 14 collection grants), making the 403 conclusive rather than a fresh-install artifact. Had the deferral been taken, the feature would have shipped rendering a link that 403s on every click."
    - "FORMATTER CLEANLINESS re-run by me rather than trusted: `pnpm biome check` on cms.ts, cms-content-pages.test.ts, en.json, ru.json → 'Checked 4 files in 8ms. No fixes applied.' The scoping was independently justified — biome.json L14/L20 exclude .astro/** and **/*.astro repo-wide, so the one changed .astro file is genuinely not a Biome target, and the two shell scripts are not Biome targets either (bash -n clean; both were additionally EXECUTED against live Directus, stronger evidence than a static lint pass)."
    - "Branch identity confirmed: git rev-parse --abbrev-ref HEAD = feature/cms-008-rules-document-downloads = handoff.yaml.branch."
    - "Diff-scope audit clean — every one of the 11 modified/added paths maps to a specific AC or workflow step. AC-9 re-confirmed by me: no /about, /history, or /partners file, and no apps/api, apps/bot, apps/workers, packages/shared-types, .env, migration, or portal-content/ binary appears."
    - "Test hygiene re-verified by me, not cited: grep for it.skip/describe.skip/test.skip in the changed test file → 0; grep for @flaky → 0. 1096/1096 tests pass across 44 files, 15 new this workflow."
    - "Integration tests correctly N/A (rubric score 1 < 4, and no apps/api surface exists — confirmed by grep and git status, not assumed). E2E omission is a REASONED RECOMMENDATION AGAINST, not a skip: apps/e2e is un-wired from CI since 2026-07-26 per its own README and its /rules specs target production where source_file is null until an operator seeds, so a download-link assertion would be flaky-by-construction — exactly what the @flaky prohibition exists to prevent."
    - "Status-Consistency 8a PASS — both pair files in the working-tree diff (FR-CMS-008.md new/untracked, requirements-registry.md modified). Checked against the working tree rather than origin/main...HEAD, which is the correct comparison pre-commit since only the handoff/ID-counter commit exists so far."
    - "Status-Consistency 8b PASS — File A `status: Implemented`; File B row 70 `Shipped` with Depends on `CMS-007`, plus the CMS module file list at L32 updated. Values agree and both are terminal. Row is positioned immediately after row 69 (FR-CMS-007) so dependency order reads correctly."
    - "Status-Consistency 8c not yet assessable and NOT a warning — neither file is committed; both land in Step 11's single workflow-finish.sh commit, satisfying atomicity by construction."
    - "workspace-state.md untouched — EXPECTED. This project updates it at Step 11.5 archive time, not Step 9. Explicitly not counted as a gap."
    - "§8.5 GitHub-Issue Link Check SKIPPED, condition confirmed — issues_created is [] and issue_ref is empty; no .copilot/issues/ path in the diff. The check scopes to issues this workflow itself touched, so it does not apply."
    - "business_process: — was VERIFIED by DocWriter against the full 21-entry BP-UAT registry rather than copied from FR-CMS-007. All entries cover auth, events, registration, admin/ops, points, or referral flows; none is a public content/marketing surface. Linking one would have been a false claim of coverage."
    - "Operator obligation captured durably under its own top-level heading in FR-CMS-008.md: bootstrap.sh THEN seed-content-documents.sh, with the explicit statement that label-only rendering until both run is AC-8's correct behaviour and NOT a defect — the single most likely thing to be misread as a bug post-merge. It is not a deferred AC: the pre-seed state is itself a verified acceptance criterion."
    - "The disproved premise ('Directus serves /assets/:id without requiring directus_files item-read permission') exists in NO tracked doc — it entered via this workflow's own analysis chain, not from FR-CMS-007, which never stated it. DocWriter correctly left the untracked run artifacts (01, 02, 04) intact, since rewriting a prior step's artifact would falsify the workflow record and 04 already disproves it in the same directory. The response taken is better than a strike-through: because no tracked doc stated the CORRECT rule either — which is how the gap let the assumption in — the verified rule was written positively into docs/04-development/security/security.md § File uploads → Serving, a file on CLAUDE.md's mandatory session-start reading list. This closes the inheritance path rather than annotating one instance of it. Endorsed."
    - "MAJOR-1's fix was held above the bar the finding demanded: SecurityReviewer had warned a blunt directus_files grant would itself be a security finding, and verified the folder-scoped + field-allowlisted replacement against eight self-designed bypass probes (filter inversion via _null and _neq, fields=*, explicit private-field requests, limit=-1, aggregate counts — no count-oracle side channel, relational traversal through source_file). None widened exposure. Net anonymous surface: six non-sensitive metadata fields on operator-placed files in one named folder."
    - "MAJOR-2's no-regression claim was verified MECHANICALLY, not read from the summary: git diff -U0 on cms.ts contains zero '-' lines touching assetUrl or any of its call sites, and assetUrl()'s body is byte-identical. The change is purely additive."
    - "Environment hygiene verified twice — SecurityReviewer checked restoration BEFORE touching anything (so it reflects the state CodeDeveloper actually left: 0 files, 0 folders, 0 directus_files perms, allowlist back to 8 fields, 5 rows intact), then removed and re-verified its own artifacts afterwards. No repo file, .env, or seed data modified."
    - "Pre-existing drift flagged but correctly NOT fixed: requirements-registry.md:41 says 'All 61 FR files' while the table held 69 rows before this change (70 after). Predates this workflow by many iterations; fixing it would add unrelated noise to this PR's diff. Recorded so it is not mistaken for a regression introduced here. Not a gate failure."
    - "CARRY-FORWARD (blocking for Step 11's PR body, not for this gate): the PR description MUST state the operator sequence — bootstrap.sh THEN seed-content-documents.sh, and that downloads 403 without the first. Both CodeDeveloper and SecurityReviewer flag this as the highest-value line in the description."
    - "RECOMMENDED FOLLOW-UP (not blocking; pre-existing and currently unexercised): assetUrl() retains the internal-base flaw for its existing callers. Should be fixed before marketing_assets, event_materials, event_photos, or sponsors.logo ships real data. Recorded in FR-CMS-008's Notes; worth registering as an ISS-* so it is not lost. SecurityReviewer explicitly declined to raise it against this PR, and this gate agrees."
    - "ADVISORY carried forward, no action: ensure_perm_for_policy compares only (policy, collection, action) and would not TIGHTEN a pre-existing broader grant. Pre-existing helper behaviour used by dozens of existing grants; verified no such directus_files grant exists on any instance. Worth knowing if a future change ever needs to narrow one."
  retry_target: null
  authorizes_commit: true
```
