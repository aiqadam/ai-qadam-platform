# Impact Analysis — FR-NTF-005

**Workflow:** wf-20260803-feat-205  
**Requirement:** FR-NTF-005 — User notification preferences and topic interests  
**Date:** 2026-08-03

---

## Executive Summary

FR-NTF-005 adds master notification channel toggles and integrates topic interests into member preferences. **Critical discovery:** Much of the described infrastructure already exists in production — `member_interests` table, bot `/interests` command, and API endpoints are all live. The actual scope is:

1. Two new boolean fields on `directus_users` (`notification_email_enabled`, `notification_telegram_enabled`)
2. Integration of these toggles into `/me/preferences` web page
3. Dispatcher enforcement (check master toggles early in notification pipeline)
4. Topic interests UI in web preferences (bot already has this)

**No breaking changes** — purely additive, backward compatible (both toggles default `true`).

---

## Critical Discovery: Existing Infrastructure

### Already Implemented (Production)

| Component | Status | Source |
|---|---|---|
| `member_interests` table | ✅ Live | Schema: `user` FK, `topic` FK, `created_at` |
| Bot `/interests` command | ✅ Live | `apps/bot/src/handlers/interests.py` (FR-BOT-002) |
| POST `/v1/me/profile/interests` | ✅ Live | `apps/api/src/users/users.controller.ts` |
| DELETE `/v1/me/profile/interests/:id` | ✅ Live | `apps/api/src/users/users.controller.ts` |
| Topics catalog | ✅ Live | FR-EVT-007 Phase 1 merged (8237fca) |

### Not Yet Implemented

| Component | Status | Action Required |
|---|---|---|
| `directus_users.notification_email_enabled` | ❌ Missing | Add via Directus bootstrap |
| `directus_users.notification_telegram_enabled` | ❌ Missing | Add via Directus bootstrap |
| Web preferences topic interests UI | ❌ Missing | Extend `/me/preferences` page |
| Dispatcher master toggle enforcement | ❌ Missing | Update `InteractionsService.dispatch()` |
| GET/PATCH `/v1/me/preferences/consents` | ⚠️ Partial | Endpoints exist (FR-USR-004), need to add channel toggles |

---

## Database Impact

### Directus Schema Changes

**File:** `infrastructure/directus/bootstrap.sh`

**Changes Required:**

1. **Add `notification_email_enabled` field to `directus_users`:**
   ```bash
   ensure directus/fields directus_users notification_email_enabled '{
     "field": "notification_email_enabled",
     "type": "boolean",
     "schema": {"default_value": true, "is_nullable": false},
     "meta": {
       "interface": "boolean",
       "display": "boolean",
       "readonly": false,
       "hidden": false,
       "width": "half",
       "sort": 50,
       "note": "Master toggle for ALL email notifications. False suppresses all emails."
     }
   }'
   ```

2. **Add `notification_telegram_enabled` field to `directus_users`:**
   ```bash
   ensure directus/fields directus_users notification_telegram_enabled '{
     "field": "notification_telegram_enabled",
     "type": "boolean",
     "schema": {"default_value": true, "is_nullable": false},
     "meta": {
       "interface": "boolean",
       "display": "boolean",
       "readonly": false,
       "hidden": false,
       "width": "half",
       "sort": 51,
       "note": "Master toggle for ALL Telegram DMs. False suppresses all Telegram messages."
     }
   }'
   ```

3. **Verify `member_interests` table exists** (should already be present):
   ```bash
   # Verification query (no action needed if it returns data)
   curl -H "Authorization: Bearer $DIRECTUS_TOKEN" \
     "$DIRECTUS_URL/collections/member_interests" | jq '.data'
   ```

**Impact:** 2 new fields, idempotent bootstrap (safe to re-run).

---

## API Impact

### Modified Endpoints

| Endpoint | Module | Change | Rationale |
|---|---|---|---|
| `GET /v1/me/preferences/consents` | Users | Add `notification_email_enabled`, `notification_telegram_enabled` to response | Existing endpoint (FR-USR-004) returns email consents, extend with channel toggles |
| `PATCH /v1/me/preferences/consents` | Users | Accept `notification_email_enabled`, `notification_telegram_enabled` in request body | Existing endpoint (FR-USR-004) updates email consents, extend with channel toggles |

### New Endpoints

| Endpoint | Module | Purpose | Notes |
|---|---|---|---|
| None | — | — | Topic interest endpoints already exist (POST/DELETE `/v1/me/profile/interests/:id`) |

### Service Layer Changes

**File:** `apps/api/src/interactions/interactions.service.ts`

**Change Required:**
```typescript
// In dispatch() method, before channel selection:
async dispatch(payload: NotificationPayload): Promise<void> {
  const user = await this.directusService.getUser(payload.userId);
  
  // NEW: Master channel toggle enforcement
  if (payload.channel === 'email' && user.notification_email_enabled === false) {
    this.logger.log(`Email suppressed for user ${payload.userId} (master toggle off)`);
    return; // Hard stop - no email sent
  }
  
  if (payload.channel === 'telegram' && user.notification_telegram_enabled === false) {
    this.logger.log(`Telegram suppressed for user ${payload.userId} (master toggle off)`);
    return; // Hard stop - no Telegram sent
  }
  
  // Existing dispatch logic continues...
}
```

**Impact:** All notification flows (FR-NTF-001, FR-NTF-002, FR-NTF-003, FR-ADM-003) automatically respect master toggles via this choke point.

---

## Web Impact

### Modified Pages

**File:** `apps/web-next/src/pages/me/preferences.astro`

**Changes Required:**

1. **Add channel toggles section** (above existing email consents):
   ```astro
   <section class="preference-section">
     <h3>Notification Channels</h3>
     <label>
       <input type="checkbox" name="notification_email_enabled" checked={user.notification_email_enabled} />
       <span>Email notifications (master toggle)</span>
       <p class="help-text">Turn off to stop ALL emails, including reminders and confirmations</p>
     </label>
     <label>
       <input type="checkbox" name="notification_telegram_enabled" checked={user.notification_telegram_enabled} />
       <span>Telegram notifications (master toggle)</span>
       <p class="help-text">Turn off to stop ALL Telegram DMs</p>
     </label>
   </section>
   ```

2. **Add topic interests section** (new):
   ```astro
   <section class="preference-section">
     <h3>Topic Interests</h3>
     <p class="help-text">Select topics you care about. Affects event announcements only.</p>
     {topics.map(topic => (
       <label>
         <input 
           type="checkbox" 
           name={`topic_${topic.id}`} 
           checked={userInterests.includes(topic.id)} 
           data-topic-id={topic.id}
         />
         <span>{topic.name}</span>
       </label>
     ))}
   </section>
   ```

3. **Update form submission handler** to:
   - PATCH `/v1/me/preferences/consents` for channel toggles
   - POST/DELETE `/v1/me/profile/interests/:id` for topic changes (endpoint already exists)

**Impact:** 1 page modified, ~80 lines added, no breaking changes to existing preferences.

---

## Bot Impact

### Existing Implementation (No Changes)

The bot `/interests` command is **fully implemented** per FR-BOT-002:
- File: `apps/bot/src/handlers/interests.py`
- Behavior: Inline keyboard with topic toggles (country-filtered)
- API integration: POST/DELETE `/v1/me/profile/interests/:id`

**No action required** — bot already satisfies FR-NTF-005's bot requirements.

---

## Module Boundary Analysis

### Affected Modules

| Module | Role | Changes |
|---|---|---|
| Users | Owner of user preferences | Add channel toggle fields, expose in API |
| Notifications | Consumer of preferences | Enforce master toggles in dispatcher |
| Interactions | Dispatcher | Check toggles before sending |
| Events | Topic catalog provider | No changes (FR-EVT-007 already provides topics) |

### Service Interactions

```
┌─────────────┐
│ Web/Bot UI  │
└──────┬──────┘
       │ POST/DELETE /v1/me/profile/interests/:id
       │ PATCH /v1/me/preferences/consents
       ▼
┌──────────────────┐
│ UsersController  │ (apps/api/src/users)
└──────┬───────────┘
       │ read: directus_users.notification_email_enabled
       │ read: directus_users.notification_telegram_enabled
       ▼
┌───────────────────┐
│ DirectusService   │ (apps/api/src/directus)
└───────────────────┘

Separate flow (notification dispatch):
┌────────────────────┐
│ InteractionsService│ (apps/api/src/interactions)
└──────┬─────────────┘
       │ check master toggles
       ▼
┌──────────────┐
│ Email/Telegram│ adapters
│ Adapters      │
└───────────────┘
```

**Boundary Preservation:** ✅ No cross-module violations. Users module owns preferences, Interactions module consumes them as read-only.

---

## Test Impact

### Unit Tests

| File | New Tests | Coverage Target |
|---|---|---|
| `apps/api/src/users/users.controller.spec.ts` | 4 | PATCH consents with channel toggles |
| `apps/api/src/interactions/interactions.service.spec.ts` | 6 | Master toggle enforcement (email/telegram, on/off) |
| `apps/web-next/src/pages/me/preferences.test.ts` | 5 | Channel toggle UI, topic interests UI |

**Total:** 15 new unit tests

### Integration Tests (Testcontainers)

| Suite | New Tests | Coverage Target |
|---|---|---|
| `apps/api/test/users.e2e-spec.ts` | 3 | Full preferences round-trip (PATCH → GET) |
| `apps/api/test/interactions.e2e-spec.ts` | 4 | Dispatcher enforcement with real Directus |

**Total:** 7 new integration tests

### E2E Tests (Playwright)

| Test | Flow | Coverage Target |
|---|---|---|
| `apps/e2e/tests/preferences-channel-toggles.spec.ts` | Navigate to /me/preferences, toggle email off, save, verify persisted | Channel toggle UI + persistence |
| `apps/e2e/tests/preferences-topic-interests.spec.ts` | Navigate to /me/preferences, select 2 topics, save, verify persisted | Topic interests UI + persistence |
| `apps/e2e/tests/notification-suppression.spec.ts` | Set email toggle off, trigger reminder, verify no email sent | End-to-end toggle enforcement |

**Total:** 3 new E2E tests

---

## Risk Assessment

### High Risks

1. **Master toggle semantics conflict with existing consents** (FR-USR-004)
   - **Risk:** Users expect `notification_email_enabled=false` AND `newsletter=on` to send newsletters
   - **Mitigation:** Documentation explicitly states master toggle overrides all other settings; add warning UI in preferences page
   - **Severity:** Medium (user confusion, support burden)

2. **Dispatcher enforcement bypass**
   - **Risk:** Some notification path (e.g., Directus Flow direct-to-adapter) bypasses `InteractionsService.dispatch()` and ignores master toggles
   - **Mitigation:** Audit all notification entry points; ensure all go through `dispatch()` choke point
   - **Severity:** High (breaks core requirement AC-1/AC-2)

### Medium Risks

1. **Topic interests filtering not applied**
   - **Risk:** FR-NTF-002 (event announcements) implementation might not check `member_interests` table
   - **Mitigation:** TestRunner must verify announcement fan-out respects topic filtering
   - **Severity:** Medium (degrades feature, doesn't break it)

2. **`country_preference` defaulting logic unclear**
   - **Risk:** FR-NTF-005 describes "defaults from first tenant sign-in" but doesn't specify WHERE this logic lives
   - **Mitigation:** CodeDeveloper must clarify — likely in Authentik post-login hook or first Directus user creation
   - **Severity:** Low (missing feature, not a bug)

### Low Risks

1. **Bot `/interests` command already exists**
   - **Risk:** None — this is a positive discovery
   - **Mitigation:** TestRunner must verify existing bot command works correctly
   - **Severity:** None

---

## Architecture Considerations

### Security Invariants

1. **Tenant isolation** — Topic interests are country-scoped (via `topics.country` FK), ensuring UZ members don't see KZ topics
2. **Auth enforcement** — All preference endpoints require authenticated user (`@CurrentUser()` decorator)
3. **No PII in logs** — Master toggle enforcement logs user ID only, not email or Telegram handle

### Performance Impact

**Minimal:**
- Two new boolean columns on `directus_users` (indexed by PK, no query impact)
- `member_interests` table already exists and is queried by existing bot command
- Dispatcher check is O(1) field read on user object (already fetched)

---

## Dependencies

### Upstream (Must Be Complete Before This)

| Dependency | Status | Impact |
|---|---|---|
| FR-EVT-007 Phase 1 | ✅ Merged (8237fca) | Provides `topics` collection |
| FR-USR-004 | ✅ Shipped | Provides `/me/preferences` page infrastructure |
| FR-BOT-002 | ✅ Shipped | Provides bot `/interests` command (already satisfies FR-NTF-005) |

### Downstream (Blocked on This)

| Dependency | Status | Impact |
|---|---|---|
| FR-NTF-002 | Planned | Event announcements must respect topic interests |
| FR-NTF-003 | Implemented | 24h reminders must respect `notification_telegram_enabled` (already does per FR-NTF-004 correction) |

---

## Gate Result

**Status:** passed

**Summary:** Scope is well-defined, architecture is sound, no breaking changes. Critical discovery: ~60% of described functionality already exists in production. Actual implementation scope is additive: 2 new Directus fields, dispatcher enforcement, and web UI integration.

**Recommendations for CodeDeveloper:**
1. Verify `member_interests` table schema matches FR-NTF-005 description before assuming it's correct
2. Clarify `country_preference` defaulting logic placement (Authentik hook vs Directus user creation)
3. Add comprehensive logging to dispatcher enforcement for debugging

**Ready for:** Step 3 (DBMigrationAuthor)
