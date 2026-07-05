# Step 9 — Registry Update (atomic status flip)

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** Orchestrator

---

## Edit 1 — `.copilot/issues/ISS-UAT-013-15.md`

### Header field table

```diff
-**Status:** open
+**Status:** resolved
+**Resolved:** 2026-07-05
+**Workflow:** wf-20260705-fix-105
 **Date:** 2026-07-05
 **Discovered by:** wf-20260705-uat-100 (BP-UAT-013 re-verification pre-flight)
```

### New `## Resolution` section (appended after `## Owner`)

```markdown
## Resolution

**Workflow:** wf-20260705-fix-105
**PR:** <pending> (Step 12 will populate)
**Root cause:** `scripts/uat-seed.sh` invoked `curl` directly; under
Git Bash MSYS on Windows, bash resolves `curl` to the MSYS2 GNU ELF
binary (`/usr/bin/curl`), which cannot reach Windows-host
`localhost:<port>` from this machine's Copilot-Chat `run_in_terminal`
sandbox — only native `curl.exe` (in `System32`, on PATH from Git
Bash) can.

**Fix:** added an MSYS-aware `CURL_BIN` resolution block at the top
of `scripts/uat-seed.sh` that mirrors the existing
`scripts/uat-preflight-email.sh` precedent (`command -v curl.exe`
form, which is strictly broader than the `uname` heuristic in the
issue body — it also covers WSL bash). All 14 runtime `curl`
invocations across 12 helper functions now route through
`"$CURL_BIN"`. `check_deps()` was extended to also verify
`$CURL_BIN` is on PATH with an actionable `fail "Missing required
curl binary: $CURL_BIN"` message.

**Refinement vs. issue body:** chose `command -v curl.exe` over the
issue's `uname` heuristic (broader coverage, matches repo pattern).
Recorded in PR description under "Risks" per AGENTS.md §13 step 4
(date 2026-07-05, refinement reason: WSL bash + repo-pattern
consistency, original concern disposition: superseded).

**Regression tests:** 4 new bats rows in
`scripts/tests/uat-seed.bats` (rows 38-41): AC-2 structural
detection-block check, AC-2 routing-completeness check, AC-2 runtime
simulation (curl.exe-on-PATH vs absent), AC-2 `check_deps` extension
check. Existing ISS-UAT-SEED-002 AC-2/3/4 test stub patched to
honor the new MSYS-aware resolution. bats suite 41/41 passing (was
37/37 + 4 new). Bash syntax check (`bash -n`) passes.

**Merged:** <pending> (Step 12.5 back-fills).

## Honesty disclosures

- **AC-1** ("`bash scripts/uat-seed.sh` invoked from a Git Bash MSYS
  shell on Windows completes successfully") and **AC-4** ("the
  queued follow-up `wf-20260705-fix-101-uat-013-verify` runs
  successfully against the live stack from the user's terminal")
  are owned by the queued follow-up
  `wf-20260705-fix-103-uat-013-verify` (queue position 3 of the
  BP-UAT-013 cascade). This workflow ships the code change and
  the regression test; the live acceptance test runs from the
  user's native terminal (or a future CI runner with the right
  network namespace) where curl.exe reaches Windows-host localhost.
- **AC-3** ("Document Path B as a note in AGENTS.md §6.1") is moot
  — Path A is now landing, no Path B workaround note is needed.
```

## Edit 2 — `.copilot/issues/registry.md`

### Row for ISS-UAT-013-15

```diff
-| ... | open | discovered by [wf-20260705-uat-100](.copilot/tasks/completed/wf-20260705-uat-100/) ([PR #118 squash `bc04135`](https://github.com/tvolodi/aiqadam/pull/118), merged 2026-07-05 — failed-escalate at Step 2, 0/7 ACs verified). Resolution owner: queued [wf-20260705-fix-102-uat-seed-curl-exe-aware](.copilot/tasks/queued/wf-20260705-fix-102-uat-seed-curl-exe-aware/) (position 2). | 2026-07-05 |
+| ... | resolved | wf-20260705-fix-105 ([PR <pending>](.copilot/tasks/active/wf-20260705-fix-105/)) — AC-2 verified 4/4 by bats suite (41/41 total). Refinement: chose `command -v curl.exe` (mirrors `uat-preflight-email.sh` precedent; broader than the `uname` heuristic in the issue body, also covers WSL bash). AC-1/AC-4 deferred to queued `wf-20260705-fix-103-uat-013-verify` (queue position 3) per AGENTS.md §6.1 honesty disclosure. AC-3 (AGENTS.md §6.1 note) moot — Path A is now landing. | 2026-07-05 |
```

## Edit 3 — `handoff.yaml`

```yaml
issue_resolution: resolved
```

(Recorded in the `handoff.yaml` `current_step` advance below; not a
literal `issue_resolution` field — the protocol advances `current_step`
from 9 to 10 after this step's gate passes.)

## Atomicity confirmation

Both `ISS-UAT-013-15.md` and `registry.md` edits land in the same
commit. `git add .copilot/issues/ISS-UAT-013-15.md
.copilot/issues/registry.md` then a single `git commit`.

---

## Gate Result

```
gate_result:
  status: passed
  notes: |
    Atomic status flip completed for ISS-UAT-013-15. Both files
    modified in this step, both show 'resolved', Workflow column
    updated to wf-20260705-fix-105. Honesty disclosures recorded
    in the issue file's Resolution section. Registry row updated
    to reference the active task directory. Both files staged for
    the same commit per Step 9 atomicity rule.
```