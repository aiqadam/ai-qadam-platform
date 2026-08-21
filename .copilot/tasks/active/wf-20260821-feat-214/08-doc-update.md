# 08 — Documentation Update

**Workflow:** `wf-20260821-feat-214`
**Agent:** DocWriter
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009` — Environment-configurable public Directus origin

---

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-CMS-009.md` | **New file** | Full FR doc following FR-CMS-008's format (its immediate predecessor). Frontmatter: `status: Implemented`, `module: CMS / Content (CMS)`, `phase: Rebuild Phase 3 (V2)`, `business_process: —`. Sections: Description, Users, Functional scope (7 items), the `process.env` vs `import.meta.env` mechanism note, the http/https security adjudication, the FR-CMS-008 MAJOR-2 preservation table, 10 checked ACs, Operator note, Notes. |
| `docs/03-requirements/requirements-registry.md` | *Functional requirements* module table, CMS row (L32) | Appended `· [009](FR-CMS-009.md)` to the CMS / Content file list. |
| `docs/03-requirements/requirements-registry.md` | *FR implementation order* table | New row `71 \| FR-CMS-009 \| Environment-configurable public Directus origin \| **Shipped** \| CMS-008`, immediately after row 70 (FR-CMS-008) and before the CMS-004/CMS-005 note. |
| `docs/04-development/standards.md` | Part VIII — Frontend specifics, new subsection *"Runtime configuration in `apps/web-next`: use `process.env`, never `import.meta.env`"* (placed after *Design system tokens*) | Records the env-var mechanism lesson **generally**, not confined to an FR doc — see the judgment call below. States the rule, the Vite build-time-inlining reason, the `api-client.ts` dead-code evidence, the `PUBLIC_` naming carve-out, the defensive-`process` requirement, the pure-injectable-resolver preference, and a concrete artifact-level verification procedure. |
| `docs/03-requirements/FR-CMS-008.md` | Notes — *"No E2E test added, by design"* bullet | **Correction appended** (dated, attributed to FR-CMS-009) recording that the downstream restatement *"FR-CMS-008's existing E2E/UAT already covers the rendered href"* is half false. See §Inherited false claim below. Nothing else in FR-CMS-008 was altered. |

---

## Judgment call — recording the env-var lesson outside the FR doc (task item 4)

**Decision: yes. Added to `docs/04-development/standards.md` Part VIII.**

The task asked me to weigh this the way FR-CMS-008 weighed its Directus
asset-permission rule, which it escalated into `security.md`. Applying the same
reasoning:

- **The lesson is not CMS-specific.** It is a property of `apps/web-next`'s
  build toolchain (Vite/Astro + a Dockerfile with no build `ARG`). It applies to
  *any* future value someone tries to make configurable in that app, in any
  module. A CMS requirement doc is the wrong place for a rule with that reach —
  nobody adding a config knob to, say, the workspace surface would read
  `FR-CMS-009.md` first.
- **It has already been rediscovered twice**, which is the empirical signal that
  the FR-doc-only home is insufficient. The whole point of item 3's "record this
  so it isn't rediscovered a third time" is a *durable, discoverable* home.
- **`standards.md` is the right file, not `security.md`.** FR-CMS-008's rule
  went to `security.md` because an unfiltered `directus_files` grant is a
  security finding. This one is not a security defect — `api-client.ts`'s dead
  path fails **closed** to the same-origin `/api`, which SecurityReviewer stated
  explicitly. It is a **correctness/convention** rule about how configuration is
  read, which is exactly `standards.md`'s remit. Filing it under security would
  misclassify it and dilute that document.
- **Part VIII (Frontend specifics) is the right section**, and it already
  contains a structurally identical precedent: the *Design system tokens*
  subsection documents another `apps/web-next` build-mechanism coupling whose
  failure mode is silent (a token exists but no utility exposes it). The new
  subsection sits directly after it and matches its shape.

**Considered and rejected:** an ADR (this is not an architecture *decision* —
there was never a real choice between the two mechanisms, since one of them
provably does not work); `architecture.md` (no module boundary or component
changed); `security.md` (misclassification, per above).

---

## Content captured durably (task item 3)

### 1. The `process.env` vs `import.meta.env` finding

Captured in **two** places by design: the full narrative in `FR-CMS-009.md`
§*Mechanism note* (with the requirement's own context), and the reusable rule in
`standards.md` Part VIII (with no CMS framing at all, so it reads as a general
app rule). Both record:

- `api-client.ts`'s `import.meta.env.PUBLIC_API_URL` path is **DEAD CODE** —
  labelled as such in both docs, in those words.
- **Why:** Vite inlines `import.meta.env` into a frozen literal at `astro build`
  time; the compiled `dist/server/chunks/Layout_*.mjs` object contains only
  `ASSETS_PREFIX` / `BASE_URL` / `DEV` / `MODE` / `PROD` / `SITE` / `SSR`. The
  actual compiled snippet is quoted in the FR doc.
- **Consequence:** the destructure is always `undefined` and silently falls back
  to `/api`; **anyone copying it as a pattern gets a value that can never be
  configured**, and the failure is invisible in review and in mocked unit tests.
- **What to do instead:** `process.env`, read at call time; keep the `PUBLIC_`
  *name* prefix (Astro's prefix rule governs `import.meta.env` client-bundle
  exposure only); access `process` defensively; prefer a pure injectable
  resolver.
- **How to check it yourself** for any future `PUBLIC_*` var — grep the built
  chunk under `dist/server/`; destructured alongside `ASSETS_PREFIX` ⇒
  build-frozen; `process.env` verbatim ⇒ live. Stated in both docs so the
  finding is reproducible rather than merely asserted.

### 2. The http/https security adjudication

Captured in `FR-CMS-009.md` §*Security note*, as an **adjudicated, accepted
residual risk (LOW)** rather than an open question — including the ruling
("documentation is sufficient; do not add a code-level rejection or a
`NODE_ENV === 'production'` warning"), all four supporting reasons in the
security review's own descending-weight order, and the four compensating
controls.

**The stated flip condition is recorded verbatim in substance and visually
separated** so the boundary is not vague: the verdict changes if
`publicAssetUrl()` gains a caller emitting into a **subresource** context
(`<img src>`, `<link href>`, `fetch()`), **or** if the Directus asset folder
stops being public-read and starts requiring a credential. The doc states that
if either becomes true, an `https://` enforcement becomes warranted and the
adjudication must be revisited.

### 3. Operator note — POSSIBLE, not APPLIED

Captured in `FR-CMS-009.md` §*Operator note — this PR makes the override
POSSIBLE, not APPLIED*, deliberately mirroring FR-CMS-008's own
"shipping this PR does NOT make downloads work" section, which established the
convention for this exact class of caveat.

States: both compose entries are comment-only, so the PR is a genuine no-op for
QA and prod until an operator acts; production needs no action because the code
default *is* the production value; **QA still emits production download links**;
the two required QA operator steps in order (stand up a Directus vhost at a
public `https://` hostname, then uncomment and set the pre-written line and
restart — no rebuild); and that this is a **named deferral against T-0141**,
which was itself blocked on exactly this code gap.

---

## The inherited false claim — corrected, and narrowed further (task item 5)

TestRunner flagged that `02-impact-analysis.md` and `03-code-summary.md` both
state *"FR-CMS-008's existing E2E/UAT already covers the rendered href"*, with
the UAT half true and the E2E half false.

**Prior run artifacts were NOT rewritten.** `02-impact-analysis.md` and
`03-code-summary.md` are untouched — rewriting them would falsify the workflow
record. The correction lives in the durable docs instead, in both directions of
propagation: forward in `FR-CMS-009.md` §Notes, and backward at the source in
`FR-CMS-008.md`'s Notes, so the claim cannot be re-inherited from the doc that
originated it.

**I verified the correction rather than relaying it — and the verification
changed it.** TestRunner's evidence was `grep -rln 'rules|download_source|sourceFile'`
over **`apps/e2e/src`**. That path **does not exist** in this repo; the specs
live under `apps/e2e/tests/` with page objects in `apps/e2e/support/`. The
"zero files" result was therefore **vacuous** — it would have returned zero for
any pattern whatsoever. Re-running against the real paths returns seven files,
including `apps/e2e/tests/smoke-content-pages.spec.ts`.

Reading that spec gives the accurate position, which is **narrower than both the
original claim and TestRunner's correction**:

- `/rules` and `/rules/[slug]` **are** E2E-covered, by
  `smoke-content-pages.spec.ts` (`FR-CMS-007 — /rules (library)`, terminology
  AC-3, superseded-label AC-4, unknown-slug, traversal) plus
  `smoke-accessibility.spec.ts` and `smoke-public.spec.ts` route lists.
- **No spec asserts the download link, `sourceFile`, or the emitted asset
  origin.** Grepping those specs for `download` returns only the
  `rules.download_source` i18n key's absence — no assertion on the `<a href
  download>` at all.

**So:** the "E2E covers the rendered href" claim is false, but the reason is
*"the existing `/rules` specs cover FR-CMS-007 concerns only"*, **not** *"no
Playwright spec references this surface."* Both docs now state the narrow,
verified version, and `FR-CMS-009.md` additionally records the bad grep path so
the vacuous evidence is not re-cited.

**This does not disturb the E2E decline.** TestRunner's three independent
grounds (prod-targeted config, non-CI-gating, and the CI-injection +
QA-vhost cost) all stand on their own and are restated in `FR-CMS-009.md`.

---

## Documents Not Updated

| Document | Considered because | Why not changed |
|---|---|---|
| `docs/04-development/security/security.md` | FR-CMS-008 escalated its Directus asset-permission rule here, and this FR carries a security adjudication. | The adjudication's outcome is *"no code change, documentation is sufficient, residual risk LOW accepted"* — it establishes no new security **rule** to add. SecurityReviewer returned zero BLOCKER and zero MAJOR findings and explicitly declined to record the `http://` question as a MAJOR. The env-var lesson is a correctness/convention rule, not a security one (the dead path fails **closed**), so filing it here would misclassify it. The adjudication and its flip condition live in the FR doc, which is where a future reviewer looking at this function will find them. |
| `docs/04-development/architecture/architecture.md` | Table row: "New module or module boundary change". | None. The change is confined to `apps/web-next/src/lib/` (ADR-0038 L1 runtime); no module, boundary, page, block, or component changed. `pnpm arch:check` passed on 289 files. |
| `docs/adr/` (new ADR) | Table row: "New ADR or architecture decision". | Not an architecture *decision* — there was no genuine choice between the two mechanisms, since `import.meta.env` provably does not work in this app. Documenting a non-choice as an ADR would misrepresent it. The reusable half is a standards rule; the app-specific half is the FR doc. |
| `docs/api/` | Table row: "New or changed API endpoint". | No REST endpoint added, removed, or modified. `apps/api/**` has zero files in the diff. |
| `packages/shared-types/README.md` | Table row: "New shared-types schema". | Unchanged. `CmsContentDocument.sourceFileUrl` keeps its `string \| null` shape; only the origin substring of the value differs. |
| `docs/runbooks/` | Table row: "New operational scenario". | The operator procedure is two steps tied to this one requirement and its T-0141 follow-up, not a recurring operational scenario. It is captured in `FR-CMS-009.md`'s Operator note, matching FR-CMS-008's precedent for the same class of caveat. A runbook would duplicate it with no additional reach. |
| `docs/02-business-processes/uat/registry.md` | `business_process` frontmatter needed verification. | **Verified, no change needed.** Re-checked the full script list — every entry (BP-UAT-000 … BP-UAT-021) covers auth, events, registration, admin/ops, points, or referral flows. None is a public marketing/content-page surface. `business_process: —` is correct, matching FR-CMS-007 and FR-CMS-008 on this same surface. |
| `.copilot/context/workspace-state.md` | Registry-update convention. | Owned by Step 11.5, not DocWriter. Deliberately untouched. |
| `02-impact-analysis.md`, `03-code-summary.md` | They carry the false E2E claim. | **Deliberately not rewritten** — they are the workflow's run record. Editing them would falsify it. Corrected in the durable docs instead (see above). |
| `apps/web-next/.env.example`, `deploy/docker-compose.{qa,prod}.yml` | They document the new knob. | Already written by CodeDeveloper as part of the implementation (AC-9). Reviewed for accuracy against the shipped resolver — correct, no duplication needed. Not re-edited. |

---

## Consistency Verification

| Check | Result |
|---|---|
| `FR-CMS-009.md` frontmatter `status` | `Implemented` ✅ |
| `requirements-registry.md` row 71 Status | `Shipped` ✅ (agrees with the FR file per the Status-Consistency pair) |
| `requirements-registry.md` CMS module row | Contains `[009](FR-CMS-009.md)` ✅ |
| `Depends on` column | `CMS-008` ✅ (matches `01-requirement-validation.md`'s "Depends on: FR-CMS-008") |
| Row ordering | 71 follows 70 (FR-CMS-008), before the CMS-004/CMS-005 note ✅ |
| `business_process` | `—`, verified against the UAT registry's full list ✅ |
| Format parity with FR-CMS-008 | Same frontmatter keys and order; Description / Users / Functional scope / notes / Acceptance criteria / Operator note / Notes ✅ |
| AC count | 10, all `[x]`, matching `01-requirement-validation.md` AC-1…AC-10 ✅ |
| No unaffected content altered | FR-CMS-008: exactly one bullet extended, nothing else touched. `standards.md`: one subsection appended within Part VIII, no existing text modified. Registry: two additive edits. ✅ |
| No duplication | The `standards.md` rule is written app-general with no CMS framing; the FR doc carries the requirement-specific narrative. Deliberate two-audience split, not copy-paste. ✅ |

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-CMS-009.md created (status: Implemented) following FR-CMS-008's format, requirements-registry.md updated in both required places (CMS module file list + new implementation-order row 71, Status Shipped, Depends on CMS-008), the reusable process.env-vs-import.meta.env lesson escalated to standards.md Part VIII, and the inherited false E2E claim corrected in both FR-CMS-009.md and FR-CMS-008.md without rewriting any prior run artifact."
  findings:
    - "FR-CMS-009.md CREATED at docs/03-requirements/FR-CMS-009.md, formatted on FR-CMS-008.md (its immediate predecessor). Frontmatter: code FR-CMS-009, status Implemented, module CMS / Content (CMS), phase Rebuild Phase 3 (V2), business_process —. All 10 ACs from 01-requirement-validation.md are present and checked, each annotated with the instrument that verified it."
    - "business_process: — VERIFIED, NOT ASSUMED. Re-checked docs/02-business-processes/uat/registry.md's full BP-UAT-000..021 script list: every entry covers auth, events, registration, admin/ops, points, or referral flows; none is a public marketing/content-page surface. Matches FR-CMS-007 and FR-CMS-008 on this same surface, per protocol (leave as — rather than link a non-matching script)."
    - "REGISTRY UPDATED IN BOTH REQUIRED PLACES: (1) the CMS / Content row of the module file table now ends `· [008](FR-CMS-008.md) · [009](FR-CMS-009.md)`; (2) a new implementation-order row `71 | FR-CMS-009 | Environment-configurable public Directus origin | Shipped | CMS-008` follows row 70 (FR-CMS-008) and precedes the CMS-004/CMS-005 note. Status-Consistency pair agrees: FR file says Implemented, registry says Shipped."
    - "THE process.env vs import.meta.env FINDING IS CAPTURED TWICE, DELIBERATELY. FR-CMS-009.md carries the full narrative with the compiled Layout_*.mjs snippet quoted; standards.md Part VIII carries the same rule written app-general with no CMS framing. Both state in these words that api-client.ts's import.meta.env.PUBLIC_API_URL path is DEAD CODE, that Vite inlines a frozen literal at astro build time containing only ASSETS_PREFIX/BASE_URL/DEV/MODE/PROD/SITE/SSR, that the destructure is therefore always undefined and silently falls back to '/api', and that anyone copying it as a pattern gets a value that can never be configured. Both also give the artifact-level check (grep dist/server/ chunks: destructured alongside ASSETS_PREFIX => build-frozen; process.env verbatim => live) so the finding is reproducible, not merely asserted."
    - "JUDGMENT CALL ON ITEM 4 — YES, ESCALATED, AND TO standards.md NOT security.md. Reasoning applied by analogy to FR-CMS-008's security.md escalation: the lesson is a property of apps/web-next's build toolchain and applies to any future config knob in any module there, so an FR doc is too narrow a home (nobody adding a knob elsewhere would read FR-CMS-009.md); it has already been rediscovered twice, which is the empirical signal the FR-doc-only home is insufficient. But it is NOT a security rule — the dead path fails CLOSED to same-origin /api, as SecurityReviewer stated — so security.md would misclassify it. Part VIII (Frontend specifics) already holds a structurally identical precedent (the Design system tokens build-coupling note, same silent-failure shape), and the new subsection sits directly after it. ADR rejected: there was no genuine decision, since one mechanism provably does not work."
    - "HTTP/HTTPS ADJUDICATION CAPTURED AS SETTLED, NOT OPEN — the ruling (documentation sufficient; no code-level rejection, no NODE_ENV==='production' warning), all four supporting reasons in the review's own descending-weight order, the four compensating controls, and 'Residual risk: LOW, accepted'. THE FLIP CONDITION IS RECORDED IN ITS OWN VISUALLY SEPARATED BLOCK: the verdict changes if publicAssetUrl() gains a caller emitting into a SUBRESOURCE context (<img src>, <link href>, fetch()), OR if the Directus asset folder stops being public-read and starts requiring a credential — with the explicit instruction that either change makes https enforcement warranted and requires revisiting the adjudication."
    - "OPERATOR NOTE CAPTURED, mirroring FR-CMS-008's own 'shipping this PR does NOT make downloads work' precedent for this class of caveat. States that both compose entries are comment-only so the PR is a genuine no-op for QA and prod until an operator acts; that prod needs no action because the code default IS the prod value; that QA STILL EMITS PRODUCTION DOWNLOAD LINKS; the two ordered QA operator steps (stand up a Directus vhost at a public https hostname, then uncomment/set the pre-written line and restart — no image rebuild); and that this is a NAMED deferral against infra task T-0141, which was itself blocked on exactly this code gap."
    - "INHERITED FALSE CLAIM CORRECTED WITHOUT FALSIFYING THE RUN RECORD. 02-impact-analysis.md and 03-code-summary.md are UNTOUCHED. The correction is placed in the durable docs in both propagation directions: forward in FR-CMS-009.md §Notes, and backward at the source in FR-CMS-008.md's 'No E2E test added' bullet (dated, attributed to FR-CMS-009), so the claim cannot be re-inherited from the doc that originated it."
    - "I VERIFIED THE CORRECTION RATHER THAN RELAYING IT, AND THE VERIFICATION CHANGED IT. TestRunner's evidence was a grep over apps/e2e/src — A PATH THAT DOES NOT EXIST in this repo (specs live in apps/e2e/tests/, page objects in apps/e2e/support/), so its 'zero files' result was VACUOUS and would have returned zero for any pattern. Re-run against the real paths: seven files match, including apps/e2e/tests/smoke-content-pages.spec.ts. Reading it gives the accurate, NARROWER position: /rules and /rules/[slug] ARE E2E-covered, but only for FR-CMS-007 concerns (5-document listing, terminology AC-3, superseded label AC-4, unknown slug, traversal) — NO spec asserts the download link, sourceFile, or the emitted asset origin. So the claim is false because the existing /rules specs cover FR-CMS-007 only, NOT because 'no Playwright spec references this surface'. Both docs state the verified narrow version; FR-CMS-009.md additionally records the bad grep path so the vacuous evidence is not re-cited. The E2E decline is undisturbed — TestRunner's three grounds (prod-targeted BASE_URL default, non-CI-gating, CI-injection + QA-vhost cost) each stand alone and are restated in the FR doc."
    - "FIVE DOCS CONSIDERED AND DELIBERATELY NOT CHANGED, each with a reason: security.md (adjudication established no new security rule; zero BLOCKER/MAJOR; the env lesson fails closed and is a correctness rule); architecture.md (no module or boundary changed; arch:check clean on 289 files); a new ADR (not a decision — one mechanism provably does not work); docs/api/ (zero apps/api files in the diff); shared-types README (CmsContentDocument.sourceFileUrl shape unchanged); runbooks (two requirement-specific steps, not a recurring operational scenario, and FR-CMS-008 set the FR-doc precedent). .env.example and both compose files were reviewed for accuracy against the shipped resolver and left as CodeDeveloper wrote them — no duplication added."
    - "workspace-state.md DELIBERATELY UNTOUCHED — owned by Step 11.5, not DocWriter."
    - "NO UNAFFECTED CONTENT ALTERED AND NO DUPLICATION INTRODUCED. FR-CMS-008: exactly one Notes bullet extended, nothing else. standards.md: one subsection appended inside Part VIII, no existing text modified. Registry: two additive edits. The standards.md rule and the FR doc's mechanism note address different audiences (app-general vs requirement-specific) and are written independently rather than copy-pasted."
