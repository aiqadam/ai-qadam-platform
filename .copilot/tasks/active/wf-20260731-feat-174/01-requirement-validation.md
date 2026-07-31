# Requirement Validation — wf-20260731-feat-174

workflow: wf-20260731-feat-174
agent: RequirementAnalyst (performed directly by Orchestrator per dispatch
brief — the requirement's scope, precedent, and business-process linkage
question were already substantially resolved in the invoking task; this
step formalizes that analysis into the standard artifact rather than
re-deriving it from scratch).

---

## Source

`docs/03-requirements/FR-BOT-002.md` ("Bot member commands") — read in
full. Full functional scope is 10 commands covering the entire member
journey (`/start` already shipped via FR-BOT-001; `/events`, `/event`,
`/register`, `/cancel`, `/me`, `/leaderboard`, `/interests`, `/upgrade`,
`/help` remain). This is PR 1 of a planned 6-PR sequence, scoped by the
invoking task to the **read-only, lowest-risk slice only**.

## Scope of this PR (FEAT-BOT-2)

In scope:
- `/help` — lists commands with one-line descriptions.
- `/events` — paginated list of upcoming events for the caller's country.
- `/event <N>` — full detail for one event, with a Register/I'm-going
  button (placeholder callback; `/register` itself is PR 2).
- New API surface: `GET /v1/internal/telegram/events`,
  `GET /v1/internal/telegram/events/:id` — both `InternalAuthGuard`-protected,
  Zod-validated at the controller boundary, alongside the existing
  `lookup`/`upsert-temp-user` routes in
  `apps/api/src/modules/auth/auth.controller.ts`.

Explicitly out of scope (separate, already-planned follow-up workflows):
`/register`, `/cancel`, `/me`, `/leaderboard`, `/interests`, `/upgrade`,
and any refinement of `/start`'s country/interest-selection FSM (that's
FR-BOT-001's territory, already shipped in PR #197).

This is a **testable, non-conflicting, architecturally feasible** slice —
it reuses the exact `InternalAuthGuard` + Zod-at-boundary pattern the
already-shipped `lookup`/`upsert-temp-user` routes established, and the
bot-side conventions (middleware stack, locale lookup, handler
registration) FR-BOT-001 already scaffolded. No new architectural pattern
is introduced.

## Precedent for multi-PR FR tracking

`FR-AUTH-002.md` (`Telegram authentication`) is the direct precedent for a
single FR shipped across multiple PRs: its frontmatter stayed
`status: Implemented` after its first PR (API layer only), while
`requirements-registry.md`'s Status column used `In Progress` ("partially
merged; remaining sub-items open" — exact registry legend text), and the
FR file itself grew a `## Implementation status` section listing what
shipped + a "Deferred to subsequent PRs" table. This PR follows the same
shape for FR-BOT-002:
- Frontmatter `status:` stays `Planned` (unchanged) — the repo's frontmatter
  enum (`Shipped`/`Implemented`/`Planned`/`Not Started`/`Proposed`) has no
  literal "in progress" value, and per task instruction this workflow does
  NOT flip to `Implemented` (only 3/10 commands land). Flipping to
  `Implemented` would overclaim; there's no better frontmatter value
  available, so per the task's own fallback instruction ("if none exists,
  leave it at its current status and just add the progress note to the FR
  file itself") frontmatter is left at `Planned`.
- Registry Status column flips `Planned` → `In Progress` (exact existing
  value, row 9 `FR-AUTH-002` precedent) — this is the correct signal:
  work has started and partially shipped, not zero progress.
- `## Implementation progress` section added to `FR-BOT-002.md` (Step 9)
  naming what shipped in this PR and the 5 remaining planned PRs by scope,
  mirroring `FR-AUTH-002.md`'s "Deferred to subsequent PRs" table format.

## Business-Process Linkage

Checked `docs/02-business-processes/uat/registry.md` for a matching
`BP-UAT-NNN` by module/surface:
- `BP-UAT-010` ("Event registration flow") is the closest by name, but its
  actual spec (`apps/e2e/tests/uat/BP-UAT-010.spec.ts`) covers the WEB
  registration flow, not bot browsing — and this PR explicitly excludes
  `/register` (the one command that would actually touch BP-UAT-010's
  surface). Linking it now, before `/register` ships, would create a
  premature post-merge UAT re-run obligation against a business process
  this PR doesn't actually touch yet.
- `BP-UAT-013` ("Member signup and operator onboarding") — covers
  lead→signup, not bot event browsing.
- No existing BP-UAT script documents "member browses/reads events via the
  Telegram bot" as an end-to-end business process. This is consistent
  with FR-BOT-001 (the bot scaffold PR immediately prior in this same
  sequence), which also set `business_process: []` for the identical
  reason (see its `01-requirement-validation.md` in
  `.copilot/tasks/completed/wf-20260731-feat-171/`).

**Decision: `business_process: []` (`—`) for this PR.** Step 13
(post-merge UAT re-verification) is skipped. When PR 2 of this sequence
ships `/register` (which DOES call into the real registration flow
`POST /v1/events/:id/register` per FR-BOT-002's functional-scope table),
that PR is the natural point to link `BP-UAT-010` — the bot's write path
into the registration flow is what BP-UAT-010 actually exercises
end-to-end, not the read-only browse surface this PR adds. Noting this
explicitly so PR 2's own Step 1 doesn't have to re-derive it.

## FR-BOT-002.md frontmatter updates (this step)

- `business_process: []` field added to frontmatter (was absent — FR-BOT-002
  predates the Business-Process Linkage convention, added 2026-07-25,
  since this FR's frontmatter shows no such field currently). See file
  diff.
- `github_issue` already set (`https://github.com/aiqadam/ai-qadam-platform/issues/140`,
  pre-existing) — no change needed. Synced Project board Status to
  `in-progress` via `scripts/sync-github-project.sh` (confirmed:
  `GITHUB_ISSUE_URL=https://github.com/aiqadam/ai-qadam-platform/issues/140`,
  exit 0).

## Gate Result

```yaml
gate: requirement-analyst
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-07-31T00:05:00Z
summary: >
  FR-BOT-002 scope narrowed to the read-only slice (/help, /events,
  /event <N>) per the invoking task. Testable, non-conflicting,
  architecturally feasible — reuses the existing InternalAuthGuard +
  Zod-at-boundary pattern and FR-BOT-001's bot-side scaffold conventions.
  business_process: [] (no existing BP-UAT script covers bot event
  browsing; the closest candidate, BP-UAT-010, covers the write/register
  path this PR explicitly excludes — deferred to PR 2 of this sequence).
  Multi-PR tracking follows the FR-AUTH-002 precedent: frontmatter stays
  Planned (no better enum value exists per task instruction), registry
  flips to "In Progress" (exact existing legend value), FR file gains an
  Implementation progress section at Step 9.
next_agent: impact-analyzer
```
