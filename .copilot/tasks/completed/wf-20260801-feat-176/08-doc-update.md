# Step 9 — Documentation Update

## Atomic FR status flip — N/A for this multi-PR FR (matches PR 1/PR 2 precedent)

`FR-BOT-002.md`'s frontmatter `status` stays `Planned` (the repo's FR
status enum has no literal "in progress" value; PR 1's
`01-requirement-validation.md` already established this rationale, PR 2
carried it forward unchanged). `requirements-registry.md`'s Status column
for FR-BOT-002 stays `In Progress` (set by PR 1, correctly unchanged by
PR 2, correctly unchanged by this PR too — 4/10 commands remain after
this PR: `/leaderboard`, `/interests`, `/upgrade`, plus the general
`/start` refinements out of scope for the whole 6-PR sequence).
`handoff.yaml.expects_registry_update: false`, matching this rationale —
no atomic-pair status flip applies to this workflow.

## Updates made

1. `docs/03-requirements/FR-BOT-002.md`:
   - Functional-scope table `/me` row rewritten to reflect actual shipped
     scope (registrations + points, streak/account-type/link-CTA caveats
     inline).
   - Acceptance criteria: `/me correctly shows all active registrations
     with status badges` checked off.
   - Implementation progress: PR 3/6 section added (shipped), documenting
     the streak-omission and link-CTA decisions in full, matching the
     rigor PR 1/PR 2's own progress notes already established. Planned
     follow-up PRs table updated to drop the now-shipped PR 3/6 row.

2. `docs/03-requirements/requirements-registry.md`: unchanged (see
   rationale above — not a bug, matches PR 1/PR 2's precedent for this
   specific multi-PR FR).

## GitHub sync

`github_issue` frontmatter already set (`#140`, unchanged since PR 1).
Per `protocol.md`'s "GitHub Issue / Project Sync", `sync-github-project.sh
--status implemented` is called at Step 11.5 (after merge), not here —
this workflow does not close #140 (that only happens once ALL 6 PRs ship,
same as PR 2's own explicit note: "Did NOT close GitHub issue #140").

## Gate Result

gate_result:
  status: passed
  summary: "FR-BOT-002.md updated (functional-scope table, AC checkbox, Implementation progress section with both scope decisions documented in full). requirements-registry.md correctly left unchanged per the established multi-PR-FR precedent (status stays In Progress until all 6 PRs ship)."
  findings: []
