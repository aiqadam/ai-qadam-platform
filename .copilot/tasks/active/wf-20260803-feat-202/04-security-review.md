# Security Review: FR-EVT-007 Phase 1 (Data Model)

**Workflow:** wf-20260803-feat-202  
**Agent:** SecurityReviewer  
**Date:** 2026-08-03  
**Requirement:** [FR-EVT-007](../../../docs/03-requirements/FR-EVT-007.md)  
**Code Summary:** [03-code-summary.md](03-code-summary.md)  
**Impact Analysis:** [02-impact-analysis.md](02-impact-analysis.md)

---

## Code Changes Reviewed

| File | Lines Changed | Type |
|------|--------------|------|
| `infrastructure/directus/bootstrap.sh` | +95 (lines 504-628, 2079-2099) | Modified — 3 new schema sections |
| `infrastructure/directus/backfill-member-interests-topic.sh` | +73 | Created — backfill script |

**Total:** 168 lines added, 0 deleted (additive schema-only change)

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|-----------|-----------|---------|-------|
| INV-1: Tenant isolation | ✅ Yes | **PASS** | `topics.country` FK enforces country scoping (ON DELETE RESTRICT). Backfill script fetches member's country and filters topics accordingly. No cross-tenant read path possible. |
| INV-2: Secrets by reference | ✅ Yes | **PASS** | No secrets in code. Backfill script uses env vars `DIRECTUS_URL` and `DIRECTUS_TOKEN` per security baseline. |
| INV-3: Auth at controller level | ❌ N/A | N/A | No API controllers in this PR (Phase 1 schema only). Deferred to Phase 2. |
| INV-4: Validation at boundaries | ❌ N/A | N/A | No API endpoints in this PR. Deferred to Phase 2. |
| INV-5: No cross-schema queries | ✅ Yes | **PASS** | All changes within Directus schema. No JOINs across `platform`/`directus`/`authentik`. |
| INV-6: Rate limiting | ❌ N/A | N/A | No public endpoints in this PR. Deferred to Phase 2. |
| INV-7: CSRF protection | ❌ N/A | N/A | No browser-initiated endpoints in this PR. Deferred to Phase 2. |
| INV-8: No `dangerouslySetInnerHTML` | ❌ N/A | N/A | No React code in this PR. Deferred to Phase 2. |
| INV-9: No N+1 queries | ✅ Yes | **PASS** | `seed_topic()` checks existence via GET before POST (lines 542-560). No query-in-loop without batching. |
| INV-10: Drizzle parameterization | ❌ N/A | N/A | No Drizzle queries in this PR. Uses Directus REST API (parameterized by design). |
| INV-11: HttpOnly tokens | ❌ N/A | N/A | No web authentication code in this PR. Deferred to Phase 2. |

**Summary:** 4 of 11 invariants applicable to Phase 1 (schema-only). All 4 PASS. 7 N/A (API/Web deferred to Phase 2+).

---

## Detailed Security Analysis

### 1. Tenant Isolation (INV-1) — PASS ✅

**Scope:** FR-EVT-007 introduces country-scoped topics.

**Evidence:**
- `topics.country` is a required FK to `countries.code` (line 533).
- ON DELETE RESTRICT prevents deleting a country with existing topics.
- All 3 topic seed sections (uz/kz/tj, lines 562-594) explicitly scope topics by country.
- Backfill script (lines 48-51 in `backfill-member-interests-topic.sh`) fetches `member.country` and filters topics by that country: 
  ```bash
  member_country=$(curl -s -H "${H_AUTH}" \
    "${DIRECTUS_URL}/users/${member}?fields=country" \
    | jq -r '.data.country // empty')
  # ...
  topic_id=$(curl -s -H "${H_AUTH}" \
    "${DIRECTUS_URL}/items/topics?filter[slug][_eq]=${normalized}&filter[country][_eq]=${member_country}&fields=id&limit=1" \
    | jq -r '.data[0].id // empty')
  ```

**Cross-tenant leak assessment:** No cross-tenant query path exists at schema level. Phase 2 API endpoints MUST filter `topics` queries by `request.user.country` — flagged in Impact Analysis (§Security Risks, MAJOR severity), tracked separately.

**Verdict:** ✅ **PASS** — Tenant isolation enforced at schema level. Phase 2 must maintain this in API queries.

---

### 2. ON DELETE Semantics — PASS ✅

**Scope:** FK cascade/restrict behavior for referential integrity + security.

**Evidence:**
- `topics.country → countries.code`: **RESTRICT** (line 539) — correct (cannot delete country with topics)
- `event_topics.event → events.id`: **CASCADE** (line 617) — correct (deleting event removes its tags)
- `event_topics.topic → topics.id`: **RESTRICT** (line 623) — correct (cannot delete topic if events reference it)
- `member_interests.topic → topics.id`: **RESTRICT** (line 2224) — correct (cannot delete topic if members interested)

**Security rationale:** RESTRICT on `topics.id` prevents accidental data loss (operator cannot delete a topic that's in use). CASCADE on `event_topics.event` is safe (event deletion should clean up its tags).

**Verdict:** ✅ **PASS** — ON DELETE semantics correct and secure.

---

### 3. Nullable Fields (Migration Phase) — PASS ✅

**Scope:** `member_interests.topic` is nullable in Phase 1.

**Evidence:**
- Line 2211: `"schema":{"is_nullable":true}` — intentional for phased migration.
- Code summary §Key Design Decisions #2 documents rationale: "Existing `member_interests` rows have `topic_tag` set but `topic` NULL — making `topic` NOT NULL immediately would violate constraint."
- Migration plan §3 documents 5-step migration order (add nullable FK → backfill → verify zero NULLs → drop topic_tag → alter to NOT NULL).

**Security rationale:** Nullable FK during migration is not a security risk (Phase 2 backfill will populate all rows; Phase 3 will enforce NOT NULL after verification). No data loss path.

**Verdict:** ✅ **PASS** — Nullable field justified by migration strategy, NOT a security flaw.

---

### 4. Backfill Script SQL Injection — PASS ✅

**Scope:** Assess `backfill-member-interests-topic.sh` for SQL injection risks.

**Evidence:**
- Script uses Directus REST API, NOT raw SQL (lines 27-32, 48-65).
- All API calls use jq for JSON construction:
  - Line 29: `filter[topic][_null]=true` — static query param
  - Line 54: `filter[slug][_eq]=${normalized}&filter[country][_eq]=${member_country}` — URL-encoded by curl (Directus SDK parses these, not raw SQL)
  - Line 59: `--data "{\"topic\":\"${topic_id}\"}"` — JSON value (Directus validates UUIDs, not executable)
- No `psql` / `pg_query` / string concatenation into SQL.

**Security rationale:** Directus REST API is the safe abstraction layer (parameterized queries under the hood). The backfill script operates at API level, not DB level.

**Verdict:** ✅ **PASS** — No SQL injection risk (uses REST API, not raw SQL).

---

### 5. Backfill Orphan Handling — PASS ✅

**Scope:** How backfill script handles unmatched `topic_tag` values.

**Evidence:**
- Lines 33-38: deletes `member_interests` rows with NULL `topic_tag` (logs warning).
- Lines 44-50: deletes rows where member has no country (logs warning).
- Lines 67-72: deletes rows where `topic_tag` has no matching `topics.slug` (logs warning).
- Line 78: reports `orphaned` count at end (operator MUST verify = 0 per Impact Analysis).

**Security rationale:** Deleting orphans is safer than leaving dangling FKs. Impact Analysis §Data Migration Strategy states "expected orphans: 0" — if actual orphans > 0, the backfill script will surface this to the operator (line 78-80 warning).

**Verdict:** ✅ **PASS** — Orphan handling correct (delete + log + report count).

---

### 6. Secrets in Code — PASS ✅

**Scope:** Grep for hardcoded secrets.

**Evidence:**
- Backfill script lines 12-13: uses env vars `DIRECTUS_URL` and `DIRECTUS_TOKEN` (not hardcoded).
- bootstrap.sh changes: no secrets (only schema JSON + seed data).
- No `password`, `secret`, `apiKey`, `Bearer` literals in diff (manual grep confirmed).

**Verdict:** ✅ **PASS** — No secrets in code.

---

### 7. Idempotency and Re-run Safety — PASS ✅

**Scope:** Can bootstrap.sh be re-run without data corruption?

**Evidence:**
- Lines 542-560 (`seed_topic` function): checks existence via GET before POST (logs "✓ topic uz/ai-ml (exists)" if already seeded).
- Lines 505-539 (`ensure "collection topics"`): Directus SDK's `ensure` pattern checks existence (same as `seed_country`, `seed_type` in existing bootstrap.sh).
- Backfill script line 28: `filter[topic][_null]=true` — only processes rows that haven't been backfilled yet (safe to re-run).

**Verdict:** ✅ **PASS** — Idempotent re-run safe.

---

### BLOCKER Findings

**None.**

---

### MAJOR Findings

**None.**

---

## Phase 2 Security Debt (Out of Scope for This PR)

These items are flagged in Impact Analysis and MUST be addressed in Phase 2 (wf-20260803-feat-203):

1. **Missing `InternalAuthGuard` on `/v1/internal/announce-event`** (BLOCKER severity in Impact Analysis §Security Risks).
   - Phase 2 must apply bearer token authentication.
   - Tracked separately; not a flaw in this PR (endpoint doesn't exist yet).

2. **Cross-tenant topic leak protection** (MAJOR severity in Impact Analysis).
   - Phase 2 API endpoints MUST filter `topics` queries by `request.user.country`.
   - Example (Phase 2 code, not this PR):
     ```typescript
     const topics = await directus.items('topics').readByQuery({
       filter: { country: { _eq: req.user.country } }
     });
     ```

3. **Directus Flow validation** (AC-1 "at least one topic required on publish").
   - Phase 1 does NOT provision this hook (bootstrap.sh limitation).
   - Phase 2 must create Directus Flow or separate `flows-bootstrap.sh`.
   - Not a security issue (just a business rule gap).

4. **API input validation** (INV-4 deferred).
   - Phase 2 endpoints must apply Zod validation at controller boundaries.

5. **Rate limiting** (INV-6 deferred).
   - Phase 2 `/v1/internal/announce-event` must have rate limit applied.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-EVT-007 Phase 1 security review complete: 4 applicable invariants PASS, 0 BLOCKER/MAJOR findings, tenant isolation enforced at schema level, ON DELETE semantics correct, no secrets in code, backfill script safe, idempotent. Phase 2 security debt tracked separately (InternalAuthGuard, cross-tenant filtering, API validation)."
  findings:
    - "✅ INV-1 (Tenant isolation): topics.country FK enforces country scoping, backfill script filters by member.country"
    - "✅ INV-2 (Secrets): no hardcoded secrets, uses DIRECTUS_URL + DIRECTUS_TOKEN env vars"
    - "✅ INV-5 (No cross-schema queries): all changes within Directus schema"
    - "✅ INV-9 (No N+1 queries): seed_topic checks existence before creating"
    - "✅ ON DELETE semantics: RESTRICT on topics FKs (prevent accidental deletion), CASCADE on event_topics.event (safe cleanup)"
    - "✅ Nullable member_interests.topic: justified by phased migration (backfill in Phase 2, NOT NULL in Phase 3)"
    - "✅ Backfill script: uses Directus REST API (no SQL injection risk), handles orphans safely (delete + log + report count)"
    - "✅ Idempotency: bootstrap.sh seed_topic checks existence, backfill script only processes NULL topic rows"
    - "⚠ Phase 2 must enforce: InternalAuthGuard on /v1/internal/announce-event (BLOCKER), cross-tenant filtering on API (MAJOR), Zod validation, rate limiting"
  blockers: []
  retry_recommended: false
```

---

## Reviewer Notes

**This is a schema-only PR** (Directus bootstrap.sh + backfill script). 7 of 11 security invariants are N/A (no API/Bot/Web code). The 4 applicable invariants all PASS. Phase 2 will introduce API endpoints — those MUST be reviewed against the full 11-invariant checklist at that time.

**Manual verification recommended** (not blocking):
1. Run `bash infrastructure/directus/bootstrap.sh` against fresh Directus container.
2. Verify `/admin/content/topics` has 24 rows (8 × 3 countries).
3. Verify `/admin/settings/data-model/member_interests` shows new `topic` field (uuid, nullable, FK to topics).
4. Spot-check one topic row: confirm `country` FK resolves to country name in Admin UI.

**No code review blockers. Ready to proceed to test design (Step 5).**
