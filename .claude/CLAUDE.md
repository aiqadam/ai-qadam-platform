# CLAUDE.md — Claude Code Configuration

> **`AGENTS.md` is the master rule file.** Claude Code reads it automatically at
> session start. This file contains only Claude Code–specific additions.
>
> Edit `AGENTS.md` for shared rules. Edit this file for Claude Code–only behavior.
> Do not duplicate rules here that already exist in `AGENTS.md`.

If a rule here conflicts with a user request, **stop and ask** before proceeding.

---

## Required reading at session start

Before writing any code in a new session, read these files in this order:

1. `AGENTS.md` — master rules (loaded automatically, but re-read if anything feels
   unclear)
2. `docs/01-business/project.md` — business context
3. `docs/04-development/architecture/architecture.md` — technical structure
4. `docs/04-development/standards.md` — code standards
5. `docs/04-development/workflow.md` — process rules
6. `docs/04-development/security/security.md` — security baseline
7. `docs/05-other/ai-collab.md` — how we work together
8. `docs/01-business/glossary.md` — domain terms
9. `docs/04-development/design-system/Design system for AI agents/readme.md` —
   **required before any UI work**: brand tokens, component classes, copy rules,
   icon policy (Lucide only), color rules (no raw hex, no gradients, no new tokens)

If any of these files is missing or contradicts another, **stop and report it** before
proceeding.

---

## Shell and agentic behavior

Claude Code has shell access and runs commands autonomously. These additional rules
apply on top of `AGENTS.md` Section 6:

- **Never `rm -rf` outside the repository working directory.**
- **Never run `pnpm db:migrate` automatically.** Generate migration files; the user
  runs them.
- **Never push to remote** without explicit user instruction in chat.
- **Before any destructive shell command**, state what it does and why, and wait for
  explicit confirmation.
- **Prefer `pnpm`** over `npm` or `yarn` for all package operations in this repo.

### Git Bash / MSYS mangles `git show <ref>:<path>` (recorded 2026-07-18)

Git Bash (MSYS) auto-converts path-like arguments before the command
runs, corrupting `git show <ref>:<path>` refs (e.g.
`origin/main:.copilot/context/workspace-state.md` → garbage) into a
`fatal: ambiguous argument` error that looks like a real bug but isn't.

**Fix:** prefix with `MSYS_NO_PATHCONV=1`, e.g.
`MSYS_NO_PATHCONV=1 bash scripts/check-workflow-state.sh --base "origin/main"`.
That script (Step 0.5 of every workflow) hits this internally — always
invoke it with the prefix or it falsely reports an invocation error
(exit 2) unrelated to actual drift.

## Git credentials (RESOLVED 2026-06-29 via Quest: ISS-UAT-013-4 workflow)

### Symptom
`workflow-finish.sh` (and any `git push`) repeatedly prompted for `Username` and
`Password for 'https://tvolodi@github.com'`. Tiring — every workflow blocked on
interactive input that the agent cannot provide.

### Root cause
The repo's `origin` was HTTPS (`https://github.com/tvolodi/aiqadam.git`) with no
`credential.helper` configured, so Git had no way to cache the PAT.

### Permanent fix (already applied on viktor's machine)

1. Generated ed25519 SSH key (no passphrase):
   `ssh-keygen -t ed25519 -f %USERPROFILE%\.ssh\id_ed25519 -N "" -C viktor@tvolodi.local`
2. Wrote `%USERPROFILE%\.ssh\config` with `Host github.com` → IdentityFile
   `id_ed25519`, `IdentitiesOnly yes`, `AddKeysToAgent yes`.
3. Added the key to GitHub Settings → SSH and GPG keys (or via `gh ssh-key add`
   after `gh auth refresh -s admin:public_key`).
4. `git remote set-url origin git@github.com:tvolodi/aiqadam.git` (this repo only).
5. `git config --global --unset credential.helper` so HTTPS doesn't compete with SSH.
6. `ssh-add $env:USERPROFILE\.ssh\id_ed25519` so ssh-agent holds the key.

### Verification
`ssh -T git@github.com` prints `Hi tvolodi! You've successfully authenticated...`
and `git push` succeeds with no prompt.

### Future agents — what to do if you ever see this prompt again
**Do NOT loop asking the user for the PAT.** Instead:

1. Check `git config --global credential.helper` — if empty, configure SSH (steps
   1–6 above) OR run `git config --global credential.helper manager` (caches the
   PAT in Windows Credential Manager after the user types it once).
2. Check `git remote get-url origin` — if `https://`, propose switching to
   `git@github.com:<org>/<repo>.git` if an SSH key is present.
3. Document your fix in this section under a new heading (date + symptom).

### Local override — tvolodi's Windows workstation (recorded 2026-07-03 by wf-20260703-uat-063)

**Do NOT use the SSH fix above on this machine.** The ed25519 key at
`%USERPROFILE%\.ssh\id_ed25519` exists but it is **not** the key registered on
GitHub for `tvolodi` — GitHub rejects it with `Permission denied (publickey)`.
The key on disk belongs to a different machine.

This machine's actual working configuration is:

- `git remote get-url origin` → `https://github.com/aiqadam/ai-qadam-platform.git`
  (HTTPS; migrated from `https://github.com/tvolodi/aiqadam.git` per
  `ISS-MIGRATE-001` — see the "Origin migrated" subsection below for the
  `gh` default-repo gotcha this caused).
- `git config --global credential.helper` → `manager` plus
  `credential.https://github.com.helper=!gh auth git-credential`.
- `gh auth status` shows logged-in to `github.com` account `tvolodi` with
  `repo` scope and `Git operations protocol: https`.

So `git push` works directly on this machine — no prompt, no PAT, no SSH key
needed. **Future agents: just `git push` and `gh pr create`.** Do not try to
switch the remote to `git@github.com:...`; do not try to load the local
`id_ed25519` into ssh-agent; do not loop asking for a PAT.

If `gh auth status` ever shows "not logged in" on this machine, run
`gh auth login --hostname github.com --git-protocol https --scopes repo,workflow`
interactively (the user types the PAT) — that's the only auth path that's
known to work here.

### `gh`'s cached default-repo can silently drift from `git remote` (recorded 2026-07-18)

Since the origin migration (`ISS-MIGRATE-001`), `git remote get-url origin`
correctly resolves to `aiqadam/ai-qadam-platform` — but `gh`'s own
*default-repo resolution* (used internally by `gh pr create`, `gh issue view`,
etc. when no `--repo` flag is given) can independently resolve to the OLD
`tvolodi/aiqadam` repo even when `git remote -v` is already correct. This
caused `gh pr create` inside `scripts/workflow-finish.sh` to fail with a
confusing, non-obvious error (`No commits between main and <branch>` — a
symptom of `gh` targeting the wrong repo, not an actual problem with the
branch), silently falling back to a compare-URL instead of a real PR.

**Symptom check:** `gh repo view --json owner,name` — if `owner.login` is
`tvolodi` instead of `aiqadam`, this is happening.

**Fix:**
```bash
gh repo set-default aiqadam/ai-qadam-platform
```
Run this once per fresh terminal/session if `gh pr create` fails
mysteriously despite `git push` having succeeded. After the fix,
`gh repo view` should report `owner.login: aiqadam`, `name: ai-qadam-platform`.

If `workflow-finish.sh` reports "Could not create PR automatically" and
falls back to a compare-URL, check this FIRST before assuming a real PR
API failure — it has been the actual root cause both times this has
happened in an agent session so far.

---

## How to handle conflicts with user requests

If the user asks for something that violates `AGENTS.md` or this file:

1. Stop. Do not partially comply.
2. Quote the specific rule being violated and explain why it exists.
3. Suggest an alternative that achieves the user's goal without violating the rule.
4. Proceed only if the user explicitly overrides the rule in chat.
5. Note the override in the PR description under "Risks."

---

## Multi-agent development system

This repo has a full agentic workflow system under `.copilot/`. When the user
asks you to implement a feature or fix a bug, you can run as the **Orchestrator**
and invoke specialized subagents.

### Quick start

1. Read `.copilot/agents/orchestrator.md` — your role as Orchestrator
2. Read the relevant workflow: `.copilot/workflows/requirement-development.md`
   or `.copilot/workflows/issue-resolution.md`
3. Check current workspace state: `.copilot/context/workspace-state.md`
4. Read and increment the ID counter: `.copilot/meta/next-workflow-id`

### Agents available

Agent definitions live in `.copilot/agents/` (one file per agent: orchestrator,
requirement-analyst, impact-analyzer, db-migration-author, code-developer,
security-reviewer, test-strategist, test-designer, test-runner, doc-writer,
quality-gate, business-analyst, uat-runner, visual-reviewer, pr-steward). Shared
protocol (gate format, retry limits, finish script) is in
`.copilot/schemas/protocol.md`.

The same 15 agents are also exposed as thin wrappers for other tools, all
pointing back to `.copilot/agents/<name>.md` as the single source of truth:
`.github/agents/*.agent.md` (GitHub Copilot) and `.kilo/agents/*.md` (Kilo
Code). When adding or renaming an agent, update all three locations.

**Agents CAN read images.** The Read tool renders PNG/JPG files natively.
Any agent (especially visual-reviewer in uat-verification Step 3.5) that
claims it cannot view screenshots is violating protocol — see
`docs/04-development/testing/visual-testing.md`.

**The `PRSteward` agent** (see `.copilot/agents/pr-steward.md` and
`AGENTS.md` §6.3) is the designated decision-maker for CI override
calls at workflow step 11.4. It is **independent of the PR producer**:
the same PRSteward decides regardless of whether the PR was written
by Orchestrator (docs-only), CodeDeveloper, TestRunner, or UATRunner.
It only stops when the §6.3 envelope says stop (introduced-by-this-PR,
new-failure-class, counter-exhausted, security-check, secrets). The
counter file is `.copilot/meta/ci-override-counters.json`.

### Workflow finish script

`scripts/workflow-finish.sh` is the canonical last action of every workflow —
commits pending artifacts, pushes, creates a GitHub PR, writes the PR URL
back into `handoff.yaml`, and returns to `main`.

### MANDATORY WORKFLOW RULES

**These rules are non-negotiable. Violations require stopping and reconciling.**

1. **ALWAYS create a feature/fix branch before any code changes.**
   When the user asks to implement a feature or fix a bug:
   - Step 0: Check clean tree, fetch origin main, checkout main, pull --rebase
   - Read and increment `.copilot/meta/next-workflow-id`
   - Create task directory `.copilot/tasks/active/<workflow-id>/`
   - Create `handoff.yaml` from schema
   - Create branch: `feature/<area>-<n>-<slug>` or `fix/ISS-<n>-<slug>`
   - Only then write any code

2. **Clean-Tree Invariant.** Every workflow ends with a synced, clean tree.
   - Working tree MUST be clean before creating a branch (Step 0)
   - Commit all changes before calling `workflow-finish.sh`
   - Return to main after workflow completes

3. **Use `workflow-finish.sh` for commit/push/PR.** Do not reimplement commit/push/PR
   logic. Read `.copilot/schemas/protocol.md` for invocation flags and pre-push checks.

4. **Step 0.5 Context Sync is blocking.** Before advancing past step 0, run
   `scripts/check-workflow-state.sh --base "origin/main"`. If it fails, reconcile
   state before proceeding.

5. **Never write code directly on main.** Every change must be on a feature/fix
   branch and go through the workflow to PR.

6. **Production-readiness and infra obligations (AGENTS.md §6.1) are
   blocking.** When a workflow's ACs require live infrastructure and the
   stack is incomplete, the Orchestrator (which has terminal access) MUST
   bring it up — `docker compose up -d <missing-services>` followed by a
   pre-flight `curl -fsS` against each required service — before
   classifying any test as "deferred." The only acceptable deferral is
   one with a named, queued follow-up workflow ID written into the issue's
   Resolution section. See `AGENTS.md` §6.1 for the full rule.

---

## This file is NOT auto-generated

`AGENTS.md` is the single source of truth for shared rules. Tool config files
(`.cursorrules`, `.windsurfrules`, `.clinerules`,
`.github/copilot-instructions.md`) are auto-generated via `pnpm ai:sync`.

This file is hand-maintained. Keep it short.
