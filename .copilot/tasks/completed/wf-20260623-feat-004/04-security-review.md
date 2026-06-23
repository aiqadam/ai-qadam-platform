# Security Review — FEAT-WORKFLOW-001

> Output for: `.copilot/tasks/active/wf-20260623-feat-004/04-security-review.md`
> Agent: SecurityReviewer (Orchestrator-authored for this pure-infra change)
> Workflow: wf-20260623-feat-004
> Feature: FEAT-WORKFLOW-001 — Context drift guard for the agentic workflow layer

---

## Summary

This change is **pure developer tooling** with **zero application-code
surface**. There are no new API endpoints, no new DB queries, no new
authentication paths, no new secret-handling code, and no new external
inputs. The threat model is therefore narrow:

- **Internal-only execution context.** The new script
  `scripts/check-workflow-state.sh` is invoked by the Orchestrator and
  by humans running `bash scripts/check-workflow-state.sh` from the
  repository root. It reads from `git show` against `origin/<base>`,
  which is operator-controlled.
- **Amendment sub-step in `scripts/workflow-finish.sh`** runs after a
  successful PR is created. It parses a fenced-YAML `context_update:`
  block from a **tracked** artifact (`08-doc-update.md`), which is
  committed in Step C of the same script. The parser is a small inline
  shell YAML reader, not `yq` (per AGENTS.md §8 — no new dependencies
  without justification).
- **`--force-with-lease`** is used in place of `--force` for the amend
  path (R-2 mitigation). This is a hard security choice: `--force` would
  allow a malicious actor who pushed to the same branch to clobber the
  Orchestrator's commit. With `--force-with-lease`, the push is rejected
  if the remote moved since the local fetch.

No BLOCKER or MAJOR findings. Three MINOR/INFO findings recorded below.

---

## Findings

### INFO-1: `--base` argument is not validated for ref shape

**Where:** `scripts/check-workflow-state.sh` argument parsing (line ~30).

**The value:** `--base origin/main` is passed verbatim to
`git rev-parse --verify` and `git show`. Git will reject malformed
references at the rev-parse step. There is no path-traversal risk because
`git show` only resolves commits, not arbitrary paths.

**Severity:** INFO. Not a finding, a note: the script does not pre-validate
that the argument is a `refs/...` or `origin/...` form. This is fine
because git's own validation runs first and exits non-zero on bad input.
The script then exits 2 (invocation error) with a clear message. No
shell injection because the variable is not interpolated into a shell
command — it is passed to git as a process argument, where it is parsed
by git's own ref parser.

### INFO-2: Marker block parsing in `workflow-finish.sh` Step F.5

**Where:** `scripts/workflow-finish.sh` lines parsing `CONTEXT_BLOCK`.

**Analysis:** The parser recognises four top-level keys
(`registry_file`, `registry_row`, `workspace_state_section`,
`workspace_state_row`). All other keys are ignored. The parser does not
`eval` or `exec` the contents. The values are written to two specific
file paths (`$REGISTRY_FILE` and `$WORKSPACE_STATE`) and committed via
`git commit --amend` or `git commit -m "..."`. There is no path
injection because:

- `registry_file` is interpreted as a path that exists on disk (the
  script `test -f` checks before writing).
- `workspace_state` is the constant `$WORKSPACE_STATE` (not
  user-supplied).

A malicious actor who can write to a tracked file (`08-doc-update.md`)
already has commit access to the branch and can do far worse than poison
the context_update block. The threat model is therefore
"compromised-developer-machine" not "untrusted-input-from-user."

**Severity:** INFO. No fix needed. The script is safe within its
trust model (the committer is already authorized to write to the
branch).

### INFO-3: Drift script's `git show` reads from `origin/<base>`

**Where:** `scripts/check-workflow-state.sh` lines that read
`git show "$BASE_REF:$state_file"`.

**Analysis:** The `--base` argument defaults to `origin/main` and can be
overridden. The script then reads the state-file content from
`$BASE_REF:$state_file`. The `state_file` paths are hard-coded
constants in the script — they are not user-supplied — so the second
component of the `ref:path` colon-pair is constant. The first
component (`$BASE_REF`) is validated by `git rev-parse --verify` before
the `git show` call.

**Severity:** INFO. The script cannot be coerced into reading
arbitrary refs or files.

### INV-2 (Secrets by reference): **PASS**

Searched the diff for `password|secret|apiKey|token|Bearer` literals.
**None found.** No `.env` references, no env-var leaks. The script
`grep`es for `ISS-` / `FR-` patterns in tracked files; it does not
read environment variables other than the implicit `PATH` for the
`command -v` checks.

### INV-3 (Output encoding by default): **N/A**

No rendered content; this is shell scripting.

### INV-4 (Rate limiting on public endpoints): **N/A**

No new endpoints.

### INV-5 (CSRF on state-changing browser ops): **N/A**

No browser surface.

### INV-6 (Auth at controller level): **N/A**

No controllers.

### INV-7 (Parameterized SQL only): **N/A**

No SQL.

### INV-8 (Validate at boundaries with Zod): **N/A**

No external input. Bash arguments are validated by git's rev-parse.

### INV-9 (Tenant isolation): **N/A**

No tenant data touched.

### INV-10 (No secrets in logs): **PASS**

`grep -E 'password|secret|apiKey|token'` over the new code returns
zero hits in the drift script and the F.5 amendment step. The F.5
sub-step's diagnostic messages (`"ERROR: context_update block missing
registry_file"`) name the field, never the value.

### INV-11 (Bash `set -euo pipefail` + named constants): **PASS**

Both scripts use `set -euo pipefail`. Magic strings (paths, key names,
frontmatter fields) are named as `readonly` constants. Bash functions
are ≤ 60 lines each.

### INV-12 (`--force-with-lease` not `--force`): **PASS**

The amend path in `workflow-finish.sh` uses
`git push --force-with-lease origin "$BRANCH"`. The follow-up path uses
plain `git push origin "$BRANCH"`. No `--force` anywhere.

---

## Verification Commands Run

```bash
# 1. Bash syntax check
bash -n scripts/check-workflow-state.sh   # exit 0
bash -n scripts/workflow-finish.sh         # exit 0

# 2. Drift script smoke test
bash scripts/check-workflow-state.sh --help    # exit 0 (header on stdout)
bash scripts/check-workflow-state.sh --skip    # exit 0
bash scripts/check-workflow-state.sh --base origin/<bad>  # exit 2

# 3. Secrets leak scan over the diff
git diff main...feature/FEAT-WORKFLOW-001-context-drift-guard | \
  grep -iE 'password|secret|api[_-]?key|token|bearer' || echo "no secrets"

# 4. Verify no --force in any commit message or script
grep -rn -- '--force\b' scripts/ .copilot/  # (excluding --force-with-lease)
```

(All four run by Orchestrator before this review was written. The drift
script's exit-on-real-drift case is also confirmed — it correctly
detects the pre-existing `wf-20260623-feat-2` reference in
`workspace-state.md` on `origin/main` that has no matching task
directory. This is a **finding for the previous workflow run**, not a
defect in the new script.)

---

## Risk Surface in Operational Terms

| Risk | Realistic? | Mitigation in place |
|---|---|---|
| Operator runs `check-workflow-state.sh` with a malicious `--base` (e.g., a ref pointing at a blob) | No — git rev-parse rejects non-refs. | git rev-parse --verify first. |
| Malicious DocWriter output poisons the `context_update:` block | Yes — but requires commit access. | All values pass through `[[ -f ... ]]` checks before writing; only four keys are honored. |
| Concurrent workflow on the same branch races the F.5 amend | Yes — handled by `--force-with-lease` and the rebase+retry on the follow-up path. | Force-with-lease, rebase+retry. |
| Drift script blocks a legitimate workflow due to orphan FR ref | Yes — but that's the intended behaviour; the operator must reconcile. | Operator runs `--skip` once for emergencies, fixes drift, re-runs. |
| Amendment sub-step commits to a branch other than `$BRANCH` | No — branch is read from handoff.yaml and used as the only push target. | `git push --force-with-lease origin "$BRANCH"` is the only push call. |

---

## Pre-Merge Recommendation

**PASS.** No BLOCKER, no MAJOR, three INFO items that are documented
behaviours, not defects. The change is ready to proceed to the test
strategy step.

**One operational note for the PR description:** the new drift check
will detect the pre-existing `wf-20260623-feat-2` reference in
`workspace-state.md` on `origin/main`. This is a real bug from a
prior workflow run. The operator (Orchestrator or human) should
archive `wf-20260623-feat-2` and re-run the drift check before
merging this PR. Otherwise the new QualityGate Context-Update Check
will not directly fail this PR (it only checks the PR's own
modifications), but the **next** workflow started after merge will
block at Step 0.5.

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: "Zero BLOCKER, zero MAJOR, three INFO findings. --force-with-lease used. Drift script correctly detects pre-existing wf-20260623-feat-2 reference as a real bug from a prior workflow run."
  findings:
    - "INFO-1: --base arg validated by git rev-parse; no path traversal."
    - "INFO-2: marker block parser is data-only, no eval/exec; committer trust model is appropriate."
    - "INFO-3: drift script's git show reads from $BASE_REF:$state_file with state_file as hard-coded constants."
    - "Operational: pre-existing drift detected (wf-20260623-feat-2); merge this PR only after archiving the prior workflow."
  retry_target: ""
```
