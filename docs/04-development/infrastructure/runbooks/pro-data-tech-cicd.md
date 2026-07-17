# Runbook: CI/CD deploy to pro-data.tech (QA + prod)

**Audience:** Agent-Infra (or whoever owns `.github/workflows/ci-cd.yml` and `deploy.sh` going forward), and anyone debugging a failed `deploy-qa`/`deploy-prod` GitHub Actions run.
**Pre-reading:** [ADR-0002](../../../adr/0002-deployment-target.md) (the *other* deployment target — read the "Two deployment targets" note below before assuming this is the only pipeline). No ADR exists yet for the pro-data.tech target; writing one is recommended follow-up, see References.
**Procedure source:** built 2026-07-17 by the `ai-qadam-infra` management repo (external, host/secrets-owning), tasks T-0110–T-0113. This runbook is a handoff snapshot, not the source of truth for host state — see "Ownership boundary" below.

## Architecture in one paragraph

Two independent Ubuntu 26.04 VMs at **pro-data.tech** (not hyperapp.cloud, not Coolify) run this monorepo's `apps/api` via Docker Compose: `pro-data-tech-qa` (`95.46.211.230`, host `qa-uz.aiqadam.org`) and `pro-data-tech-prod` (`95.46.211.224`, host `aiqadam.org`, also running Penpot — unrelated, don't touch it). Both hosts have a dedicated, low-privilege `deploy` system user reachable only by a per-host ed25519 SSH key whose `authorized_keys` entry forces execution of one script (`deploy/deploy.sh`) — the SSH client cannot run anything else, ever, even if the key leaks. `.github/workflows/ci-cd.yml` (added by this repo, independent of `deploy.yml`/`ci.yml`) has three jobs: `build` (lint/typecheck/test/build, hard-fails, blocks deploy), `deploy-qa` (auto on push to `main`), `deploy-prod` (manual `workflow_dispatch`, gated by a GitHub-native required-reviewer approval). The workflow tells `deploy.sh` which commit to deploy by encoding it into the SSH command string itself (`deploy:<sha>`), which OpenSSH exposes to the forced command via `$SSH_ORIGINAL_COMMAND` even though the command the client sent is otherwise discarded.

```
push to main ──► build job (lint/typecheck/test/build) ──► deploy-qa job
                                                                  │
                                       ssh deploy@qa-host "deploy:<sha>"
                                                                  │
                                                                  ▼
                                              deploy.sh (forced command only)
                                          validates <sha> → git fetch/checkout
                                          → docker compose up -d --build
                                                                  │
                                                                  ▼
                                        writes .last-deployed-commit(.previous)

workflow_dispatch (git_ref input, human-approved via "production" environment)
                                                                  │
                                       ssh deploy@prod-host "deploy:<sha>"
                                                          (same deploy.sh contract)
```

## ⚠️ Two deployment targets exist — read this before touching anything

This repo already has an accepted deployment architecture: [ADR-0002](../../../adr/0002-deployment-target.md) — single host `aiqadam-web` (`212.20.151.29`, hyperapp.cloud, Coolify-orchestrated) — with its own runbooks (`coolify-bootstrap.md`, `coolify-app-stacks.md`) and its own live GitHub Actions pipeline, `.github/workflows/deploy.yml`, which still fires on every push to `main` via `COOLIFY_TOKEN`.

**The pro-data.tech pipeline documented here is a second, independent deployment target that this repo has no ADR for.** It was stood up entirely from the infra-management side (see "Ownership boundary" below) in response to an out-of-band request, without — as far as this runbook's author can tell from the repo at hand-off time — a corresponding architectural decision on the app-repo side about why a second target exists, which one is authoritative, or whether Coolify is being phased out.

**Do not assume either pipeline is deprecated.** Both are live and both will run on every push to `main` unless someone changes that. If you are Agent-Infra (or the person who owns this repo's deploy architecture) and you are reading this for the first time, the immediate next step is almost certainly: **write an ADR reconciling the two targets** (which one is production-authoritative, whether pro-data.tech is a QA-only target long-term or a planned Coolify replacement, what happens to `deploy.yml` once that's decided) before building further on either one. See References.

## File inventory

### In this repo (`aiqadam/ai-qadam-platform`)

| Path | Purpose |
|---|---|
| `.github/workflows/ci-cd.yml` | The pipeline itself — `build`/`deploy-qa`/`deploy-prod` jobs. Added on branch `add-ci-cd-workflow`, [PR #15](https://github.com/aiqadam/ai-qadam-platform/pull/15) — **status at hand-off: OPEN, NOT MERGED.** Merging is what makes `deploy-qa` fire for real; until then this file exists only on that branch. |
| `.github/workflows/deploy.yml` | The *other* pipeline (Coolify/hyperapp.cloud, ADR-0002). Untouched by this work. Still live. |
| `.github/workflows/ci.yml` | Pre-existing CI, deliberately advisory-only (`continue-on-error: true` on all jobs) per an earlier decision recorded 2026-06-29/07-03 in this repo's own history — untouched, not to be confused with `ci-cd.yml`'s own hard-fail `build` job, which is a separate, independent gate. |

### On each host (`pro-data-tech-qa` / `pro-data-tech-prod`, both under `/opt/apps/aiqadam-<env>/`)

| Path | Mode / owner | Purpose |
|---|---|---|
| `deploy/deploy.sh` | `750 deploy:deploy` | The forced-command target. Full script body reproduced below. |
| `deploy/deploy.sh.pre-T0113.<timestamp>.bak` | same as above | Backup of the placeholder script this replaced — one per host, harmless to leave in place. |
| `deploy/.last-deployed-commit` | written by the script | Full 40-char SHA of the currently-deployed commit. **Does not exist yet on prod** (script installed but never invoked — see "Current state at hand-off"). |
| `deploy/.last-deployed-commit.previous` | written by the script | Full 40-char SHA of the commit deployed immediately before the current one — this is the rollback target. |
| `deploy/docker-compose.qa.yml` / `docker-compose.prod.yml` | tracked on host only | **Not in this repo's git history.** These files, and everything else under `deploy/`, were created directly on each host by the infra side — `git status` in this repo will never show them. Do not expect to find them by cloning. |
| `deploy/.env` | `640 tvolodi:aiqadam-<env>-secrets` | App secrets. `deploy` has group-read via `aiqadam-<env>-secrets`. **Never committed, never in this repo, values are not in this runbook.** |

**`deploy.sh` full contents (identical shape on both hosts, `<env>`/`<compose-file>`/`<secrets-group>` substituted):**

```bash
#!/bin/bash
# deploy.sh — forced-command target for the `deploy` CI user.
# Reads the requested git ref from SSH_ORIGINAL_COMMAND (set by sshd even
# though this script itself is invoked via authorized_keys' command= override
# — this is standard, documented OpenSSH behavior).
#
# Expected invocation: ssh deploy@host "deploy:<40-or-7-char-hex-sha>"
# Anything else (wrong format, missing, unparseable) is rejected.
#
# HARD RULE: this script must NEVER run `git clean`. The deploy/ directory
# (this script, the compose files, and .env) is untracked by git — `git
# reset --hard` does not remove untracked files, but `git clean` would
# destroy them irrecoverably. Do not add `git clean` under any circumstance.

set -euo pipefail

APP_DIR="/opt/apps/aiqadam-<env>"
COMPOSE_FILE="deploy/<compose-file>"
COMPOSE_PROJECT="aiqadam-<env>"
LAST_DEPLOYED_FILE="$APP_DIR/deploy/.last-deployed-commit"
LOG_PREFIX="[deploy.sh $(date -u +%Y-%m-%dT%H:%M:%SZ)]"

echo "$LOG_PREFIX invoked; SSH_ORIGINAL_COMMAND=${SSH_ORIGINAL_COMMAND:-<unset>}"

if [[ -z "${SSH_ORIGINAL_COMMAND:-}" ]]; then
  echo "$LOG_PREFIX ERROR: no SSH_ORIGINAL_COMMAND set; refusing to deploy" >&2
  exit 1
fi

if [[ "$SSH_ORIGINAL_COMMAND" =~ ^deploy:([0-9a-fA-F]{7,40})$ ]]; then
  REQUESTED_REF="${BASH_REMATCH[1]}"
else
  echo "$LOG_PREFIX ERROR: SSH_ORIGINAL_COMMAND did not match ^deploy:<7-40 hex chars>$, got: $SSH_ORIGINAL_COMMAND" >&2
  exit 1
fi

cd "$APP_DIR"

# Never eval/exec the raw string; only ever pass $REQUESTED_REF, which is
# already regex-constrained to hex characters, as a git argument.
git fetch origin --quiet
if ! git cat-file -e "${REQUESTED_REF}^{commit}" 2>/dev/null; then
  echo "$LOG_PREFIX ERROR: ref $REQUESTED_REF not found after fetch; refusing to deploy" >&2
  exit 1
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
echo "$PREVIOUS_COMMIT" > "$LAST_DEPLOYED_FILE.previous"

git checkout --detach "$REQUESTED_REF" --quiet
git rev-parse HEAD > "$LAST_DEPLOYED_FILE"

docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --build

echo "$LOG_PREFIX deployed $REQUESTED_REF (was $PREVIOUS_COMMIT)"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps
```

## Operational commands (the cheat-sheet you actually need)

All SSH commands run from a workstation holding the relevant deploy private key (`QA_SSH_DEPLOY_KEY`/`PROD_SSH_DEPLOY_KEY` — GitHub Actions secrets in this repo; the raw key files also exist on the infra-side management workstation, not this repo). You almost certainly don't need to run these by hand — the GitHub Actions jobs do it — but for debugging:

### Trigger a deploy manually (bypassing GitHub Actions)

```bash
ssh -i <path-to-deploy-key> -o IdentitiesOnly=yes deploy@<qa-or-prod-ip> "deploy:<full-or-short-sha>"
```

Output shows the marker line, then a `docker compose ps` table for that environment. Exit 0 = success.

### Check what's currently deployed

```bash
ssh -i <path-to-deploy-key> -o IdentitiesOnly=yes deploy@<host-ip> "deploy:$(git rev-parse HEAD)"
```

(There's no read-only "what's deployed" command — the forced-command restriction means any successful SSH call to `deploy@host` *is* a deploy of whatever ref you pass. To check status without deploying, you'd need the `tvolodi` operator account, which this repo's agents do not have credentials for — see "Ownership boundary.")

### Roll back to the previous commit

```bash
# From the host, as an operator with read access to deploy/.last-deployed-commit.previous
# (again: this repo's CI has no read path for this file — an infra-side operator
# must supply the SHA, or you trigger it blind if you already know the SHA)
ssh -i <path-to-deploy-key> -o IdentitiesOnly=yes deploy@<host-ip> "deploy:<sha-from-.last-deployed-commit.previous>"
```

### Confirm the negative-control property (forced-command cannot be bypassed)

```bash
ssh -i <path-to-deploy-key> -o IdentitiesOnly=yes deploy@<host-ip> "whoami; cat /etc/shadow"
```

Expected: identical output to a normal deploy call (marker line + compose table) — the injected command never runs. If this ever returns `whoami`/`/etc/shadow` output instead, the forced-command restriction has been broken and this is a security incident, not a bug to casually fix.

## Verification

- **QA:** `curl -s -o /dev/null -w '%{http_code}' https://qa-uz.aiqadam.org/health` → `200` within ~30s of a `deploy-qa` run completing.
- **Prod:** `curl -s -o /dev/null -w '%{http_code}' https://aiqadam.org/health` → `200` within ~30s of a `deploy-prod` run completing.
- **Confirm the right commit landed:** SSH to the host as `tvolodi` (operator account, not `deploy`) and `cat /opt/apps/aiqadam-<env>/deploy/.last-deployed-commit` — should match the SHA you expected to deploy.
- GitHub Actions run status is itself the primary signal: `gh run list --repo aiqadam/ai-qadam-platform --workflow=ci-cd.yml`.

## Rollback

1. Identify the target SHA: `.last-deployed-commit.previous` on the host (needs `tvolodi` operator access to read — see "Ownership boundary"), or any known-good SHA from `git log`.
2. `ssh -i <deploy-key> deploy@<host-ip> "deploy:<target-sha>"` — this is a full forward deploy of that SHA, not a special rollback mode. It re-runs `docker compose up -d --build` against the older commit.
3. Re-run Verification above.
4. There is currently no automated/one-click rollback (e.g. a `workflow_dispatch` "rollback" job) — this is a manual SSH operation. Consider adding one if rollbacks become frequent.

## Common failure modes

### `This account is currently not available.` on every SSH attempt
The `deploy` user's shell must be a real shell (`/bin/bash`), not `/usr/sbin/nologin` — `nologin` unconditionally refuses to execute anything, including an `authorized_keys` forced command, regardless of restrictions. This is a documented OpenSSH interaction, not specific to this repo. If you ever see this, someone likely "hardened" the account by changing its shell — revert that.

### `fatal: detected dubious ownership in repository at '<path>'` (git)
The app checkout on each host is owned `tvolodi:tvolodi`, not `deploy:deploy`. `deploy` needs (a) membership in the `tvolodi` group (already granted at hand-off — `sudo usermod -aG tvolodi deploy`, done on both hosts) and (b) a `git config --global --add safe.directory <app-dir>` entry in `deploy`'s own `~/.gitconfig` (done on QA at hand-off; **not yet done on prod**, since prod's script has never actually run `git` as `deploy` — if prod's first real deploy hits this error, that's why; the fix is the one-line `safe.directory` config add, run once as `deploy`).

### `deploy-qa`/`deploy-prod` never reaches the SSH step
Check the `build` job first — it's a hard gate. A failing `pnpm lint`/`typecheck`/`test` blocks deploy entirely by design. (At hand-off, `build` was failing on a large batch of stale Biome lint findings, traced almost entirely to a committed test-artifact directory `apps/e2e/uat-results/` being linted as source — see [PR #16](https://github.com/aiqadam/ai-qadam-platform/pull/16), open at hand-off, which deletes that directory and cleans up the remainder.)

### `sudo -u deploy test -r <file>` reports false even though permissions look correct
Not applicable to `deploy.sh` itself (it doesn't use this pattern), but if you're debugging the adjacent `.env` group-read grant: `test -r` uses `access(2)`, which checks *real* credentials; an actual `open()` (e.g. via `cat`, or via Compose's own `.env` read) uses *effective* credentials, and the two can disagree immediately after a `usermod -aG` group change. Don't trust `test -r` as a permission oracle here — verify with a functional check (does `docker compose ps` actually work as `deploy`?) instead.

## Ownership boundary — read this if you're an agent operating in this repo

**This repo (`aiqadam/ai-qadam-platform`) can freely edit `.github/workflows/ci-cd.yml`** — build/test/lint steps, job structure, the `git_ref` input, etc. — since that file lives here.

**This repo cannot, and should not attempt to, directly change anything on the two pro-data.tech hosts** (`deploy.sh`'s deployed *content* aside — see below), the SSH keys, the `deploy` user's permissions, sshd config, firewall rules, or the `aiqadam-<env>-secrets` group. Those are owned and managed by a separate, external infra-management repo (`ai-qadam-infra`, not part of this monorepo, not on GitHub under this org) via an approval-gated workflow with a human in the loop for every change. If you need something changed on the host side — a new env var support in `deploy.sh`, a different Compose invocation, a new deploy user permission — **that request needs to go to whoever operates `ai-qadam-infra`**, not be patched directly via an ad hoc SSH session from this repo's tooling, even though the credentials (`QA_SSH_DEPLOY_KEY` etc.) are technically present as GitHub secrets here.

The one exception: `deploy.sh`'s *forward-deploy logic itself* (the script body reproduced above) is reasonable for this repo's own agents to evolve going forward, since it's the one piece that's really "ours" — the deploy contract, not the host plumbing around it. If you do change it, you still need to get the new version onto each host (there's no CD path for `deploy.sh` itself — it's not deployed by `deploy.sh` deploying itself), which today means asking the infra side to `scp` a new version into place, backing up the old one first, exactly as was done when this script was first installed.

**Two GitHub-side settings live outside this repo's normal PR flow and are also infra-owned:**
- Repository secrets `QA_SSH_DEPLOY_KEY`, `PROD_SSH_DEPLOY_KEY`, `QA_SSH_HOST_KEY`, `PROD_SSH_HOST_KEY` — private key material, set once via `gh secret set`, not visible to anyone including this runbook's author beyond the fact that they exist.
- The `production` GitHub Environment's required-reviewer list — currently just `tvolodi` (GitHub user id `25960910`). If prod-deploy approval needs to include other people, that's a `gh api repos/aiqadam/ai-qadam-platform/environments/production` change, which either side can technically make (it's a normal repo-admin action), but coordinate first since it changes who can approve prod pushes.

## Current state at hand-off (2026-07-17)

- [PR #15](https://github.com/aiqadam/ai-qadam-platform/pull/15) (`ci-cd.yml` itself): **open, not merged.** Merging it is what makes `deploy-qa` start firing for real on future pushes to `main`. Until merged, the workflow file exists only on the `add-ci-cd-workflow` branch and nothing in it runs automatically.
- [PR #16](https://github.com/aiqadam/ai-qadam-platform/pull/16) (lint cleanup, blocking PR #15's `build` job from passing cleanly): **open, not merged.** Deletes `apps/e2e/uat-results/` (a committed Playwright test-artifact directory responsible for ~99.5% of the lint diagnostics) and removes ~10 dead `biome-ignore` comments. `pnpm lint` exits 0 with this PR applied.
- QA host: `deploy.sh` live and **rehearsed successfully** (a real self-deploy of the then-current commit was run directly over SSH, health-checked, confirmed working end-to-end).
- Prod host: `deploy.sh` installed and syntax-checked (`bash -n`) only — **never actually invoked.** First real prod deploy will be the first time this path is exercised end-to-end there. Expect to hit the `safe.directory` gotcha above on that first run.
- No merge order is enforced between PR #15 and PR #16 by anything technical — but merging #15 before #16 means the first `deploy-qa` run will fail at the `build` job (lint), which is annoying but not harmful (no deploy happens on a failed build). Merging #16 first, then #15, avoids that.

## References

- [ADR-0002](../../../adr/0002-deployment-target.md) — the other, currently-still-accepted deployment target (Coolify/hyperapp.cloud). **No ADR yet exists for the pro-data.tech target described in this runbook — writing one, and deciding how the two targets relate, is the most valuable immediate follow-up for whoever owns this repo's deploy architecture.**
- [`coolify-bootstrap.md`](coolify-bootstrap.md), [`coolify-app-stacks.md`](coolify-app-stacks.md) — the parallel pipeline's own runbooks, for comparison.
- [PR #15](https://github.com/aiqadam/ai-qadam-platform/pull/15) — adds `ci-cd.yml`.
- [PR #16](https://github.com/aiqadam/ai-qadam-platform/pull/16) — lint cleanup blocking #15's `build` job.
- `ai-qadam-infra` repo (external, not in this org) — tasks T-0110 through T-0113 — the full design/execution/verification audit trail for everything in this runbook, including three failed/rolled-back attempts before the working configuration was reached. Not accessible from this repo; ask the infra operator if you need the detailed history.
