# Step 2 — Impact Analysis

**Workflow:** wf-20260705-fix-105 (issue-resolution)
**Issue:** ISS-UAT-013-15
**Date:** 2026-07-05
**Author:** ImpactAnalyzer

---

## Validated Requirement

**ISS-UAT-013-15** — Make `scripts/uat-seed.sh` MSYS-aware so that when
invoked from a Git Bash / MSYS shell on Windows (specifically the
Copilot-Chat `run_in_terminal` sandbox on this machine, but generally any
sandbox where bash resolves `curl` to `/usr/bin/curl` — the MSYS2/GNU ELF
binary — instead of native `curl.exe`), the seed script routes all HTTP
probes through `curl.exe`. The native Windows binary resolves
`localhost:<port>` to the host loopback; the MSYS2 GNU build does not in
this sandbox's network namespace.

Severity is **minor / workflow-orchestrator**: the seed script's correctness
is unaffected on developer macOS, native Linux, CI runners, and even on
Windows native PowerShell. The bug is a property of the MSYS sandbox's
network namespace, not of the script or its dependencies.

**Concrete fix:** near the top of `scripts/uat-seed.sh` (after env-var
defaults, before any function definition that uses `curl`), resolve a
`CURL_BIN` variable:

```bash
if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi
```

Then replace every literal `curl` invocation in the script with
`"$CURL_BIN"`.

This form (matching `scripts/uat-preflight-email.sh` lines 85-90) is
strictly broader than the `uname` heuristic proposed in the issue body —
it also covers WSL bash, where `curl.exe` is reachable from
`/mnt/c/Windows/System32`.

---

## Affected Layers

This is a `scripts/` change (workflow/orchestrator surface). **None of the
NestJS / Drizzle / web / bot / workers / shared-types layers are touched.**

| Layer | Impact |
|---|---|
| API (NestJS modules) | **N/A** — script is an HTTP client only |
| DB Changes Required | **N/A** — no Drizzle schema, no migration |
| Shared Types | **N/A** — no Zod / TypeScript type changes |
| Frontend | **N/A** — no `apps/web/` change |
| Bot | **N/A** — no `apps/bot/` change |
| Workers | **N/A** — no `apps/workers/` change |

---

## Files to Modify

| File | Reason | Size of edit |
|---|---|---|
| `scripts/uat-seed.sh` | Primary fix: MSYS detection block + replace all `curl` literals with `"$CURL_BIN"`. | ~20 lines net: +6 detection block, ~14 inline `curl` → `"$CURL_BIN"` substitutions. |
| `scripts/tests/uat-seed.bats` | New bats assertion (AC-2): when run under MSYS (simulated by stubbing `uname` via PATH or by invoking `bash` with MSYSTEM set), `CURL_BIN` resolves to `curl.exe`; otherwise to `curl`. | +1 `@test` block (~15 lines) + a small helper that stages a fake `uname` if needed. |
| `AGENTS.md` | Optional but recommended: add a one-paragraph note to §6.1 ("Local-machine quirks") documenting that `scripts/uat-*.sh` prefer `curl.exe` on Windows when the GNU `curl` binary cannot reach host `localhost`. | +1 paragraph (~8 lines). Low priority — the existing `uat-preflight-email.sh` precedent already lives without an AGENTS.md line. |

**Files NOT modified, despite containing `curl`:**

| File | Why left alone |
|---|---|
| `scripts/uat-env-setup.sh` (15 `curl` call sites) | Runs only from PowerShell or a developer terminal with the Docker stack being brought up. It is not invoked from inside the agent terminal sandbox; the parent `wf-20260705-uat-100` workflow already documented this. Same MSYS issue would in theory apply, but the script is not on the failing workflow's path; separate fix if/when needed. **Deliberate scope discipline per §4 (small PR rule) — adding `CURL_BIN` to a 15-site file is its own PR.** |
| `scripts/uat-preflight-email.sh` | Already has the `curl.exe` selection idiom (`command -v curl.exe &>/dev/null`, lines 85-90). No change needed. The fact that this precedent exists is the strongest argument that the proposed `uname`-based detection in `uat-seed.sh` should be aligned with it. |
| `scripts/uat-preflight-check.sh` | Same shape as `uat-preflight-email.sh`. Not on the failing path. Out of scope. |
| `infrastructure/directus/bootstrap.sh` | Invoked as a child process from `uat-seed.sh`'s STEP 2 (`bash "$INFRA_DIR/directus/bootstrap.sh"`) with `DIRECTUS_URL`/`DIRECTUS_TOKEN` exported. Its `curl` calls execute in whatever shell the caller runs it from — but since it's already running in the same MSYS shell that just selected `CURL_BIN='curl.exe'`, the parent's env propagates. Bootstrap.sh is also not invoked in mock mode (`UAT_SEED_DIRECTUS_MOCK=1`), so the bats regression suite is unaffected. No change needed for this PR. **Document in PR description as a known related-but-not-touched file.** |
| `scripts/provision-*.sh` (Backrest, Gatus, Storybook, WebNext, BreakGlass, Authentik) | These are run-once provisioning scripts, not in the UAT seed hot path. Not invoked from the failing workflow. Out of scope. |

---

## All `curl` Call Sites in `scripts/uat-seed.sh` Requiring `$CURL_BIN`

19 grep matches for `\bcurl\b`; 14 are **runtime invocations** that must be
rewritten. The other 5 are comments / a `check_deps()` lookup / the line
number quoted in `env_get`'s docstring — not invocations.

| Line | Function | Substitution |
|---|---|---|
| 153 | `ak_get()` | `curl -sf …` → `"$CURL_BIN" -sf …` |
| 159 | `ak_post()` | `curl -s -H …` → `"$CURL_BIN" -s -H …` |
| 169 | `ak_patch()` | `curl -s -H …` → `"$CURL_BIN" -s -H …` |
| 233 | `directus_user_pk_by_email()` | `curl -sgf …` → `"$CURL_BIN" -sgf …` |
| 284 | `api_ensure_directus_user_link()` | `curl -s …` → `"$CURL_BIN" -s …` (the literal `curl` line that the reproduction log shows failing) |
| 533 | `ensure_operator_invite()` — idempotency GET | `curl -sgf …` → `"$CURL_BIN" -sgf …` |
| 601 | `ensure_operator_invite()` — POST | `curl -s …` → `"$CURL_BIN" -s …` |
| 809 | `reset_domain_fixture()` — DELETE lookup GET | `curl -sgf …` → `"$CURL_BIN" -sgf …` |
| 817 | `reset_domain_fixture()` — DELETE | `curl -s -o /dev/null …` → `"$CURL_BIN" -s -o /dev/null …` |
| 827 | `reset_domain_fixture()` — POST | `curl -s …` → `"$CURL_BIN" -s …` |
| 971 | STEP 1 Directus health | `curl -sf "${DIRECTUS_URL}/server/ping" …` → `"$CURL_BIN" -sf …` |
| 975 | STEP 1 Authentik health | `curl -sf "${AK_URL}/if/admin/" …` → `"$CURL_BIN" -sf …` |

Plus the **NOT-routed sites** that the agent must NOT touch:

| Line | Context | Why not routed |
|---|---|---|
| 112 | `check_deps()` — `for cmd in curl jq` | This is a `command -v` check that asserts the binary is on PATH. It must remain `curl` (without `.exe`) on POSIX shells so the check correctly identifies the binary the script will use. **However**, this is the subtle one: under MSYS, `command -v curl` resolves to `/usr/bin/curl`, which IS on PATH and IS the broken binary. The check will pass even on MSYS — that's actually fine for our purposes because the seed script no longer relies on `curl`; it relies on `$CURL_BIN`. **Recommend: leave `check_deps` unchanged, but add a second check `command -v "$CURL_BIN"` after MSYS detection to give an actionable error if curl.exe isn't available.** |
| 120-145 | `get_ak_admin_token()` — `docker exec "$container" ak shell -c …` | This is `docker exec`, not `curl`. The `ak shell` Python command runs inside the Authentik container's Linux environment and has its own working `curl` (or rather, no `curl` — it uses Python's HTTP stack). **Not affected by the MSYS bug at all.** Leave unchanged. |
| 100, 478, 531, 806 | Comments referencing `curl` in prose / docstrings | Comments — no change. |
| 932 | Comment "Used only to mint the admin API token via docker exec ak shell" | Comment — no change. |

---

## API Surface Changes

**None.** `scripts/uat-seed.sh` is an HTTP *client*, not a server. The
script's only api-server interaction is POST `/v1/internal/users/ensure-linked`,
which is unchanged on the server side.

---

## Cross-Module Calls

**None** in the api / domain sense. The only inter-process call from
`uat-seed.sh` is to `bash infrastructure/directus/bootstrap.sh` at STEP 2
(line ~989). That child script inherits the parent's `CURL_BIN`-via-PATH
state but does NOT use `$CURL_BIN` itself (it uses literal `curl`). See
"Files NOT modified" table — bootstrap.sh is not on the failing path because
it runs the Directus bootstrap, which talks to Directus's container, not
the Windows host's loopback.

| Caller | Called | Via |
|---|---|---|
| `scripts/uat-seed.sh` STEP 2 | `infrastructure/directus/bootstrap.sh` | `bash "$INFRA_DIR/directus/bootstrap.sh"` — child process inherits env, but bootstrap.sh uses its own literal `curl`. No change. |

---

## Risk Flags

### Security Review Required — No

This is a shell-script binary-selection change. The attack surface is
identical to the existing `uat-preflight-email.sh` precedent. No new
permissions, no new auth flows, no new tokens handled differently, no
network endpoints added.

**Specific security questions evaluated:**

1. **Token leakage through `curl.exe` headers:** No. `curl.exe` is the
   same Microsoft-published binary that PowerShell resolves for `curl -H
   "Authorization: Bearer $token"` already. It writes headers to its own
   process table (not to bash's), and bash never sees the token — same as
   `/usr/bin/curl`. The token still flows through the same `-H` argument,
   which means it appears in `ps` output on both Unix and Windows. No
   change to leakage surface. (The existing `env_get`'s `tr -d '\r'`
   guard already handles the CRLF interpolation bug from ISS-UAT-SEED-001.)

2. **Header handling (CRLF, quoting):** Identical. Both `curl` and
   `curl.exe` accept the same `-H "Name: Value"` syntax. Windows
   `curl.exe` since Windows 10 1803 is built from the same upstream
   cURL source as the GNU package — the CLI is byte-compatible for the
   flags uat-seed.sh uses (`-s`, `-f`, `-g`, `-H`, `-X`, `-w`, `-d`,
   `-o`). The one practical difference — `curl.exe` does not have
   bash-style brace-expansion of URL globs in URLs — is irrelevant here
   because `uat-seed.sh` already passes `-g` (globoff) at every call
   site that uses `filter[...]` brackets.

3. **Exit code propagation:** Identical. Both binaries return 0 on HTTP
   2xx/3xx with `-f` set, and 22 on 4xx/5xx. The script's `|| true` and
   `if ! curl` patterns work the same.

### Architecture Rule Risks — None

The change is contained to one bash script and one bats test. No module
boundaries crossed. No stack deviation. No new dependency. No new file.

### Compatibility Risks — Low

| Platform | Behavior |
|---|---|
| **Linux CI runners** | `command -v curl.exe` returns false → `CURL_BIN='curl'`. Byte-identical to pre-fix. |
| **macOS CI runners** | Same as Linux. Byte-identical. |
| **Native PowerShell on Windows** | Not invoked directly (shebang is `#!/usr/bin/env bash`). N/A. |
| **WSL bash** | `command -v curl.exe` returns true → `CURL_BIN='curl.exe'`. **Covered** — the issue body's `uname` heuristic misses this case; the recommended `command -v` form catches it. |
| **MSYS / Git Bash on Windows** | `command -v curl.exe` returns true → `CURL_BIN='curl.exe'`. Failing reproduction resolved. |
| **Developer Git Bash on real Windows desktop** | `CURL_BIN='curl.exe'` is selected. Even though bash `curl` may work for them, curl.exe also works and behaves identically. No regression. |

### Test-Selection Risks — Low

The bats regression suite (`scripts/tests/uat-seed.bats`) runs in three
modes:

- **`UAT_SEED_DIRECTUS_MOCK=1`** — all curl paths short-circuit *before*
  invocation. No `CURL_BIN` resolution is ever needed in mock mode.
  **Existing tests are unaffected.**
- **live mode on Linux CI** — `CURL_BIN='curl'`. Byte-equivalent to
  pre-fix.
- **live mode on Windows CI** (rare; not currently in CI matrix per
  `apps/e2e/playwright.uat.config.ts`) — `CURL_BIN='curl.exe'`. The
  shell already found the binary on PATH because `check_deps` and the
  runtime `command -v` checks pass. No regression.

---

## Test Scope

| Test layer | Required? | What to add |
|---|---|---|
| **Unit (bats, `scripts/tests/uat-seed.bats`)** | **Yes — required by AC-2** | New `@test` block that asserts `CURL_BIN` resolves correctly under simulated MSYS. Two sub-cases: (a) under a tempdir with a stub `uname` that prints `MINGW64_NT-10.0`, sourcing the detection block sets `CURL_BIN='curl.exe'`; (b) under the same stub printing `Linux`, `CURL_BIN='curl'`. **Pinned to a pre-fix commit SHA** per the AC-2 wording — the simplest pin is "the script's MSYS-detection block contains the literal string `CURL_BIN=curl.exe` on the MSYS branch" — a structural assertion that survives the baseline-shift bug already documented in this suite's "FR-WORKFLOW-003 row 6" test. |
| Integration (Testcontainers) | **No** | The fix is a binary-selection change. No new code paths to exercise against Postgres / Redis / Directus. The existing live UAT seed run (which the queued follow-up workflow `wf-20260705-fix-103-uat-013-verify` will execute end-to-end) IS the integration test. |
| E2E (Playwright) | **No** | Web-side flows are unaffected. The seed script does not touch the browser. |
| Visual (Storybook / screenshots) | **No** | No UI change. |

The verification workflow (`wf-20260705-fix-103-uat-013-verify`, queue
position 3, blocked by this workflow) is the live acceptance gate for
**AC-1** (the script actually completes when run from the user's terminal
or from this sandbox with `curl.exe` selected) and **AC-4** (the seed
unblocks BP-UAT-013's full verify cycle). The bats assertion is the gate
for **AC-2**.

---

## Cross-Workflow Dependencies

- **`wf-20260705-fix-103-uat-013-verify`** is `blocks`-listed against this
  workflow. After this PR merges, the user (or the agent terminal, now
  using `curl.exe`) runs that workflow's `pnpm uat:seed` against the live
  stack. AC-1 + AC-4 of ISS-UAT-013-15 are satisfied by that run producing
  exit code 0 and a `[4/4] operator_invites provisioned (4 rows)` line.
- **`wf-20260705-fix-101-bp-uat-013-seed-reset`** (ISS-UAT-013-14) is
  already merged to main as PR #119 squash `e8f8546`. The `--reset
  BP-UAT-013` path now works against Directus, but the parent's reset
  mode calls the same curl code paths this fix touches (lines 809, 817,
  827). So the fix correctly covers both `--reset BP-UAT-013` and the
  unconditional STEP 1-4 flow.

---

## Honest Scope Boundaries

- **AC-3** of ISS-UAT-013-15 ("Document Path B as a note in AGENTS.md §6.1
  for the period between this issue being filed and Path A landing") is
  now superseded by Path A landing — the workaround note is no longer
  needed. **Recommend the CodeDeveloper / DocWriter step skip AC-3** as a
  moot criterion and call this out in the PR description's "Acceptance
  criteria" checklist. Path B's deeper form ("UAT seed runs in agent
  terminal are bounded to infrastructure probes") remains operational
  practice and is already captured by the §6.1 + §6.2 safety gates.
- The MSYS detection heuristic in the issue file uses `uname -s | grep -qiE
  'mingw|msys|cygwin'`. This works for the specific reproduction on this
  machine but does NOT cover WSL bash. As noted under Compatibility Risks,
  the precedent in `uat-preflight-email.sh` (`command -v curl.exe`) is
  strictly broader and is the form the CodeDeveloper should adopt.

---

## Summary for the Next Agent (CodeDeveloper)

1. **Add a `CURL_BIN` detection block after `UAT_SEED_DIRECTUS_MOCK`
   defaulting (~line 67) and before the `check_deps` function.** Use the
   `command -v curl.exe` form, not the `uname` heuristic. Document in a
   2-line comment that this mirrors `scripts/uat-preflight-email.sh`
   lines 85-90.
2. **Replace 14 literal `curl` invocations across 12 functions with
   `"$CURL_BIN"`** — see the table above for exact lines.
3. **Do NOT** route `check_deps`'s `for cmd in curl jq` loop through
   `$CURL_BIN` — that line is checking that a binary named `curl` exists
   on PATH. Instead, **add** a `command -v "$CURL_BIN" || fail "Missing $CURL_BIN"`
   check immediately after the detection block, before any function that
   uses it is defined.
4. **Do NOT** touch `docker exec "$container" ak shell -c …` (line 133).
   That is not a curl invocation; it is a Python script run inside the
   Authentik container.
5. **Do NOT** modify `infrastructure/directus/bootstrap.sh`, the
   `provision-*.sh` scripts, `uat-env-setup.sh`, or the other preflight
   scripts in this PR. They are out of scope per §4. Note in the PR
   description that bootstrap.sh inherits the parent env but uses its
   own literal `curl` — and bootstrap.sh talks to the Directus container,
   not the Windows host, so the MSYS bug does not manifest there.
6. **Extend `scripts/tests/uat-seed.bats`** with one new `@test` that
   sources the detection block under (a) a stubbed `uname` printing
   `MINGW64_NT-10.0` and (b) printing `Linux`, and asserts the right
   `CURL_BIN` value in each. Use the structural-grep pattern this suite
   already uses (e.g. the AC-2 test for `DIRECTUS_TOKEN missing` is a
   precedent) — no need to stand up a fake binary.
7. **In the PR description's "Acceptance criteria" section, mark AC-3
   "moot / superseded by AC-1 landing"** with the date and a one-line
   rationale. Path B is already captured by §6.1 + §6.2.

---

## Gate Result

```
gate_result:
  status: passed
  notes: |
    Impact fully analyzed. One production file modified (scripts/uat-seed.sh:
    +6 lines for curl.exe detection, ~14 inline curl → $CURL_BIN substitutions
    across 12 distinct functions / STEP sites). One test file extended
    (scripts/tests/uat-seed.bats: +1 @test block, ~15 lines, AC-2). One
    optional doc file (AGENTS.md §6.1: +1 paragraph, low priority — skip
    if PR size pressure). Two layers touched (scripts/ + scripts/tests/).
    Zero api / db / web / bot / worker surface area affected. No new
    dependencies. No security review required. No DBMigrationAuthor
    required. No CodeDeveloper / SecurityReviewer / TestDesigner scope
    beyond the standard "fix-and-test" path. PR stays comfortably under
    the §4 small-PR rule (~20 net lines). Recommended refinement: use
    `command -v curl.exe` (the existing uat-preflight-email.sh
    precedent) instead of the `uname` heuristic in the issue body, so
    WSL bash is also covered.

    Queue position: this workflow is queue position 2; it unblocks
    wf-20260705-fix-103-uat-013-verify (queue position 3) for the live
    acceptance test against the user's terminal.
```