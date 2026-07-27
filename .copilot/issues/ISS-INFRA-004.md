# ISS-INFRA-004 — No backup infrastructure exists on either host

**Severity:** blocker
**Module:** infrastructure / backups
**Status:** PARTIALLY RESOLVED 2026-07-27 by `wf-20260727-fix-135`
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
