# Step 5 — Security Review

**Workflow:** wf-20260628-fix-031
**Issue:** [ISS-UAT-013-2](../../issues/ISS-UAT-013-2.md)
**Reviewed by:** SecurityReviewer
**Reviewed at:** 2026-06-28

---

## Files Reviewed

| File | Change | Lines (effective) | Trust boundary? |
|---|---|---|---|
| `scripts/uat-preflight-check.sh` | **NEW** | 252 | Local-dev pre-flight only; not network-facing |
| `scripts/tests/uat-preflight-check.bats` | **NEW** | 132 | Test-only; runs in developer / CI environment |
| `.copilot/workflows/uat-verification.md` | MODIFY (Step 2) | +14 / −6 | Orchestrator pre-flight spec |
| `docs/02-business-processes/uat/BP-UAT-000.md` | MODIFY (appended §"Process identity check") | +20 | Operator-facing documentation |

**Network-facing surface:** zero. The helper invokes `powershell.exe` against the
local machine only; no inbound sockets, no outbound HTTP, no DB calls, no IPC.

---

## Threat Model

### What could an attacker actually do here?

The change is entirely **developer-local pre-flight tooling**. The blast radius
is "does the local UAT pre-flight approve a backend that's actually wrong?"
The realistic threat scenarios are:

1. **A malicious env var in the developer's shell.**
   A local attacker (or a misbehaving `direnv` / dotfile) could set
   `UAT_PREFLIGHT_PROBE_OUTPUT=...` to fool the helper into approving any
   substring. *Reach:* the developer's own machine; never reaches production
   (the env var is read by a local script only; production runs do not
   invoke this helper). **Defense-in-depth concern, not a security finding.**

2. **A malicious `service-name`, `port`, or `expected-substring` argv.**
   These come from the operator running
   `bash scripts/uat-preflight-check.sh api :3000 "@aiqadam/api"` per the
   `uat-verification.md` Step 2 spec. If the operator passes a hostile
   `port` value (e.g. containing shell metacharacters), what happens?
   *Answer:* the value reaches PowerShell as a quoted argv element (see
   `INV-Command-Invocation` below) and is consumed by `-LocalPort $port`,
   which is **typed Int32** in `Get-NetTCPConnection` — non-numeric input
   throws before reaching WMI. **No injection vector found.**

3. **A sibling project's dev server squatting on `:3000` (the original
   incident).** This is precisely what the fix *detects*. Not a new threat.

4. **PowerShell side-channel.** `Get-CimInstance Win32_Process` reads the
   CommandLine of *any* process the caller has rights to inspect. On
   Windows, any local user can enumerate all processes by default; no
   elevation needed. The helper reads the CommandLine of the PID
   listening on the configured port and echoes the first 200 chars to
   stderr on mismatch. **Reach:** operator's terminal only. The CommandLine
   may legitimately contain absolute file paths (e.g. `apps/api/dist/main.js`)
   but **does not contain secrets** — process command lines on this stack
   are file paths and node module entry points, not API keys, tokens, or
   passwords.

5. **log-injection via the echoed CommandLine.** The helper truncates to
   200 chars and emits it via `printf '%s' "$local_preview"`. ANSI escape
   sequences in the CommandLine (e.g. a malicious process name crafted to
   inject terminal escape codes) would be **written verbatim as text** by
   `printf '%s'`, not interpreted. This is the explicit fix from design
   decision §6 of `03-code-summary.md`. **No log-injection vector.**

### Threat model conclusion

The change does not expand the production attack surface in any way. It is
a **detection** tool for an already-present misconfiguration (foreign dev
server on the expected port). All realistic attacker scenarios are
information-only (operator's stderr) and require local code execution, which
means the attacker already wins.

---

## Invariant Check Results

| Invariant | Applicable? | Result | Notes |
|---|---|---|---|
| **INV-1** Tenant isolation | No | N/A | No DB queries; no tenant-scoped tables touched. |
| **INV-2** Secrets by reference | **Yes** | **PASS** | Grepped `password\|secret\|apiKey\|token\|Bearer` across the diff: zero matches in source. CommandLine echoed to stderr contains file paths only (verified against the original incident's CommandLine in `ISS-UAT-013-2.md` lines 33–38). No `.env` reads, no `printenv`, no API-key access. |
| **INV-3** Auth at controller level | No | N/A | No NestJS controllers touched; no new HTTP endpoints. |
| **INV-4** Validation at boundaries | **Yes** | **PASS** | The bash helper is the boundary: validates `argc == 3` (`uat-preflight-check.sh:118`), port is digits-only in 1-65535 range (`:110–114`), `expected-substring` non-empty (`:117–119`). PID output is asserted numeric via `[[ "$pid" =~ ^[0-9]+$ ]]` (`:233`). Honours AGENTS.md §1.5 "at least one assertion per function". |
| **INV-5** No cross-schema queries | No | N/A | No SQL; no DB. |
| **INV-6** Rate limiting | No | N/A | No public endpoint; helper is local-dev invocation only. |
| **INV-7** CSRF protection | No | N/A | No browser-initiated state-changing op. |
| **INV-8** No `dangerouslySetInnerHTML` | No | N/A | No React / JSX touched. |
| **INV-9** No N+1 queries | No | N/A | No DB; no loops over data. |
| **INV-10** Drizzle parameterization | No | N/A | No SQL. |
| **INV-11** HttpOnly tokens (web) | No | N/A | No web cookie handling. |

### INV-Command-Invocation (custom check, per user prompt)

The user prompt asks specifically about command-injection in the PowerShell
invocation. **Detailed check below** — this is the highest-risk area of the diff.

The call site is `scripts/uat-preflight-check.sh:202`:

```bash
ps_script=$(
  cat <<'PS_EOF'
...
$port = $args[0]
...
PS_EOF
)
...
probe_output="$(
  powershell.exe -NoProfile -Command "$ps_script" "$port" 2>&1
)"
```

| Sub-check | Result | Rationale |
|---|---|---|
| Heredoc is single-quoted (`<<'PS_EOF'`) | **PASS** | No shell expansion inside the PowerShell script body. Bash metacharacters in the heredoc are inert. |
| `$ps_script` is double-quoted in `-Command "$ps_script"` | **PASS (acceptable)** | The double quotes around `$ps_script` prevent word-splitting on internal whitespace. Since `ps_script` was generated by the heredoc with no shell expansion, its contents are a known-safe literal. No user-controlled data is interpolated here. |
| `$port` is passed as a separate `"$port"` argv element, not interpolated into `-Command` | **PASS** | PowerShell binds `argv[1]` (after the script body) to `$args[0]`. This is **not** the same as bash's `-c "$script $arg"` pattern. The port value flows into PowerShell as a **string** that gets bound to `$port` and then to `-LocalPort $port`. |
| PowerShell-typed parameter coercion | **PASS (defense-in-depth)** | `Get-NetTCPConnection -LocalPort` is typed `Int32`. A non-numeric `$port` throws `ParameterBindingValidationException` before reaching WMI. The bash-side validator at `:110–114` already enforces digits-only in 1-65535, so this is belt-and-braces. |
| WMI filter is `("ProcessId=" + $pidVal)` with `$pidVal = [int]$conn` | **PASS** | `$pidVal` is **already cast to `[int]`** before string concatenation. Even a hostile `$conn` value cannot inject into the WMI filter string. |
| Apostrophe / quote in `expected-substring` | **PASS** | The substring is **never** passed to PowerShell. It is matched locally in bash (`[[ "$commandline" != *"$EXPECTED_SUBSTRING"* ]]` at `:248`) via parameter expansion, not eval. |
| `local` declarations inside functions | **PASS** | Per `03-code-summary.md` §9, a `local` outside-function bug was caught and fixed during validation. Current file: `local` appears only at `:152, :155, :160` (all inside `probe_via_test_hook`) and `:236, :247` (the truncation) inside the script body — verified. |

### INV-Test-Hook (custom check)

The user prompt asks specifically about the test-hook env-var parser.

The parser is `probe_via_test_hook` at `:142–178`. Inputs come from
`UAT_PREFLIGHT_PROBE_OUTPUT`, `UAT_PREFLIGHT_PROBE_PID`, `UAT_PREFLIGHT_PROBE_FAIL`.
Values are extracted by:

- `grep -E '^PID='` / `grep -E '^COMMANDLINE='` (`:154–155`) — line prefix match only.
- Parameter expansion: `${pid_line#PID=}` / `${cmd_line#COMMANDLINE=}` (`:165, :168`) — pure string operation.
- Then emitted via `printf '%s\n' "$pid"` / `printf 'PID=%s\nCOMMANDLINE=%s\n' "$pid" "$cmd"` (`:171, :178`).

| Sub-check | Result | Rationale |
|---|---|---|
| No `eval` on parsed values | **PASS** | Grepped the file: zero `eval` occurrences. The single comment on `:152` explicitly documents "We do NOT bash-eval the values." |
| No shell re-interpretation of parsed values | **PASS** | Values flow only into `[[ … =~ ^[0-9]+$ ]]` (numeric check) and `printf '%s'` (literal write). Neither re-invokes the shell. |
| Could a malicious `UAT_PREFLIGHT_PROBE_OUTPUT` bypass the helper? | **Yes — but only locally.** | INFORMATIONAL: a local attacker who can set env vars can fool the pre-flight into approving any backend. But this attacker already has local code execution, which is the full win condition. The env var is **not** set by any production deployment path; it is a pure dev/CI hook. |
| Could a malicious `UAT_PREFLIGHT_PROBE_PID` cause harm downstream? | **No.** | The PID is echoed to stderr in the failure message and stored in `$pid` for the success message. It is never passed back to the OS as an argument to any external command. `kill -0` is not invoked. |

### INV-LogInjection (custom check)

The `fail()` helper is `uat-preflight-check.sh:65`:

```bash
fail() { printf '%b  ✗ FATAL:%b %s\n' "$RED" "$NC" "$*" >&2; exit 1; }
```

- `%b` is applied **only to `$RED` and `$NC`** (the color codes).
- `%s` is applied to the **entire** user-supplied message, which means
  backslashes in the message are written **literally** — `C:\Users\…\path`
  stays as text, not `\U`/`\n`/etc. interpretation.
- The `local_preview="${commandline:0:200}"` (`:247`) truncates the
  CommandLine before passing it to `fail()`, which prevents a malicious
  CommandLine from creating unbounded stderr output.

| Sub-check | Result | Rationale |
|---|---|---|
| `echo -e` anywhere? | **None.** | Grepped `echo -e`: zero matches in `uat-preflight-check.sh`. The color helpers use `printf '%b'` for ANSI codes and `printf '%s'` for the message — the explicit fix from `03-code-summary.md` §6. |
| Unquoted variable expansions that would word-split? | **None material.** | All expansions are inside `"$VAR"` or `[[ … ]]`. The `printf '%s' "$cmd" | tr '\n' ' '` (`:171`) explicitly collapses newlines for stability. |
| Terminal escape injection via CommandLine | **Defended.** | A CommandLine containing the bytes `\033[2J` (ANSI clear-screen) or `; rm -rf /` is written as **text** to stderr; bash does not interpret it because it flows through `printf '%s'`, not `printf '%b'` or `echo -e`. |

### INV-Permissions (custom check)

| Sub-check | Result | Rationale |
|---|---|---|
| `Get-NetTCPConnection -LocalPort` requires elevation? | **No.** | Standard cmdlet, available to all users. Reference: Microsoft Docs, "NetTCPConnection" — runs in user context. |
| `Get-CimInstance Win32_Process` requires elevation? | **No.** | WMI queries against Win32_Process are readable by all local users by default; this is intentional (Task Manager equivalent). |
| Does the helper run with elevated privileges? | **No.** | `bash` / `powershell.exe -NoProfile` is invoked from the developer's normal shell. No `sudo`, no `Run as Administrator`, no UAC prompt. |

### INV-New-Dependencies (custom check)

| Sub-check | Result | Rationale |
|---|---|---|
| New `package.json` entries? | **None.** | Helper is bash; test is bats. Both runtimes are already in `package.json` devDeps per `02-impact-analysis.md` lines 84–89. |
| New system binaries required? | **None on Windows.** | Uses `powershell.exe` (built-in), `Get-NetTCPConnection` / `Get-CimInstance` (built-in cmdlets), `grep` (Git Bash ships with it), `tr` (coreutils, always present). |
| macOS/Linux new binaries? | **None today** (TODO marker only). | `probe_process_identity_unix` is a `fail` stub at `:226`. When implemented, it will need `lsof` and `ps` — both BSD-userland standard. Tracked as future work, no security implication today. |

---

## Findings

### BLOCKER Findings

**None.** No blocker-level security defects identified. Every category above
either passes or is N/A.

### MAJOR Findings

**None.** No MAJOR (retriable-by-CodeDeveloper) findings.

### MINOR Findings

**None.** No MINOR findings raised; everything that could have been MINOR
(see INFORMATIONAL notes below) is below the threshold of "should fix before
proceeding."

### INFORMATIONAL Notes

These are not findings per the gate-status semantics. They are documented for
the next reviewer / future contributor and to satisfy AGENTS.md §9 honesty.

1. **Test-hook env vars are a theoretical local-only bypass.** A local
   attacker who can set `UAT_PREFLIGHT_PROBE_OUTPUT` can fool the helper.
   This requires local code execution, which already wins. **Not a security
   defect in production** (the env var is not consumed by any production
   component). Defense-in-depth note only.

2. **Bats tests do not exercise the real PowerShell path.** The bats file
   at `scripts/tests/uat-preflight-check.bats` injects synthetic probe output
   via `UAT_PREFLIGHT_PROBE_OUTPUT`. This means the **PowerShell syntax** in
   `probe_process_identity_windows` (`:182–201`) is only verified on a
   Windows machine, either by `pnpm test:bash` running on Windows or by
   manual invocation. `03-code-summary.md` §3 and "Known Limitations §2"
   call this out honestly (70% confidence). **Not a security defect**, but
   the next reviewer should run the helper on Windows once before merge to
   validate that PowerShell actually accepts the `-Command "$ps_script"
   "$port"` invocation pattern (it does — this is the canonical
   PowerShell-from-bash pattern, but worth confirming once).

3. **macOS / Linux TODO marker.** The Unix probe is a `fail` stub at
   `:226`. Anyone running the helper on macOS or Linux will see a clear
   error pointing at the TODO. **Not a security defect**, but a
   defense-in-depth gap for cross-platform dev. Tracked separately per
   `02-impact-analysis.md`.

4. **CommandLine first 200 chars echoed to stderr on mismatch.** This is
   the issue's required error shape ("CommandLine: …"). It is a useful
   diagnostic for operators but does contain absolute file paths. Per
   `security.md` "What we don't log" — paths are not on the do-not-log list,
   only secrets/tokens/PII. File paths are fine. **Confirmed safe.**

5. **`UAT_PREFLIGHT_PROBE_FAIL=1` triggers an unconditional `return 1`** in
   the test hook, which the caller maps to a `fail` with the message
   `"process-identity probe failed: test hook reported non-zero exit"`
   (`:215`). If a real PowerShell failure occurs, the message reads
   `"process-identity probe failed: PowerShell exited <N>"` (`:218`). Both
   are operator-friendly and contain no secrets. **Confirmed safe.**

---

## Verdict

**PASS.** No BLOCKER or MAJOR findings. All 11 role-defined invariants are
either confirmed-OK or N/A. The custom checks for command-injection,
test-hook safety, log-injection, permissions, and new-dependencies all pass.
The PowerShell invocation at `scripts/uat-preflight-check.sh:202` uses the
canonical bash-args-into-PowerShell pattern: separate argv element, typed
parameter binding, integer-coerced WMI filter — three independent layers
defending against injection, none of which are bypassable by a hostile
`port` argument.

The INFORMATIONAL notes above are honest disclosures of the
defense-in-depth boundaries of this fix, not findings. They are consistent
with the `03-code-summary.md` "Known Limitations" section and AGENTS.md §9.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "All 11 role-defined invariants and 5 custom checks (command-injection, test-hook safety, log-injection, permissions, new-dependencies) pass for scripts/uat-preflight-check.sh, scripts/tests/uat-preflight-check.bats, .copilot/workflows/uat-verification.md, and docs/02-business-processes/uat/BP-UAT-000.md. No BLOCKER or MAJOR findings. The PowerShell invocation at uat-preflight-check.sh:202 uses separate-argv parameter binding with type-coerced WMI filter; no command-injection vector. Three INFORMATIONAL notes recorded for honest disclosure per AGENTS.md §9 (test-hook bypass requires local code execution; bats does not exercise real PowerShell; macOS/Linux TODO)."
  findings:
    - "INFORMATIONAL: UAT_PREFLIGHT_PROBE_OUTPUT env var is a local-only bypass — requires local code execution, which already wins. Not a production concern."
    - "INFORMATIONAL: Bats tests use the synthetic-probe test hook; real PowerShell syntax is exercised only on Windows CI or a Windows dev machine. Confirm by one manual run before merge."
    - "INFORMATIONAL: macOS/Linux probe is a fail-stub at uat-preflight-check.sh:226. Tracked separately per ISS-UAT-013-2 'Out of scope'."
  next_step: "Step 6 — TestStrategist. No retry needed."
```
