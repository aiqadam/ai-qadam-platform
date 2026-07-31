# 08 — Doc Update: FR-BOT-002 PR 5/6 — `/interests`

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-BOT-002.md` | `## Implementation progress` | Added a new `**PR 5/6 (this PR) — shipped:** ...` paragraph block immediately after PR 4's entry and before the "Planned follow-up PRs" table, matching the exact prose density/structure of PR 4's own entry. Covers: what `/interests` does; the two new API routes and the `MeProfileService` reuse rationale (with the `TelegramEventTopicsService`-not-exported finding and the PR 1/6 duplication precedent); the `forwardRef(MeProfileModule)` wiring in `AuthModule` plus the unanticipated `forwardRef(AuthModule)` fix required inside `me-profile.module.ts` itself, called out prominently (same treatment as PR 2's `ISS-BOT-REG-001` callout), including the root-cause explanation (`main-bootstrap.spec.ts` catching an `UndefinedModuleException` via a second pre-existing scan path through `LeadsModule`/`InteractionsModule`/`TelegramModule`) and the forward-looking rule it implies for future bidirectional module edges; the `intent='learn'` scope-narrowing decision with AC-7 cited as its regression guard (same posture as PR 3's streak-gap documentation); the `BP-UAT-003` adjacency finding (real topical/resource overlap via AC-3/Steps 006-008, but web-only spec, no bot-surface steps — documented adjacency, not a gap, same treatment as PR 4's `BP-UAT-012` finding); and the test/verification numbers (apps/api 1470/1471 with the one pre-existing unrelated flake independently git-stash-verified this workflow; apps/bot 146/146). Phrased in present/implemented-not-yet-merged tense, matching PR 1-4's own precedent of writing this entry before their own merge. |
| `docs/03-requirements/FR-BOT-002.md` | `## Implementation progress` (intro paragraph) | Updated the "do not infer completeness" framing sentence: replaced the stale "5-of-10-command slice" wording (accurate as of PR 4, now stale) with "while PR 6/6 (`/upgrade`) remains unshipped," and updated "unchanged by this PR" → "unchanged through PR 5" for the `requirements-registry.md` cross-reference, since this paragraph is a running status statement each PR in the sequence keeps current, not a historical record of PR 4's state. |
| `docs/03-requirements/FR-BOT-002.md` | `## Implementation progress` (Planned follow-up PRs table) | Removed the `5/6` row (now shipped, documented in its own paragraph above per the table's own established convention — PRs 1-4 followed the identical pattern of removing their own row once shipped). Table now lists only `6/6 — /upgrade`. |

## Documents Not Updated

| Document | Reason |
|---|---|
| `docs/03-requirements/FR-BOT-002.md` frontmatter (`status:`) | Stays `Planned`, per this workflow's explicit instruction and the file's own established 4-PR precedent: the frontmatter enum has no "in progress" literal, and claiming `Implemented` for a partial-command slice (PR 6/6 still unshipped) would be dishonest. Confirmed unchanged — no edit made. |
| `docs/03-requirements/FR-BOT-002.md` frontmatter (`business_process:`) | Confirmed stays `[BP-UAT-010]` unchanged, per `01-requirement-validation.md`'s explicit finding: `BP-UAT-003` is a real topical adjacency (same `member_interests` resource, same `MeProfileService`) but is a web-only spec with zero bot-surface steps, so it is not force-linked. This is a documented adjacency, not a gap — recorded in the new PR 5/6 progress paragraph, not as a frontmatter change. No edit made to frontmatter. |
| `docs/03-requirements/FR-BOT-002.md` `## Acceptance criteria` table | Not touched. This table has never been retroactively expanded per-PR for sub-feature-level ACs (PR 3's streak gap and PR 4's PII-narrowing decision also did not get new rows here) — the workflow's own draft AC-1..AC-11 list lives in `01-requirement-validation.md` instead, consistent with existing practice across this FR's PR sequence. No existing row references `/interests`, so nothing needed toggling. |
| `docs/03-requirements/requirements-registry.md` | Status column for `FR-BOT-002` (row 58) confirmed as `In Progress`, set by PR 1, correctly left unchanged by every subsequent PR including this one — matches this workflow's explicit instruction not to flip it to `Shipped` before PR 6/6 lands. Verified by reading the table row directly; no edit made. |
| `docs/02-business-processes/uat/registry.md` | Checked directly. No new BP-UAT process is introduced or run by this PR (interests-toggle stays under the FR's existing `[BP-UAT-010]` linkage per the frontmatter decision above). `BP-UAT-003`'s registry row is unaffected — no new spec authored, no run performed, `Process Ref`/`Status`/`Last Run` columns for that row correctly remain `—`. No edit made. |
| `docs/04-development/architecture/architecture.md` | Considered and deliberately not changed. This PR adds a third `forwardRef`'d edge to `AuthModule`'s DI cycle graph (`RegistrationsModule`, then this PR's `MeProfileModule`, plus the newly-required `me-profile.module.ts`-side `forwardRef(AuthModule)`), but checked `architecture.md` directly (`Multi-tenancy implementation` section and a full-file search for `forwardRef`/module-cycle language) and confirmed it documents **no** per-module DI cycle detail anywhere — not even for the older, identical `RegistrationsModule` precedent this PR's fix mirrors. The cycle's rationale already lives entirely in code comments (`auth.module.ts`, `me-profile.module.ts`, cross-referencing `registrations.module.ts`'s original discovery), which is the established, sufficient documentation surface for this class of detail in this codebase — architecture.md operates at the module-boundary/data-flow level, not the individual-DI-edge level. Adding it here would be new-pattern documentation for something that isn't architecturally new (same cycle shape, same forwardRef fix, just a new pair of modules), and no other module's forwardRef edge is documented at this level either. Call: no change needed. Reasoning stated per the task brief's request to "make the call and state your reasoning either way." |
| `docs/04-development/design-system/...` | Not applicable — this PR has no UI surface change requiring design-system review (bot-only, Telegram inline keyboards, no web components). |
| `packages/shared-types/README.md` | Not applicable — no new shared-types schema introduced; the two new API routes use `interestsQuerySchema`/`toggleInterestBodySchema` Zod schemas local to `telegram-auth.service.ts`, consistent with every other `TelegramInternalController` route in this sequence (none of which added shared-types entries either). |
| `docs/runbooks/` | Not applicable — no new operational scenario; this is a straightforward proxy route with no new deploy/ops procedure. |
| ADRs (`docs/adr/`) | Not applicable — no new architecture decision; this PR reuses an existing service and an existing, twice-precedented forwardRef pattern rather than introducing a new one. |

## Gate Result

```yaml
gate: doc-writer
status: passed
reasoning: >
  All required documentation updates for this PR made directly to
  FR-BOT-002.md's "## Implementation progress" section, following PR 4's
  exact prose structure/density as the closest precedent: new PR 5/6
  shipped paragraph (API surface, MeProfileService reuse rationale, the
  forwardRef(MeProfileModule) wiring plus the prominently-called-out
  unanticipated forwardRef(AuthModule) fix inside me-profile.module.ts,
  the intent='learn' scope decision with AC-7 as its regression guard, the
  BP-UAT-003 documented-adjacency finding, and verification numbers),
  Planned-follow-up-PRs table reduced to just 6/6, and the intro
  paragraph's running slice-count language refreshed to stay accurate.
  requirements-registry.md and FR-BOT-002.md's business_process
  frontmatter both verified unchanged by direct read, not assumed.
  docs/02-business-processes/uat/registry.md checked and confirmed
  unaffected. architecture.md checked for existing DI-cycle documentation
  conventions (none exist, even for the older RegistrationsModule
  precedent this PR's fix mirrors) and deliberately left unchanged, with
  reasoning stated per the task brief's request.
blocking_issues: []
needs_clarification: []
notes: >
  INTENTIONAL, PRECEDENTED EXCEPTION to the standard workflow's "atomic FR
  status flip" requirement — QualityGate should NOT flag this as a missed
  status flip. FR-BOT-002.md frontmatter `status:` correctly stays
  `Planned` (not `Implemented`) and requirements-registry.md's Status
  column correctly stays `In Progress` (not `Shipped`), because
  FR-BOT-002 ships across a planned 6-PR sequence and this is PR 5 of 6 —
  PR 6/6 (`/upgrade`, depends on FR-AUTH-006) has not shipped yet. This is
  not a new precedent invented for this PR: PRs 1, 2, 3, and 4 of this
  exact FR all followed the identical pattern (frontmatter and registry
  both held at their in-progress values through 4 prior "shipped" PR
  entries), and the file's own "## Implementation progress" section
  documents the reasoning inline (the repo's FR frontmatter status enum
  has no "in progress" literal, so claiming `Implemented` for a partial
  slice would misrepresent unshipped commands as done — the same judgment
  call PR 2 made explicitly about not closing GitHub issue #140 early).
  The atomic-status-flip requirement will correctly apply once PR 6/6
  ships and the full 10-command FR is complete.
  Per this workflow's explicit instruction, no Step 13 post-merge UAT
  results are written into the doc yet — that happens later in this same
  workflow, after real merge, as a follow-up doc edit outside this
  DocWriter pass's responsibility. No placeholder text was added for it.
```
