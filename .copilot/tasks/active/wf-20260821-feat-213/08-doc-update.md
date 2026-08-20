# Documentation Update — FR-CMS-008

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-CMS-008.md` | **new file** | Created following FR-CMS-007's exact format. Frontmatter: `code`, `name`, `status: Implemented`, `module: CMS / Content (CMS)`, `phase: Rebuild Phase 3 (V2)`, `business_process: —`. Sections: Description, Users, Functional scope (6 items), Architecture note, **Directus asset-permission note**, Acceptance criteria (all 10, `[x]`), **Operator note**, Notes. |
| `docs/03-requirements/requirements-registry.md` | Module Abbrev table, CMS row (L32) | Appended `· [008](FR-CMS-008.md)` to the CMS / Content file list. |
| `docs/03-requirements/requirements-registry.md` | FR implementation order table | Added row `70` — `FR-CMS-008` \| Community Rules & Documents — original source-file download link \| **Shipped** \| **CMS-007**. Placed immediately after row 69 (FR-CMS-007), matching dependency order. |
| `docs/03-requirements/FR-CMS-007.md` | Functional scope §2 (`content_documents`) | One-sentence forward cross-reference: `source_document_label` is a citation string only in FR-CMS-007; FR-CMS-008 later adds the `source_file` relation and a real download link alongside it. No other content altered — the parent's own ACs and Notes are untouched (it did not claim the label was downloadable, so nothing there is wrong, only incomplete without the pointer). |
| `docs/04-development/security/security.md` | File uploads → Serving (new subsection: "Directus assets (`/assets/:id`) — public serving requires an explicit, scoped grant") | **Corrects the disproved factual claim.** Records that relations are not permissions, that anonymous `/assets/:id` 403s without a `directus_files` read grant (verified live, Directus 11), that the "existing precedent" collections are empty and therefore proved nothing, and the six-point rule for serving a public Directus asset safely (explicit grant → folder-scoped filter → non-sensitive field allowlist → multipart `folder` part ordered before `file` → public-base URL, never the internal Docker host → `?download` for real filenames). Links to FR-CMS-008 for the reference implementation and bypass-probe evidence. |

### Operator note — captured durably

The requirement that this PR alone does **not** make downloads work is recorded
in `docs/03-requirements/FR-CMS-008.md` under its own top-level heading,
**"Operator note — shipping this PR does NOT make downloads work"**, placed
immediately after the acceptance criteria so it cannot be missed by anyone
reading the AC list. It states the two required steps **in order**:

1. Re-run `infrastructure/directus/bootstrap.sh` — creates the `source_file`
   field + relation, appends `source_file` to the public-read allowlist, creates
   the `public-documents` folder, and adds the scoped `directus_files` read
   grant. Without the folder and grant every download 403s regardless of the
   frontend.
2. Then run `infrastructure/directus/seed-content-documents.sh` — uploads the 5
   `.docx` files into that folder and links each row's `source_file`.

It also states explicitly that until both have run, rows render **label-only**,
and that this is **AC-8's required behaviour, not a defect** — plus what happens
if the order is reversed (PATCH fails and is reported; nothing is corrupted).

## Documents Not Updated

| Document | Considered because | Why not updated |
|---|---|---|
| `docs/04-development/architecture/architecture.md` | New Directus field, relation, folder, and permission grant. | No module boundary changed, no new module, no new API surface. FR-CMS-007's binding architecture note (content reads bypass NestJS entirely via `lib/cms.ts`) already covers this pattern and remains accurate verbatim. FR-CMS-008 restates it in its own Architecture note rather than duplicating it upward. |
| `docs/adr/` (new ADR) | The hardcoded `PUBLIC_ASSET_FOLDER_ID` and the folder-scoped grant are genuine design decisions. | Not architecture-decision-level. SecurityReviewer assessed the hardcoded UUID as following an **established repo precedent** (the 8 RBAC policy UUIDs already hardcoded in the same `bootstrap.sh`), not a novel pattern — an ADR is for decisions that change how the system is built, and this follows existing practice. The reusable *rule* extracted from it landed in `security.md` instead, which is where a future implementer will actually look. |
| `docs/04-development/standards.md` | New `publicAssetUrl()` helper alongside `assetUrl()`. | Not a new coding convention — it is one module-local helper in one file, both sites comment which realm they belong to. Nothing generalizable to repo-wide standards. |
| `docs/api/` | — | No API endpoint added or changed. `apps/api` is untouched by this diff. |
| `packages/shared-types/README.md` | — | No shared-types schema added. `CmsContentDocument` / `CmsContentDocumentRow` are module-local to `apps/web-next/src/lib/cms.ts`. |
| `docs/runbooks/<slug>.md` | The two-step operator sequence is arguably operational. | The sequence is FR-specific and short, and FR-CMS-007 established the precedent of documenting its own seeding step in the FR file rather than a runbook. Splitting it into a runbook would separate it from the AC-8 context that explains why label-only rendering is correct. Kept in FR-CMS-008 where it stays adjacent to that reasoning. |
| `docs/02-business-processes/uat/registry.md` | `business_process` field needed a value. | **Verified, not copied from FR-CMS-007.** Re-read the full 21-entry script list (BP-UAT-000 … BP-UAT-021): all cover auth, events, registration, admin/ops, points, or referral flows. None covers a public marketing/content-page surface. `business_process: —` is correct; adding a new BP-UAT script is not in this FR's scope and no existing row should be edited to falsely claim coverage. |
| `.copilot/context/workspace-state.md` | Required by protocol for `requirement-development`. | Updated at **Step 11.5 (archive time)** per this project's convention, not at Step 9. Intentionally not touched here. |
| `apps/e2e/README.md` | No E2E test added. | The README's existing statement (suite un-wired from CI since 2026-07-26, prod-targeted) is what *justified* omitting an E2E test — it is already accurate and needs no change. |

## Correcting the disproved claim — search results

The false premise —

> "Directus serves `/assets/:id` without requiring `directus_files` item-read permission"

— was grepped for across **all** tracked docs (`docs/`) and `.copilot/`:

| Location | Tracked? | Action |
|---|---|---|
| `.copilot/tasks/active/wf-20260821-feat-213/01-requirement-validation.md:77` | No (this run's own artifact, untracked) | **Left as-is.** Run artifacts are a historical record of what was believed at that step; `04-security-review.md` already disproves it in the same directory, and rewriting a prior step's artifact would falsify the workflow record. |
| `.copilot/tasks/active/wf-20260821-feat-213/02-impact-analysis.md:56` | No (same) | Left as-is, same reasoning. |
| `.copilot/tasks/active/wf-20260821-feat-213/04-security-review.md:71` | No (same) | This is the *disproof*, quoting the claim in order to refute it. Correct as written. |
| `docs/03-requirements/FR-CMS-007.md` | **Yes** | **Claim not present.** FR-CMS-007 never states it — the belief entered via this workflow's own analysis chain, not from the parent FR. Nothing to correct there. |
| `docs/04-development/architecture/architecture.md`, `docs/04-development/security/security.md`, `docs/04-development/standards.md`, `docs/adr/` | **Yes** | **Claim not present** anywhere. Grep for `directus_files` / `assets/:id` / "without requiring" across `docs/` returned only unrelated hits (`FR-CMS-001` and `web-v1-feature-surface.md` describe *where* assets are served from, never *whether* a permission is required). |

**Conclusion:** the false claim is **not recorded in any tracked doc**, so there
is nothing to strike. But its *absence* is precisely how it was inherited — no
tracked doc stated the **correct** rule either, so the analysis chain filled the
gap with an assumption. The durable fix is therefore **positive, not
corrective**: the verified rule is now written into
`docs/04-development/security/security.md` § File uploads → Serving, which is on
the mandatory session-start reading list (`CLAUDE.md` item 6). A future
requirement needing a public Directus asset will now find the correct rule where
it looks, instead of re-deriving the wrong one from empty-collection
"precedent".

## Verification

| Check | Result |
|---|---|
| `docs/03-requirements/FR-CMS-008.md` frontmatter `status` | `Implemented` |
| Registry row 70 Status / Depends on | `Shipped` / `CMS-007` |
| Registry CMS module file list | includes `[008](FR-CMS-008.md)` |
| All 10 ACs present and checked `[x]` | Yes — one per AC-1…AC-10 from `01-requirement-validation.md` |
| Operator two-step note present in FR-CMS-008.md | Yes, own top-level heading |
| Markdown links resolve (relative paths) | `FR-CMS-007.md` ↔ `FR-CMS-008.md` sibling links; `security.md` → `../../03-requirements/FR-CMS-008.md` |
| No unaffected content altered | FR-CMS-007 edit is a single additive sentence in Functional scope §2; `security.md` edit is a new subsection appended within § File uploads → Serving, no existing bullet changed |

**Known pre-existing drift, deliberately NOT fixed here:**
`requirements-registry.md:41` reads "All 61 FR files sorted by implementation
dependencies" while the table already held 69 rows before this change (now 70).
This drift predates FR-CMS-008 by many workflows. Correcting it is an unrelated
change that would add noise to this PR's diff; flagged here so it is not
mistaken for a regression introduced by this workflow.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FR-CMS-008.md created following FR-CMS-007's exact format with
    status: Implemented and business_process: — (verified against the
    full 21-entry BP-UAT registry, not copied). requirements-registry.md
    updated in both required places: the CMS module file list and a new
    implementation-order row 70 with Status=Shipped, Depends on=CMS-007.
    The operator two-step obligation (bootstrap.sh THEN
    seed-content-documents.sh, else label-only rendering which is AC-8's
    correct behaviour and not a defect) is captured under its own
    top-level heading in FR-CMS-008.md. Two optional updates were
    evaluated and both taken: a one-line forward cross-reference in
    FR-CMS-007's Functional scope §2, and — since the disproved
    "/assets/:id needs no directus_files permission" claim turned out not
    to exist in any TRACKED doc — a new positive rule in
    security.md § File uploads → Serving recording the verified behaviour
    and the six-point scoped-grant pattern, so the gap that let the
    assumption in is closed at the source.
  findings:
    - "business_process: — VERIFIED rather than copied from FR-CMS-007. Re-read docs/02-business-processes/uat/registry.md's full script list (BP-UAT-000 through BP-UAT-021): every entry covers auth, events, registration, admin/ops, points, or referral flows. None is a public marketing/content-page surface. Linking any of them would be a false claim of coverage."
    - "The false premise is NOT present in any tracked doc — grepped docs/ and .copilot/ for 'without requiring', 'directus_files item-read', and 'assets/:id'. It appears only in this workflow's own untracked run artifacts (01, 02, and 04 where it is quoted in order to be refuted). Those were left intact: rewriting a prior step's artifact would falsify the workflow record, and 04-security-review.md already disproves it in the same directory."
    - "Because no tracked doc stated the correct rule either, the fix is positive rather than corrective: security.md § File uploads → Serving now carries a new subsection recording the empirical 403 result, that relations are not permissions, that the cited 'precedent' collections are empty and proved nothing, and the six-point pattern (explicit grant, folder-scoped filter, non-sensitive field allowlist, multipart folder-before-file ordering, public-base URLs, ?download). security.md is on CLAUDE.md's mandatory session-start reading list, so a future requirement will find the rule where it looks."
    - "FR-CMS-007 cross-reference taken but kept minimal — one additive sentence in Functional scope §2. FR-CMS-007's own ACs are NOT wrong (it never claimed the label was downloadable), so nothing there was corrected, only pointed forward. No AC checkbox, Note, or Architecture note in that file was touched."
    - "Operator note is deliberately in FR-CMS-008.md rather than a new runbook: it must stay adjacent to AC-8, which is what explains why label-only rendering is correct rather than a defect. FR-CMS-007 set the precedent of documenting its own seeding step in the FR file."
    - "No ADR written. SecurityReviewer assessed the hardcoded PUBLIC_ASSET_FOLDER_ID as following an established repo precedent (8 RBAC policy UUIDs already hardcoded in the same bootstrap.sh), not a novel architectural decision. The reusable rule it implies was captured in security.md instead."
    - "architecture.md deliberately untouched — no module boundary changed and FR-CMS-007's binding note (content reads bypass NestJS via lib/cms.ts) remains accurate verbatim for this FR too."
    - "workspace-state.md intentionally not touched at Step 9 — this project updates it at Step 11.5 archive time."
    - "Pre-existing drift flagged, not fixed: requirements-registry.md:41 says 'All 61 FR files' while the table held 69 rows before this change. Predates this workflow by many iterations; fixing it would add unrelated noise to this PR's diff."
```
