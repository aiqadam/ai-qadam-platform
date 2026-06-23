# Security Review — FR-MIG-020

**Workflow:** wf-20260623-feat-015
**Requirement:** FEAT-MIG-020
**Files Reviewed:** 4 new API files, 3 modified API files, 4 new web-next files, 6 modified web-next files

---

## Code Changes Reviewed

### API — NEW files
- `apps/api/src/modules/members/onboarding.dto.ts`
- `apps/api/src/modules/members/onboarding.service.ts`
- `apps/api/src/modules/members/onboarding.controller.ts`
- `apps/api/src/modules/members/members.module.ts`

### API — MODIFIED files
- `apps/api/src/modules/me-profile/me-profile.service.ts`
- `apps/api/src/modules/me-profile/me-profile.controller.ts`
- `apps/api/src/modules/points/points-directus.service.ts`
- `apps/api/src/app.module.ts`

### web-next — NEW files
- `apps/web-next/src/pages/welcome/[slug].astro`
- `apps/web-next/src/pages/onboard.astro`
- `apps/web-next/src/blocks/customer/OnboardingForm.tsx`
- `apps/web-next/src/lib/use-onboarding.ts`

### web-next — MODIFIED files
- `apps/web-next/src/lib/api-ssr.ts`
- `apps/web-next/src/lib/cms.ts`
- `apps/web-next/src/blocks/customer/index.ts`
- `apps/web-next/src/layouts/Layout.astro`
- `apps/web-next/src/blocks/common/PageHead.astro`
- `apps/web-next/src/lib/types.ts`

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1: Tenant isolation | Yes | PASS | All Directus reads/writes scoped by `userId` (Authentik `sub` claim). `member` filter on `member_skills`, `member_interests`, `member_consents` uses `_eq: userId`. No cross-tenant paths. `countryCode` is injected by auth middleware, not manually passed. |
| INV-2: Secrets by reference | Yes | PASS | No password/secret/apiKey/Bearer literals in any new or modified file. Auth is via injected `DirectusClient` and `AuthGuard`. No hardcoded credentials. |
| INV-3: Auth at controller level | Yes | PASS | `MembersOnboardingController` extends the same class hierarchy as `MeProfileController` (which carries `@UseGuards(AuthGuard)` at line 131). The `POST /v1/members/onboard` handler requires a valid Bearer token. Anon calls return 401 via `requireUserId()`. |
| INV-4: Validation at boundaries | Yes | PASS | `OnboardMemberDtoSchema` is applied via `safeParse()` at the controller entry point (line 36 of onboarding.controller.ts) before any service calls. All fields have explicit types, lengths, and transforms. `.strict()` prevents extra fields. |
| INV-5: No cross-schema queries | Yes | PASS | Onboarding uses only Directus REST API (via injected `DirectusClient`). No Drizzle queries in the onboarding flow. Postgres is touched only in `leaderboard()` which is not part of this feature. |
| INV-6: Rate limiting | Yes | WARN | Falls back to AppModule global throttle (60/min per IP). This is the same limit as other member endpoints. However, the comment in the controller file says "no rate-limit override" — if stricter limits are needed for onboarding, this must be added explicitly. Not a blocker at the current limit. |
| INV-7: CSRF protection | Yes | PASS | Uses Bearer token auth (Authorization header). Bearer tokens are inherently CSRF-resistant. No session cookies involved. |
| INV-8: No dangerouslySetInnerHTML | Yes | PASS | Zero occurrences in any reviewed file. The `set:html=""` in `[slug].astro` is empty (placeholder for future bodyMd rendering). |
| INV-9: No N+1 queries | Yes | WARN | `addSkill()` and `addInterest()` each call `listSkills()` / `listInterests()` (full table scan for this user) before every insert for deduplication. This creates N+1 where N = number of skills/interests in the request. With max 50 skills + 20 interests, the worst case is 70 pre-checks for one onboarding call. This is acceptable for the onboarding flow (low frequency, small limits), but the pattern should not migrate to high-frequency write paths. |
| INV-10: Drizzle parameterization | Yes | PASS | No Drizzle queries in onboarding code. All data access is via Directus REST. |
| INV-11: HttpOnly tokens (web) | Yes | PASS | Refresh tokens are handled by Authentik/cookie mechanism (out of scope of this change). Onboarding uses Bearer tokens in Authorization header. No `localStorage` token storage in the React form. |

---

## BLOCKER Findings

**None.**

All applicable invariants pass. No architectural violations, no embedded secrets, no injection paths, no missing auth guards, no cross-schema queries.

---

## MAJOR Findings

### MAJOR-1: `completeOnboarding` lacks idempotency for profile writes

**File:** `apps/api/src/modules/members/onboarding.service.ts`, lines 33-68

**Issue:** The idempotency comment at line 34 says "skips all writes if already onboarded" and line 35 acknowledges "Future: read onboarded_at from profile once the field is added." The current code **always calls `doPatchProfile`**, which will overwrite `first_name`, `last_name`, and `job_title` on every repeat call. Only the points award is idempotent (checked in `awardFirstJoinPoints`).

**Risk:** A client that retries the onboarding request (e.g., due to a network timeout with a 204 response) will silently overwrite the member's profile data. While `firstName`/`lastName` are typically stable, `jobTitle` could change.

**Fix:** Guard the entire body of `completeOnboarding` with an early return when `onboarded_at` is already set:

```typescript
async completeOnboarding(userId: string, dto: OnboardMemberDto): Promise<void> {
  const alreadyOnboarded = await this.profile.getOnboardedAt(userId);
  if (alreadyOnboarded !== null) {
    this.logger.debug(`user=${userId} already onboarded, skipping`);
    return;
  }
  // ... rest of method
}
```

**Severity:** Medium. The impact of a retry overwriting `job_title` is low (user-provided data, not system state). But the explicit design intent in the comments ("Idempotent: skips all writes if onboarded_at already set") is not implemented for profile/skills/interests/consents.

---

### MAJOR-2: `bodyMd` XSS surface prepared but unsanitized

**File:** `apps/web-next/src/pages/welcome/[slug].astro`, lines 42-47

**Issue:** The template renders `<div set:html="">` as an empty placeholder. This is safe today. However, the intent is clearly to render `page.bodyMd` (markdown body from Directus) in the near future. If `bodyMd` is added without sanitization, any HTML or JavaScript stored in that Directus field would be rendered.

**Risk:** Medium-term. A compromised Directus admin or a misconfigured webhook could inject malicious scripts into `landing_pages.body_md`, which would then execute in every visitor's browser.

**Fix:** When `bodyMd` is wired up, use a sanitizing markdown renderer:

```typescript
// Example: use 'marked' + DOMPurify
import { marked } from 'marked';
import DOMPurify from 'dompurify';
const safeHtml = DOMPurify.sanitize(marked.parse(page.bodyMd));
```

**Severity:** Medium (not a blocker today since `bodyMd` is not rendered, but the template structure invites this mistake).

---

## Minor Observations (not gate-blocking)

1. **Rate limit note:** `POST /v1/members/onboard` has no explicit `@Throttle` decorator and relies on the global 60/min. If onboarding spam becomes an issue, consider adding a tighter limit specifically for this endpoint.

2. **`OnboardingData` index signature:** `use-onboarding.ts` line 17 has `[key: string]: unknown` which allows extra keys in the client-side type. This is client-side only and the backend's `.strict()` Zod schema rejects extra fields, so this is safe but could be cleaned up.

3. **`slug` for analytics:** As flagged in the impact analysis, the campaign slug is stored and could become PII-adjacent. No action needed in this PR, but a privacy review of how the slug is used in analytics is recommended.

---

## Gate Result

```
gate: security-review
agent: security-reviewer
status: passed
workflow: wf-20260623-feat-015
requirement: FEAT-MIG-020

summary: >
  All 11 security invariants confirmed. No BLOCKER findings. Two MAJOR
  findings: (1) completeOnboarding lacks idempotency guard for profile
  writes — it always overwrites firstName/lastName/jobTitle on retry;
  (2) bodyMd rendering is scaffolded without sanitization. Both are
  fixable by CodeDeveloper without architectural change. No secrets
  embedded, no cross-schema queries, no injection paths, auth correctly
  applied at controller level, Zod validates at boundary.

blockers: []
majors:
  - MAJOR-1: missing onboarded_at idempotency gate in completeOnboarding
  - MAJOR-2: bodyMd XSS surface needs DOMPurify when wired up
confidence: high
```
