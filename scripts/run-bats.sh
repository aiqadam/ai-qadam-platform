#!/usr/bin/env bash
# scripts/run-bats.sh — wrapper to run bats regardless of install method.
#
# Tries, in order:
#   1. BATS env var (if set)
#   2. System bats on PATH
#   3. Local pnpm install at node_modules/bats/bin/bats
#
# This avoids the broken pnpm shim on Windows (pnpm's bin/bats
# points at install.sh via .cmd shim which doesn't run as expected).
#
# Usage:
#   scripts/run-bats.sh scripts/tests/*.bats
#   BATS=/path/to/bats scripts/run-bats.sh scripts/tests/*.bats
#   pnpm test:bash

set -euo pipefail

if [[ -n "${BATS:-}" ]] && [[ -x "$BATS" ]]; then
  exec "$BATS" "$@"
fi

if command -v bats >/dev/null 2>&1; then
  exec bats "$@"
fi

LOCAL_BATS="$(cd "$(dirname "$0")/.." && pwd)/node_modules/bats/bin/bats"
if [[ -x "$LOCAL_BATS" ]]; then
  exec "$LOCAL_BATS" "$@"
fi

echo "ERROR: bats not found." >&2
echo "  Install options:" >&2
echo "    - System:        brew install bats-core   # macOS" >&2
echo "                     apt install bats         # Debian/Ubuntu" >&2
echo "    - npm (local):   pnpm install              # uses this repo's devDep" >&2
echo "    - From source:   git clone https://github.com/bats-core/bats-core.git" >&2
exit 127
