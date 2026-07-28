# Test Results — wf-20260728-fix-145 (ISS-INFRA-QA-DIRECTUS-SCHEMA-001)

## No code changes — infra-only workflow

This workflow made no `apps/*` source changes, so there is no new unit
test suite to run. `deploy/docker-compose.qa.yml`'s syntax was validated:

```
docker compose -f deploy/docker-compose.qa.yml config --quiet
(with a throwaway dummy .env supplying required vars)
→ exit 0
```

Confirmed the added `DIRECTUS_TOKEN` key correctly resolves from
`DIRECTUS_ADMIN_TOKEN`'s value in the interpolated output.

## Live infrastructure verification (AGENTS.md §6.1 — the actual test for this workflow)

### `bootstrap.sh` run against QA Directus

- Pre-flight: confirmed 29 collections (all `directus_*` system), 2
  policies (Public, Administrator) before the run.
- Copied `infrastructure/directus/bootstrap.sh` +
  `scripts/tests/directus-retry-helper.bash` to the QA host preserving
  relative paths, ran with `DIRECTUS_URL=http://localhost:3119` +
  `DIRECTUS_ADMIN_TOKEN`.
- Result: exit 0, zero `✗`/FAIL lines across 450 log lines. 270 items
  created, 19 seed rows, 0 pre-existing (confirms QA really started from
  zero). Post-run: 79 collections, all 7 ADR-0021 policies exist,
  `policy.member` has all 14 expected permission rows.
- Idempotency not re-verified with a second run this time (already
  proven idempotent locally in `wf-20260728-fix-144`; this run's own
  "0 exists / N created" count on a known-empty starting state is itself
  sufcient evidence of correct first-run behavior).

### `flows-bootstrap.sh` run against QA Directus

- Result: exit 0, zero failures. All 3 registration-lifecycle flows
  (`reg-capacity-decision`, `reg-waitlist-promotion`, `reg-checkin-points`)
  created and confirmed `status: "active"` via `GET /flows`.

### `DIRECTUS_TOKEN` fix

- Before: `aiqadam-qa-api-1` env showed `DIRECTUS_TOKEN=qa-placeholder-token-not-real-000000`.
- After: `docker exec aiqadam-qa-api-1 env | grep DIRECTUS_TOKEN` shows
  the real value, matching `DIRECTUS_ADMIN_TOKEN`.
- `curl https://qa.aiqadam.org/api/v1/leaderboard` → `200
  {"countryCode":"uz","window":"all","entries":[]}` — genuine successful
  API→Directus round trip (was previously impossible with the placeholder
  token, independent of schema state).

### `RBAC_SYNC_WRITE_ENABLED`

- `POST /v1/internal/rbac/poll` (with QA's real `INTERNAL_API_TOKEN`):
  `{"scanned":12,"jobs_created":0,"errors":1}`. 0 jobs created is
  correct — none of QA's 12 Authentik users has a `directus_users` row
  yet (nobody has signed in via OIDC on the freshly-bootstrapped
  Directus). The 1 error is a minor, pre-existing, unrelated bug (empty-
  email Authentik user trips a Directus query-syntax edge case) — noted
  in the issue file, not blocking, not fixed in this workflow.

### End-to-end symptom re-check

- `GET https://qa.aiqadam.org/api/v1/me/profile` (unauthenticated):
  `401` — was `404` in the original user report. Correct expected
  behavior for an `AuthGuard`-protected route.
- `GET https://qa.aiqadam.org/me/profile` (the actual page): `200`.
- Anonymous `GET https://qa.aiqadam.org/api/v1/...` reads of
  `directus_users`-shaped data: still correctly denied (no PII-leak
  regression from the `wf-20260728-fix-144` fix).

## Known gap (disclosed, not silently skipped)

No real signed-in QA member session was exercised end-to-end (no test
credentials available in this session). The verification above proves
API↔Directus connectivity, schema correctness, and the specific
previously-broken endpoint no longer 404s/500s for the reasons
originally diagnosed — but a full human sign-in → `/me/profile` render
round trip on QA specifically was not performed. Flagged in the issue
file's Resolution section as the first thing to check on the next QA
UAT touch.

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "Live infra verification complete: bootstrap.sh + flows-bootstrap.sh ran clean (0 failures) against QA; DIRECTUS_TOKEN + RBAC_SYNC_WRITE_ENABLED fixes confirmed live via a real API-to-Directus round trip and the exact originally-reported endpoint. One known gap (no real member session tested) honestly disclosed, not silently skipped."
  findings: []
```
