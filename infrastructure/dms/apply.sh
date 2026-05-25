#!/usr/bin/env bash
# Push the canonical user-patches.sh into the live DMS container,
# execute it, reload postfix, and run the regression smoke.
#
# Idempotent: re-running is safe — user-patches.sh uses `sed` in-place
# on config files DMS regenerates each container start, and the smoke
# proves the resulting routing is correct.
#
# Usage:
#   bash infrastructure/dms/apply.sh
#
# Pre-req: ssh aiqadam-prod resolves to the production host
# (see ~/.ssh/config or set the AIQADAM_HOST env var below).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PATCH="$REPO_ROOT/infrastructure/dms/user-patches.sh"
SMOKE="$REPO_ROOT/infrastructure/dms/smoke.sh"
HOST="${AIQADAM_HOST:-aiqadam-prod}"

[ -r "$PATCH" ] || { echo "missing $PATCH" >&2; exit 1; }
[ -r "$SMOKE" ] || { echo "missing $SMOKE" >&2; exit 1; }

DMS_CTR="$(ssh "$HOST" 'sudo -n docker ps --format "{{.Names}}" | grep -m1 "^dms-"')"
[ -n "$DMS_CTR" ] || { echo "no running dms-* container found on $HOST" >&2; exit 1; }
echo "→ target container: $DMS_CTR"

# 1. Push canonical patches into the DMS config volume (backed up first).
echo "→ pushing user-patches.sh + backing up existing"
ssh "$HOST" "sudo -n docker exec $DMS_CTR bash -c '
  ts=\$(date +%Y%m%d-%H%M%S)
  if [ -f /tmp/docker-mailserver/user-patches.sh ]; then
    cp /tmp/docker-mailserver/user-patches.sh /tmp/docker-mailserver/user-patches.sh.bak.\$ts
  fi
'"
ssh "$HOST" "sudo -n docker exec -i $DMS_CTR bash -c 'cat > /tmp/docker-mailserver/user-patches.sh && chmod +x /tmp/docker-mailserver/user-patches.sh'" < "$PATCH"

# 2. Execute the patches against the running container's live configs.
echo "→ executing user-patches.sh against live configs"
ssh "$HOST" "sudo -n docker exec $DMS_CTR bash /tmp/docker-mailserver/user-patches.sh"

# 3. Reload Postfix so the LDAP-config changes take effect immediately.
#    (Dovecot reads /etc/dovecot/* on the next auth, no reload needed.)
echo "→ reloading postfix"
ssh "$HOST" "sudo -n docker exec $DMS_CTR postfix reload"

# 4. Smoke. Refuses to declare success unless every probe matches.
echo "→ running smoke probes"
ssh "$HOST" "sudo -n docker exec -i $DMS_CTR env IN_CONTAINER=1 bash -s" < "$SMOKE"

echo
echo "ok  apply.sh complete — DMS LDAP routing is in the documented shape."
