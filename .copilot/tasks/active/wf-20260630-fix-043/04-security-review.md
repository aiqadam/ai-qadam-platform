# Security Review — ISS-UAT-013-9

**Workflow:** wf-20260630-fix-043
**Agent:** SecurityReviewer
**Date:** 2026-06-30

---

## Code Changes Reviewed

| File | Change Description |
|---|---|
| `apps/api/src/modules/leads/leads.service.ts` | Added early-return guard: `if (existing?.email_verified)` → `return { status: 'already_verified', userId: existing.id }`. Extended `CreateLeadResult.status` union. |
| `apps/api/test/leads-service.spec.ts` | Added 1 new `it()` regression test block. |

---

## Invariant Check Results

| Invariant | Result | Notes |
|---|---|---|
| Tenant isolation | Pass | No new queries; guard does less work, not more |
| Secrets logging | Pass | Only DB-generated UUID logged; email not present in new log line |
| Auth at controller | Pass | Endpoint intentionally public; guard does not change auth posture |
| Validation at boundaries | Pass | Zod validation at controller precedes this guard |
| No cross-schema queries | Pass | Single GET /users via Directus HTTP client |
| Rate limiting | Advisory (pre-existing) | Gap pre-dates this fix; tracked in roadmap |
| CSRF | N/A | JSON API, no cookie-based state change |
| N+1 queries | Pass | Early return adds zero additional queries |

---

## Specific Findings

### Truthy-safety on `email_verified: null`

`if (existing?.email_verified)` — truthy table:
- `true` → early return (correct — address IS verified)
- `false` → falls through (correct)
- `null` → falls through (correct — treat unknown as unverified)
- `undefined` → falls through (correct)
- `existing === null` → `?.` short-circuits, falls through (correct)

### Status information leakage

Controller at `leads.controller.ts` calls `await this.leads.create(...)` and ignores return value. HTTP callers always receive `{ accepted: true }`. No internal status is leaked.

### Logger injection

`${existing.id}` is a DB-generated UUID fetched from Directus, not from user-supplied input. No injection risk.

---

## OWASP Top 10 (changed lines only)

All categories: **Pass** — guard restricts processing (does less), no new dependencies, no crypto, no SQL, UUID logged (not user input), no serialization changes.

---

## Advisory (non-blocking, pre-existing)

**ADVISORY-1:** Rate limiting not yet implemented on `POST /v1/leads`. Pre-dates this fix. Tracked in roadmap (Phase ζ, BullMQ). Out of scope.

---

## Gate Result

```yaml
gate_result:
  agent: security-reviewer
  workflow_instance_id: wf-20260630-fix-043
  status: passed
  summary: >
    All invariants checked. No BLOCKER or MAJOR findings. Guard is truthy-safe,
    does not leak status to HTTP callers, logs only DB-generated UUID. One
    pre-existing advisory (rate limiting) noted but out of scope.
```

Gate: passed
