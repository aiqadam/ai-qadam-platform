# GitHub access — what's required to operate this repo's workflow

This is a checklist, not a secrets file. It lists what each developer (or
agent acting on a developer's behalf) needs to provision **on their own
machine** to run this repo's GitHub-facing automation — PR creation,
issue management, CI status checks. No actual credentials are stored here
or anywhere in this repo; see `.claude/CLAUDE.md`'s "Git credentials"
section for this machine's specific working setup and troubleshooting
history.

---

## 1. `gh` CLI, authenticated with the right scopes

Everything in `.copilot/workflows/*.md` and `scripts/workflow-finish.sh`
goes through the `gh` CLI, not raw REST calls. Required scopes:

| Scope | Why | Used by |
|---|---|---|
| `repo` | Create/merge/view PRs; create/close/comment on issues; read/write repo contents via the API | `gh pr create/merge/view/checks/edit`, `gh issue view/create/close/comment/reopen`, `git push` over HTTPS |
| `workflow` | Push commits that touch `.github/workflows/*.yml` (GitHub rejects these without it, even via PR) | Any workflow that edits CI config |
| `read:org` | Read org membership/team info (currently used incidentally, not load-bearing for any documented step) | — |

Verify with `gh auth status` — it should show `Token scopes:` including at
least `repo` and `workflow`. If missing:

```bash
gh auth login --hostname github.com --git-protocol https --scopes repo,workflow
```

This is interactive (the human types the PAT) — an agent cannot complete
this step unattended. If `gh auth status` shows "not logged in" mid-session,
stop and ask the human to run the above; do not loop asking for a token in
chat.

## 2. `gh`'s default-repo resolution must match the actual remote

Separate from auth — `gh`'s own default-repo cache can drift from
`git remote -v` (this bit us twice in one session after the
`tvolodi/aiqadam` → `aiqadam/ai-qadam-platform` migration, `ISS-MIGRATE-001`).
Verify:

```bash
gh repo view --json owner,name
```

Should report `owner.login: aiqadam`, `name: ai-qadam-platform`. If not:

```bash
gh repo set-default aiqadam/ai-qadam-platform
```

See `.claude/CLAUDE.md`'s "gh's cached default-repo can silently drift"
section for the full symptom writeup.

## 3. Git push transport (SSH vs HTTPS+credential-helper)

Either works — this repo doesn't mandate one. What matters is that
`git push` completes without an interactive credential prompt, since
agents can't answer one. Two supported paths, pick one:

- **HTTPS + credential helper** (this machine's current setup): git config
  `credential.helper` set to `manager` plus
  `credential.https://github.com.helper=!gh auth git-credential` — piggybacks
  on `gh`'s own auth from step 1, no separate key needed.
- **SSH key**: an ed25519 key registered on GitHub for the pushing account,
  loaded into `ssh-agent`, with `origin` set to
  `git@github.com:aiqadam/ai-qadam-platform.git`.

**Do not assume which one is configured on a given machine** — check
`git remote get-url origin` (scheme tells you) and `git config
credential.helper`, or just attempt a `git push` and diagnose from the
actual failure. Full troubleshooting history (including a same-machine
case where the "obviously correct" SSH key on disk belonged to a
*different* machine and had to be abandoned in favor of HTTPS) is in
`.claude/CLAUDE.md`.

## 4. Awareness of the `main` branch ruleset (read-only need, no extra scope)

`main` on `aiqadam/ai-qadam-platform` is covered by an active **repository
ruleset** (id `18687633`) requiring all changes to arrive via PR — this is
already `repo`-scope-readable/writable (rulesets aren't a separate
permission tier for PR-based workflows; you only need elevated access if
you intend to *change* the ruleset itself, which no documented workflow
step does). One easy-to-get-wrong detail: check for it with
`gh api repos/<org>/<repo>/rulesets`, **not**
`gh api repos/<org>/<repo>/branches/main/protection` — the latter only
sees *classic* branch protection and returns a false "not protected" 404
even when this ruleset is actively enforcing. See
`docs/04-development/workflow.md`'s "Git workflow" section for the
human-facing statement of the same rule ("Protected: no direct pushes, PR
required, CI must pass").

## 5. GitHub Projects (v2) — `project` scope (added 2026-07-29)

This repo's workflow uses a GitHub Project (v2) board, `ai-qadam-platform`
(project number `1`), as a synced mirror of every currently-open
`ISS-<n>` issue and non-terminal `FR-<CODE>` requirement — see
`.copilot/schemas/protocol.md` "GitHub Issue / Project Sync" for the full
mechanism and `scripts/sync-github-project.sh` for the implementation.
The markdown files under `.copilot/issues/` and `docs/03-requirements/`
remain authoritative for workflow gating (QualityGate's atomic-pair
check) and workflow resume — the Project board is a queryable
convenience view, not (yet — see the Phase 2 note in `protocol.md`) the
system of record.

**Required scope:** `project` (in addition to `repo`, `workflow`,
`read:org` from §1). Verify with `gh auth status` — Token scopes must
include `project`. If missing:
```bash
gh auth refresh -s project,read:project
```

**`Agent-Verified` vs. `Done` (added 2026-07-29):** this is a
volunteer-run community project, not a paid QA org — the Status field
splits "an agent finished everything it can verify" (`Agent-Verified`,
set automatically) from "a human volunteer spot-checked it"
(`Done`, human-only — no script ever sets this). See
`.copilot/schemas/protocol.md`'s "`Agent-Verified` vs. `Done`" subsection
for the full rationale.

**Fixed IDs** (confirmed live 2026-07-29 — re-verify via the commands
below if any of this starts failing, e.g. after an org/project reset):

| Item | Value | Verify with |
|---|---|---|
| Project number | `1` | `gh project list --owner aiqadam` |
| Project id | `PVT_kwDOEXUt6M4BewJJ` | same |
| Status field id | (fetch live — not hardcoded in the script) | `gh project field-list 1 --owner aiqadam --format json` |
| Status: Todo | `f75ad846` | GraphQL `field(name:"Status") { ... options { id name } }` |
| Status: In Progress | `47fc9ee4` | same |
| Status: Implemented | `f0db74f6` | same |
| Status: Agent-Verified | `875a2bc9` | same |
| Status: Done | `98236657` | same |
| Issue Type: Task | `IT_kwDOEXUt6M4CCp-w` | `repository.issueTypes` GraphQL query |
| Issue Type: Bug | `IT_kwDOEXUt6M4CCp-x` | same |
| Issue Type: Feature | `IT_kwDOEXUt6M4CCp-y` | same |

**Note on `gh issue create`/`gh issue edit`:** neither supports setting
Issue Type via CLI flag (confirmed against `gh` v2.83.1 `--help` output,
2026-07-29) — Issue Type requires the GraphQL `createIssue` (with
`issueTypeId`) or `updateIssueIssueType` mutation. `createIssue`'s
ProjectV2 attach field is `projectV2Ids` (not `projectIds`, which targets
legacy classic Projects) — easy to get wrong, confirmed via GraphQL
schema introspection. `scripts/sync-github-project.sh` handles all of
this; do not attempt `gh issue create --type` in ad hoc scripts, it does
not exist.

**Note on eventual consistency:** `createIssue`'s own mutation response
frequently returns an empty `projectItems` list even when the
`projectV2Ids` attachment succeeded (confirmed live 2026-07-29 — the
attachment is asynchronous relative to the mutation's return payload).
`sync-github-project.sh` polls (up to 5×, 1s apart) for the project item
to appear before giving up; a bare `createIssue` call elsewhere should do
the same rather than assuming the first response is authoritative.

## 6. CI secrets — provisioned separately, not via `gh auth`

`.github/workflows/*.yml` reference several GitHub Actions repo secrets
(`COOLIFY_TOKEN`, `PROD_SSH_DEPLOY_KEY`, `QA_SSH_DEPLOY_KEY`,
`WEB_NEXT_DEPLOY_KEY`, `TELEGRAM_ALERT_BOT_TOKEN`, `LHCI_GITHUB_APP_TOKEN`,
etc.). These are **repo-level GitHub Actions secrets**, configured once via
the GitHub web UI or `gh secret set` by whoever administers repo settings
— not something an individual developer's or agent's local `gh auth`
provisions, and not needed for local development or for any of the
`.copilot/` agentic workflow steps (they're consumed by CI runners, not by
`workflow-finish.sh` or any local script).

## 7. Fallback: `GITHUB_TOKEN` for `workflow-finish.sh`

`scripts/workflow-finish.sh` tries `gh pr create` first; if that fails, it
falls back to a raw REST API call using `GITHUB_TOKEN` if set in the
environment (a classic PAT with at least `repo` scope). This exists as a
last-resort fallback for environments where `gh` itself isn't
usable/authenticated — normal operation should never need it if step 1
above is satisfied.

---

## Not covered here: infrastructure/server access

Server-level access (Coolify deploy tokens, SSH to prod/QA hosts,
Authentik admin tokens, `RESEND_API_KEY`, etc.) is a separate, higher-blast-radius
credential set from everything above — those let you deploy and touch live
infrastructure, not just GitHub. See `docs/04-development/infrastructure/`
for what exists; this doc intentionally stops at "what's needed to open a
PR and manage issues," not "what's needed to operate production."
