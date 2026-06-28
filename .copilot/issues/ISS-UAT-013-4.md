# ISS-UAT-013-4 — `scripts/uat-seed.sh` does not provision `operator_invites` rows

| Field | Value |
|---|---|
| ID | ISS-UAT-013-4 |
| Severity | bug |
| Module | uat / seed |
| Status | open |
| Reported | 2026-06-28 |
| Reporter | BusinessAnalyst (wf-20260628-uat-030 / 01-uat-script-validation.md) — first flagged in Step 1 |
| Workflow | wf-20260628-uat-030 |

## Symptom

`scripts/uat-seed.sh` provisions only the two Authentik users (`uat-member@aiqadam.test`, `uat-operator@aiqadam.test`) and delegates Directus schema bootstrap to `infrastructure/directus/bootstrap.sh`. It does **not** insert any rows into the `operator_invites` collection.

BP-UAT-013 requires three `operator_invites` rows (one valid + unused, one consumed, one expired) to exercise Steps 005 / 006 and Neg 002 / Neg 003. Without them, those steps cannot complete against the real `/v1/onboard/preview` API contract.

For the 2026-06-28 run, the Orchestrator mitigated inline by inserting the three rows via `POST /items/operator_invites` on Directus using the static admin token from `apps/api/.env` (`DIRECTUS_TOKEN=uat-directus-static-admin-token-32c`). This is a **workaround**, not a fix — re-running `pnpm uat:seed` against a clean Directus would leave the table empty again.

## Repro

```bash
pnpm uat:seed                          # succeeds
curl -sS -H "Authorization: Bearer $DIRECTUS_TOKEN" \
  http://localhost:8200/items/operator_invites | jq '.data | length'
# → 0  (expected: ≥3)
```

## Root cause

`scripts/uat-seed.sh` (lines 1–200+ examined; remainder delegates to bootstrap.sh for schema and Authentik for users) has no `ensure_operator_invite()` function and no INSERT block against `operator_invites`. The seed script predates BP-UAT-013 — it was written for the earlier scripts (BP-UAT-001 through BP-UAT-012) which do not need onboard tokens.

## Proposed resolution

Extend `scripts/uat-seed.sh` with an `ensure_operator_invite()` helper that idempotently inserts three rows into `operator_invites` after the Directus schema bootstrap:

```bash
ensure_operator_invite() {
  local email="$1" status="$2" expires_at="$3" consumed_at="$4" token_plain="$5"
  local token_hash
  token_hash=$(printf '%s' "$token_plain" | sha256sum | awk '{print $1}')
  # Check if row exists by token_prefix
  # If not, POST to /items/operator_invites
}
```

Then call it with:

| `email` | `status` | `expires_at` | `consumed_at` | `token_plain` |
|---|---|---|---|---|
| `uat-operator+valid@aiqadam.test` | `pending` | now + 7d | NULL | `uat-onboard-token` |
| `uat-operator+used@aiqadam.test` | `consumed` | now + 7d | now - 2h | `uat-onboard-used-token` |
| `uat-operator+expired@aiqadam.test` | `pending` | now - 1d | NULL | `uat-onboard-expired-token` |

Then export the three plaintext tokens as env vars in `apps/e2e/.env.uat` (see ISS-UAT-013-6 finding #4 — runner currently relies on literal fallbacks):

```
UAT_ONBOARD_TOKEN=uat-onboard-token
UAT_ONBOARD_USED_TOKEN=uat-onboard-used-token
UAT_ONBOARD_EXPIRED_TOKEN=uat-onboard-expired-token
```

The `uat-env-setup.sh` script already writes `.env.uat` — extend it to also receive the three tokens from the seed step.

## Acceptance criteria

1. `pnpm uat:seed` against a clean Directus leaves the `operator_invites` collection with exactly 3 rows (one valid, one consumed, one expired).
2. `pnpm uat:seed` against an already-seeded Directus is idempotent (no duplicate rows).
3. `apps/e2e/.env.uat` contains the three `UAT_ONBOARD_*` env vars pointing to the plaintext tokens above.
4. A new bats regression test under `scripts/tests/uat-seed.bats` verifies both invariants.

## References

- `scripts/uat-seed.sh`
- `infrastructure/directus/bootstrap.sh` — schema owner
- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — inline mitigation
- `.copilot/tasks/active/wf-20260628-uat-030/01-uat-script-validation.md` — first flag