#!/usr/bin/env bash
# Regression smoke for DMS LDAP filter parity (see ../dms/user-patches.sh).
#
# Runs four classes of postmap probes against the Authentik-LDAP-backed
# Postfix configs. The bug fixed on 2026-05-25 caused EXTERNAL domain
# probes to return non-empty (because internal users had recovery
# emails on those domains). This smoke detects any regression of that
# class plus the symmetric leak at the address level.
#
# Usage:
#   bash infrastructure/dms/smoke.sh                # runs on prod via ssh
#   IN_CONTAINER=1 bash infrastructure/dms/smoke.sh # runs inside the
#                                                   # dms container itself
#                                                   # (called by apply.sh)
#
# Exit codes:
#   0  — all probes returned the expected shape
#   2  — at least one probe failed; failures printed to stderr
#
# Tuning: extend EXTERNAL_DOMAINS / EXTERNAL_ADDRS if you discover
# another false-positive vector. INTERNAL_ADDRS pins on two stable
# accounts (viktor.drukker + no-reply); add more as the team grows.
set -u

EXTERNAL_DOMAINS=(gmail.com outlook.com example.com yahoo.com)
EXTERNAL_ADDRS=(
  drukker1991@gmail.com
  kambetbayeva@gmail.com
  someone@example.com
)
INTERNAL_DOMAIN=aiqadam.org
INTERNAL_ADDRS=(
  viktor.drukker@aiqadam.org
  no-reply@aiqadam.org
)

failures=0

# probe <expected: empty|nonempty> <label> <ldap-config> <query>
probe() {
  local expect="$1" label="$2" cfg="$3" q="$4"
  local out
  out="$(postmap -q "$q" "ldap:$cfg" 2>/dev/null || true)"
  case "$expect" in
    empty)
      if [ -z "$out" ]; then
        printf '  ok  %-58s empty\n' "$label"
      else
        printf '  FAIL %-57s expected empty, got: %s\n' "$label" "$out" >&2
        failures=$((failures + 1))
      fi
      ;;
    nonempty)
      if [ -n "$out" ]; then
        printf '  ok  %-58s -> %s\n' "$label" "$out"
      else
        printf '  FAIL %-57s expected non-empty, got empty\n' "$label" >&2
        failures=$((failures + 1))
      fi
      ;;
  esac
}

run() {
  echo "── External domains must NOT be treated as locally hosted (ldap-domains.cf)"
  for d in "${EXTERNAL_DOMAINS[@]}"; do
    probe empty "domains.cf  ?$d" /etc/postfix/ldap-domains.cf "$d"
  done

  echo
  echo "── Internal domain MUST resolve (ldap-domains.cf)"
  probe nonempty "domains.cf  ?$INTERNAL_DOMAIN" /etc/postfix/ldap-domains.cf "$INTERNAL_DOMAIN"

  echo
  echo "── External addresses must NOT resolve as aliases or mailboxes"
  for a in "${EXTERNAL_ADDRS[@]}"; do
    probe empty "aliases.cf  ?$a" /etc/postfix/ldap-aliases.cf "$a"
    probe empty "users.cf    ?$a" /etc/postfix/ldap-users.cf   "$a"
  done

  echo
  echo "── Internal addresses MUST resolve as aliases + mailboxes"
  for a in "${INTERNAL_ADDRS[@]}"; do
    probe nonempty "aliases.cf  ?$a" /etc/postfix/ldap-aliases.cf "$a"
    probe nonempty "users.cf    ?$a" /etc/postfix/ldap-users.cf   "$a"
  done

  echo
  if [ "$failures" -gt 0 ]; then
    echo "FAIL  $failures probe(s) regressed — re-run infrastructure/dms/apply.sh" >&2
    exit 2
  fi
  echo "ok    all probes returned the expected shape"
}

if [ "${IN_CONTAINER:-0}" = "1" ]; then
  run
else
  # Re-exec inside the dms container via ssh.
  SELF="$(cat "$0")"
  ssh aiqadam-prod 'sudo -n docker exec -i $(sudo -n docker ps --format "{{.Names}}" | grep -m1 "^dms-") bash -c "IN_CONTAINER=1 bash -s"' <<< "$SELF"
fi
