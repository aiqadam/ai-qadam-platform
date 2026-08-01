# 03 — Code Developer — wf-20260801-fix-189

## Implementation

Single insertion in `infrastructure/directus/bootstrap.sh` (12 added lines,
between `email_verified_at` block and `city` block at line ~3235).

## Pattern chosen: `email_verified_at` analog

Chose this exact analog over alternatives because:

| Alternative | Why rejected |
|---|---|
| `datetime` type with default `null` | `email_verified_at` precedent uses `timestamp` for "set once, then readonly" semantics; identical use case here. |
| Different placement (e.g. adjacent to other "FR-MIG-020 onboarding" code) | No such grouping exists in bootstrap.sh; sections are organized by feature cluster (F-S1.x). The closest semantic neighbor is `email_verified_at` (set-once, system-driven, never edited by user) — placed it there. |
| Writable (non-readonly) | Wrong — `onboarded_at` is set only by `MembersOnboardingService.completeOnboarding()`, never by the user directly. `meta.readonly: true` matches `email_verified_at` and prevents accidental writes from admin UI. |
| Default `CURRENT_TIMESTAMP` | Wrong — legacy users (joined before this fix) would silently get a misleading timestamp; null + explicit set on completion is the correct idempotency semantic per `MembersOnboardingService.completeOnboarding()` ("skipped if onboarded_at already set"). |

## The change (diff)

```diff
 echo "[F-S1.6 — directus_users.email_verified_at]"
 ensure "field directus_users.email_verified_at" \
   "${DIRECTUS_URL}/fields/directus_users/email_verified_at" \
   "${DIRECTUS_URL}/fields/directus_users" \
   '{
     "field":"email_verified_at",
     "type":"timestamp",
     "schema":{"is_nullable":true},
     "meta":{"interface":"datetime","width":"half","readonly":true}
   }'

+echo "[ISS-RBAC-ONBOARDED-AT-001 — directus_users.onboarded_at]"
+ensure "field directus_users.onboarded_at" \
+  "${DIRECTUS_URL}/fields/directus_users/onboarded_at" \
+  "${DIRECTUS_URL}/fields/directus_users" \
+  '{
+    "field":"onboarded_at",
+    "type":"timestamp",
+    "schema":{"is_nullable":true},
+    "meta":{
+      "interface":"datetime",
+      "width":"half",
+      "readonly":true,
+      "note":"Set once by MembersOnboardingService.completeOnboarding() (FR-MIG-020); null for legacy users who joined before this field was created. Referenced by MEMBER_PROFILE_FIELDS allowlist (line ~2729) and by MeProfileService.{setOnboardedAt,getOnboardedAt,fetchProfileRow}; absence caused the ISS-RBAC-PERMS-001 403 to manifest even after the permission-row fix (PR #223)."
+    }
+  }'
+
 echo "[F-S1.6 — directus_users.city]"
```

## Self-check against §1 (Ten Non-Negotiables)

| Rule | How satisfied |
|---|---|
| 1. Simple control flow | Single `ensure` call, same shape as ~30 siblings. |
| 2. Loops have upper bounds | N/A (no loops). |
| 3. No magic numbers / strings | Field name `"onboarded_at"` is the canonical reference (used by 4 API files). Type values are directus schema literals, not magic. |
| 4. Functions ≤60 lines | The block is 12 lines, total file is unchanged in structure. |
| 5. ≥1 assertion per function | `ensure` itself asserts existence (200 OK → skip; 404 → POST). |
| 6. Variables in smallest scope | No new variables introduced. |
| 7. Return values checked | `ensure` reads the HTTP response before deciding skip-vs-POST. |
| 8. No dynamic imports / eval | None. |
| 9. Flat data structures | Field config JSON is 2 levels (schema / meta), same as siblings. |
| 10. Zero warnings | `bash -n` syntax check exit=0 (verified). |

## Idempotency

`ensure()` helper (defined earlier in bootstrap.sh) does:

```
GET ${DIRECTUS_URL}/fields/directus_users/<field>
→ if 200: skip
→ else:   POST the JSON to create it
```

So:
- 1st run after merge: field doesn't exist → POST → created.
- 2nd run after merge: field exists → 200 → skipped. No diff.
- Confirmed by live verification (Step 7).