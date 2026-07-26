# 01 — Backup fix + Coolify operational-docs sweep

**Workflow:** `wf-20260727-fix-134`
**Issue:** [ISS-INFRA-003](../../../issues/ISS-INFRA-003.md) (blocker)
**Status:** passed
**Stacked on:** `wf-20260727-docs-133` (PR #69)

---

## Scope change, disclosed

This started as step 3 of the documentation audit — sweeping retired-Coolify
prose out of ~63 files. While reading the disaster-recovery runbook to rewrite
it, the underlying scripts turned out to be **live and broken**, not merely
described wrongly.

The user was asked before proceeding and chose to fix the scripts first. The
prose sweep is therefore **partial by agreement**: operational docs (the ones an
operator or agent would act on) are done; non-operational prose is not.

## The defect

`infrastructure/restic/aiqadam-db-dump.sh` (hourly) and
`aiqadam-backup.sh` (daily) both contained:

```bash
docker exec coolify-db pg_dump -U coolify -d coolify … | gzip > …
```

Both run under `set -euo pipefail`. Coolify was removed 2026-07-23 (PR #45,
ADR-0007) and its host decommissioned (ADR-0040, `ef50eba`), so `coolify-db`
does not exist — the failed `docker exec` **aborted each script before its
`restic backup` call**. No snapshots, no error visible to an operator.

Two further faults in the same path:

- Postgres discovery filtered on `ancestor=pgvector/pgvector:pg16` with a
  hard-coded Coolify container-ID fallback. Current hosts run `postgres:16` as
  `aiqadam-<env>-postgres-1` — discovery would have failed regardless.
- `aiqadam-restore-drill.sh` asserted `data/coolify/source` in `REQUIRED_PATHS`,
  so the monthly drill hard-failed and blamed the backup for a stale assertion.
- `aiqadam-backup.sh`'s `PATHS` led with `/data/coolify` (absent → skipped with
  a warning), so the daily snapshot captured **no application state at all**.

**Impact:** likely zero DB snapshots between 2026-07-23 and this fix landing on
the hosts. The stated 4-hour RTO was not achievable in that window.

## Changes

### Code — `infrastructure/restic/`

| File | Change |
|---|---|
| `aiqadam-db-dump.sh` | Runtime PG discovery (`PG_CONTAINER` → `aiqadam-<env>-postgres-1` → `postgres:16`, hard error if none); removed the Coolify dump; added an empty-dump guard so a broken `pg_dumpall` fails instead of shipping a useless snapshot |
| `aiqadam-backup.sh` | Same discovery (kept byte-identical); removed the Coolify dump; `PATHS` → `$APP_DIR` (`/opt/apps/aiqadam-{prod,qa}`) + `/etc/letsencrypt`; Coolify log excludes → `node_modules`/`.git`/`dist` |
| `aiqadam-restore-drill.sh` | `REQUIRED_PATHS`: `data/coolify/source` → `var/backups/aiqadam` (actually proves the DB dump reached the snapshot) |

`--host=aiqadam-web` is **deliberately retained** as an opaque restic series
label. Changing it would split the repo's snapshot history and break
`restic forget` retention grouping for every pre-existing snapshot. Documented
inline so the next reader doesn't "fix" it.

### Docs — operational surface only

| File | Treatment |
|---|---|
| `runbooks/_archive/coolify-bootstrap.md` | **Archived** + ⛔ banner |
| `runbooks/_archive/coolify-app-stacks.md` | **Archived** + ⛔ banner |
| `runbooks/snapshot-restore.md` | Rewritten: real hosts, real PG discovery, cluster-dump extraction, host-rebuild slow path replacing "full Coolify rebuild" |
| `runbooks/restic-backups.md` | De-Coolified fully (0 refs left); header explaining the defect + how to verify on the hosts |
| `runbooks/README.md` | No longer cites the dead Coolify runbook as the model to imitate; `_archive/` marked not-a-template; pro-data-tech runbook no longer called "ADR-less … alongside Coolify" |
| `runbooks/observability.md` | Scoped header: deploy steps dead, compose files + query patterns still valid; deployment status explicitly unverified |
| `security/runbooks/secret-rotation-pending.md` | Header: **the exposure is still open**, only the rotation mechanics are stale; old→new mapping table added |
| `architecture/architecture.md` | "Hardening posture (live state)" → "as applied … to the retired Coolify host", with what still applies vs. what doesn't |

Nine inbound links repointed to `_archive/`. Links **inside** the archived files
were rewritten for their new depth (they had silently broken on the move).

## Verification

- `shellcheck --severity=warning` → **clean** on all three scripts (same
  invocation `restic-drill-lint.yml` uses).
- `bash -n` → clean on all three.
- No **executable** Coolify reference remains in `infrastructure/restic/` —
  only explanatory comments (verified by grepping non-comment lines).
- Repo-wide markdown link check: **16 broken, identical to the pre-change
  baseline.** The archive move introduced zero new breakage.
- `pnpm arch:check` → passed.
- `check-workflow-state.sh --base origin/main` → exit 0.

## Not verified — needs a host

The scripts run on QA/prod, which this workflow cannot reach. **The fix is not
proven until it runs there.** Deployment is a host-side action documented in
[ISS-INFRA-003](../../../issues/ISS-INFRA-003.md); follow-up
`wf-20260727-fix-135-verify-backups-live` should install both scripts, run
`aiqadam-db-dump.sh` manually, confirm a new snapshot via
`restic snapshots --tag aiqadam-db-hourly --last`, and quantify the gap.

Treat the backup as **unproven** until that runs.

## Deliberately left

~40 non-operational files (requirements, roadmap, plans, completed task
artifacts) still mention Coolify. None is a procedure anyone would follow, and
several are historical records that *should* keep the old name. Tracked in
`workspace-state.md`.
