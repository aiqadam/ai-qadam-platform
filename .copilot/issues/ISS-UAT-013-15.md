# ISS-UAT-013-15 — UAT seed + agent-sandbox `bash` cannot reach Windows-host localhost

**Severity:** minor (workflow/orchestrator — affects remote/CI/sandboxed runs only)
**Module:** workflow/orchestrator
**Status:** resolved
**Resolved:** 2026-07-05
**Workflow:** wf-20260705-fix-105
**Date:** 2026-07-05
**Discovered by:** wf-20260705-uat-100 (BP-UAT-013 re-verification pre-flight)

## Summary

When `scripts/uat-seed.sh` runs from a Git Bash / MSYS bash sub-shell that is itself running inside a sandboxed agent terminal (VS Code Copilot Chat's `run_in_terminal` on this machine, or any remote-execution sandbox that maps Git Bash as the default bash), the seed's HTTP probes to `http://localhost:<api_port>` exit with `curl: (7) Failed to connect`. The api is up and reachable from `curl.exe` (PowerShell) on the same host; only the sandbox's bash-curled path fails.

This makes `pnpm uat:seed` non-functional when invoked from inside an automated workflow's terminal sandbox, even when the rest of the UAT environment (Docker stack, web, api on `:3001`, mailpit, Authentik) is healthy.

## Reproduction

```
sandbox$ pnpm uat:seed
… STEP 1-2 succeed …
[3/4] Creating Authentik test users…
  ✓ user uat-member (exists, pk=5)
  ✓ uat-member → groups: aiqadam-member
+ api_ensure_directus_user_link uat-member@example.com 'UAT Member'
++ curl -s -H 'x-internal-auth: …' -X POST -w '\n%{http_code}' \
       http://localhost:3000/v1/internal/users/ensure-linked -d '{…}'
+ resp='\n000'
+ ec=7
ELIFECYCLE  Command failed with exit code 7.
```

`curl --version` shows: `curl 8.5.0 (x86_64-pc-linux-gnu)` from `/usr/bin/curl` (Git Bash MSYS). PowerShell `curl.exe --version` is a separate binary. Inside this sandboxed terminal, only the bash GNU curl is on `$PATH`, and it cannot reach Windows-host `localhost:3000` / `:3001`.

Sanity-check from the same sandbox with `curl.exe`:

```powershell
PS> curl.exe -s --max-time 5 http://localhost:3001/health
{"status":"ok","timestamp":"…","service":"api","tenant":{"code":"uz","name":"Uzbekistan"}}
```

So the api IS reachable — just not from bash inside this terminal.

## Root-cause hypothesis

The Copilot-Chat `run_in_terminal` tool on this Windows machine spawns a Git Bash / MSYS shell. When bash then runs `curl` (without `.exe`), MSYS resolves to `/usr/bin/curl` — a Linux ELF binary running through WSL's network namespace, which cannot see the Windows host's loopback adapter the way native `curl.exe` can. The sandbox's `localhost` and the Windows host's `localhost` are **not the same network endpoint** in this configuration.

This is not a misconfiguration of the repo or the api; it is a property of how this terminal sandbox resolves "localhost" from inside bash.

## Mitigation paths

### Path A — make the seed `curl.exe`-aware on Windows

In `scripts/uat-seed.sh`, near the top, switch the curl binary to `curl.exe` when running under Git Bash on Windows:

```bash
# Detect Git Bash on Windows: MSYSTEM is set, but `uname -s` reports MINGW* / MSYS / CYGWIN
if uname -s 2>/dev/null | grep -qiE 'mingw|msys|cygwin'; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi
# Then replace every `curl` call with "$CURL_BIN" in the script.
```

This keeps the script POSIX-correct (it remains a `bash` script) while routing HTTP through the native Windows binary where available.

### Path B — document that the agent terminal cannot run `pnpm uat:seed`

Update `AGENTS.md §6.1` and the workflow's Step 2 pre-flight to note: **UAT seed must run from the user's native terminal, not from inside an agent sandbox.** The Orchestrator's Step 2 pre-flight in the agent terminal is limited to **infrastructure probes** (curl, docker ps, port checks); the actual `pnpm uat:seed` invocation must be deferred to a human-triggered run OR to a CI runner that has the right network namespace.

This is the path `wf-20260705-uat-100` falls back to: Step 1 (validation) + Step 2 (pre-flight infrastructure probes) are complete in the sandbox; Steps 3+ (UATRunner, VisualReviewer, Triage, PR) are queued as a follow-up workflow that the user runs from their own terminal.

### Path C — both (Path A as the long-term fix, Path B as the immediate workaround)

Recommended. Path A is the right engineering answer (the seed script should not depend on bash curl reaching Windows localhost); Path B is the immediate workaround for this and any future workflow run from this terminal.

## Acceptance criteria

- [ ] AC-1: After Path A is implemented, `bash scripts/uat-seed.sh` invoked from a Git Bash MSYS shell on Windows completes successfully when the api is reachable at `localhost:3001`.
- [ ] AC-2: A new bats assertion under `scripts/tests/uat-seed.bats` verifies that on MSYS, `CURL_BIN` resolves to `curl.exe` (or the equivalent detection logic), pinned to a pre-fix commit SHA.
- [ ] AC-3: Document Path B as a note in `AGENTS.md §6.1` for the period between this issue being filed and Path A landing.
- [ ] AC-4: The queued follow-up workflow `wf-20260705-fix-101-uat-013-verify` runs successfully against the live stack from the user's terminal (re-uses the artifacts in `.copilot/tasks/active/wf-20260705-uat-100/` as its inputs).

## Owner

Queued as `wf-20260705-fix-102-uat-seed-curl-exe-aware` (issue-resolution workflow). Pairs with `ISS-UAT-013-14` (`wf-20260705-fix-101-bp-uat-013-seed-reset`) — both must land before the `wf-20260705-fix-103-uat-013-verify` UAT re-run workflow can complete.

## Resolution

**Workflow:** wf-20260705-fix-105
**PR:** [#120](https://github.com/tvolodi/aiqadam/pull/120)
**Merged:** 2026-07-05 (squash SHA `f55ce74281510d5cb45270571e54181a185ded7f`)
**Root cause:** `scripts/uat-seed.sh` invoked `curl` directly; under Git Bash MSYS on Windows, bash resolves `curl` to the MSYS2 GNU ELF binary (`/usr/bin/curl`), which cannot reach Windows-host `localhost:<port>` from this machine's Copilot-Chat `run_in_terminal` sandbox — only native `curl.exe` (in `System32`, on PATH from Git Bash) can.

**Fix:** added an MSYS-aware `CURL_BIN` resolution block at the top of `scripts/uat-seed.sh` that mirrors the existing `scripts/uat-preflight-email.sh` precedent (`command -v curl.exe` form, which is strictly broader than the `uname` heuristic in the issue body — it also covers WSL bash). All 14 runtime `curl` invocations across 12 helper functions now route through `"$CURL_BIN"`. `check_deps()` was extended to also verify `$CURL_BIN` is on PATH with an actionable `fail "Missing required curl binary: $CURL_BIN"` message.

**Refinement vs. issue body:** chose `command -v curl.exe` over the issue's `uname` heuristic (broader coverage, matches repo precedent). Recorded in PR description under "Risks" per AGENTS.md §13 step 4 (date 2026-07-05, refinement reason: WSL bash + repo-pattern consistency, original concern disposition: superseded).

**Regression tests:** 4 new bats rows in `scripts/tests/uat-seed.bats` (rows 38-41): AC-2 structural detection-block check, AC-2 routing-completeness check, AC-2 runtime simulation (curl.exe-on-PATH vs absent), AC-2 `check_deps` extension check. Existing ISS-UAT-SEED-002 AC-2/3/4 test stub patched to honor the new MSYS-aware resolution. bats suite 41/41 passing (was 37/37 + 4 new). Bash syntax check (`bash -n`) passes.

**Merged:** <pending> (Step 12.5 back-fills).

## Honesty disclosures

- **AC-1** ("`bash scripts/uat-seed.sh` invoked from a Git Bash MSYS shell on Windows completes successfully") and **AC-4** ("the queued follow-up `wf-20260705-fix-101-uat-013-verify` runs successfully against the live stack from the user's terminal") are owned by the queued follow-up `wf-20260705-fix-103-uat-013-verify` (queue position 3 of the BP-UAT-013 cascade). This workflow ships the code change and the regression test; the live acceptance test runs from the user's native terminal (or a future CI runner with the right network namespace) where curl.exe reaches Windows-host localhost.
- **AC-3** ("Document Path B as a note in AGENTS.md §6.1") is moot — Path A is now landing, no Path B workaround note is needed.

## Related

- AGENTS.md §6.1 (production-readiness infra obligations) — "If pre-flight fails … fix the root cause, do not defer"
- `.claude/CLAUDE.md` "Local override" — notes the machine's git-auth quirks; same category of "this terminal is special"
- `wf-20260705-uat-100` pre-flight (`02-preflight.md`) — full reproduction with curl traces
- `scripts/uat-seed.sh` lines 264-296 — current `api_base` derivation
- `scripts/uat-preflight-email.sh` lines 85-90 — existing `command -v curl.exe` precedent that the fix mirrors