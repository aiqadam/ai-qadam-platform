# Security Review: FR-MIG-018

**Workflow:** `wf-20260623-feat-011` (requirement-development)
**Agent:** SecurityReviewer
**Date:** 2026-06-23

---

## Code Changes Reviewed

| File | Change Type |
|------|-------------|
| `apps/web-next/src/lib/types.ts` | Modified |
| `apps/web-next/src/lib/use-access-log.ts` | Created |
| `apps/web-next/src/lib/use-referrals.ts` | Created |
| `apps/web-next/src/blocks/customer/AccessLogTable.tsx` | Created |
| `apps/web-next/src/blocks/customer/ReferralDashboard.tsx` | Created |
| `apps/web-next/src/blocks/customer/index.ts` | Modified |
| `apps/web-next/src/pages/me/index.astro` | Created |
| `apps/web-next/src/pages/me/preferences.astro` | Created |
| `apps/web-next/src/pages/me/access-log.astro` | Created |
| `apps/web-next/src/pages/me/referrals.astro` | Created |

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|-----------|------------|--------|-------|
| INV-1: Tenant isolation | No | N/A | Frontend-only; data is self-only (member accessing own data). Backend enforces scoping. |
| INV-2: Secrets by reference | No | N/A | No secrets, passwords, API keys, or Bearer tokens in any of the 10 files. |
| INV-3: Auth at controller level | No | N/A | Verified by ImpactAnalyzer: all four backend endpoints use `AuthGuard`. |
| INV-4: Validation at boundaries | No | N/A | All API calls go through existing typed endpoints; no new endpoints created. |
| INV-5: No cross-schema queries | No | N/A | Frontend-only implementation. |
| INV-6: Rate limiting | No | N/A | No new public endpoints. |
| INV-7: CSRF protection | No | N/A | No state-changing operations (POST/PUT/PATCH/DELETE). All data fetches via TanStack Query (GET). |
| INV-8: No `dangerouslySetInnerHTML` | Yes | PASS | Zero occurrences in all 10 reviewed files. React escapes by default. `shareUrl` rendered via `{code.shareUrl}` in JSX `href` attribute and child text only — safe. |
| INV-9: No N+1 queries | Yes | PASS | TanStack Query hooks manage data fetching; blocks don't issue queries inside loops. |
| INV-10: Drizzle parameterization | No | N/A | Frontend-only implementation. |
| INV-11: HttpOnly tokens (web) | Yes | PASS | `api-client.ts` holds access token in module-scope variable (memory only, not localStorage). Refresh cookie handled by API contract (HttpOnly + Secure). Confirmed at line 40: `let accessToken: string \| null = null;`. |

---

## BLOCKER Findings

None.

---

## MAJOR Findings

None.

---

## Additional Security Observations

1. **AuthGate protection**: All four Astro pages correctly wrap content with `<AuthGate>` (sign-in redirect for anonymous users).

2. **API endpoint scoping**: All four hooks (`useMyAccessLog`, `useMyReferralCodes`, `useMyReferralStats`, `ConsentList`) query self-only data. Backend filters by `req.user.sub`.

3. **No IP exposure**: Correctly excludes IP addresses from self-view per ADR-0033 (`AccessLogEvent` type has no IP field).

4. **Clipboard API safety**: `ReferralDashboard` uses `navigator.clipboard.writeText()` with try/catch for insecure contexts — appropriate fallback (silently ignores if unavailable).

5. **Referral URL rendering**: `shareUrl` is rendered as:
   - JSX `href` attribute: `<a href={code.shareUrl}>` — browser handles URL encoding
   - Child text: `{code.shareUrl}` — React escapes, no XSS risk

6. **Event label mapping**: `EVENT_LABELS` in `AccessLogTable` is a hardcoded Record, preventing injection via event name from API.

7. **No user-generated content rendering**: No markdown rendering, no rich text, no user-submitted HTML in these files.

8. **ConsentList pre-existing**: The `ConsentList` block (used by preferences.astro) is not new in this PR; assumed already reviewed.

---

## Gate Result

```
gate: security-reviewer
status: passed
timestamp: 2026-06-23T15:35:00Z
workflow_id: wf-20260623-feat-011
artifact: .copilot/tasks/active/wf-20260623-feat-011/04-security-review.md

summary: |
  FR-MIG-018 is a pure frontend migration with no new API endpoints,
  no backend changes, and no new secrets. All 10 files reviewed.
  Key security properties confirmed: AuthGate on all pages, memory-only
  access token storage, zero dangerouslySetInnerHTML, no secrets in
  code, self-only data access via existing AuthGuard-protected endpoints.

invariant_results:
  INV-8_dangerouslySetInnerHTML: passed
  INV-9_no_n_plus_1: passed
  INV-11_http_only_tokens: passed

blockers: 0
major_findings: 0

recommendation: proceed to next workflow step
```
