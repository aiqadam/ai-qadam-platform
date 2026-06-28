# ISS-UAT-013-5 — Directus returns 503 "Under pressure" during seed bootstrap; 3 retries required

| Field | Value |
|---|---|
| ID | ISS-UAT-013-5 |
| Severity | minor |
| Module | uat / seed |
| Status | open |
| Reported | 2026-06-28 |
| Reporter | Orchestrator pre-flight (wf-20260628-uat-030 / 02-preflight.md) |
| Workflow | wf-20260628-uat-030 |

## Symptom

During `pnpm uat:seed`, Directus returned intermittent HTTP 503s with body `"Service 'api' is unavailable. Under pressure."`. The seed script's `set -euo pipefail` aborts on the first 503 unless the calling code retries.

The Orchestrator re-ran the seed with 8s and 15s back-off between attempts; retry 3 succeeded end-to-end. Bootstrap ultimately reported `✅ Directus schema bootstrapped`. This was not blocking the run, but is a non-trivial env reliability issue.

## Impact

- **Not blocking** for 2026-06-28 — the seed eventually succeeded after 3 retries. Without back-off, the run would have aborted at the first 503 and required manual intervention.
- **Latent risk**: re-running `pnpm uat:seed` on a fresh container may exhibit the same 503s. If the back-off is removed (or the developer assumes one-shot success), the run will fail.

## Root cause

`infrastructure/directus/bootstrap.sh` (invoked by `scripts/uat-seed.sh`) creates a large number of collections, relations, fields, and RBAC policies in rapid succession on a fresh Directus instance. Directus 2024.x returns 503 "Under pressure" when the api receives more concurrent requests than its worker pool can drain — the message is a load-shedding signal, not a configuration error.

The 8s / 15s back-off in the Orchestrator's mitigation is enough to let the worker pool drain; this should be baked into the seed script so it works without manual retry.

## Repro

```bash
# On a fresh Directus container:
time pnpm uat:seed
# → fails on retry 1 with "Service 'api' is unavailable. Under pressure."
# → fails on retry 2 with the same
# → succeeds on retry 3 (with back-off)
```

## Proposed resolution

Wrap `infrastructure/directus/bootstrap.sh`'s collection-creation loop with exponential back-off:

```bash
create_collection_with_retry() {
  local payload="$1" max_attempts=5
  local attempt=1 delay=4
  while (( attempt <= max_attempts )); do
    if curl -sf -H "Authorization: Bearer $DIRECTUS_TOKEN" \
         -H "Content-Type: application/json" \
         -X POST "$DIRECTUS_URL/collections" -d "$payload" >/dev/null; then
      return 0
    fi
    warn "Directus 503 (attempt $attempt/$max_attempts) — backing off ${delay}s"
    sleep "$delay"
    delay=$(( delay * 2 ))
    attempt=$(( attempt + 1 ))
  done
  fail "Directus still 503 after $max_attempts attempts"
}
```

Apply the same wrapper to field-creation, relation-creation, and RBAC policy writes — anywhere `bootstrap.sh` issues a POST/PATCH to Directus in a tight loop.

Add a config knob in `infrastructure/directus/.env`: `DIRECTUS_RETRY_MAX=5`, `DIRECTUS_RETRY_BASE_DELAY=4` so the dev can tune without editing bash.

## Acceptance criteria

1. `pnpm uat:seed` on a fresh Directus completes in one pass without manual retry.
2. The retry helper is logged (count of retries per collection) so the developer can see when Directus is under pressure.
3. A new bats test (`scripts/tests/uat-seed-retries.bats`) mocks a 503-then-200 sequence and asserts the helper succeeds without test failure.

## References

- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — observed 503 + back-off
- `infrastructure/directus/bootstrap.sh` — collection/relation creator
- `scripts/uat-seed.sh`