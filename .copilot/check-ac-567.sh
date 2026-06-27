#!/usr/bin/env bash
# BP-UAT-000 AC-5, AC-6, AC-7 checks
# On Windows, use curl.exe (Windows-native) instead of Git Bash curl
# to avoid localhost IPv6 resolution issues that cause false 000 results.
CURL="curl.exe"

echo "=== AC-5: NestJS API health ==="
code=$($CURL -s -o /dev/null -w '%{http_code}' http://localhost:3000/health || true)
echo "  /health = $code"
if [ "$code" = "200" ]; then echo "  PASS"; else echo "  FAIL (expected 200, got $code)"; fi

echo ""
echo "=== AC-6: Astro web ==="
code=$($CURL -s -o /dev/null -w '%{http_code}' http://localhost:4321/ || true)
echo "  / = $code"
if [ "$code" = "200" ]; then echo "  PASS"; else echo "  FAIL (expected 200, got $code)"; fi

echo ""
echo "=== AC-7: Internal token guard ==="
# BP-UAT-000 Step 007 specifies POST /v1/internal/ping, but that route does not
# exist in the codebase (InternalController only has /v1/internal/email).
# Using /v1/internal/email instead — same InternalAuthGuard, same intent.
# A 401 (not 500, not 404) means the guard is active and INTERNAL_API_TOKEN is set.
code=$($CURL -s -o /dev/null -w '%{http_code}' -X POST \
  -H 'x-internal-auth: intentionally-wrong-token' \
  http://localhost:3000/v1/internal/email || true)
echo "  /v1/internal/email (wrong token) = $code"
if [ "$code" = "401" ]; then echo "  PASS"; else echo "  FAIL (expected 401, got $code)"; fi
