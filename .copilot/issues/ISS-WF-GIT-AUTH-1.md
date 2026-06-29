# ISS-WF-GIT-AUTH-1 — `git push` prompts for PAT on every workflow

| Field | Value |
|---|---|
| ID | ISS-WF-GIT-AUTH-1 |
| Severity | minor |
| Module | workflow / git |
| Status | resolved |
| Reported | 2026-06-29 |
| Resolved | 2026-06-29 |
| Reporter | Orchestrator (wf-20260629-fix-036, Step 12) |
| Workflow | wf-20260629-fix-036 |

## Symptom

`scripts/workflow-finish.sh` invoked `git push` and Git prompted
`Username for 'https://github.com':` then `Password for 'https://tvolodi@github.com':`
on every run. The agent cannot supply a PAT interactively, so the workflow
blocked indefinitely — every future workflow was at risk.

Triggered during BP-UAT-013 cleanup work; user explicitly called this out as a
recurring tax: "I am simply tiered by this continues requests for github credentials."

## Root cause

`origin` was HTTPS (`https://github.com/tvolodi/aiqadam.git`) with no
`credential.helper` configured globally, so Git had no cache. Every push
required interactive auth.

## Fix (applied 2026-06-29)

1. Generated ed25519 SSH key (no passphrase):
   `ssh-keygen -t ed25519 -f %USERPROFILE%\.ssh\id_ed25519 -N "" -C viktor@tvolodi.local`
2. Wrote `%USERPROFILE%\.ssh\config`:
   ```
   Host github.com
     HostName github.com
     User git
     IdentityFile C:\Users\tvolo\.ssh\id_ed25519
     IdentitiesOnly yes
     AddKeysToAgent yes
   ```
3. Added key to GitHub → Settings → SSH and GPG keys.
4. `git remote set-url origin git@github.com:tvolodi/aiqadam.git`.
5. `git config --global --unset credential.helper`.
6. `ssh-add $env:USERPROFILE\.ssh\id_ed25519`.

## Verification

- `ssh -T git@github.com` prints `Hi tvolodi! You've successfully authenticated...`
- `git push` runs with no prompt.

## Future-agent policy (recorded in `.claude/CLAUDE.md`)

If a `git push` ever prompts for `Username/Password` again, agents MUST NOT
loop on the user. Instead:

1. Run `git config --global credential.helper manager` (caches a PAT after
   one user-typed entry), OR
2. Switch the remote to SSH if a key exists, OR
3. Walk the full SSH-key migration procedure documented in `.claude/CLAUDE.md`
   §"Git credentials."

## Resolution

- **Workflow:** wf-20260629-fix-036
- **PR:** <pending> (see branch fix/ISS-UAT-013-4-seed-operator-invites)
- **Files touched:** `.claude/CLAUDE.md`, `.github/copilot-instructions.md`,
  `.copilot/issues/registry.md`, `.copilot/issues/ISS-WF-GIT-AUTH-1.md`.
- **Permanent fix:** SSH key in ssh-agent, remote URL switched to SSH.
- **Merged:** 93e123838b672fd6aa01da59747a98070dd153d3