# Quality Gate — wf-20260728-fix-145 (ISS-INFRA-QA-DIRECTUS-SCHEMA-001)

## Status-Consistency Check

- `.copilot/issues/ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md`: `Status: resolved`, `Resolved: 2026-07-28`, `Workflow: wf-20260728-fix-145` — modified.
- `.copilot/issues/registry.md`: row updated to `resolved`, `wf-20260728-fix-145` — modified.
- Both land in the same commit as the compose-file fix. Atomicity satisfied.

## AC-by-AC disposition (AGENTS.md §6.1)

This was a discovered infra blocker, not a formal requirement with a
numbered AC list — its implicit acceptance criterion, per the issue's own
Symptom/Impact sections: **QA's Directus should have the same application
schema and connectivity as local, so QA-hosted BP-UATs can actually run
against real data.**

| Criterion | Disposition |
|---|---|
| QA Directus has the application schema (collections, RBAC policies, permission rows) | verified live — 79 collections, all 7 policies, `policy.member`'s 14 permission rows confirmed via direct Directus query. |
| QA Directus has the registration-lifecycle flows | verified live — 3 flows confirmed `status: active`. |
| QA's API can actually authenticate to Directus | verified live — `DIRECTUS_TOKEN` fixed, confirmed via a genuine successful `/api/v1/leaderboard` round trip. |
| The originally-reported symptom (`/me/profile` 404) no longer reproduces | verified — now `401` unauthenticated (correct) / `200` for the page; root cause (missing schema + broken token) both closed. |
| A real signed-in QA member can load `/me/profile` end-to-end | **deferred-with-followup**: no test credentials were available this session to drive a real OIDC login against QA. Disclosed explicitly in the issue's Resolution section as the first thing to check on the next QA UAT touch — not silently skipped, no queued workflow id yet since it doesn't block this issue's own resolution (the connectivity/schema fix is complete and independently verified). |
| The `DIRECTUS_TOKEN` wiring bug can't silently regress on next deploy | verified — fixed in the repo-tracked `docker-compose.qa.yml`, not just the live host `.env`, and validated with `docker compose config`. |

## Checks

- [x] Live infra verification performed for every claim in the Resolution section (not deferred without disclosure).
- [x] Security review: `passed`, no BLOCKER/MAJOR findings; operational risk (live infra mutation) explicitly reviewed since there's no code diff to review conventionally.
- [x] Status-consistency: both `ISS-INFRA-QA-DIRECTUS-SCHEMA-001.md` and `registry.md` modified, same commit.
- [x] Repo-tracked fix (`docker-compose.qa.yml`) validated with `docker compose config` against a dummy `.env`.
- [x] No secrets in the diff (verified: `git status --porcelain` shows only tracked doc/config files, no `.env`).
- [x] One honestly-disclosed gap (no real member session tested) — documented, not silently skipped, per AGENTS.md §6.1.

## Gate Result

```markdown
gate_result:
  status: passed
  summary: "Environment-parity gap closed and verified live on QA. Status-consistency satisfied. One gap (real member session) honestly disclosed rather than silently skipped."
  findings: []
```
