# Step 1 — Issue Lookup (wf-20260702-fix-055, ISS-UAT-SEED-001)

## Issue summary

`ISS-UAT-SEED-001` (severity: bug, module: uat/seed, status: open) reports
that `scripts/uat-seed.sh` step 4 fails on a fresh Directus instance with
HTTP 400 VALUE_TOO_LONG when creating `operator_invites` rows. Three root
causes are identified in the issue:

1. **Directus readonly validation**: `consumed_at` field has
   `meta.readonly = true`; Directus 11 rejects ANY value (including
   `null`) for readonly fields via the items API.
2. **Seed-script payload bug**: `ensure_operator_invite` explicitly
   POSTs `consumed_at: null` for the "pending" fixture rows
   (valid + expired + no-user).
3. **CRLF in env values**: `env_get()` does not strip `\r` from values
   read from Windows-edited `.env` files, causing the
   `Authorization: Bearer ${token}` header to contain a trailing
   `\r` — Directus returns FORBIDDEN.

The issue also flags a missing `authentik_user_id` column on the seed
rows and undocumented `AUTHENTIK_ADMIN_TOKEN` env var. The `.env.example`
already documents `AUTHENTIK_ADMIN_TOKEN` (verified at
[apps/api/.env.example:91-92](apps/api/.env.example) — both URL and
token present), so AC-4 is already satisfied on `main` and is recorded
as `verified-already-satisfied` rather than requiring a new change.

## Acceptance criteria (from the issue)

| AC | Description | Mapped to bats test |
|---|---|---|
| AC-1 | `pnpm uat:seed` on a fresh Directus creates all 4 operator_invite rows without error | new `uat-seed-iss-001.bats` AC-1 |
| AC-2 | Rows have `authentik_user_id` set to the correct Authentik pk | new test AC-2 |
| AC-3 | CRLF-safe env parsing (idempotency check returns rows, not FORBIDDEN) | new test AC-3 |
| AC-4 | `AUTHENTIK_ADMIN_TOKEN` documented in `env.example` | already satisfied on `main` |

## Honesty disclosures

1. **AC-4 already satisfied**: `apps/api/.env.example` already
   documents `AUTHENTIK_ADMIN_URL` and `AUTHENTIK_ADMIN_TOKEN` with
   the actual production guidance. The issue file's "Proposed
   resolution" #4 is therefore a no-op. Recorded in
   `03-code-summary.md` and `09-quality-gate.md` Honesty disclosures
   as `verified-already-satisfied`.

2. **Workflow `wf-20260630-uat-042` already mitigated in-line**:
   The reporter's workflow patched the missing `authentik_user_id`
   via the Directus API as a pre-flight step (per
   `wf-20260630-uat-042/BP-UAT-013-04-triage.md` line 45). This
   workflow makes that mitigation permanent in the seed script
   itself.

3. **`env_get` is duplicated**: Same function exists in
   `scripts/uat-env-setup.sh:73-78`. The CRLF fix must be applied
   to both copies to avoid drift. The fix in `uat-env-setup.sh` is
   a side-effect of fixing the seed.

## Files reviewed

- `.copilot/issues/ISS-UAT-SEED-001.md` (issue file)
- `scripts/uat-seed.sh` (current state — has `if $cat == ""` partial
  fix that still POSTs `consumed_at: null`)
- `scripts/uat-env-setup.sh` (sibling with same `env_get`)
- `infrastructure/directus/bootstrap.sh` (operator_invites schema
  confirmation: `consumed_at` is `readonly: true`, `is_nullable: true`,
  at line ~2863)
- `apps/api/.env.example` (already documents `AUTHENTIK_ADMIN_TOKEN`)
- `scripts/tests/uat-seed.bats` (existing 4 ACs — will not modify,
  will add a new file `uat-seed-iss-001.bats` for the new ACs)

## Gate Result

gate_result:
  status: passed
  summary: "Issue validated. Three code changes + one already-satisfied AC. New regression test file planned."
  findings:
    - "AC-1: ensure_operator_invite currently POSTs 'consumed_at: null' for pending rows — Directus 11 readonly validation rejects this with VALUE_TOO_LONG. Fix: omit the key entirely when value is empty."
    - "AC-2: ensure_operator_invite does not look up Authentik user pk by email. Fix: add user_pk_by_email helper, use it in ensure_operator_invite for all 4 rows. Mock-mode prints the resolved pk so the test can grep it."
    - "AC-3: env_get strips double-quotes but not carriage returns. Fix: add '| tr -d \"\\r\"' to the pipeline in both uat-seed.sh and uat-env-setup.sh."
    - "AC-4: AUTHENTIK_ADMIN_TOKEN already documented in apps/api/.env.example. Verified-already-satisfied."
