# Step 9: Documentation Update — FR-BOT-002 PR 4/6 (`/leaderboard`)

## Required updates

1. **`docs/03-requirements/FR-BOT-002.md`**:
   - AC checkboxes: `/leaderboard shows top 10...` and `A temporary user
     is excluded from /leaderboard results` both flipped `[ ]` → `[x]`.
   - `status:` frontmatter **unchanged** (`Planned`) — this FR ships
     across 6 PRs; per the task instruction and the same rationale PR
     1-3 already established (the repo's FR frontmatter enum has no
     "in progress" literal), `Implemented` is not claimed for a
     6-of-10-command slice.
   - `business_process:` frontmatter **unchanged** (`[BP-UAT-010]`) —
     this PR's own surface (leaderboard) does not touch BP-UAT-010, but
     the field represents the FR as a whole (PR 2/3 do touch it), and
     `BP-UAT-012` (the topically-correct match for leaderboard) has no
     spec/process_ref/run history to link to instead. Documented as a
     legitimate gap in the new Implementation-progress prose, not forced.
   - "Implementation progress" section: added a full "PR 4/6 (this
     PR) — shipped" entry (API/bot changes, design decisions, live
     temp-exclusion verification summary, business_process reasoning),
     removed PR 4/6's row from the "Planned follow-up PRs" table (now
     only 5/6, 6/6 remain).

2. **`docs/03-requirements/requirements-registry.md`**: **no change** —
   row 58 (`FR-BOT-002`) already shows `In Progress` (set by PR 1/6,
   unchanged by PR 2/3), and stays that way per this PR's task
   instructions — an FR shipping across a 6-PR sequence stays "In
   Progress" until the final PR, matching the `FR-AUTH-002` precedent PR
   1's own workflow already established.

## Atomicity note

This is a **multi-PR FR** (documented explicitly in `FR-BOT-002.md`'s own
"Implementation progress" section header). The atomic-pair rule in
`protocol.md` ("Status-Consistency Check") governs the *terminal* status
flip (`Planned`/`In Progress` → `Implemented`/`Shipped`) — this PR does
not perform that flip (neither file changes to a terminal status), so
the atomic-pair requirement does not apply here the way it would for a
single-PR FR. What DOES apply and IS satisfied: `FR-BOT-002.md` itself is
modified in this PR's diff (AC checkboxes + Implementation-progress
prose), matching PR 1/2/3's own established precedent for how a
multi-PR FR's DocWriter step behaves at a non-terminal PR.

## GitHub sync

`github_issue` frontmatter is set
(`https://github.com/aiqadam/ai-qadam-platform/issues/140`). Per
`protocol.md`'s "GitHub Issue / Project Sync", sync to `implemented`
(not `agent-verified` — no `business_process` link applies to this PR's
surface, so there is nothing for Step 13 to re-verify, but the FR as a
whole is still mid-sequence, matching PR 2/3's own choice to leave issue
#140 open since it tracks the full 10-command FR):

```bash
scripts/sync-github-project.sh --ref FR-BOT-002 --status implemented \
  --existing-url "https://github.com/aiqadam/ai-qadam-platform/issues/140"
```

Best-effort, non-blocking per protocol — logged here regardless of
outcome.

## Gate Result

gate_result:
  status: passed
  summary: "FR-BOT-002.md's AC checkboxes and Implementation-progress section updated to reflect PR 4/6 shipped; requirements-registry.md correctly left unchanged (already In Progress, stays so until the final PR in this 6-PR sequence)."
  findings:
    - "This is a non-terminal PR in a multi-PR FR — the atomic terminal-status-flip rule does not apply the way it would for a single-PR FR, matching PR 1/2/3's own established precedent."
    - "business_process frontmatter deliberately left unchanged — this PR's surface doesn't touch BP-UAT-010, and BP-UAT-012 (the topical match) has no spec to link to; recorded as a gap in the FR's own prose, not silently ignored."
