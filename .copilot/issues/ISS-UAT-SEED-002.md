# ISS-UAT-SEED-002 — `scripts/uat-seed.sh`'s `api_base` default points to port 3001; api actually listens on 3000

| Field | Value |
|---|---|
| ID | ISS-UAT-SEED-002 |
| Severity | bug |
| Module | uat/seed |
| Status | **resolved** |
| Reported | 2026-07-03 |
| Resolved | 2026-07-04 |
| Workflow | wf-20260704-fix-089 |
| Reporter | Orchestrator (wf-20260703-uat-064, Step 3 — debug seed run) |
| Related | wf-20260703-fix-064 introduced `api_ensure_directus_user_link` |

## Symptom

`scripts/uat-seed.sh` line 243:

```bash
local api_base="${API_BASE_URL:-http://localhost:3001}"
```

The default `http://localhost:3001` is wrong — the actual NestJS api
listens on port **3000** (confirmed via
`apps/api/.env` `PORT=3000` + `netstat -ano | grep 3000` + HTTP
200 OK from `GET /v1/internal/users/ensure-linked`).

`api_ensure_directus_user_link` (lines 243-262) does:

```bash
curl -s -H "x-internal-auth: ${token}" -H "Content-Type: application/json" \
  -X POST -w '\n%{http_code}' \
  "${api_base}/v1/internal/users/ensure-linked" \
  -d "${body}"
```

which returns HTTP 000 (connection refused) because nothing listens
on 3001. The seed then fails on the first `ensure_test_user` call
that invokes `api_ensure_directus_user_link` (any identity fixture
that needs bridging).

On a workstation the operator must export
`API_BASE_URL=http://localhost:3000` to make the seed work, which
isn't documented anywhere except via this issue.

## Why 3000 (not 3001)

Several artifacts point to port 3000:
- `apps/api/.env` `PORT=3000`
- `apps/api/package.json` `start:prod` runs `node apps/api/dist/main`
  (which reads `PORT` from env)
- `infrastructure/docker-compose.yml` `apps/api` exposes 3000
- `scripts/uat-preflight-check.sh` (when functional) probes
  `localhost:3000/health`

There's no piece of production configuration that says 3001.
Likely the default in `uat-seed.sh` is a residual typo from an
earlier iteration where the api was launched on 3001 (e.g., a
Docker port-forward from `ai-dala-next`'s dev container that's no
longer relevant).

## Recommended fix

One-line change in `scripts/uat-seed.sh`:

```diff
- local api_base="${API_BASE_URL:-http://localhost:3001}"
+ local api_base="${API_BASE_URL:-http://localhost:3000}"
```

Or, even cleaner, derive from `apps/api/.env`'s `PORT`:

```bash
local api_port
api_port=$(env_get "$API_DIR/.env" "PORT")
api_port="${api_port:-3000}"
local api_base="${API_BASE_URL:-http://localhost:${api_port}}"
```

## Required for close

1. `grep -n "localhost:3001" scripts/uat-seed.sh` returns no matches.
2. `pnpm uat:seed --reset BP-UAT-001` succeeds without exporting
   `API_BASE_URL` first.
3. Add a bats test in `scripts/tests/uat-seed.bats` that confirms
   the default `api_base` resolves to whatever port the api's
   `apps/api/.env` `PORT` declares (idempotent across renames).

## Recommended workflow

Fold into a small `wf-20260703-fix-066-seed-port` workflow (single
file, single change, ~10 lines + bats case).

## Notes

- This is a latent bug in fix-064's `api_ensure_directus_user_link`
  helper, exposed only when invoking the seed against the live
  stack. The UAT/test environments already define
  `API_BASE_URL` explicitly in their `.env`, so the bug never
  triggered.
- Discovered while verifying ISS-UAT-001-1 in
  `wf-20260703-uat-064` (see
  `.copilot/tasks/active/wf-20260703-uat-064/03-uat-verification.md`).

## Resolution

- **Workflow:** wf-20260704-fix-089
- **PR:** https://github.com/tvolodi/aiqadam/pull/<pending>
- **Root cause:** `scripts/uat-seed.sh`'s `api_ensure_directus_user_link` defaulted
  to `${API_BASE_URL:-http://host.docker.internal:3001}` (and an earlier iteration
  to `${API_BASE_URL:-http://localhost:3001}`) — both wrong. The API actually
  listens on port 3000 per `apps/api/.env PORT=3000` and every other artifact;
  the seed silently failed unless an operator exported `API_BASE_URL` first.
- **Fix:** Replaced the literal default with a derivation from `apps/api/.env`'s
  `PORT` via the existing `env_get` helper, with `:3000` as a named fallback for
  fresh-checkout UX. Also replaced the misleading `host.docker.internal` /
  `WSL2 VM network namespace` comment with an accurate 6-line block.
- **Regression test:** `scripts/tests/uat-seed.bats` cases
  `ISS-UAT-SEED-002 AC-1..AC-5` (5 cases: 2 structural `grep` regressions +
  3 stubbed-helper cases that derive `api_base` from a stub `apps/api/.env`).
- **Merged:** <pending> — back-filled post-merge.
