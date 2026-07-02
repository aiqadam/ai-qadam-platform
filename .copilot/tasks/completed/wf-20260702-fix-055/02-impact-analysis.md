# Step 2 — Impact Analysis (wf-20260702-fix-055, ISS-UAT-SEED-001)

## Files modified

| File | Reason | Lines changed (est) |
|---|---|---|
| `scripts/uat-seed.sh` | (a) `env_get` add CRLF strip; (b) `ensure_operator_invite` omits `consumed_at` when empty; (c) new `user_pk_by_email` helper; (d) call helper + add `authentik_user_id` to payload; (e) update mock-mode line to print `authentik_user_id` for testability | ~30 |
| `scripts/uat-env-setup.sh` | `env_get` add CRLF strip (consistency — same function is duplicated) | ~1 |
| `scripts/tests/uat-seed-iss-001.bats` | NEW — 4 ACs of regression tests | ~120 |

Total: **3 files, ~150 lines** (under the 400-line / 5-file PR cap).

## Files NOT modified

| File | Reason |
|---|---|
| `apps/api/.env.example` | Already documents `AUTHENTIK_ADMIN_TOKEN` (lines 91-92). No change needed. |
| `infrastructure/directus/bootstrap.sh` | Schema already has `consumed_at readonly: true` (line 2863) and `authentik_user_id` (line 2848). No schema change. |
| `apps/api/src/modules/admin-invites/admin-invites.service.ts` | API code already does the right thing — it checks `row.authentik_user_id == null` (line 357) and throws `invite_missing_authentik_user` if missing. The bug is the seed, not the API. |
| `scripts/uat-env-setup.sh` infrastructure step changes | No new infrastructure — Authentik + Directus containers already exist; seed just needs better data. |
| `pnpm-lock.yaml`, `apps/*/package.json` | No new dependencies. |
| `docs/04-development/...` | Doc updates handled in Step 10 if needed; likely no new docs (operational runbook for UAT seed). |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Behavioural change in `ensure_operator_invite`**: omitting `consumed_at` changes the JSON shape sent to Directus. Existing rows in a long-lived Directus instance will not be affected (only new rows); idempotency check (token_hash) prevents duplicates. | Low | Bats test exercises the mock-mode payload construction; the actual HTTP path is unchanged. |
| **CRLF strip affects all `env_get` callers**: could mask a real `\r` in a value somewhere else. | Very low | `\r` is never intentional in a Unix env value. The fix matches existing `tr -d '"'` pattern. |
| **`user_pk_by_email` adds a new HTTP call per row (4 calls/seed)**: increases seed runtime by ~200ms. | Negligible | Seed runs once per environment setup, not in a hot path. |
| **New `.bats` file collides with existing `uat-seed.bats` AC numbering**: tests use grep, so no real collision. | Very low | The new file is named `uat-seed-iss-001.bats`; existing `uat-seed.bats` keeps its 4 ACs. |

## Blast radius

- Only the local dev / CI seed step is affected.
- Production UAT is rerun from scratch; this change benefits it but is not in its critical path.
- No live infrastructure (Postgres, Directus, Authentik, API) is touched at runtime.
- No API contract change.
- No user-visible behaviour change.

## Plan accepted

No pushback from any agent. The fix is small, contained, and ships in a single PR.
