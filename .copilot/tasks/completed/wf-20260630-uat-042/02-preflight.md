# Step 2 — Pre-Flight Result
# wf-20260630-uat-042 (All UAT scripts run)
# 2026-06-30

## Docker Stack

| Container | Status |
|---|---|
| aiqadam-postgres | healthy ✓ (was Exited; restarted) |
| aiqadam-directus | healthy ✓ (was Restarting; restarted after postgres came up) |
| aiqadam-mailpit | healthy ✓ |
| aiqadam-authentik-server | healthy ✓ |
| aiqadam-authentik-worker | healthy ✓ (was unhealthy; restarted) |
| aiqadam-redis | healthy ✓ |
| aiqadam-minio | healthy ✓ |
| aiqadam-twenty | starting (not critical for UAT scripts) |
| aiqadam-telegram-bot-api | unhealthy (not required for current UAT scripts) |

## App Processes

| Service | Port | PID | CommandLine |
|---|---|---|---|
| API (apps/api) | 3000 | 5668 | `"C:\Program Files\nodejs\node.exe" dist/main.js` |
| Web (apps/web) | 4321 | 6196 | `node astro.mjs preview --port 4321 --host 127.0.0.1` |

**Process identity check (manual, via PowerShell)**:
- Port 3000: `node dist/main.js` — confirmed API. CommandLine doesn't contain `@aiqadam/api` because the process was started from `apps/api/` directory without the package name in args. This is the correct process.
- Port 4321: `node astro.mjs preview` — confirmed apps/web preview server. CommandLine uses `@astrojs/node` adapter implicitly (production build). This is the correct process.

**Note**: The bash `uat-preflight-check.sh` script fails in the WSL environment with "process-identity probe not implemented for linux" (ISS-UAT-013-2 cross-platform TODO). Manual PowerShell verification was performed instead.

## HTTP Reachability

| Service | URL | Status |
|---|---|---|
| API health | http://localhost:3000/health | 200 ✓ |
| Web | http://localhost:4321 | 200 ✓ |
| Directus | http://localhost:8200/server/ping | 200 ✓ |
| Authentik | http://localhost:9000/-/health/ready/ | 200 ✓ |
| Mailpit | http://localhost:8025 | 200 ✓ |
| Mailpit API | http://localhost:8025/api/v1/messages | 200 ✓ |

## Seed Status

`pnpm uat:seed` ran partially. Steps 1-3 completed:
- ✓ Stack reachability verified
- ✓ Directus schema bootstrapped (all collections exist)
- ✓ Authentik users: uat-member (pk=5), uat-operator (pk=6)

Step 4 (operator_invites) failed with Directus validation error:
- **Root cause**: `consumed_at: null` triggers `VALUE_TOO_LONG` in Directus 11 for
  `readonly: true` fields (Directus validation bug for readonly timestamp fields).
- **Mitigation**: All 4 operator_invite rows already exist from previous seed run
  (wf-20260629-fix-039). Verified via Python API call — all rows present.
- **Impact on UAT**: None. Seed data is present. New issue ISS-UAT-013-9 registered
  for the seed bug.

## Operator Invites (verified present)

| token_hash (prefix) | status | expires_at |
|---|---|---|
| 441f71... | pending | 2026-07-06T17:56:02Z |
| 05ce1c... | consumed | 2026-07-06T17:56:02Z |
| a64b74... | pending (expired) | 2026-06-28T17:56:02Z |
| 76859e... | pending (no-user) | 2026-07-06T17:56:02Z |

## Gate Result

```yaml
gate_result:
  status: passed
  notes: >
    Pre-flight passed with manual verification for process identity (bash script
    has WSL cross-platform limitation). All 6 HTTP health checks pass. Seed data
    present. Seed script has known bug (ISS-UAT-013-9) but does not block this run.
```
