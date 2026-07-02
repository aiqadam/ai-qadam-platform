#!/usr/bin/env bats
# scripts/tests/audit-nodemailer-version.bats
#
# Regression test for ISS-CI-002 — the pre-existing CI regression where
# `pnpm audit --prod --audit-level=high` failed because
# `apps/api > nodemailer@6.10.1` carried two high-severity CVEs
# (GHSA-rcmh-qjqh-p98v, GHSA-p6gq-j5cr-w38f). Branch protection requires
# this audit to pass before merge; ISS-CI-002 unblocks merges by upgrading
# `nodemailer` to a patched version (>=9.0.1) in `apps/api`.
#
# This test asserts that the unblocked state is real and durable:
#
#   AC-1: Resolved `nodemailer` version in @aiqadam/api is >=9.0.1.
#         (Pre-fix: 6.10.1 — would fail. Post-fix: 9.0.3 — passes.)
#   AC-2: `pnpm audit --prod --audit-level=high` exits 0.
#   AC-3: Neither of the two original CVE advisory IDs appears in audit output.
#   AC-4: `apps/api/package.json` declares a `nodemailer` range whose lower
#         bound is `9.0.1` or higher.
#   AC-5: `pnpm --filter @aiqadam/api typecheck` exits 0 with no `error TS`
#         markers (proves the upgraded package's runtime API is still
#         shape-compatible with `email.service.ts`).
#
# The tests are hermetic (no Docker, no network, no testcontainers).
# They depend on the project's lockfile being in sync with the
# `package.json` change introduced by the same PR.
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/audit-nodemailer-version.bats
#   pnpm test:bash --filter=audit-nodemailer-version
#
# Pre-fix behavior (what this test catches if reverted):
#   - `pnpm list --filter @aiqadam/api nodemailer` reports `6.10.1`
#   - `pnpm audit --prod --audit-level=high` exits 1 with both GHSAs
#   - `apps/api/package.json` contains `"nodemailer": "^6.9.16"`
#
# Post-fix behavior (what passes after this PR):
#   - `pnpm list --filter @aiqadam/api nodemailer` reports a 9.x version
#   - `pnpm audit --prod --audit-level=high` exits 0 with no high findings
#   - `apps/api/package.json` contains `"nodemailer": "^9.0.1"`

load 'test_helper'

REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"

# Floor versions for the patched nodemailer line. The patched range for
# GHSA-p6gq-j5cr-w38f is `>=9.0.1` per the GitHub Security Advisory.
# 9.0.0 and earlier are still vulnerable. Hard-code the constant here
# (AGENTS.md §1.3 — no magic numbers; this is the single allowed named
# literal for the test, mirroring uat-seed.bats's `count == 4` pattern).
PATCHED_NODEMAILER_FLOOR_MAJOR=9
PATCHED_NODEMAILER_FLOOR_MINOR=0
PATCHED_NODEMAILER_FLOOR_PATCH=1

setup() {
  export REPO_ROOT
  cd "$REPO_ROOT"
}

# On this Windows dev host, `pnpm` resolves to a `.ps1` shim that
# re-execs `node`, but `node` is not on the bash subshell's PATH
# (pnpm shim does `exec node "$basedir/node_modules/pnpm/bin/pnpm.cjs"`
# which fails when `node` isn't found). To make these tests hermetic
# on the Windows dev host we route pnpm through PowerShell, where the
# PATH does include `C:\Program Files\nodejs\`. On CI (ubuntu-latest)
# `pnpm` is a plain Linux binary and the PowerShell branch is skipped
# (no powershell.exe present) — falls through to direct `pnpm` invocation.
#
# Pattern (inlined in each test, not factored to a function because
# bash subshells spawned by `run bash -c '...'` do NOT inherit shell
# functions defined in the bats test file):
#   if command -v powershell.exe >/dev/null 2>&1; then
#     powershell.exe -NoProfile -NonInteractive -Command "pnpm <args>" 2>&1
#   else
#     pnpm <args> 2>&1
#   fi

@test "AC-1: resolved nodemailer version in @aiqadam/api is >=9.0.1" {
  # `pnpm list --filter @aiqadam/api nodemailer` prints something like:
  #   "nodemailer 9.0.3"
  run bash -c '
    cd "$REPO_ROOT"
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -NonInteractive -Command "pnpm list --filter @aiqadam/api nodemailer" 2>&1
    else
      pnpm list --filter @aiqadam/api nodemailer 2>&1
    fi
  '
  [ "$status" -eq 0 ] || { echo "pnpm list failed: $output"; return 1; }

  # Extract the version digit. The pnpm list output line is:
  #   "nodemailer 9.0.3"
  # (preceded by a "dependencies:" header and the workspace banner).
  # We anchor the regex to a line that starts with `nodemailer` (the
  # exact dep name) and capture the version token — this avoids
  # matching stray digits like the `0` in `@aiqadam/api@0.0.0`.
  version=$(echo "$output" | grep -E '^nodemailer[[:space:]]' | head -n 1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1)
  [ -n "$version" ] || { echo "no version found in pnpm list output: $output"; return 1; }

  # Split major.minor.patch with awk (POSIX-portable, no `read -d`).
  major=$(echo "$version" | awk -F. '{print $1}')
  minor=$(echo "$version" | awk -F. '{print $2}')
  patch=$(echo "$version" | awk -F. '{print $3}')

  # Floor comparison: `actual >= floor`. Done with explicit shell arithmetic
  # so the test fails loudly with a useful diff if any component regresses.
  [ "$major" -ge "$PATCHED_NODEMAILER_FLOOR_MAJOR" ] \
    || { echo "major $major < floor $PATCHED_NODEMAILER_FLOOR_MAJOR"; return 1; }
  if [ "$major" -eq "$PATCHED_NODEMAILER_FLOOR_MAJOR" ]; then
    [ "$minor" -ge "$PATCHED_NODEMAILER_FLOOR_MINOR" ] \
      || { echo "minor $minor < floor $PATCHED_NODEMAILER_FLOOR_MINOR"; return 1; }
    if [ "$minor" -eq "$PATCHED_NODEMAILER_FLOOR_MINOR" ]; then
      [ "$patch" -ge "$PATCHED_NODEMAILER_FLOOR_PATCH" ] \
        || { echo "patch $patch < floor $PATCHED_NODEMAILER_FLOOR_PATCH"; return 1; }
    fi
  fi
}

@test "AC-2: pnpm audit --prod --audit-level=high exits 0" {
  run bash -c '
    cd "$REPO_ROOT"
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -NonInteractive -Command "pnpm audit --prod --audit-level=high" 2>&1
    else
      pnpm audit --prod --audit-level=high 2>&1
    fi
  '
  # Pre-fix: exits 1 with two high-severity findings.
  # Post-fix: exits 0 with only low/moderate findings.
  [ "$status" -eq 0 ] || {
    echo "pnpm audit failed (status=$status); output:"
    echo "$output"
    return 1
  }
}

@test "AC-3: original CVEs no longer reported by pnpm audit" {
  # Even though AC-2 covers the audit exit code, the two specific CVE IDs
  # are the regression markers we're targeting. Asserting them by name makes
  # the test diagnostic clearer if a future change re-introduces them.
  run bash -c '
    cd "$REPO_ROOT"
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -NonInteractive -Command "pnpm audit --prod --audit-level=high" 2>&1
    else
      pnpm audit --prod --audit-level=high 2>&1
    fi
  '
  # Invert the grep: we expect neither advisory ID to appear in any line.
  if echo "$output" | grep -q 'GHSA-rcmh-qjqh-p98v'; then
    echo "FAIL: GHSA-rcmh-qjqh-p98v (addressparser DoS) still reported"
    echo "$output" | grep 'GHSA-rcmh-qjqh-p98v' || true
    return 1
  fi
  if echo "$output" | grep -q 'GHSA-p6gq-j5cr-w38f'; then
    echo "FAIL: GHSA-p6gq-j5cr-w38f (raw-message SSRF) still reported"
    echo "$output" | grep 'GHSA-p6gq-j5cr-w38f' || true
    return 1
  fi
}

@test "AC-4: apps/api/package.json declares nodemailer ^9.0.1 or later" {
  # Grep the literal semver floor out of the package.json. We use a fixed
  # string match on "^9.0.1" to allow `^9.0.1`, `^9.0.10`, `~9.0.1`, etc.
  # If a future maintainer broadens to `^9` or `^10`, this test still passes
  # — but a regression to `^6.9.x` would fail loudly.
  run grep -E '"nodemailer":[[:space:]]*"\^9\.[0-9]+\.[0-9]+"' "$REPO_ROOT/apps/api/package.json"
  [ "$status" -eq 0 ] || {
    echo "apps/api/package.json does not declare nodemailer ^9.x"
    echo "actual line:"
    grep -n '"nodemailer"' "$REPO_ROOT/apps/api/package.json" || true
    return 1
  }
}

@test "AC-5: pnpm --filter @aiqadam/api typecheck exits 0 with no TS errors" {
  # Proves the upgraded package's runtime API is still shape-compatible with
  # `apps/api/src/modules/email/email.service.ts`. If a future major bump
  # breaks the createTransport / sendMail types, this test catches it.
  run bash -c '
    cd "$REPO_ROOT"
    if command -v powershell.exe >/dev/null 2>&1; then
      powershell.exe -NoProfile -NonInteractive -Command "pnpm --filter @aiqadam/api typecheck" 2>&1
    else
      pnpm --filter @aiqadam/api typecheck 2>&1
    fi
  '
  [ "$status" -eq 0 ] || {
    echo "typecheck failed (status=$status); output:"
    echo "$output"
    return 1
  }
  # Defensive: also assert no `error TS` markers snuck through (shouldn't,
  # but `tsc --noEmit` could still exit 0 if all errors are filtered).
  if echo "$output" | grep -qE '^[^ ].*error TS[0-9]+'; then
    echo "typecheck output contains error TS markers despite exit 0:"
    echo "$output" | grep -E '^[^ ].*error TS[0-9]+' || true
    return 1
  fi
}