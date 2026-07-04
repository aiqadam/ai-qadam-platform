# 03 — Code Summary: ISS-UAT-BRIDGE-002 (Option B)

## What

Replace all seeded `@aiqadam.test` emails with `@example.com` across
the UAT seed scripts, fixtures, and tests, and add an idempotent
email-migration helper that PATCHes any existing seeded Authentik
user's email to the new TLD on next seed run. Default the
`api_ensure_directus_user_link` URL to `host.docker.internal:3001`
(fixes a latent WSL-bash → Windows-host API reachability issue exposed
by this workflow's live verification). Add `-g` (`--globoff`) to three
Directus `curl` calls (fixes a latent bash-curl bracket-range parse
error on `filter[...]` URLs that silently broke WSL-bash flows).

## Why

Directus 11.4.x's `directus_users.email` field has the built-in
`is-email` validator applied on the data-write path. RFC 6761 reserves
`.test` for testing, but no major email validator (including
`validator.js`'s `isEmail`, which Directus uses) accepts `.test` — they
require a 2+ character TLD per RFC 5321. So `@aiqadam.test` fails
validation and `Directus.users.createOne(...)` returns 400 FAILED_VALIDATION,
which `DirectusUsersBridgeService.ensureLinkedByEmail` (delivered in
wf-20260704-fix-085 / PR #104) surfaces as a rejected bridge call,
breaking the UAT seed → bridge → mirror round-trip for every
`*@aiqadam.test` user.

The original fix (Option A: relax Directus's validator) is infeasible
because `directus_users.email` is a system field (`meta.system: true`)
and Directus disallows any `meta` modification other than
`schema.is_indexed` for system fields. Option B (switch the TLD) is the
only path that doesn't require patching Directus core.

The `host.docker.internal:3001` change and the `-g` curl flags are
not Option-B-specific — they are latent bugs in code that pre-dates
this workflow but that this workflow exposed by running the seed from
WSL bash against the Windows-host API and against Directus's
bracket-heavy `filter[...]` URLs. The minimum-scope fix to make Option B
verifiable end-to-end is to fix both.

## How

### `scripts/uat-seed.sh`

**1. New helper `user_email_by_pk` (lines 199-215):**

```bash
user_email_by_pk() {
  local ak_url="$1" token="$2" pk="$3"
  ak_get "${ak_url}/api/v3/core/users/${pk}/" "$token" \
    | jq -r '.email // empty' 2>/dev/null || true
}
```

Counterpart to existing `user_pk_by_email` (which resolves
email → pk for the `operator_invites.authentik_user_id` lookup). This
new helper resolves pk → email so we can detect a stale email after
the TLD migration. Both helpers are zero-network-failure by design
(ak_get's `|| true` returns empty on any error).

**2. New email-update branch in `ensure_test_user` (lines 330-351):**

```bash
if [[ -n "$pk" && "$FORCE_REGEN" == "0" ]]; then
  # ISS-UAT-BRIDGE-002 — PATCH existing user's email if it differs
  # from the seed's declared email (the @aiqadam.test → @example.com
  # migration path; idempotent if emails already match).
  local existing_email
  existing_email=$(user_email_by_pk "$ak_url" "$token" "$pk")
  if [[ -n "$existing_email" && "$existing_email" != "$email" ]]; then
    local email_patch_resp email_patch_code
    email_patch_resp=$(ak_patch "${ak_url}/api/v3/core/users/${pk}/" \
      "$(jq -nc --arg e "$email" '{email:$e}')" "$token")
    email_patch_code="${email_patch_resp%%|*}"
    if [[ "$email_patch_code" != "200" && "$email_patch_code" != "204" ]]; then
      warn "email update for ${username} returned HTTP ${email_patch_code} (non-fatal) — old email may persist"
    else
      ok "${username} email updated: ${existing_email} -> ${email}"
    fi
  fi
  ok "user ${username} (exists, pk=${pk})"
fi
```

The branch only fires when (a) the user already exists AND
(b) `FORCE_REGEN=0` (so we are not also resetting the password). If
the existing email differs from the seed's declared email, we PATCH
via Authentik's `PATCH /api/v3/core/users/{pk}/` endpoint and accept
either 200 or 204 as success. If the PATCH fails for any reason, we
warn (non-fatal) — the seed continues, the next run will retry.

**3. API base URL default (line 264):**

```bash
# host.docker.internal resolves to the host machine from BOTH WSL bash and
# PowerShell — Docker Desktop's magic DNS. Using it instead of localhost:3001
# because the API container/pod may be running on the Windows host side, not
# inside the WSL2 VM's network namespace. Override via API_BASE_URL=...
# (e.g. "http://localhost:3001" if the API is also running inside WSL).
local api_base="${API_BASE_URL:-http://host.docker.internal:3001}"
```

The previous default `http://localhost:3001` works when bash and the
API share a network namespace (e.g. PowerShell on Windows where the
API listens on `::` and bash runs through Git for Windows). When bash
runs in WSL2 with `localhost` referring to the WSL2 VM's loopback,
`localhost:3001` is connection-refused because the API listens on
the Windows host. `host.docker.internal` resolves to the host machine
from BOTH WSL bash and PowerShell, making it the universal default.

**4. `-g` curl flag on 3 Directus calls (lines 230, 525, 770):**

```bash
# `-g` (--globoff) disables curl's URL-bracket range parsing; required for
# Directus `filter[field][op]=...` URLs which contain `[` and `]` that bash's
# curl otherwise treats as character classes (ISS-UAT-BRIDGE-002).
curl -sgf -H "Authorization: Bearer ${token}" \
  "${directus_url}/users?filter[email][_eq]=${encoded}&fields=id&limit=1" \
  ...
```

Without `-g`, bash's curl errors with `curl: (3) bad range in URL
position 36: ...filter[email]...` because `[email]` looks like a
character class to bash's curl. This was a latent bug — the previous
test runs of this code presumably went through PowerShell's `curl.exe`
(which uses Win32 APIs and doesn't parse brackets). With `-g`, the URL
passes through verbatim and the request succeeds.

**5. String updates (5 sites):**
- L14-15: header comment
- L467: operator_invite comment
- L901, L905: `MEMBER_EMAIL` / `OPERATOR_EMAIL` defaults
- L1003: comment in STEP 4
- L1026-1027: `OPERATOR_FIXTURE_EMAIL` / `NO_USER_FIXTURE_EMAIL`

### `scripts/uat-env-setup.sh`

**1 site (lines 476-479):** default `UAT_MEMBER_EMAIL` and
`UAT_OPERATOR_EMAIL` to `@example.com` in the `.env.uat` template
section.

### `scripts/uat-fixtures/BP-UAT-001.json`

**5 email references (lines 10, 19, 28, 30, 42):** all 5 instances of
`@aiqadam.test` switched to `@example.com` — covers the 3 identity
fixtures' `email` fields, the consent row's `lookup_value`, and the
consent row's `payload.member_email`.

### `scripts/tests/uat-seed.bats`

**3 assertion updates (lines 101-104, 301, 433-435):** string patterns
in `AC-1` row 3, `FR-WORKFLOW-003 row 7`, and `ISS-UAT-001-1` updated
to match `@example.com`. Added a comment in `ISS-UAT-001-1` documenting
the migration source (wf-20260704-fix-086 / ISS-UAT-BRIDGE-002) so the
next reader knows why the TLD changed.

## Risks

See `02-impact-analysis.md` for the full risk register. The two
load-bearing risks are:

1. **Existing seeded Authentik users retain `@aiqadam.test` emails** —
   mitigated by `user_email_by_pk` PATCH branch (idempotent; logs the
   change).

2. **`host.docker.internal` doesn't resolve on non-Docker-Desktop
   systems** — mitigated by `API_BASE_URL` env override; comment in
   code documents the override.

## Verification

See `07-test-results.md` for the actual test run output.

- **Mock mode (CI):** `bash scripts/run-bats.sh scripts/tests/*.bats` →
  95/96 pass (1 pre-existing failure on origin/main, unrelated to this PR)
- **Live end-to-end:** `bash scripts/uat-seed.sh --reset BP-UAT-001` →
  exit 0, all 5 fixtures created
- **Directus round-trip:** GET `/users?filter[email][_in]=...` →
  3 rows present with valid UUIDs

## Size

- 4 files changed
- +77 / -21 lines (98 net)
- Well within AGENTS.md §4 limits (400 lines / 5 files)