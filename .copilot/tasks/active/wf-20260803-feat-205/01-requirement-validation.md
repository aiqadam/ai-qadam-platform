# Requirement Validation — FR-NTF-005

**Workflow:** wf-20260803-feat-205  
**Requirement:** FR-NTF-005 — User notification preferences and topic interests  
**GitHub Issue:** https://github.com/aiqadam/ai-qadam-platform/issues/135  
**Date:** 2026-08-03

---

## Raw Input

From handoff.yaml:
> User notification preferences and topic interests — Members control which notifications they receive and for which topics. Preferences include a per-channel toggle (email on/off, Telegram on/off) and a topic interest list.

From FR-NTF-005.md:
- **Module:** Notifications (NTF)
- **Phase:** Roadmap Sprint 5.5
- **Status:** Planned → **In Progress** (updated as part of this workflow)
- **Dependencies:** FR-USR-004 (Shipped), FR-EVT-007 (In Progress), FR-NTF-002 (Planned)

---

## Analysis

### Completeness Issues Found

1. **Missing business process linkage** — The requirement file lacks the `business_process` frontmatter field. Based on functional scope analysis:
   - **BP-UAT-003** (Member self-service profile) — The `/me/preferences` page with notification toggles and topic interests
   - **BP-UAT-005** (Operator announce composer) — Announcements must respect `notification_email_enabled` and topic interests

2. **Clarification needed on FR-USR-004 relationship** — FR-USR-004 (status: Shipped) already implements `/me/preferences` with email consent toggles and Telegram notification toggle. FR-NTF-005 describes:
   - **New:** `notification_email_enabled` field (master toggle for ALL email notifications)
   - **New:** Topic interests table (`user_interests`) and management UI
   - **Already exists (per FR-USR-004):** `notification_telegram_enabled` toggle, preferences page structure
   - **Refinement needed:** The relationship between FR-USR-004's three email-topic consents (`newsletter`, `sponsor_offer`, `speaker_promo`) and FR-NTF-005's master `notification_email_enabled` toggle. The requirement states `notification_email_enabled=false` suppresses ALL emails — this is broader than the existing per-topic consents.

3. **Acceptance criteria completeness** — The current ACs cover the core behaviors but could benefit from:
   - Cross-module verification (does toggling affect both FR-NTF-002 and FR-NTF-003?)
   - Boundary cases (what happens when a user has `notification_email_enabled=false` but specific topic consents ON?)

### Conflicts with Existing Features

**Resolved overlap with FR-USR-004:**
- FR-USR-004 (Shipped) provides the `/me/preferences` page infrastructure and the `notification_telegram_enabled` toggle
- FR-NTF-005 **extends** this page with:
  - New master email toggle (`notification_email_enabled`)
  - Topic interests UI and management
  - Bot `/interests` command as an alternative interface
- **No true conflict** — FR-NTF-005 builds on FR-USR-004's foundation. The dependency is correctly declared.

**Consistent with notification system:**
- FR-NTF-002 (Event announcement fan-out) depends on FR-NTF-005 and correctly references `notification_email_enabled` and topic interests
- FR-NTF-003 (24h reminder) references `notification_telegram_enabled` consistently
- FR-NTF-004 (Telegram adapter, Implemented) already checks `notification_telegram_enabled` per its documented scope

### Architectural Feasibility

**✅ Database layer:**
- New fields on `directus_users`: `notification_email_enabled`, `notification_telegram_enabled`, `country_preference`, `telegram_id`
  - **Pattern confirmed:** Other requirements (FR-USR-002, FR-USR-004) already extend `directus_users` via Directus schema, then read via Directus API from NestJS
  - **Concern noted:** `telegram_id` field overlaps with account linking (FR-AUTH-005, still Planned). However, per FR-NTF-004's correction note, the actual field used is `directus_users.telegram_user_id`, not an Authentik attribute. This requirement should align with that pattern.
- New table `user_interests` (M2M: user ↔ topic)
  - **Architecturally sound:** Follows the module boundary pattern (users module owns user data, events module owns topics, junction table mediates)

**✅ API layer:**
- Endpoints align with existing REST conventions:
  - `GET/PATCH /v1/me/preferences/consents` — extends existing endpoint (FR-USR-004)
  - `POST /v1/me/profile/interests` — new, follows `/v1/me/profile/*` pattern
  - `DELETE /v1/me/profile/interests/:id` — standard REST delete
- Module boundaries respected: Users module owns preferences, calls Events module service to resolve topics

**✅ Frontend layer:**
- Web: extends existing `/me/preferences` page (FR-USR-004)
- Bot: new `/interests` command, follows existing bot command pattern (FR-BOT-001)

**⚠️ Cross-cutting concern:**
- The requirement states `notification_email_enabled=false` suppresses ALL email notifications system-wide. This affects:
  - FR-NTF-001 (transactional emails)
  - FR-NTF-002 (announcements)
  - FR-NTF-003 (reminders)
  - FR-ADM-003 (operator announcements)
- **Recommendation:** Ensure the notification dispatcher (FR-NTF-001's `dispatch()` method) enforces this check early in the pipeline, before any channel-specific logic

---

## Formalized Requirement

**FR-NTF-005** — User notification preferences and topic interests

**Actor:** Members

**Behavior:** Members control which notifications they receive through two mechanisms:
1. **Channel-level toggles:** Master switches for email (`notification_email_enabled`) and Telegram (`notification_telegram_enabled`) notifications. Setting either to `false` suppresses ALL notifications on that channel, overriding any per-topic or per-consent settings.
2. **Topic interests:** Members select which community topics (AI/ML, MLOps, Python, etc.) they care about. Topic interests gate fan-out announcements (FR-NTF-002) but do NOT affect transactional messages (registration confirmation, reminders).

**Interfaces:**
- **Web:** `/me/preferences` page displays channel toggles and topic interest checkboxes (filtered by user's country)
- **Bot:** `/interests` command shows topics as inline keyboard toggle buttons
- **API:** `GET/PATCH /v1/me/preferences/consents` (channel toggles), `POST/DELETE /v1/me/profile/interests/:id` (topic interests)

**Data model:**
- Extends `directus_users` with: `notification_email_enabled` (bool, default `true`), `notification_telegram_enabled` (bool, default `true`), `country_preference` (FK)
- New table `user_interests`: `user` (FK), `topic` (FK), `created_at`

**Dependencies:**
- FR-USR-004 (Shipped) — provides `/me/preferences` page infrastructure
- FR-EVT-007 (In Progress) — provides `topics` collection
- FR-NTF-001 (Shipped) — notification dispatcher must enforce channel toggles
- FR-NTF-002 (Planned) — event announcements respect topic interests

**Cross-references:**
- BP-UAT-003 (Member self-service profile) — verifies preferences UI and persistence
- BP-UAT-005 (Operator announce composer) — verifies announcements respect consent filters

---

## Acceptance Criteria (draft)

### Core functionality

**AC-1:** Setting `notification_email_enabled=false` suppresses ALL email notifications
- **Given** a member with `notification_email_enabled=false`
- **When** any notification event fires (registration confirmation, reminder, announcement)
- **Then** no email is sent to that member, regardless of other consent settings
- **Verify:** Check `notifications_sent` / `interaction_deliveries` — no rows with `channel='email'`

**AC-2:** Setting `notification_telegram_enabled=false` suppresses ALL Telegram DMs
- **Given** a member with linked Telegram and `notification_telegram_enabled=false`
- **When** any notification event fires
- **Then** no Telegram DM is sent to that member
- **Verify:** Check `interaction_deliveries` — no rows with `channel='telegram'`

**AC-3:** Topic interests gate fan-out announcements only, not transactional messages
- **Given** a member with interests={AI/ML}, `notification_email_enabled=true`
- **And** a published event tagged with only {Python}
- **When** event announcement fan-out runs (FR-NTF-002)
- **Then** the member does NOT receive an announcement email
- **And** when the member registers for an event, they DO receive a confirmation email (transactional, unaffected by topic interests)

**AC-4:** `country_preference` defaults to first tenant sign-in
- **Given** a new member signs up via `uz.aiqadam.org`
- **Then** their `country_preference` is set to `uz`
- **And** subsequent sign-ins from other subdomains do NOT change `country_preference`

**AC-5:** Web preferences page displays channel toggles and topic interests
- **Given** a signed-in member at `/me/preferences`
- **Then** channel toggles for email and Telegram are visible
- **And** topic interests checkboxes are shown (filtered by `country_preference`)
- **And** toggling a setting persists after page reload

**AC-6:** Bot `/interests` command manages topic interests
- **Given** a member invokes `/interests` in Telegram bot
- **Then** bot displays topics for their country as inline keyboard
- **And** tapping a topic button toggles that interest on/off
- **And** changes are reflected in web `/me/preferences` immediately

**AC-7:** Transactional emails are never suppressed by topic interests
- **Given** a member with NO topic interests set
- **And** `notification_email_enabled=true`
- **When** the member registers for an event
- **Then** they receive a registration confirmation email (FR-REG-001)
- **And** they receive a 24h reminder email (FR-NTF-003)

### Edge cases

**AC-8:** Email toggle overrides all other email settings
- **Given** a member with `notification_email_enabled=false`
- **And** email topic consents (`newsletter`, `sponsor_offer`) are ON (from FR-USR-004)
- **And** topic interests are set
- **When** any notification attempts to send email
- **Then** no email is sent (master toggle wins)

**AC-9:** Cross-tenant isolation for topic interests
- **Given** a UZ member with interests={AI/ML}
- **When** a KZ event tagged {AI/ML} is published
- **Then** the UZ member does NOT receive an announcement (country boundary respected)

**AC-10:** Idempotent topic interest add/remove
- **Given** a member with interest {AI/ML}
- **When** they add {AI/ML} again
- **Then** no duplicate row is created (dedupe on user+topic)

---

## Gate Result

**Status:** passed

**Summary:** FR-NTF-005 is complete, architecturally feasible, and ready for development with two required metadata updates.

**Findings:**
- Requirement is specific and testable with 10 acceptance criteria covering core functionality and edge cases
- Architectural feasibility confirmed — follows module boundary patterns, database schema extensions match existing precedents
- No true conflicts with FR-USR-004 — FR-NTF-005 extends (not replaces) the existing preferences infrastructure
- Consistent with notification system — FR-NTF-002/003/004 correctly reference the toggles and interests defined here
- Missing business_process frontmatter field — must add BP-UAT-003 and BP-UAT-005 before step 2
- Minor field name clarification needed: telegram_id vs telegram_user_id (use telegram_user_id per FR-NTF-004's pattern)
- Recommendation: notification dispatcher must check notification_email_enabled early in the pipeline to enforce master toggle
