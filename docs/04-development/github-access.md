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

## 5. GitHub Projects — not currently used

This repo's workflow does **not** use GitHub Projects (boards/ProjectV2).
Issue tracking is entirely via GitHub Issues + this repo's own
`.copilot/issues/registry.md` mirror. If Projects integration becomes a
real requirement later, it needs its own scope (`project`, via
`gh project` subcommands or the ProjectV2 GraphQL API) — not covered by
anything above. Flag this explicitly if a future task asks for it; don't
assume the existing `repo` scope covers it (it doesn't).

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
