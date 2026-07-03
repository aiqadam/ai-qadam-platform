## What

Two independent changes bundled for atomicity:

1. **Bugfix in `scripts/uat-preflight-check.sh`** — the Windows pre-flight
   process-identity probe (ISS-UAT-013-2 invariant) silently fails on Git
   Bash when:
   - the PowerShell `-Command` form strips `$`-tokens during bash
     double-quote expansion,
   - PowerShell outputs `\r\n` (CRLF) which corrupts the `^[0-9]+$` PID
     check,
   - Windows paths use `\` but the expected substring uses `/`, so
     `apps/api` never matches `apps\api`.

2. **New blocker issue `ISS-UAT-001-1`** — `scripts/uat-seed.sh` cannot
   mirror newly-added Authentik identity fixtures into Directus, because
   `directus-users-bridge.ensureLinked()` only fires on the OIDC
   `/v1/auth/callback` flow, not on Authentik admin-API user creation.
   This blocks `pnpm uat:seed --reset BP-UAT-001` and any other BP-UAT-*
   run that uses a freshly-created Authentik fixture user.

## Why

- The preflight probe fix unblocks UAT verification runs on Windows. All
  12 `scripts/tests/uat-preflight-check.bats` regression tests pass,
  including the AC-4 invariant that detects a foreign service listening
  on :3000.
- ISS-UAT-001-1 must be registered and queued (wf-20260703-fix-064)
  before any further BP-UAT-001 verification can succeed.

## How

- **`scripts/uat-preflight-check.sh`**: rewrite the PowerShell probe to
  write its body to a temp `.ps1` and invoke via `-File` (instead of
  `-Command`); strip trailing `\r` from `CommandLine`; normalize both
  sides via `${var//\\//}` before the substring match. ~50/24 lines
  changed in 1 file.
- **`.copilot/issues/ISS-UAT-001-1.md`**: full diagnostic with three
  attempted workarounds (all failed) and the recommended fix
  (`POST /v1/internal/users/ensure-linked` protected by
  `InternalAuthGuard`).
- **`.copilot/issues/registry.md`**: add the issue row.
- **`.copilot/context/workspace-state.md`**: mark `wf-20260703-uat-063`
  as `needs-review` and queue `wf-20260703-fix-064`.

## Risks

- Low. The preflight bugfix is constrained by the bats regression suite
  (12 tests). The ISS-UAT-001-1 issue file documents the failure mode and
  proposed fix; no code change is proposed in this PR for the seed issue.

## Testing

- `bash scripts/run-bats.sh scripts/tests/uat-preflight-check.bats` —
  all 12 tests pass.
- `arch:check` — passes (8 files scanned staged).
- The seed issue is registered but **not** fixed in this PR.

## Honesty disclosure (per AGENTS.md §6.1)

BP-UAT-001 verification did NOT reach the live Playwright run. The
workflow escalated to `needs-review` at Step 2 (seed). ACs of BP-UAT-001
are NOT verified by this PR. Status of `BP-UAT-001` in
`docs/02-business-processes/uat/registry.md` stays `Ready` until a future
verification run after `wf-20260703-fix-064` lands.

## Checklist

- [x] Tests added / updated (bats regression suite still green)
- [x] Docs updated if behavior changed (issue + registry + workspace-state)
- [x] No new dependencies
- [ ] Manually tested locally — `pnpm uat:seed --reset BP-UAT-001` still
      fails (ISS-UAT-001-1, follow-up workflow)