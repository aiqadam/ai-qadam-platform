#!/usr/bin/env bash
# aiqadam-backup-receive — SSH forced command for the peer-host backup key.
#
# Installed at /usr/local/sbin/aiqadam-backup-receive.sh and pinned via
# command="...",restrict in /root/.ssh/authorized_keys. The peer host can
# ONLY invoke rsync in server mode, writing under /var/backups/aiqadam/peer/.
# It cannot get a shell, read any other path, pull data back, or forward
# ports (`restrict` disables forwarding, agent, pty and X11).
#
# This bounds the blast radius of a host compromise: an attacker on prod
# can write backup files onto QA and nothing else — in particular they
# cannot read QA's database dumps.
#
# Verified 2026-07-27 against both live hosts: shell → DENIED,
# `cat /etc/shadow` → DENIED, rsync pull → DENIED, rsync push → OK.
set -euo pipefail

PEER_DIR="/var/backups/aiqadam/peer"
mkdir -p "$PEER_DIR"
chmod 700 "$PEER_DIR"

cmd="${SSH_ORIGINAL_COMMAND:-}"

# Only an rsync server invocation is permitted.
case "$cmd" in
  "rsync --server "*)
    # Reject anything trying to escape the receive dir or read back.
    case "$cmd" in
      *" --sender "*) echo "DENIED: read/pull not permitted" >&2; exit 1 ;;
      *".."*)         echo "DENIED: path traversal" >&2; exit 1 ;;
      *" /"*)         echo "DENIED: absolute destination not permitted" >&2; exit 1 ;;
    esac

    # Confine the write. The client sends a RELATIVE destination (e.g.
    # "prod/"), which rsync resolves against the process CWD — without
    # this chdir it would land in /root. Combined with the ".." and
    # absolute-path rejections above, the destination cannot escape
    # $PEER_DIR.
    cd "$PEER_DIR"

    # Re-exec the client's own --server invocation rather than a
    # hardcoded flag string: rsync negotiates compression and checksum
    # options in these flags, and a fixed list breaks with
    # "Failed to negotiate a compress choice" whenever the client's
    # options differ. Safety comes from the --sender/.. rejection above
    # plus `restrict` in authorized_keys — not from pinning flags.
    #
    # shellcheck disable=SC2086  # word-splitting of $cmd is intended
    exec $cmd
    ;;
  *)
    echo "DENIED: only rsync push to $PEER_DIR is permitted" >&2
    exit 1
    ;;
esac
