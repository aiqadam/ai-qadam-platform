# Doc Update — wf-20260731-feat-174 (FEAT-BOT-2 PR 1/6)

workflow: wf-20260731-feat-174
agent: DocWriter (performed directly by Orchestrator)

---

## Required updates

1. **FR status note (NOT a terminal flip — intentional, per task
   instruction).** `docs/03-requirements/FR-BOT-002.md`:
   - `status:` frontmatter left at `Planned` (unchanged) — no better enum
     value exists (repo's frontmatter enum: `Shipped`/`Implemented`/
     `Planned`/`Not Started`/`Proposed`, no literal "in progress"); task
     explicitly forbids flipping to `Implemented` for a 3/10-command
     slice.
   - `business_process: []` frontmatter field added (Step 1) — this FR
     predated the Business-Process Linkage convention (added 2026-07-25)
     and had no such field before this workflow.
   - `/events` AC checked off (`[x]`) — the one FR-level AC this PR's
     slice actually satisfies (see `06-test-strategy.md`'s AC Mapping).
   - `X-Internal-Token` → corrected to the real wire header name
     (`x-internal-auth`) in the Notes section — a pre-existing inaccuracy
     in the FR doc, caught while implementing against the real
     `InternalAuthGuard` code.
   - New `## Implementation progress` section: names what shipped in this
     PR, states the frontmatter/registry status rationale, and tables the
     5 remaining planned PRs by scope + dependency (2/6 register+cancel,
     3/6 me, 4/6 leaderboard, 5/6 interests, 6/6 upgrade) — so a future
     workflow picks up the plan without re-deriving it, per the task's
     explicit instruction.
2. **Registry status flip.** `docs/03-requirements/requirements-registry.md`
   row 58 (FR-BOT-002): `Planned` → `In Progress` (exact casing matches
   the existing row-9 `FR-AUTH-002` precedent in the same table/column —
   the multi-PR-FR-in-progress case this repo has already established).
   NOT `Shipped` — per task instruction, since only 3/10 commands landed.
3. **`.copilot/context/workspace-state.md`** — new entry prepended (see
   below), summarizing the PR, the reuse-vs-duplicate architectural
   decision, and honestly stating what's unit-tested-only vs. what would
   need live verification.
4. **GitHub sync (best-effort).** `scripts/sync-github-project.sh --ref
   FR-BOT-002 --status implemented --existing-url
   https://github.com/aiqadam/ai-qadam-platform/issues/140` — run as part
   of this step's commit sequence below, per
   `requirement-development.md` Step 9's own instruction. Not
   `agent-verified` yet: `business_process` is `[]` for this PR (Step 13
   is skipped), so per Step 11.5's own branching rule this syncs to
   `agent-verified` directly at Step 11.5 post-merge, not here — `implemented`
   is the correct pre-merge value here, matching the FR-BOT-001 precedent's
   own sequencing.

## Atomicity

Both `FR-BOT-002.md` and `requirements-registry.md` edits are staged in
the same commit as the substantive code (API + submodule pointer bump),
per the Atomicity rule in `protocol.md`'s Status-Consistency Check section
— not a separate follow-up commit.

## Gate Result

```yaml
gate: doc-writer
workflow: wf-20260731-feat-174
status: passed
timestamp: 2026-08-01T01:45:00Z
summary: >
  FR-BOT-002.md: business_process frontmatter added, /events AC checked,
  X-Internal-Token corrected to x-internal-auth, new Implementation
  progress section names this PR's scope + the 5 remaining planned PRs by
  scope/dependency. requirements-registry.md row 58 flipped Planned -> In
  Progress (matches FR-AUTH-002 row-9 precedent exactly). Neither file
  flipped to a terminal Shipped/Implemented status, per task instruction
  (3/10 commands only). workspace-state.md entry added. Both status-pair
  files staged in the same commit as the substantive code change.
next_agent: quality-gate
```
