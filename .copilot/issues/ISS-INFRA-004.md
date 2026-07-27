# ISS-INFRA-004 — No backup infrastructure exists on either host

**Severity:** blocker
**Module:** infrastructure / backups
**Status:** RESOLVED 2026-07-27 by `wf-20260727-feat-136` (cross-host replication live on both hosts)
**Business-Process:** —

## Symptom

Verified by direct inspection of both live hosts on 2026-07-27:

| Check | prod `95.46.211.224` | QA `95.46.211.230` |
|---|---|---|
| `restic` binary | **NOT installed** | **NOT installed** |
| `/etc/restic/` (repo creds) | **absent** | **absent** |
| `/usr/local/sbin/aiqadam-*.sh` | **absent** | **absent** |
| `aiqadam-*` systemd timers | **0 timers** | **0 timers** |
| `/var/backups/aiqadam` | **absent** | **absent** |

## This supersedes the ISS-INFRA-003 diagnosis

ISS-INFRA-003 concluded the backups "silently stopped" when Coolify was
removed. That was **wrong** — inferred from reading the scripts, not from
observing the hosts. The truth is worse: the backup system described by
[ADR-0017](../../docs/adr/0017-backup-architecture.md) and
`restic-backups.md` **was never deployed to the pro-data.tech hosts at
all.** It existed only on the decommissioned Coolify host.

Prod has been running with **zero backups of any kind** since it was
provisioned. `aiqadam-prod-postgres-1` has been up 13 days.

## Two further script defects, found only by running against live hosts

Both would have caused the "fixed" scripts from ISS-INFRA-003 to fail:

1. **Container discovery missed QA entirely.** The pattern
   `name=^/aiqadam-.*-postgres-1$` matches prod
   (`aiqadam-prod-postgres-1`) but NOT QA, whose database container is
   `ai-qadam-test-db-1` on image `pgvector/pgvector:pg16`. Now matches on
   *image* (`postgres|pgvector`), not name.
2. **The superuser is not `postgres`.** Prod's is `aiqadam_prod`, QA's is
   `aiqadam`; `pg_dumpall -U postgres` fails with
   `role "postgres" does not exist`. Now read from the container's own
   `POSTGRES_USER` env, with `postgres` as fallback.

Both fixes verified live: discovery resolves the right container and
superuser on both hosts and produces valid dumps (prod 4.2 KB, QA 1.1 MB).

## Immediate mitigation applied

Manual `pg_dumpall` taken on both hosts, verified non-empty and
containing real SQL:

- prod: `/var/backups/aiqadam/db-dumps/manual-20260727T031431Z/all.sql.gz` (4.2 KB, 29 statements)
- QA: `/var/backups/aiqadam/db-dumps/manual-20260727T031501Z/all.sql.gz` (1.1 MB, 1229 statements)

**These are local-disk only and are not a backup system.** They are a
stopgap so a single bad migration is survivable today.

## Still open

Standing up the actual backup system requires decisions the code cannot
make:

1. **Where do snapshots go?** ADR-0017 specifies Cloudflare R2. No R2
   credentials exist on either host, and it is unknown whether the
   bucket/account still exists. **Note:** the sibling `ai-dala-infra`
   project states a hard rule of *no off-site storage of any kind* — if
   that applies here, ADR-0017's premise needs revisiting and a
   local-disk retention policy chosen instead.
2. **Repo passphrase** — must be generated and stored; losing it makes
   backups unrecoverable (ADR-0017's own warning).
3. **Install + enable** restic, the two scripts, and the systemd timers
   on both hosts.

Data volume is small (prod ~8 MB, QA ~1.1 MB), so cost is not a factor
in the decision.


---

## Resolution — cross-host replication (2026-07-27, `wf-20260727-feat-136`)

User's design: **prod's backups live on QA; QA's live on prod.** No external
provider, so the `ai-dala-infra` no-off-site rule holds while still getting the
data off the machine that produced it.

**Chosen over restic-to-R2:** data is ~10 MB total, both hosts are ours, and a
restic passphrase stored on the hosts protects nothing while adding a way to
lose the backups permanently. Plain `gzip` + `rsync`.

### Security model

Each host holds a dedicated ed25519 key (`/root/.ssh/backup-push`) authorized on
the peer with `command="/usr/local/sbin/aiqadam-backup-receive.sh",restrict`.
The forced command permits **only** an rsync push into
`/var/backups/aiqadam/peer/`, rejecting `--sender` (pull), `..`, and absolute
destinations, and `cd`s into the peer dir so relative paths cannot escape.

Verified live against both hosts:

| Attempt | Result |
|---|---|
| shell (`id -un`) | **DENIED** |
| `cat /etc/shadow` | **DENIED** |
| rsync pull (exfiltrate peer's dumps) | **DENIED** |
| rsync push | **OK** |

So a compromise of one host lets the attacker write backup files onto the other
— it does not give them a shell or let them read the peer's data.

### Verified working

- prod → QA and QA → prod pushes both succeed.
- Restore check: prod's replicated dump on QA passes `gzip -t` and contains 30
  SQL statements with a valid `PostgreSQL database cluster dump` header.
- `systemd` timers enabled on both hosts, nightly 03:00 UTC with 5-min jitter
  and `Persistent=true`; both services run green under `ProtectSystem=strict`.

### Two guard bugs found by running live

1. **rsync flag pinning broke negotiation.** The forced command originally
   re-exec'd a hardcoded `--server` flag string; rsync negotiates compression in
   those flags, so it failed with *"Failed to negotiate a compress choice"*.
   Now re-execs the client's own invocation, with safety from the
   `--sender`/`..`/absolute rejections plus `restrict`.
2. **The SQL guard rejected a valid dump.** `zcat | head -200 | grep -q` exits
   early, SIGPIPEs `zcat`, and under `set -o pipefail` fails the whole pipeline
   — it rejected QA's good 1.1 MB dump. Replaced with a full-stream `awk` scan.

### Residual limitation

Both hosts are KVM guests at the same provider on adjacent IPs. This protects
against disk failure, bad migrations, accidental `DROP`, and loss of one VM. It
does **not** protect against provider-level loss or account suspension. That is
a real gap versus ADR-0017's original off-site intent, accepted deliberately
because the no-off-site rule forbids the alternative.

### ADR-0017 follow-up

ADR-0017 still specifies Cloudflare R2 and is `Accepted`. It now contradicts the
deployed reality and should be superseded by an ADR recording the cross-host
model. Not done here to keep this change reviewable.
