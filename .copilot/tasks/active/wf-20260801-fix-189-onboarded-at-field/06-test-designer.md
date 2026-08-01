# 06 — Test Designer — wf-20260801-fix-189

## Tests designed

A single shell-script probe file that runs all 5 live curl tests
sequentially and produces a pass/fail report. Reuses `tmp-iss168-probe.sh`
shape (extended). Lives at `tmp-iss168-verify.sh` (transient; deleted
after run, not committed).

```bash
#!/bin/bash
# tmp-iss168-verify.sh — Live verification of bootstrap.sh field creation.
set -euo pipefail

URL="http://localhost:8200"
STATIC_TOKEN="uat-directus-static-admin-token-32c"
AUTH="Authorization: Bearer ${STATIC_TOKEN}"

PASS_COUNT=0
FAIL_COUNT=0
record() {
  local label="$1"
  local result="$2"   # PASS|FAIL
  if [ "$result" = "PASS" ]; then PASS_COUNT=$((PASS_COUNT+1)); else FAIL_COUNT=$((FAIL_COUNT+1)); fi
  printf '%-50s %s\n' "$label" "$result"
}

# --- TEST 1: field present in /fields/directus_users ---
FIELDS=$(curl -fsS -H "$AUTH" "${URL}/fields/directus_users")
if echo "$FIELDS" | jq -e '[.data[] | .field] | index("onboarded_at")' >/dev/null; then
  record "T1: field appears in /fields/directus_users" PASS
else
  record "T1: field appears in /fields/directus_users" FAIL
fi

# --- TEST 2: full schema of new field ---
SINGLE=$(curl -fsS -H "$AUTH" "${URL}/fields/directus_users/onboarded_at")
TYPE=$(echo "$SINGLE" | jq -r '.data.type')
NULLABLE=$(echo "$SINGLE" | jq -r '.data.schema.is_nullable')
INTERFACE=$(echo "$SINGLE" | jq -r '.data.meta.interface')
READONLY=$(echo "$SINGLE" | jq -r '.data.meta.readonly')
if [ "$TYPE" = "timestamp" ] && [ "$NULLABLE" = "true" ] \
   && [ "$INTERFACE" = "datetime" ] && [ "$READONLY" = "true" ]; then
  record "T2: schema matches spec (type/nullable/interface/readonly)" PASS
else
  record "T2: schema matches spec (type/nullable/interface/readonly)" FAIL
  echo "  got: type=$TYPE nullable=$NULLABLE interface=$INTERFACE readonly=$READONLY"
fi

# --- TEST 3: idempotency (covered separately after re-bootstrap) ---

# --- TEST 4: PATCH writes a value ---
USERS=$(curl -fsS -H "$AUTH" "${URL}/users?limit=1")
USER_ID=$(echo "$USERS" | jq -r '.data[0].id // empty')
TEST_TS="2026-08-01T12:00:00.000Z"
PATCH_RESULT=$(curl -fsS -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"onboarded_at\":\"${TEST_TS}\"}" \
  "${URL}/users/${USER_ID}")
if echo "$PATCH_RESULT" | jq -e ".data | has(\"onboarded_at\") and (.data.onboarded_at != null)" >/dev/null; then
  record "T4: PATCH /users/{id} body onboarded_at persists" PASS
else
  record "T4: PATCH /users/{id} body onboarded_at persists" FAIL
fi

# --- TEST 5: GET /users/{id}?fields=onboarded_at returns the value ---
READ_RESULT=$(curl -fsS -H "$AUTH" "${URL}/users/${USER_ID}?fields=onboarded_at")
READ_TS=$(echo "$READ_RESULT" | jq -r '.data.onboarded_at')
if [ "$READ_TS" = "$TEST_TS" ]; then
  record "T5: GET ?fields=onboarded_at returns the written value" PASS
else
  record "T5: GET ?fields=onboarded_at returns the written value" FAIL
  echo "  expected: ${TEST_TS}; got: ${READ_TS}"
fi

# Restore: null out the test value so local user state isn't left dirty.
curl -fsS -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"onboarded_at":null}' \
  "${URL}/users/${USER_ID}" >/dev/null

echo
echo "=== TOTALS: ${PASS_COUNT} pass, ${FAIL_COUNT} fail ==="
[ "$FAIL_COUNT" = "0" ]
```

## Why not commit the test script

The test is a transient probe — re-running it requires re-running
bootstrap.sh, which has its own side effects (writing many other
Directus rows). The probe is not idempotent and not regression-grade;
the schema existence + write tests above are the test surface, and
running them is the test. Future regressions would be caught by the
same `ensure()` skip-on-existence path — if the field were ever
accidentally dropped, the next bootstrap re-run would re-create it
loudly.

## CI integration

None — schema is provisioned by `bootstrap.sh`, not by CI. The live
verification is the test.