# 09-quality-gate.md — wf-20260709-migrate-001-origin-cutover

## Verdict: PASS

## Acceptance criteria

| AC | Description | Verified |
|---|---|---|
| AC-1 | `origin/main` on this clone points at `aiqadam/ai-qadam-platform` (not `tvolodi/aiqadam`) | YES (`git remote -v`) |
| AC-2 | `origin/main` HEAD has the full migrated history (HEAD ancestor = `ba439ea`, the original `tvolodi/aiqadam` HEAD) | YES (`git log origin/main --oneline -3`) |
| AC-3 | `LICENSE` file exists on `origin/main` with blob SHA `66b36289aa9698027d2b7108a90288ded4caf544` (byte-identical to old repo's initial-commit blob) | YES (`git rev-parse origin/main:LICENSE`) |
| AC-4 | `protect-branch` ruleset is active on `~DEFAULT_BRANCH` of the new repo (id `18687633`) | YES (`gh api .../rulesets`) |
| AC-5 | `package.json` `homepage` and `repository.url` point at the new origin | YES (`grep ^homepage package.json`) |
| AC-6 | Local working tree is clean on `main` tracking `origin/main` | YES |
| AC-7 | PR references in `.copilot/issues/*` and `registry.md` are deliberately preserved as historical truth (not rewritten) | YES (audit trail intact) |

## Honesty disclosures

- Ruleset id changed 18686195 → 18687633 due to unintended DELETE during
  the ruleset-flip step. Body is identical (`deletion` + `non_fast_forward`
  + `pull_request`, `enforcement=active`, no bypass actors). Net effect:
  same protection, new id.
- The deleted-ruleset window was approximately 4 minutes and 30 seconds
  (`00:51:43` ruleset created → `00:52:27` recreated after force-push).
  No third party had push access during this window (repo is admin-only,
  owned by the user).
- Force-push used `--force-with-lease`, not raw `--force`. The lease
  value matched the remote's pre-push state, so the push was a clean
  replacement of unrelated history (LICENSE-only → full project history
  with LICENSE preserved on top).
- LICENSE commit's blob SHA was verified byte-identical before commit
  (`66b36289…`) and after push to `origin/main` (`66b36289…`).
- The historical PR/issue URLs in `.copilot/issues/*` (e.g. PR #131,
  PR #130, etc.) were intentionally NOT rewritten. They record
  historical truth on `tvolodi/aiqadam` and rewriting them would
  destroy the audit trail. Only `package.json` (the canonical-origin
  metadata) was updated.

## Outstanding follow-ups

- Verify any external automation that hardcoded ruleset id `18686195`
  is updated to `18687633`. None known.
- Decision: delete or freeze `tvolodi/aiqadam` repo? Currently
  `git remote oldorigin` on this clone points at it.
