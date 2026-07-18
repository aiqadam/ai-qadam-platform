# Security Review — wf-20260718-feat-121

## Code Changes Reviewed

- `scripts/uat-qa-preflight-check.sh` (new) — read in full
- `scripts/tests/uat-qa-preflight-check.bats` (new) — read in full
- `.copilot/agents/uat-runner.md` (modified) — full diff reviewed
- `.copilot/workflows/uat-verification.md` (modified) — full diff reviewed
- `.copilot/schemas/handoff.schema.yaml` (modified) — full diff reviewed
- `scripts/uat-seed.sh` — checked for changes (none; `git diff --stat` empty),
  `reset_localhost_guard` presence confirmed at line 645/996, untouched
- `.copilot/tasks/active/wf-20260718-feat-121/02-impact-analysis.md` and
  `03-code-summary.md` — read for context, not relied on for the verification
  claims below (verified independently per instructions)

This is a `.copilot/`-tooling + shell-script change (FR-WORKFLOW-005,
read-only QA-target mode for agent-driven UAT). No NestJS controller, DB,
React, tenant-scoped table, or auth-guard surface is touched. Confirmed via
`git diff --stat`: only `.copilot/`, `scripts/`, and the task directory
changed — no `apps/api/`, `apps/web*/`, `apps/bot/`, `apps/workers/`, or
`packages/` path present.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | No tenant-scoped table, no `countryCode`-filtered query, no `bypassTenant()` — this diff contains no DB access of any kind. |
| INV-2 Secrets by reference | Yes | Pass | No `password`/`secret`/`apiKey`/`token`/`Bearer` literals in any of the 5 changed files. The new script's probes are unauthenticated GET requests against public HTTPS endpoints; no credential is read, passed, or logged anywhere in the diff. |
| INV-3 Auth at controller level | No | N/A | No controller, no NestJS route, added or modified. |
| INV-4 Validation at boundaries | Yes (analogue) | Pass | The one true "boundary" here is `uat_target`'s value at workflow Step 0, which is treated as an allowlist (`local`, `qa`) with `failed-escalate` on anything else — see verification below. The script's own `--base-url` flag is validated for presence (missing value → exit 2) but not further sanitized before use; see the command-injection check below for why this is safe regardless. |
| INV-5 No cross-schema queries | No | N/A | No DB access of any kind. |
| INV-6 Rate limiting | No | N/A | Not a public API endpoint; this is a local dev/CI shell script making outbound GET probes, not an inbound endpoint requiring throttling. |
| INV-7 CSRF protection | No | N/A | No browser-initiated state-changing request. All HTTP activity in the diff is outbound `curl -sS ... GET` (implicit default method), read-only, and does not touch a session cookie. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | Pass | Zero occurrences — confirmed by grep across all 5 changed files (also structurally true: no React/JSX file is in this diff). |
| INV-9 No N+1 queries | No | N/A | No query loop; the script's two `check_host` calls are two fixed, sequential HTTP probes, not a data-driven loop over query results. |
| INV-10 Drizzle parameterization | No | N/A | No `sql\`...\`` tag, no `db.execute()`, no SQL of any kind in this diff. |
| INV-11 HttpOnly tokens (web) | No | N/A | No token issuance, storage, or cookie handling. No `localStorage` usage. |

9 of 11 invariants are N/A for this diff (no DB/API/frontend/auth surface,
as both the impact analysis and code summary state and as independently
confirmed by `git diff --stat` above). INV-2 and INV-8 are applicable and
pass. The invariant checklist is intentionally light for this change class;
the FR's actual security-relevant property (QA read-only guarantee) is
outside the standard INV-1..11 set and is verified in its own section below
per the Orchestrator's task instructions.

---

## FR-Specific Verification: QA Read-Only Guarantee (AC-3c)

This is the one property that matters for this diff. Verified directly,
independent of the code summary's self-assessment.

### 1. `scripts/uat-qa-preflight-check.sh` — structural check

Read the file in full (222 lines). Confirmed:

- The only two `curl` invocations are inside `probe_http_code()` (line 181):
  `curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || printf '000'`.
  No `pnpm`, no `uat:seed`, no `uat-seed.sh`, no `eval`, no `source`/`.` of
  another file, anywhere in the script.
- `grep -c 'uat:seed' scripts/uat-qa-preflight-check.sh` → `0` (ran directly,
  not taken on faith from the bats output). `grep -n 'pnpm'` matches exactly
  two lines (25, 108), both prose in comments/usage text — "the
  fixture-seeding pnpm script" — describing the absence of the capability,
  not invoking it. Confirmed the code summary's design-decision note
  (rewording away from the literal token to keep the regression guard
  meaningful) is accurately reflected in the actual file.
- The script has exactly one job: two HTTP GET reachability probes
  (`check_host` for `$BASE_URL` and the fixed `$IDP_URL`) and a pass/fail
  exit code. There is no code path — conditional, loop, or otherwise — that
  reaches any external command besides `curl`, `printf`, and shell
  built-ins.
- **Conclusion: the read-only guarantee is genuinely structural at the
  script level.** It is not merely "the script doesn't currently call seed"
  — the capability to call it doesn't exist in the file at all. A future
  edit would have to *add* a seed invocation, not merely fail to remove a
  guard.

### 2. `.copilot/agents/uat-runner.md` / `.copilot/workflows/uat-verification.md` — process-level check

Read both full diffs. Confirmed:

- `uat-runner.md`'s new `### target: qa` Pre-Flight block (lines ~287-302)
  calls only `bash scripts/uat-qa-preflight-check.sh` and explicitly states
  "seed/reset is NEVER invoked for `target: qa`. Do not run `pnpm uat:seed`
  (with or without `--reset`) against QA under any circumstance." No
  `pnpm uat:seed` line appears anywhere inside the `target: qa` branch — it
  appears only in the separate, pre-existing `target: local` branch a few
  lines above (unchanged from before this diff, per the surrounding
  unmodified context in the same diff hunk).
- `uat-verification.md`'s new `#### target: qa` Step 2 block (lines
  ~139-158) is the same shape: only the pre-flight script invocation plus
  an explicit "seed/reset is NEVER invoked" comment. The `pnpm uat:seed`
  line remains solely inside the untouched `target: local` block above it.
- **This is process-level enforcement, not script-level enforcement** — it
  depends on the UATRunner agent and the Orchestrator actually following
  the documented branch and not, say, running the `target: local` block's
  commands against a QA `handoff.yaml` by mistake, or an operator manually
  invoking `pnpm uat:seed` outside the documented flow entirely. Unlike the
  script (§1), there is no mechanism that makes it *impossible* to invoke
  seed against QA from the docs alone — only a mechanism that makes it
  *undocumented and against explicit instruction* to do so. I note this
  distinction explicitly rather than treating "the docs say never" as
  equivalent to "the code cannot."
- The `landingUrl` ternary in `uat-runner.md` (`UAT_TARGET === 'qa' ? 'https://qa.aiqadam.org' : 'http://localhost:4321'`)
  is allowlist-shaped (only the literal `'qa'` string takes the QA path),
  consistent with Step 0's stated allowlist gate.

### 3. `scripts/uat-seed.sh` / `reset_localhost_guard` — independent backstop untouched

`git diff --stat -- scripts/uat-seed.sh` returns empty — zero changes.
Directly confirmed `reset_localhost_guard()` is defined at line 645 and
called at line 996 of the current (unmodified) file. This FR's design does
not rely on this guard (the QA branch never reaches a seed call at all,
per §1), but it remains in place as an independent, pre-existing backstop
(FR-WORKFLOW-003) should `uat-seed.sh` ever be invoked manually against a
non-localhost target through some other path outside this workflow.

### 4. Other security-relevant checks on the new script

- **Network calls:** both probes are unauthenticated `curl -sS ... GET`
  (curl's default method — no `-X POST`/`-d` anywhere) against public HTTPS
  URLs. No `Authorization` header, no cookie, no admin API. `-o /dev/null`
  discards the response body (reachability check only, does not process or
  echo remote content). `--max-time 10` bounds each probe so a hung host
  cannot hang pre-flight indefinitely. Matches the impact analysis's
  expectation exactly.
- **`--base-url` command-injection check:** `BASE_URL="$2"` (line 129) is
  assigned directly to a variable, then passed as `"$url"` — a single
  double-quoted argument — into `curl -sS -o /dev/null -w '%{http_code}'
  --max-time 10 "$url"` (line 181). This is a direct `argv` element to
  `curl`, not a string that gets `eval`'d, `source`'d, or interpolated into
  a shell command built with `bash -c "..."`. Standard shell word-splitting
  and globbing are suppressed by the double quotes, so a value like
  `--base-url "$(rm -rf /)"` or `--base-url "; rm -rf /;"` is passed to curl
  as a single literal URL string argument (which curl will simply fail to
  parse as a valid URL and report a `000`/error code) — **not executed as a
  shell command**. Confirmed no `eval`, no backticks, no unquoted `$url`
  expansion anywhere in the file. `host_of()` (line 143) does only
  parameter-expansion string stripping (`${url#https://}` etc.), again no
  `eval`. No injection path found.
- **Secrets/tokens:** none hardcoded, none logged. The script prints only
  hostnames, HTTP status codes, and the fixed AC-3c read-only message —
  confirmed by reading every `printf`/`ok`/`warn`/`info`/`fail` call site.
- **Test hook (`UAT_QA_PREFLIGHT_HTTP_CODES`):** documented in the script
  header as "do not use in production," parsed via safe `IFS=','`
  splitting and `${pair%%=*}`/`${pair#*=}` parameter expansion — no `eval`
  of the hook's content. Cannot be used to inject commands even if an
  attacker controlled the env var, since the parsed value is only ever
  compared with `==` and pattern-matched with `=~` against a fixed regex
  (`^2[0-9][0-9]$` / `^3[0-9][0-9]$`), never executed.

---

## BLOCKER Findings

None.

## MAJOR Findings

None.

### Minor observation (non-blocking, informational only)

The QA read-only guarantee has two distinct strength levels that are both
true but shouldn't be conflated: the **script-level** guarantee (§1) is
structural/enforced-by-absence and cannot be defeated by an agent
mis-following instructions. The **doc/process-level** guarantee (§2) — that
UATRunner and the Orchestrator actually take the `target: qa` branch and
never run the `target: local` block's `pnpm uat:seed` line against a QA
`handoff.yaml` — is enforced only by the agent correctly reading and
following `uat-runner.md`/`uat-verification.md`, same as any other
documented workflow rule in this repo. This is consistent with how the rest
of the `.copilot/` workflow system already operates (e.g. Scope Constraints
elsewhere are also process-followed, not code-enforced), so it is not a
regression in enforcement strength relative to the rest of the system — just
worth recording plainly rather than letting "structural, not just
documented" (true of the script) blur into implying the docs are also
code-enforced (they are not, and don't need to be, given the script already
makes the dangerous action unreachable).

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-005 security review passed. No product-code/DB/API/frontend/auth surface touched (9/11 invariants N/A, confirmed individually rather than blanket-skipped). The FR's actual security property — QA UAT sessions are structurally read-only — verified directly: scripts/uat-qa-preflight-check.sh contains zero pnpm/uat:seed/eval/source code paths (confirmed by direct grep, not taken from the bats output or code summary), scripts/uat-seed.sh and its reset_localhost_guard backstop are unmodified (git diff --stat empty), and --base-url is passed to curl as a quoted argv element with no eval/shell-interpolation injection path. No BLOCKER or MAJOR findings."
  findings:
    - "Script-level read-only enforcement (scripts/uat-qa-preflight-check.sh) is genuinely structural: no code path reaches pnpm/uat:seed/uat-seed.sh — the capability doesn't exist in the file, not merely unused."
    - "Doc-level enforcement (uat-runner.md, uat-verification.md target: qa branches) is process-level, not code-level — depends on the agent following documented steps. Both branches were read in full; the pnpm uat:seed line appears only inside the untouched target: local block, never inside target: qa. Noted as a minor non-blocking distinction, not a finding requiring a fix."
    - "scripts/uat-seed.sh confirmed untouched (empty git diff --stat); reset_localhost_guard (FR-WORKFLOW-003) intact at lines 645/996 as an independent backstop this FR does not rely on."
    - "--base-url is passed as a quoted \"$url\" argv element into curl, never eval'd or shell-interpolated; command-injection payloads would be treated as a literal (invalid) URL string by curl, not executed."
    - "No secrets, tokens, or credentials introduced, hardcoded, or logged anywhere in the diff. All network calls are unauthenticated GET probes against public HTTPS endpoints with a bounded --max-time."
```
