# Migration Plan — FR-NTF-005

**Workflow:** wf-20260803-feat-205  
**Requirement:** FR-NTF-005 — User notification preferences and topic interests  
**Date:** 2026-08-03  
**Author:** DBMigrationAuthor

---

## Executive Summary

Two boolean fields added to Directus's `directus_users` table to implement master notification channel toggles (email on/off, Telegram on/off). Migration is **forward-only** (no reversal needed — the fields are purely additive with safe defaults), **non-destructive** (zero data loss, backward compatible), and **idempotent** (safe to re-run).

**Migration location:** `infrastructure/directus/bootstrap.sh` using the existing `ensure` helper pattern.

**Deployment safety:** Green across all axes — no schema downtime, no existing-row mutation, no dependent services broken by the addition.

---

## Requirement

**FR-NTF-005:** User notification preferences and topic interests  
**GitHub Issue:** https://github.com/aiqadam/ai-qadam-platform/issues/135

Members control which notifications they receive via per-channel master toggles (email, Telegram) and topic interests. This migration adds the two boolean channel toggles to the `directus_users` table:

- `notification_email_enabled` — Master toggle for ALL email notifications (default `true`)
- `notification_telegram_enabled` — Master toggle for ALL Telegram DMs (default `true`)

**Acceptance criteria affected:**
- AC1: Setting `notification_email_enabled=false` stops all email notifications
- AC2: Setting `notification_telegram_enabled=false` stops all Telegram DMs

---

## Schema Changes

### Target Collection

**Collection:** `directus_users` (Directus system table, managed via Directus API)  
**Module:** N/A (this is infrastructure, not application code)  
**Migration file:** `infrastructure/directus/bootstrap.sh`

### Fields to Add

#### 1. `notification_email_enabled`

**Type:** `boolean`  
**Constraints:**
- `NOT NULL`
- `DEFAULT true`

**Directus metadata:**
```json
{
  "field": "notification_email_enabled",
  "type": "boolean",
  "schema": {
    "is_nullable": false,
    "default_value": true
  },
  "meta": {
    "interface": "boolean",
    "special": ["cast-boolean"],
    "width": "half",
    "sort": 50,
    "note": "Master toggle for ALL email notifications. False suppresses all emails (reminders, announcements, confirmations). FR-NTF-005."
  }
}
```

**Rationale:** Default `true` ensures backward compatibility — existing users see no behavior change until they explicitly opt out. The field is gated at the dispatcher level (`InteractionsService.dispatch()`) to create a hard stop before any email channel processing.

---

#### 2. `notification_telegram_enabled`

**Type:** `boolean`  
**Constraints:**
- `NOT NULL`
- `DEFAULT true`

**Directus metadata:**
```json
{
  "field": "notification_telegram_enabled",
  "type": "boolean",
  "schema": {
    "is_nullable": false,
    "default_value": true
  },
  "meta": {
    "interface": "boolean",
    "special": ["cast-boolean"],
    "width": "half",
    "sort": 51,
    "note": "Master toggle for ALL Telegram DMs. False suppresses all Telegram messages. Enforced after FR-NTF-004 (Telegram adapter) ships. FR-NTF-005."
  }
}
```

**Rationale:** Same backward-compatibility logic as email toggle. The enforcement point is the same dispatcher method — when FR-NTF-004 (Telegram adapter) lands, this field will already be present and ready to gate.

---

## Migration Implementation

### File Location

**Path:** `infrastructure/directus/bootstrap.sh`  
**Section:** After existing `directus_users` field provisioning (recommend placing after line 2071, immediately following `notification_opt_ins` field)

### Migration Code

Add the following two blocks to `bootstrap.sh`:

```bash
echo "[FR-NTF-005 — directus_users.notification_email_enabled]"
ensure "field directus_users.notification_email_enabled" \
  "${DIRECTUS_URL}/fields/directus_users/notification_email_enabled" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"notification_email_enabled",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":true},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "sort":50,
      "note":"Master toggle for ALL email notifications. False suppresses all emails (reminders, announcements, confirmations). FR-NTF-005."
    }
  }'

echo "[FR-NTF-005 — directus_users.notification_telegram_enabled]"
ensure "field directus_users.notification_telegram_enabled" \
  "${DIRECTUS_URL}/fields/directus_users/notification_telegram_enabled" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"notification_telegram_enabled",
    "type":"boolean",
    "schema":{"is_nullable":false,"default_value":true},
    "meta":{
      "interface":"boolean",
      "special":["cast-boolean"],
      "width":"half",
      "sort":51,
      "note":"Master toggle for ALL Telegram DMs. False suppresses all Telegram messages. Enforced after FR-NTF-004 (Telegram adapter) ships. FR-NTF-005."
    }
  }'
```

### Idempotency Guarantee

The `ensure` helper (lines 100–123 of `bootstrap.sh`) implements idempotency:

1. **Existence check:** `GET /fields/directus_users/{field_name}` — if HTTP 200, the field already exists → skip creation and print `✓ field (exists)`.
2. **Creation:** If check returns non-200, `POST /fields/directus_users` with retry logic (absorbed 503/429 via `directus_request_with_retry` helper).
3. **Retry policy:** Up to 5 attempts with exponential backoff (4s → 8s → 16s → 32s → 64s) to handle Directus 503 "Under pressure" storms on fresh containers.

**Safe to re-run:** Running `bootstrap.sh` twice (or N times) will create the fields once on the first run, then skip on subsequent runs with `✓` messages.

---

## Migration Type

**Classification:** Forward-only, additive, non-destructive

**Why forward-only:** There is no realistic rollback scenario that requires dropping these fields. The fields are:
- Purely additive (no existing column replaced or modified)
- Backward compatible (default `true` matches current implicit behavior)
- Schema-level only (no data transformation, no dependent FK cascades)

**Reversal strategy:** If the fields must be removed (e.g., the feature is entirely abandoned), use the `drop_field` helper:

```bash
drop_field "directus_users" "notification_email_enabled"
drop_field "directus_users" "notification_telegram_enabled"
```

This is **not recommended** unless the feature is fully reverted — the fields are harmless when present (they simply store booleans), and their presence does not block any future schema evolution.

---

## Tenant Scoping

**Does this change affect tenant-scoped tables?** No.

**Justification:** `directus_users` is a **global** table — one row per member regardless of which country tenant(s) they belong to. A member can register for events in multiple countries (`uz.aiqadam.org`, `kz.aiqadam.org`) under a single `directus_users` row. Notification preferences are **member-level**, not tenant-level — a member's email toggle applies across all countries.

The `directus_users` table already has a `country` FK (added in Sprint 4.3) that points to the member's **primary** country, but this is for default timezone/locale purposes, not for tenant isolation. The notification toggles do not need a `countryCode` column or index.

**No tenant scoping changes required.**

---

## Data Loss and Safety Analysis

### Zero Data Loss Verification

**Existing rows:** All existing `directus_users` rows will receive `notification_email_enabled = true` and `notification_telegram_enabled = true` via the `DEFAULT` clause. No user is opted out without explicit action.

**New rows:** All future `INSERT` statements against `directus_users` (via Directus's built-in registration flow or Authentik sync) will populate these fields with `true` if not explicitly set.

**No migration data transformation required:** Because the fields have safe defaults, there is no need for a backfill script or an `UPDATE` pass over existing rows — the `DEFAULT` clause handles it at DDL time.

### Backward Compatibility

**Before this migration ships:**
- Current behavior: All users receive all email notifications (no master toggle exists)
- Current API: `GET /v1/me/preferences/consents` returns `{email_reminders: bool, email_announcements: bool}` (granular toggles from FR-USR-004)

**After this migration ships:**
- New behavior: Users with `notification_email_enabled = true` continue to receive all emails (unchanged)
- API extension: `GET /v1/me/preferences/consents` adds `notification_email_enabled: true` and `notification_telegram_enabled: true` to the response (see Impact Analysis §API Impact)
- Dispatcher gating: `InteractionsService.dispatch()` checks the master toggles **before** channel-specific logic

**No breaking changes:** Existing API clients that don't send the new fields in `PATCH` requests will leave them at `true` (safe default). Existing consumers that don't read the new response fields will continue to work (additive response shape).

### Rollback Safety (If Required)

**Scenario:** The feature is abandoned mid-sprint and the fields must be removed.

**Steps:**
1. **Stop the API service** to prevent in-flight writes.
2. **Run the drop commands:**
   ```bash
   drop_field "directus_users" "notification_email_enabled"
   drop_field "directus_users" "notification_telegram_enabled"
   ```
3. **Restart the API service.**

**Cost:** ~5 seconds of API downtime per field (Directus runs `ALTER TABLE directus_users DROP COLUMN ...` under the hood). No data loss beyond the two boolean columns themselves (which have no dependent FKs).

**Recommended alternative to rollback:** Leave the fields in place but gate the feature at the application layer (feature flag in `apps/api/.env`). Dropping schema is more disruptive than disabling a feature.

---

## Deployment Plan

### Pre-Deployment Checklist

- [ ] Verify Directus is reachable: `curl -fsS -H "Authorization: Bearer $DIRECTUS_TOKEN" "$DIRECTUS_URL/server/info"`
- [ ] Confirm `DIRECTUS_TOKEN` has admin permissions (collection/field creation requires elevated role)
- [ ] Run `bootstrap.sh` in dry-run mode (if implemented) OR manually verify the `ensure` helper will skip existing fields
- [ ] Back up Directus Postgres database (standard pre-migration practice, even for non-destructive changes)

### Deployment Steps

#### Local / QA / Staging

1. **Set environment variables:**
   ```bash
   export DIRECTUS_URL="http://localhost:8200"  # or https://cms-qa.aiqadam.org
   export DIRECTUS_TOKEN=$(docker exec aiqadam-directus env | grep ADMIN_TOKEN | cut -d= -f2)
   ```

2. **Run bootstrap script:**
   ```bash
   bash infrastructure/directus/bootstrap.sh
   ```

3. **Verify fields exist:**
   ```bash
   curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
     "$DIRECTUS_URL/fields/directus_users/notification_email_enabled" | jq '.data.field'
   # Expected: "notification_email_enabled"
   
   curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
     "$DIRECTUS_URL/fields/directus_users/notification_telegram_enabled" | jq '.data.field'
   # Expected: "notification_telegram_enabled"
   ```

4. **Verify default values on existing rows:**
   ```bash
   curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
     "$DIRECTUS_URL/users?fields=id,notification_email_enabled,notification_telegram_enabled&limit=5" \
     | jq '.data[] | {id, notification_email_enabled, notification_telegram_enabled}'
   # Expected: Both fields are `true` for all rows
   ```

#### Production

1. **Coordinate with operations team** (even though this is low-risk, notify before mutating prod schema).
2. **Run the same steps as QA** against the production Directus instance.
3. **Monitor Directus logs** for 5 minutes post-deployment to catch any retry storms or 503 errors (should be absorbed by the helper, but verify).

### Post-Deployment Verification

- [ ] Confirm both fields appear in Directus Admin UI under Settings → Data Model → directus_users
- [ ] Confirm a test user can view these fields in `/me/preferences` (web) — requires CodeDeveloper's API integration to be deployed first
- [ ] Confirm toggling `notification_email_enabled = false` in the Admin UI does NOT break any existing API endpoints (should be a no-op until dispatcher enforcement lands)

---

## Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Directus 503 storm on fresh container | Low | Medium | `ensure` helper has built-in retry with exponential backoff (up to 5 attempts, 64s max) |
| Field name collision with future Directus core field | Low | Very Low | Prefix `notification_` is unlikely to collide; Directus reserves unprefixed names like `status`, `role` |
| Default `true` inadvertently opts users INTO more emails | None | Zero | Default `true` matches current implicit behavior (all users receive all emails today); this is opt-OUT, not opt-IN |
| Rolling deployment causes version skew (old API + new schema) | Low | Low | Fields are nullable in practice (Directus enforces NOT NULL at DDL, but old API versions won't set them); default `true` ensures safe fallback |
| Performance impact on `directus_users` table | None | Zero | Two booleans add ~2 bytes per row; no index needed (not a filter/sort key in hot paths) |

**Overall risk level:** **Low** — This is a textbook additive migration with safe defaults and no dependent services broken.

---

## Testing Plan

### Unit Tests (Not Applicable)

This is a schema-only change. No application code unit tests are affected until `InteractionsService.dispatch()` is modified (that change is out of scope for DBMigrationAuthor — see Impact Analysis §API Impact).

### Integration Tests

**Test:** Verify fields exist and have correct defaults  
**Location:** New bats test in `scripts/tests/directus-bootstrap.bats`

```bash
@test "FR-NTF-005: directus_users.notification_email_enabled exists with default true" {
  run curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
    "$DIRECTUS_URL/fields/directus_users/notification_email_enabled"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.data.field == "notification_email_enabled"'
  echo "$output" | jq -e '.data.schema.default_value == true'
}

@test "FR-NTF-005: directus_users.notification_telegram_enabled exists with default true" {
  run curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
    "$DIRECTUS_URL/fields/directus_users/notification_telegram_enabled"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.data.field == "notification_telegram_enabled"'
  echo "$output" | jq -e '.data.schema.default_value == true'
}
```

### UAT Verification (BP-UAT-003, BP-UAT-005)

**Scope:** FR-NTF-005 is linked to BP-UAT-003 (member preferences) and BP-UAT-005 (notification dispatch). The UAT session will verify end-to-end flows AFTER the full feature ships (migration + API + web UI + dispatcher enforcement).

**Migration-specific UAT:** Not applicable — schema changes are verified via integration tests above. UAT focuses on user-facing behavior, not DDL.

---

## Dependencies

### Upstream (Must Complete Before This)

None. This migration is standalone and does not depend on any prior schema changes.

### Downstream (Depends On This)

1. **CodeDeveloper (Step 6)** — Extends `GET/PATCH /v1/me/preferences/consents` to read/write these fields
2. **CodeDeveloper (Step 6)** — Updates `InteractionsService.dispatch()` to enforce master toggles
3. **TestRunner (Step 8)** — Writes integration tests for the API changes
4. **UATRunner (Step 12)** — Verifies end-to-end BP-UAT-003 and BP-UAT-005 flows

---

## Rollback Strategy

### When to Roll Back

Rollback is **not recommended** unless:
1. The entire FR-NTF-005 feature is abandoned mid-sprint (business decision, not technical)
2. A critical Directus API bug is discovered that makes these fields unusable (Directus upgrade breaks the schema, etc.)

### Rollback Steps (If Absolutely Necessary)

1. **Stop the API service** (prevents in-flight writes to the fields).
2. **Drop the fields via the `drop_field` helper:**
   ```bash
   # Add these lines to a rollback script, or run interactively:
   drop_field "directus_users" "notification_email_enabled"
   drop_field "directus_users" "notification_telegram_enabled"
   ```
3. **Verify fields are gone:**
   ```bash
   curl -s -H "Authorization: Bearer $DIRECTUS_TOKEN" \
     "$DIRECTUS_URL/fields/directus_users/notification_email_enabled"
   # Expected HTTP 404
   ```
4. **Restart the API service.**

**Downtime:** ~10 seconds total (5s per field for Directus to run `ALTER TABLE ... DROP COLUMN`).

**Data loss:** Only the two boolean columns are dropped. No user data, no FK dependencies, no cascade effects.

### Preferred Alternative to Rollback

Instead of dropping the fields, **feature-flag the enforcement** in `apps/api/.env`:

```bash
# .env
FEATURE_NOTIFICATION_MASTER_TOGGLES_ENABLED=false
```

Then gate the dispatcher checks:

```typescript
// In InteractionsService.dispatch()
if (process.env.FEATURE_NOTIFICATION_MASTER_TOGGLES_ENABLED === 'true') {
  if (payload.channel === 'email' && user.notification_email_enabled === false) {
    return; // suppressed
  }
}
```

This keeps the schema stable while allowing the feature to be toggled on/off operationally.

---

## Open Questions (None)

All design decisions are finalized:
- Field names: `notification_email_enabled`, `notification_telegram_enabled` (matches FR-NTF-005 spec)
- Defaults: `true` (backward compatible, opt-out)
- Location: `directus_users` (global member table, not tenant-scoped)
- Migration tool: `ensure` helper in `bootstrap.sh` (idempotent, retries on 503/429)

---

## Gate Result

**Status:** `passed`  
**Attempt:** 1  
**Timestamp:** 2026-08-03T15:15:00Z

**Summary:** Migration plan complete. Two boolean fields (`notification_email_enabled`, `notification_telegram_enabled`) added to `directus_users` via idempotent `ensure` helper. Zero data loss, backward compatible (default `true`), no tenant scoping required. Forward-only migration (rollback not recommended but documented if needed). Safe to proceed to CodeDeveloper (Step 6).

**Self-check results:**
- [x] All tenant-scoped tables have `countryCode` column and index → N/A (no new tables, `directus_users` is global)
- [x] All foreign keys indexed → N/A (no FKs added)
- [x] `createdAt` / `updatedAt` present on every new table → N/A (no new tables)
- [x] No raw SQL hand-written (Drizzle generates) → N/A (Directus API manages its own DDL via JSON payloads)
- [x] Migration is reversible (or reversal documented as impossible with backup strategy) → Reversal documented via `drop_field` helper (§Rollback Strategy)

**Next step:** Hand off to CodeDeveloper (Step 6) to implement API integration (`GET/PATCH /v1/me/preferences/consents` extension and `InteractionsService.dispatch()` enforcement).

**Output file:** `.copilot/tasks/active/wf-20260803-feat-205/05-migration-plan.md`

---

## Appendix A: Directus Field Schema Reference

For future migrations that add fields to `directus_users`, use this template:

```bash
echo "[<REQUIREMENT> — directus_users.<field_name>]"
ensure "field directus_users.<field_name>" \
  "${DIRECTUS_URL}/fields/directus_users/<field_name>" \
  "${DIRECTUS_URL}/fields/directus_users" \
  '{
    "field":"<field_name>",
    "type":"<directus_type>",
    "schema":{"is_nullable":<true|false>,"default_value":<value>},
    "meta":{
      "interface":"<directus_interface>",
      "special":["<cast-type>"],
      "width":"half|full",
      "sort":<integer>,
      "note":"<human_readable_description>"
    }
  }'
```

**Common types:**
- `boolean` → interface: `boolean`, special: `["cast-boolean"]`
- `string` → interface: `input`, no special
- `integer` / `bigInteger` → interface: `input`, no special
- `timestamp` → interface: `datetime`, special: `["cast-timestamp"]`
- `json` → interface: `input-code`, special: `["cast-json"]`

**Width:** `half` for fields that can share a row, `full` for wide fields (JSON, text areas).

**Sort:** Controls field order in Directus Admin UI forms (lower numbers appear first).

---

**End of Migration Plan**
