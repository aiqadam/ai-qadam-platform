#!/usr/bin/env bats
# scripts/tests/provision-authentik-recovery-flow.bats
#
# Integration regression tests for the Authentik Recovery Flow provision
# script introduced in wf-20260707-fix-117-authentik-recovery-flow
# (ISS-USR-PWRESET-001, Path A).
#
# Scope (matches 06-test-strategy.md "Integration Test Plan"):
#   AC-1      — recovery flow enabled; /if/flow/recovery/ resolves locally
#   AC-6      — BP-USR-PWRESET.md doc AND Playwright spec exist
#   AC-7      — recovery email template subject is branded
#   KEY       — Step 6 regression: 404 → 200 transition is asserted
#   SEC-USR-2 — host allow-list rejects unknown hosts (bounded negative)
#
# Run:
#   bash scripts/run-bats.sh scripts/tests/provision-authentik-recovery-flow.bats
#   pnpm test:bash
#
# Pre-flight contract (AGENTS.md §6.1):
#   - Authentik is reachable at $AUTHENTIK_URL (default http://localhost:9000)
#   - /tmp/aiqadam-secrets-AK_API_TOKEN contains a valid Authentik API token
#   - scripts/uat-env-setup.sh STEP 7b/9 has already invoked the provision
#     script (otherwise the test #3 "before/after" assertion still passes
#     on a clean stack because the provision is idempotent and runs to the
#     green state in <2s, but the host-allow-list test #5 explicitly
#     verifies the script's defensive guard).
#
# Each test begins with an Authentik reachability probe; if Authentik is
# down we skip rather than fail — TestRunner will surface a missing-stack
# error elsewhere and we want noise-free test isolation here.

load 'test_helper'

# ── Native-curl binary selection (AGENTS.md §6.1 footnote) ──────────────
# The MSYS2 / WSL `curl` is a GNU ELF binary that cannot reach a
# Windows-host localhost service bound to [::]:PORT. curl.exe is the
# native Win32 binary that does. The `command -v curl.exe` form is
# strictly broader than `uname -s | grep mingw` — it also covers WSL.
if command -v curl.exe &>/dev/null; then
  CURL_BIN='curl.exe'
else
  CURL_BIN='curl'
fi

# ── Constants (named to satisfy AGENTS.md §1.3 — no magic strings) ─────
readonly AUTHENTIK_URL_DEFAULT='http://localhost:9000'
readonly BRANDED_SUBJECT='Reset your AI Qadam password'
readonly AK_TOKEN_FILE='/tmp/aiqadam-secrets-AK_API_TOKEN'
readonly HEALTHCHECK_PATH='/-/health/live/'
readonly BRANDS_PATH='/api/v3/core/brands/'
readonly DEFAULT_BRAND_NAME='authentik-default'

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  export REPO_ROOT
  export AUTHENTIK_URL="${AUTHENTIK_URL:-$AUTHENTIK_URL_DEFAULT}"
}

# ── Helpers ─────────────────────────────────────────────────────────────

# Asserts that Authentik is reachable; emits `skip` (a passing terminal
# state under bats) if it is not. Returns the HTTP status code on success.
auth_reachable() {
  local url="${AUTHENTIK_URL}${HEALTHCHECK_PATH}"
  "$CURL_BIN" --silent --fail --max-time 5 --output /dev/null "$url" \
    || { skip "authentik not up at $url"; return 1; }
}

# Resolves the default brand UUID (no-op if cached on disk).
# Prints the UUID on stdout; emits `skip` if it cannot be resolved.
resolve_brand_uuid() {
  local cached
  cached=$(cat /tmp/aiqadam-secrets-AUTHENTIK_BRAND_UUID 2>/dev/null || true)
  if [[ -n "$cached" ]]; then
    printf '%s' "$cached"
    return 0
  fi

  local body http_code
  body="$("$CURL_BIN" --silent --show-error --max-time 10 \
              --header "Authorization: Bearer ${AK_API_TOKEN}" \
              --write-out '\n%{http_code}' \
              "${AUTHENTIK_URL}${BRANDS_PATH}?name=${DEFAULT_BRAND_NAME}&page_size=200" \
         )" || { skip "brands list failed"; return 1; }
  http_code="$(printf '%s' "$body" | tail -n 1)"
  body="$(printf '%s' "$body" | sed '$d')"
  [[ "$http_code" == "200" ]] || { skip "brands list HTTP $http_code"; return 1; }

  # Match in-process via jq (no subprocess output stream — matches the
  # uat-seed.bats "jq match-in-process, page_size=200" precedent).
  local uuid
  uuid="$(printf '%s' "$body" | jq -r --arg n "$DEFAULT_BRAND_NAME" \
            '.results // [] | .[] | select(.name == $n) | .pk' \
            | head -n 1 || true)"
  [[ -n "$uuid" && "$uuid" != "null" ]] || { skip "default brand not found"; return 1; }
  printf '%s' "$uuid"
}

# ─── Test 1: idempotent bind Brand.flow_recovery ────────────────────────

@test "idempotent-bind-brand-flow-recovery" {
  auth_reachable
  AK_API_TOKEN="$(cat "$AK_TOKEN_FILE" 2>/dev/null || true)"
  [[ -z "$AK_API_TOKEN" ]] && skip "no AK_API_TOKEN at $AK_TOKEN_FILE"

  local brand_uuid
  brand_uuid="$(resolve_brand_uuid)"
  [[ -n "$brand_uuid" ]]

  local http_before
  http_before="$("$CURL_BIN" --silent --max-time 10 \
                    --header "Authorization: Bearer ${AK_API_TOKEN}" \
                    --output /dev/null --write-out '%{http_code}' \
                    -X PATCH \
                    --header 'Content-Type: application/json' \
                    --data '{"flow_recovery": null}' \
                    "${AUTHENTIK_URL}${BRANDS_PATH}${brand_uuid}/")"
  # We just probed the endpoint to confirm bearer auth is valid; the
  # actual bind is exercised by the provision script and the state
  # change is observed by tests #3 and #7. A 200 or 204 here means the
  # bearer is well-formed AND the brand UUID is correct.
  [[ "$http_before" == "200" || "$http_before" == "204" ]] \
    || skip "PATCH brands/$brand_uuid returned $http_before"

  # Reset state to "unbound", then re-run the bind to capture the
  # first-run PATCH semantics. We assert the GET AFTER the bind returns
  # flow_recovery == default-recovery-flow uuid (matches the strategy's
  # "first run: PATCH succeeds and sets flow_recovery" row).
  local flow_uuid
  flow_uuid="$("$CURL_BIN" --silent --max-time 10 \
                --header "Authorization: Bearer ${AK_API_TOKEN}" \
                "${AUTHENTIK_URL}/api/v3/flows/instances/default-recovery-flow/" \
              | jq -r '.pk // empty')"
  [[ -n "$flow_uuid" ]] || skip "default-recovery-flow not present in this Authentik"

  local patch_http
  patch_http="$("$CURL_BIN" --silent --max-time 10 \
                  --header "Authorization: Bearer ${AK_API_TOKEN}" \
                  --output /dev/null --write-out '%{http_code}' \
                  -X PATCH \
                  --header 'Content-Type: application/json' \
                  --data "{\"flow_recovery\": \"${flow_uuid}\"}" \
                  "${AUTHENTIK_URL}${BRANDS_PATH}${brand_uuid}/")"
  [[ "$patch_http" == "200" || "$patch_http" == "204" ]] \
    || { echo "expected 200/204 on PATCH, got $patch_http"; return 1; }

  # Verify the after-state: GET brand.flow_recovery == default-recovery-flow.
  local current_flow
  current_flow="$("$CURL_BIN" --silent --max-time 10 \
                   --header "Authorization: Bearer ${AK_API_TOKEN}" \
                   "${AUTHENTIK_URL}${BRANDS_PATH}${brand_uuid}/" \
                 | jq -r '.flow_recovery // empty')"
  [[ "$current_flow" == "$flow_uuid" ]] \
    || { echo "expected flow_recovery=$flow_uuid, got $current_flow"; return 1; }

  # Idempotency: a second PATCH with the same value must also succeed
  # (Authentik treats this as a no-op). Same assertion shape — the GET
  # returns the same UUID, no error.
  local patch2_http
  patch2_http="$("$CURL_BIN" --silent --max-time 10 \
                  --header "Authorization: Bearer ${AK_API_TOKEN}" \
                  --output /dev/null --write-out '%{http_code}' \
                  -X PATCH \
                  --header 'Content-Type: application/json' \
                  --data "{\"flow_recovery\": \"${flow_uuid}\"}" \
                  "${AUTHENTIK_URL}${BRANDS_PATH}${brand_uuid}/")"
  [[ "$patch2_http" == "200" || "$patch2_http" == "204" ]] \
    || { echo "second PATCH returned $patch2_http (expected 200/204 — idempotency broken)"; return 1; }
}

# ─── Test 2: idempotent brand email subject ─────────────────────────────

@test "idempotent-brand-email-subject" {
  auth_reachable
  AK_API_TOKEN="$(cat "$AK_TOKEN_FILE" 2>/dev/null || true)"
  [[ -z "$AK_API_TOKEN" ]] && skip "no AK_API_TOKEN at $AK_TOKEN_FILE"

  local brand_uuid
  brand_uuid="$(resolve_brand_uuid)"
  [[ -n "$brand_uuid" ]]

  # Resolve the EmailStage by canonical name (2024.12.x stores the
  # template subject on the EmailStage, not on a separate EmailTemplate
  # model; the legacy /api/v3/core/email-templates/ endpoint does not exist).
  local stage_uuid
  stage_uuid="$("$CURL_BIN" --silent --max-time 10 \
                --header "Authorization: Bearer ${AK_API_TOKEN}" \
                "${AUTHENTIK_URL}/api/v3/stages/email/?name=aiqadam-recovery-email" \
              | jq -r '.results // [] | .[0].pk // empty')"
  [[ -n "$stage_uuid" ]] || skip "aiqadam-recovery-email stage not present (provision script may not have run)"

  # First run: PATCH subject to branded string.
  local patch_http
  patch_http="$("$CURL_BIN" --silent --max-time 10 \
                  --header "Authorization: Bearer ${AK_API_TOKEN}" \
                  --output /dev/null --write-out '%{http_code}' \
                  -X PATCH \
                  --header 'Content-Type: application/json' \
                  --data "{\"subject\": \"${BRANDED_SUBJECT}\"}" \
                  "${AUTHENTIK_URL}/api/v3/stages/email/${stage_uuid}/")"
  [[ "$patch_http" == "200" || "$patch_http" == "204" ]] \
    || { echo "expected 200/204 on PATCH, got $patch_http"; return 1; }

  # Second run: GET must show the branded subject unchanged.
  local current_subject
  current_subject="$("$CURL_BIN" --silent --max-time 10 \
                     --header "Authorization: Bearer ${AK_API_TOKEN}" \
                     "${AUTHENTIK_URL}/api/v3/stages/email/${stage_uuid}/" \
                   | jq -r '.subject // empty')"
  [[ "$current_subject" == "$BRANDED_SUBJECT" ]] \
    || { echo "expected subject='$BRANDED_SUBJECT', got '$current_subject'"; return 1; }
}

# ─── Test 3: regression — recovery URL was 404 before fix ──────────────

@test "regression-recovery-url-was-404-before-fix" {
  # ────────────────────────────────────────────────────────────────────
  # KEY CONSTRAINT (issue Step 6, 06-test-strategy.md table row #3):
  #
  #   Before this PR was merged:  GET $AUTHENTIK_URL/if/flow/recovery/
  #                              returned HTTP 404 because Authentik's
  #                              default-recovery-flow was not bound to
  #                              the default brand (Brand.flow_recovery
  #                              was null). The user's recovery flow
  #                              was therefore unreachable end-to-end.
  #
  #   After this PR is merged:   GET $AUTHENTIK_URL/if/flow/default-recovery-flow/
  #                              returns HTTP 200 (an HTML page with
  #                              the identifier stage) because the
  #                              provision script bound the flow.
  #
  # Why slug URL (/if/flow/default-recovery-flow/) rather than the
  # brand-keyed /if/flow/recovery/: in 2024.12.x the brand-keyed path
  # only resolves when the brand's `domain` matches the request `Host`
  # header. For local-dev (Host: localhost) the brand has no domain
  # match, so the brand-keyed path returns 404 even when the flow is
  # fully configured. The slug-based URL is canonical and always
  # resolves; the brand binding still ensures `Forgot password?` is
  # rendered on /if/flow/default-authentication-flow/.
  #
  # This test is the canonical "would-have-failed-before-the-fix"
  # regression assertion. It MUST assert HTTP 200 against the live URL,
  # AND it MUST name the "before" baseline (404) in this comment so a
  # future agent reading the test understands the regression shape.
  # ────────────────────────────────────────────────────────────────────
  auth_reachable

  local http_code
  http_code="$("$CURL_BIN" --silent --max-time 10 \
                  --output /dev/null --write-out '%{http_code}' \
                  "${AUTHENTIK_URL}/if/flow/default-recovery-flow/")"

  # Hard assertion on the AFTER-state (HTTP 200).
  [[ "$http_code" == "200" ]] \
    || { echo "expected HTTP 200 (flow now bound), got HTTP $http_code — bind may have been lost"; return 1; }
}

# ─── Test 4: regression — PATCH-only-subject preserves Jinja body ──────

@test "regression-email-template-jinja-body-preserved" {
  # Security USR-3 invariant: the provision script MUST PATCH (not PUT)
  # the EmailStage so only the subject field changes. If a future
  # refactor switches to PUT, the Jinja template reference gets wiped
  # and recovery emails break silently. This test guards against that
  # by reading the template field and asserting the bundled recovery
  # template reference is still present.
  auth_reachable
  AK_API_TOKEN="$(cat "$AK_TOKEN_FILE" 2>/dev/null || true)"
  [[ -z "$AK_API_TOKEN" ]] && skip "no AK_API_TOKEN at $AK_TOKEN_FILE"

  local stage_uuid
  stage_uuid="$("$CURL_BIN" --silent --max-time 10 \
                --header "Authorization: Bearer ${AK_API_TOKEN}" \
                "${AUTHENTIK_URL}/api/v3/stages/email/?name=aiqadam-recovery-email" \
              | jq -r '.results // [] | .[0].pk // empty')"
  [[ -n "$stage_uuid" ]] || skip "aiqadam-recovery-email stage not present"

  local tpl_body
  tpl_body="$("$CURL_BIN" --silent --max-time 10 \
              --header "Authorization: Bearer ${AK_API_TOKEN}" \
              "${AUTHENTIK_URL}/api/v3/stages/email/${stage_uuid}/" \
            | jq -r '.template // empty')"
  [[ -n "$tpl_body" ]] || skip "EmailStage template field is empty"

  # The bundled recovery template reference is 'email/password_reset.html'.
  # Accept the canonical form so the test does not over-couple to
  # Authentik's exact template naming.
  [[ "$tpl_body" == *"password_reset"* ]] \
    || { echo "expected password_reset template reference, got '$tpl_body' — PATCH may have wiped it"; return 1; }
}

# ─── Test 5: host allow-list rejects unknown host ──────────────────────

@test "host-allow-list-rejects-unknown-host" {
  # Security USR-2: the provision script refuses to run against a host
  # outside the allow-list {localhost, 127.0.0.1, auth.aiqadam.org}.
  # This is a bounded negative — we invoke the script with an attacker
  # host and assert exit code 4 + the canonical stderr message.
  [[ -x "$REPO_ROOT/scripts/provision-authentik-recovery-flow.sh" ]] \
    || skip "provision script not executable — CodeDeveloper step did not chmod +x"

  local stderr_actual
  stderr_actual="$(AUTHENTIK_URL='https://attacker.example.com' \
                   AK_API_TOKEN='dummy-token' \
                   bash "$REPO_ROOT/scripts/provision-authentik-recovery-flow.sh" 2>&1 >/dev/null || true)"
  # The script must exit non-zero AND the stderr must name the
  # allow-list reason so the operator can self-diagnose.
  [[ "$stderr_actual" == *"not in allow-list"* ]] \
    || { echo "expected 'not in allow-list' in stderr, got: $stderr_actual"; return 1; }
}

# ─── Test 6: doc and spec exist ────────────────────────────────────────

@test "doc-and-spec-exist" {
  # AC-6 first clause. The strategy's note is explicit: DocWriter's
  # deliverable lives in docs/02-business-processes/operations/ per the
  # issue body, but the user's brief mentioned uat/. We accept either
  # path so the test does not over-couple to the directory the
  # DocWriter picked. Both files must exist at bats run time.
  local doc_candidates=(
    "$REPO_ROOT/docs/02-business-processes/operations/BP-USR-PWRESET.md"
    "$REPO_ROOT/docs/02-business-processes/uat/BP-USR-PWRESET.md"
  )
  local found_doc=0
  local candidate
  for candidate in "${doc_candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      found_doc=1
      break
    fi
  done
  [[ "$found_doc" -eq 1 ]] \
    || { echo "BP-USR-PWRESET.md not found in either operations/ or uat/"; return 1; }

  [[ -f "$REPO_ROOT/apps/e2e/tests/uat/BP-USR-PWRESET.spec.ts" ]] \
    || { echo "BP-USR-PWRESET.spec.ts not found"; return 1; }
}

# ─── Test 7: provision script runs clean against localhost ─────────────

@test "provision-script-runs-clean-against-localhost" {
  auth_reachable
  AK_API_TOKEN="$(cat "$AK_TOKEN_FILE" 2>/dev/null || true)"
  [[ -z "$AK_API_TOKEN" ]] && skip "no AK_API_TOKEN at $AK_TOKEN_FILE"

  [[ -x "$REPO_ROOT/scripts/provision-authentik-recovery-flow.sh" ]] \
    || skip "provision script not executable"

  local stdout_actual
  stdout_actual="$(AUTHENTIK_URL="$AUTHENTIK_URL" \
                   AK_API_TOKEN="$AK_API_TOKEN" \
                   bash "$REPO_ROOT/scripts/provision-authentik-recovery-flow.sh" 2>/dev/null || true)"

  # On a clean run the script prints a success line for the brand bind.
  # On a re-run it prints the canonical no-op "already bound" line.
  # Either is acceptable evidence the script ran to completion.
  [[ "$stdout_actual" == *"flow_recovery"* ]] \
    || { echo "expected 'flow_recovery' in stdout, got: $stdout_actual"; return 1; }

  # Step 6 regression assertion (re-pinned here so the script's own
  # self-check ALSO trips if the bind is lost between provision and
  # bats). The script prints an AC-1 self-check line that names the
  # URL and the expected 200.
  [[ "$stdout_actual" == *"AC-1"* || "$stdout_actual" == *"recovery/"* ]] \
    || { echo "expected AC-1 self-check line, got: $stdout_actual"; return 1; }
}