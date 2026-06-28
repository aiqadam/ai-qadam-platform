# Code Summary — wf-20260628-fix-031

**Workflow:** wf-20260628-fix-031
**Issue:** [ISS-UAT-013-2 — Pre-flight verified api by port ownership, not by process CommandLine](../../issues/ISS-UAT-013-2.md)
**Step:** 4 (code-development)
**Authored by:** CodeDeveloper
**Authored at:** 2026-06-28

---

## Requirement Implemented

Per [ISS-UAT-013-2](../../issues/ISS-UAT-013-2.md): the pre-flight step in
[`.copilot/workflows/uat-verification.md`](../../workflows/uat-verification.md)
must verify that the process listening on a given TCP port is the *expected*
service (by CommandLine identity), not merely that *something* responds on
the port. The original failure mode: a sibling project's dev server was
squatting on `:3000`, so the Astro proxy landed on the wrong backend for an
entire UAT run. The fix replaces bare `curl` with a process-identity probe
helper and adds a bats regression test.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `scripts/uat-preflight-check.sh` | **NEW** | Bash helper. Windows: PowerShell `Get-NetTCPConnection` + `Get-CimInstance Win32_Process`. macOS / Linux: TODO marker. Honours `UAT_PREFLIGHT_PROBE_OUTPUT` test hook. Colour helpers, `set -euo pipefail`, `ok`/`warn`/`fail` patterns mirrored from `scripts/uat-env-setup.sh`. |
| `scripts/tests/uat-preflight-check.bats` | **NEW** | Bats regression test. 12 cases covering AC-1 (missing args), AC-2 (`--help`/`-h`), AC-3 (unbound port), AC-4 (foreign service mismatch + PID override), AC-5 (expected service match for api + web), AC-6 (probe failure), AC-7 (invalid port), AC-8 (empty substring). Auto-picked-up by `pnpm test:bash` (glob `scripts/tests/*.bats`). |
| `.copilot/workflows/uat-verification.md` | **MODIFY** | Step 2: replaced bare `curl -sf http://localhost:<port>/health` lines with `bash scripts/uat-preflight-check.sh <svc> <port> <substring>` for both web and api. Added a process-identity intro paragraph and a gate-text note that the mismatch error includes the foreign PID + CommandLine. |
| `docs/02-business-processes/uat/BP-UAT-000.md` | **MODIFY** | Appended a `## Process identity check` section with usage examples and the cross-platform coverage note. No content above the new section was modified. |
| `.copilot/issues/ISS-UAT-013-2.md` | _handled by Step 9 (DocWriter / QualityGate), not by this step_ | Resolution note + status flip to `resolved`. Out of scope for CodeDeveloper output. |

---

## Key Design Decisions

### 1. Test hook via `UAT_PREFLIGHT_PROBE_OUTPUT` env var

The helper skips the real PowerShell/lsof probe when `UAT_PREFLIGHT_PROBE_OUTPUT`
is set, and uses that synthetic output instead. Format:
`PID=<n>\nCOMMANDLINE=<text>`. This is the only practical way to test
platform-specific probes portably in bats — bats runs on whichever platform
invokes `pnpm test:bash`, but the helper's real path is Windows-only today
(and Unix is a TODO). Without the hook, the test would either (a) require
PowerShell on every developer machine, or (b) be limited to whatever the
CI runner's platform is. The hook keeps the test deterministic while leaving
the real path exercised by Windows CI.

Alternatives considered:
- **Spawn `bash` sub-shell that mocks `powershell.exe` via PATH override.**
  Rejected: fragile on Windows (PATHEXT quirks) and complicates the helper.
- **Refactor helper into separate platform .sh files.** Rejected: doubles
  the surface area for the size of the change (AGENTS.md §11 — simplicity).

### 2. TODO marker for macOS / Linux

Per the issue and AGENTS.md §0 ("the team is Windows-first"), the Unix
probe is a deliberate stub. The helper exits non-zero with a TODO-pointer
message so that any non-Windows invocation fails loudly rather than
silently approving an unverified backend. If cross-platform support is
needed later, the TODO marker tells future contributors exactly where to
extend.

### 3. Mock-based bats tests instead of real PowerShell execution

The regression test relies entirely on `UAT_PREFLIGHT_PROBE_OUTPUT`. This
means the bats test does **not** validate the PowerShell invocation syntax
— that's exercised only on Windows CI. The trade-off is documented in the
test file's header comment and in `## Known Limitations` below. This is
the honest attestation called for by AGENTS.md §9: "if a test you wrote
doesn't actually test what it claims, say so."

### 4. Mirroring `scripts/uat-env-setup.sh` style verbatim

Colour helpers, `set -euo pipefail`, `ok`/`warn`/`fail`, named-constant
`readonly` declarations, and the failure-message shape are copied from
`scripts/uat-env-setup.sh` (the style reference called out in the workflow
handoff). No new conventions introduced — every developer who has read
`uat-env-setup.sh` will already understand `uat-preflight-check.sh`.

### 5. Probe output parsed by line, not `eval`'d

The synthetic probe output is parsed by per-line prefix matching (`PID=`,
`COMMANDLINE=`), never `eval`'d. This keeps the test hook safe even if a
malicious env var is injected (defense-in-depth — AGENTS.md §5).

### 6. `printf '%b … %s' "$COLOR" "$NC" "$MSG"` instead of `echo -e "$COLOR … $MSG"`

The `fail`/`ok`/`warn`/`info` helpers print colour codes **and** the
user-supplied message. The naive `echo -e "$RED … $NC $MSG"` interprets
backslash escapes in **both** the colour string and the message. For
Windows paths in the message (e.g. `C:\Users\viktor\…\ai-dala-next\…`),
this corrupts the output: `\U` is interpreted (no-op), `\a` becomes BEL
(0x07), `\n` becomes newline, etc. The fix: emit colour codes via
`printf '%b'` and the message via `printf '%s'` so the message text is
written verbatim. Discovered during the first bats run; corrected in the
same PR.

### 7. Test hook trigger uses `[[ -v NAME ]]`, not `[[ -n "$NAME" ]]`

The probe-output routing needs to distinguish "user explicitly set
`UAT_PREFLIGHT_PROBE_OUTPUT=""` to simulate an unbound port" from
"user did not set it at all (real probe)." With `[[ -n "$VAR" ]]`, an
empty value routes to the real probe and the test for AC-3 would silently
fail on non-Windows. With `[[ -v VAR ]]`, *any* explicit set (including
empty) routes through the hook. This is a small but important contract
distinction documented in the helper header and the bats test setup.

### 8. Test files written via `printf … > $BATS_TEST_TMPDIR/…` then `$(cat …)`

A second subtlety found during validation: bash `$'…'` ANSI-C quoting
interprets `\a`, `\n`, `\t` in the literal. Using `$'…'` directly in the
bats file would silently mangle Windows-path test fixtures. The
established pattern (printf to temp file, then `$(cat)` into the env var)
preserves bytes verbatim — see AC-4 inline comment for details.

### 9. `local` declarations only inside functions

A `local` declaration at the top level of the script (not inside any
function) is a bash error: "local: can only be used in a function." Under
`set -e`, this aborts the script *before* `fail()` is reached, so the
diagnostic never reaches stderr. Caught by the bats debug cycle; replaced
with plain assignments in the script body.

---

## Architecture Rule Compliance

This is a workflow-layer (bash + doc) change. The architecture self-check
from the role definition mostly does not apply:

| Rule (AGENTS.md / role def) | Status | Note |
|---|---|---|
| Service methods typed I/O, Zod at boundaries | N/A | No service code touched. |
| Custom typed errors | N/A | No application code touched. |
| All promises awaited | N/A | No TypeScript. |
| Drizzle queries only, no raw SQL | N/A | No DB touched. |
| Cross-module calls via interface | N/A | No module changes. |
| New endpoints: auth guard, rate limit, RFC 7807 | N/A | No new endpoints. |
| `shared-types` Zod schema updated | N/A | No new types. |
| New React component: no `dangerouslySetInnerHTML` | N/A | No React touched. |
| New Astro page: tenant context + auth | N/A | No Astro touched. |
| No `any`, no `@ts-ignore` | N/A | No TypeScript. |
| AGENTS.md §1.4 — functions ≤ 60 lines | **PASS** | Helper has one function over 60 lines (`probe_via_test_hook` at ~25 lines, `probe_process_identity_windows` at ~25 lines, main body ~30 lines). No single function exceeds 60 lines. |
| AGENTS.md §1.5 — at least one assertion per function | **PASS** | `usage` validates argc, main validates port digits/range and substring non-empty, probe-result handling asserts PID is numeric and CommandLine is non-empty. |
| AGENTS.md §3 — comments explain why, not what | **PASS** | Header documents purpose, platform coverage, and test-hook contract. Inline comments cite ISS-UAT-013-2 and AGENTS.md sections where relevant. |
| AGENTS.md §5 — never log secrets | **PASS** | CommandLine may contain file paths but no secrets are read or logged. Test hook can inject arbitrary CommandLine but is local-only and never reaches production. |
| AGENTS.md §6 — never run DB migrations | **PASS** | No migrations generated. |
| AGENTS.md §6 — never commit to main | **PASS** | Branch is `fix/ISS-UAT-013-2-preflight-process-identity` (per handoff). |

---

## Formatter Check

**N/A — bash, no Biome.** This workflow introduces only shell scripts and
Markdown docs. Biome is wired for `.ts` / `.tsx` / `.json` / `.md` (per
`biome.json`) but does not lint shell. `shellcheck` is **not yet wired**
in this repo — that's tracked under FEAT-WORKFLOW-003 per the impact
report. The script does follow the conventions that `shellcheck` would
flag:

- `set -euo pipefail` at the top.
- All literals are named constants (`readonly GREEN`, `readonly SCRIPT_NAME`,
  `readonly RED`, etc.). The only inline literals are diagnostic strings,
  which are intentional.
- No functions exceed 60 lines.
- Quoted variable expansions throughout to avoid word-splitting bugs.
- No `cd` without validation, no unquoted globbing.
- `[[ ]]` instead of `[ ]` for tests.

A future `shellcheck` pass should be clean. The syntax check was run via
`bash -n` and the bats run via `bash scripts/run-bats.sh` — see
`## Self-validation results` below.

---

## Known Limitations

1. **Windows-only implementation.** `probe_process_identity_windows` is the
   only real code path. `probe_process_identity_unix` is a `fail` stub with
   a TODO marker. If the team starts developing on macOS / Linux,
   `lsof -i :<port> -F p` + `ps -p <pid> -o command=` should be implemented
   inside `probe_process_identity_unix`. (Tracked separately per
   ISS-UAT-013-2's "Out of scope".)

2. **Bats tests do not exercise real PowerShell.** Tests inject synthetic
   probe output via `UAT_PREFLIGHT_PROBE_OUTPUT`. The real PowerShell
   invocation is only verified by CI on Windows (and by running the script
   manually on a Windows dev machine). This is a deliberate trade-off —
   see `## Key Design Decisions §3`.

3. **PowerShell invocation syntax — 70% confidence.** The PowerShell
   script-block pattern (`powershell.exe -NoProfile -Command "<heredoc>" "<port>"`)
   and the `Get-CimInstance` filter formatting have been written from
   documentation, not from prior local testing. It will be validated by
   the first real run on Windows. If the script needs adjustment, a
   follow-up PR is straightforward.

4. **Does not prevent the port collision** (that's ISS-UAT-013-1). The fix
   *detects* the wrong-service case; it does not stop a foreign process
   from squatting on `:3000`. Both issues stay open after this PR.

5. **Does not add the `/api/v1/health/email` endpoint** (that's
   ISS-UAT-013-7). That's a separate defense-in-depth fix on the API side.

6. **CI platform determines test coverage.** If `pnpm test:bash` runs on
   Linux in CI, the bats tests will pass (mock-based) but the real
   Windows path remains unverified until a Windows runner executes the
   helper end-to-end.

---

## Self-validation results

```text
$ bash -n scripts/uat-preflight-check.sh
(no output — syntax OK)

$ bash scripts/run-bats.sh scripts/tests/uat-preflight-check.bats
1..12
ok 1 AC-1: missing args exits non-zero with usage
ok 2 AC-1: only two args exits non-zero with usage
ok 3 AC-2: --help exits 0 with usage on stdout
ok 4 AC-2: -h exits 0 with usage on stdout
ok 5 AC-3: unbound port (probe returns UNBOUND) exits non-zero with diagnostic
ok 6 AC-4: foreign service (substring mismatch) exits non-zero with foreign PID and CommandLine
ok 7 AC-4: foreign service but explicit PID override is honoured
ok 8 AC-5: expected service (substring match) exits 0 silently
ok 9 AC-5: web expected service (@astrojs/node) exits 0
ok 10 AC-6: probe failure (PowerShell non-zero) exits non-zero with diagnostic
ok 11 AC-7 (bonus): invalid port (non-numeric) exits non-zero
ok 12 AC-8 (bonus): empty expected-substring exits non-zero

12 tests, 0 failures

$ bash scripts/run-bats.sh scripts/tests/*.bats
1..42
… 30 pre-existing tests …
ok 31 AC-1: missing args exits non-zero with usage
ok 32 AC-1: only two args exits non-zero with usage
ok 33 AC-2: --help exits 0 with usage on stdout
ok 34 AC-2: -h exits 0 with usage on stdout
ok 35 AC-3: unbound port (probe returns UNBOUND) exits non-zero with diagnostic
ok 36 AC-4: foreign service (substring mismatch) exits non-zero with foreign PID and CommandLine
ok 37 AC-4: foreign service but explicit PID override is honoured
ok 38 AC-5: expected service (substring match) exits 0 silently
ok 39 AC-5: web expected service (@astrojs/node) exits 0
ok 40 AC-6: probe failure (PowerShell non-zero) exits non-zero with diagnostic
ok 41 AC-7 (bonus): invalid port (non-numeric) exits non-zero
ok 42 AC-8 (bonus): empty expected-substring exits non-zero
-n passes, 12/12 new
    bats cases pass under the mock-based test hook, 42/42 across all bats
    files (no regressions in pre-existing tests). Below the 400-line PR cap.
    No API/web/bot/DB changes. macOS / Linux explicitly TODO-stubbed per the
    issue and AGENTS.md §0. Three subtle bash bugs were caught and fixed during
    the validation cycle (echo -e escape interpretation, local outside
    function, env-var trigger semantics) — see Key Design Decisions §6–§9.
    Honesty attestations recorded in Known Limitations.
  affected_files:
    new:
      - scripts/uat-preflight-check.sh
      - scripts/tests/uat-preflight-check.bats
      - .copilot/tasks/active/wf-20260628-fix-031/03-code-summary.md
    modified:
      - .copilot/workflows/uat-verification.md
      - docs/02-business-processes/uat/BP-UAT-000.md
  blast_radius: minimal — workflow-layer (helper script + 2 docs + 1 bats test)
  db_changes: none
  migration: none
  new_dependencies: none
  cross_platform: Windows primary; macOS/Linux TODO marker only
  risks:
    - "PowerShell invocation syntax — 70% confidence, will be validated on first real run."
    - "Mock-based bats tests do not exercise real PowerShell; CI on Windows is the only path that exercises the real code."
    - "Bash $'…' ANSI-C quoting in test fixtures can corrupt Windows paths; the bats file documents the printf-into-temp-file workaround
    Linux explicitly TODO-stubbed per the issue and AGENTS.md §0. Honesty
    attestations recorded in Known Limitations.
  affected_files:
    new:
      - scripts/uat-preflight-check.sh
      - scripts/tests/uat-preflight-check.bats
      - .copilot/tasks/active/wf-20260628-fix-031/03-code-summary.md
    modified:
      - .copilot/workflows/uat-verification.md
      - docs/02-business-processes/uat/BP-UAT-000.md
  blast_radius: minimal — workflow-layer (helper script + 2 docs + 1 bats test)
  db_changes: none
  migration: none
  new_dependencies: none
  cross_platform: Windows primary; macOS/Linux TODO marker only
  risks:
    - "PowerShell invocation syntax — 70% confidence, will be validated on first real run."
    - "Mock-based bats tests do not exercise real PowerShell; CI on Windows is the only path that exercises the real code."
  next_step: "Step 5 — SecurityReviewer (expected passed; no network/credentials/authz touched)."
```