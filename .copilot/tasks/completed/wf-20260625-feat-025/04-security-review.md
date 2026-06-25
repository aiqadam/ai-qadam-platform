# Security Review — FR-MIG-031

**Workflow:** wf-20260625-feat-025
**Agent:** SecurityReviewer
**Date:** 2026-06-25
**Revision:** v2 (post-fix — MAJOR-1 resolved)

---

## Code Changes Reviewed

| File | Change Description |
|---|---|
| `apps/web-next/src/middleware.ts` | Constant swap: `REFRESH_COOKIE_NEXT` → `'aiqadam-refresh'`; `REFRESH_COOKIE_LEGACY` → `'aiqadam-next-refresh'` |
| `apps/web-next/src/layouts/Layout.astro` | Removed `<meta name="robots" content="noindex,nofollow">`. Updated default title/description. Retained `ssrAuthJson` XSS mitigation. |
| `apps/web-next/src/blocks/common/PageHead.astro` | Added OG tags, Twitter card, canonical link, Google Fonts preconnect, Plausible analytics script. |
| `apps/web-next/public/robots.txt` | Replaced `Disallow: /` with `Disallow: /workspace/`, `Disallow: /me/`, `Allow: /`, and sitemap directive. **(Fix applied: MAJOR-1 resolved.)** |
| `apps/web-next/src/pages/auth/signed-out.astro` | Cookie clear order swapped: `aiqadam-refresh` cleared first, `aiqadam-next-refresh` second. |
| `apps/web-next/src/pages/index.astro` | Updated hardcoded title from `"AI Qadam (next)"` to `"AI Qadam"`. |

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 — Tenant isolation | No | N/A | No DB queries touched. All changes are frontend/head/cookie constants. |
| INV-2 — Secrets by reference | Yes | PASS | No password/secret/apiKey/token/Bearer literals in strings, logs, or responses. `INTERNAL_API_URL` is loaded from `process.env`. Cookie names are non-secret identifiers. |
| INV-3 — Auth at controller level | No | N/A | No new controller methods. Middleware-level auth bootstrap unchanged in logic. |
| INV-4 — Validation at boundaries | No | N/A | No new API boundaries, DTOs, or queue consumers introduced. |
| INV-5 — No cross-schema queries | No | N/A | No DB queries. |
| INV-6 — Rate limiting | No | N/A | No new public endpoints. |
| INV-7 — CSRF protection | No | N/A | No new state-changing browser-initiated operations introduced. Cookie clear in `signed-out.astro` is client-side JS on a logout-landing with no form POST. |
| INV-8 — No `dangerouslySetInnerHTML` | Yes | PASS | Zero occurrences in the diff. Astro `set:html` in `Layout.astro` (line 39) is the pre-existing SSR auth injection, not introduced by this PR. |
| INV-9 — No N+1 queries | No | N/A | No DB queries. |
| INV-10 — Drizzle parameterization | No | N/A | No SQL. |
| INV-11 — HttpOnly tokens (web) | Yes | PASS | Refresh tokens are set by the API (`/v1/auth/refresh`) which issues them as HttpOnly cookies. The `signed-out.astro` client-side clear does NOT access `document.cookie` to read the token; it merely writes expiration headers. The middleware forwards the raw `cookie` header to the API — the browser never reads the token value in JS. |

---

## Focused Concern Analysis

### 1. Cookie parity swap — session continuity during 24h overlap window

**Finding:** PASS — No session loss risk.

The `hasRefresh` check (middleware.ts lines 54–57) is an OR across all three names: `aiqadam-refresh`, `aiqadam-next-refresh`, and `__Host-aiqadam-refresh`. This logic was already present before this PR and was not modified. The constant swap only changes which name the middleware labels as "primary" vs. "legacy" in comments and in `signed-out.astro` — it does not remove either name from the acceptance set. A v2 user holding only the old `aiqadam-next-refresh` cookie will still pass `hasRefresh` and their session will continue uninterrupted. The API (`auth.controller.ts` line 52) already uses `aiqadam-refresh` as canonical and has its own overlap logic. The swap is correctly implemented.

**One minor observation (non-blocking):** The `REFRESH_COOKIE_NEXT` / `REFRESH_COOKIE_LEGACY` constant names are now semantically inverted relative to their string values (NEXT now holds the API-canonical name, LEGACY holds the build-aside name). This is acknowledged in the code-summary as deliberate (renaming the constants would require touching `hasRefresh` references). The in-code comment block on lines 1–16 of `middleware.ts` accurately explains the post-cutover semantics. No security risk; clarity concern only.

---

### 2. Plausible analytics — external script load safety and CSP

**Finding:** DEFERRED ADVISORY (pre-existing gap, not introduced by this PR).

The Plausible `<script>` tag (`PageHead.astro` line 46) loads from `https://plausible.io/js/script.js`. This is an external, third-party script executed in the user's browser under the app's origin. Security concerns:

- **CSP `script-src`:** No Content Security Policy header is emitted by the Astro app (`astro.config.mjs` has no security headers configured) and no Traefik middleware applies a CSP header. `security.md` §XSS declares: *"Content Security Policy (CSP) strict, no `unsafe-inline`, no `unsafe-eval`."* This CSP baseline is not implemented anywhere in the application today. This is a pre-existing gap, not introduced by this PR.
- **Impact of the Plausible script specifically:** If a CSP were in place, adding `https://plausible.io` to `script-src` would be required. This PR makes the eventual CSP implementation slightly more complex (one additional allowed source).
- **Plausible itself:** Plausible is an EU-based, open-source, GDPR-compliant analytics tool with no cross-site user tracking. It does not execute user-controlled content. The `data-domain` attribute it reads is a static string literal. The supply-chain risk is real but bounded (Plausible is not a CDN with shared namespace — the script is fetched from Plausible's own infra).

The absence of CSP is a pre-existing architectural gap documented in `security.md` as the baseline expectation. Adding the Plausible script does not worsen the CSP attack surface meaningfully (the app already has no CSP and has `is:inline` scripts). This gap is filed as a deferred advisory below for follow-up tracking.

---

### 3. Google Fonts preconnect — CSP concern

**Finding:** PASS with observation.

`PageHead.astro` adds two `<link rel="preconnect">` tags for `fonts.googleapis.com` and `fonts.gstatic.com`. These are preconnect hints only — they establish a TCP/TLS handshake ahead of time but do not load any content at this point (no `<link rel="stylesheet" href="https://fonts.googleapis.com/...">` is present in the diff). No font data is transferred to the browser from this PR alone.

CSP impact: If a CSP is later added, `connect-src` would need `https://fonts.googleapis.com https://fonts.gstatic.com`. This is a future consideration; the preconnects themselves carry no data-exfiltration or script-injection risk.

---

### 4. robots.txt — operator/workspace page indexability (FIXED)

**Finding:** PASS — Fix verified.

The previous review found that the blanket `Allow: /` permitted crawling of `/workspace/*` and `/me/*` URL trees, disclosing admin URL paths to search engine indexes.

**Verified fix (`apps/web-next/public/robots.txt`):**

```
User-agent: *
Disallow: /workspace/
Disallow: /me/
Allow: /

Sitemap: https://aiqadam.org/sitemap.xml
```

The fix is correct:

1. `Disallow: /workspace/` and `Disallow: /me/` are placed **before** `Allow: /`, which is the correct robots.txt order-of-specificity (more specific rules take precedence over the catch-all).
2. Public pages (events, speakers, home, sign-in, etc.) remain fully indexable via the `Allow: /` catch-all.
3. Operator admin URLs (`/workspace/admin/rbac-sync`, `/workspace/admin/audit`, `/workspace/admin/countries/[code]/provisioning`, etc.) and member account pages (`/me/*`) are now excluded from crawl.
4. No new issues were introduced: the file contains only the three directives and the sitemap pointer — no stray rules, no wildcards, no syntax errors.

MAJOR-1 is **resolved**.

---

### 5. OG tags rendering user-controlled content — XSS risk

**Finding:** PASS.

The `title` and `description` props passed to `<PageHead>` flow into `<meta property="og:title" content={title}>` etc. In Astro's template syntax, values interpolated with `{expr}` inside HTML attribute `content={...}` are HTML-attribute-escaped by the Astro compiler (angle brackets, quotes, ampersands are escaped). There is no `set:html` on these attributes.

The only `set:html` in the reviewed diff is in `Layout.astro` line 39:
```
<script is:inline set:html={`window.__AIQADAM_AUTH__ = ${ssrAuthJson};`} />
```
This is a pre-existing line, not introduced by this PR. It applies `JSON.stringify` and then `.replace(/</g, '\\u003c')` to the auth blob before injection, which is the standard mitigation for JSON-in-`<script>` XSS (prevents `</script>` injection). This pattern is correct.

For `PageHead.astro`: `title` and `description` originate from Astro props set by page authors (trusted code), not from user-generated content in the database. Even if a title were sourced from a CMS field, Astro's attribute escaping prevents HTML injection in `content={...}` attributes. No XSS vector exists.

---

### 6. signed-out.astro cookie clear order change

**Finding:** PASS.

The reordering of client-side cookie clears (`aiqadam-refresh` first, `aiqadam-next-refresh` second) is correct post-cutover behavior. Both clears always execute — the second line does not depend on the first succeeding. The `Max-Age=0` approach correctly expires cookies without exposing their values (no `document.cookie` read, no value echoed).

The page retains `<meta name="robots" content="noindex,nofollow">` (line 31), which is intentional and correct — the logout landing page should not be indexed.

One observation (pre-existing, non-blocking): neither clear sets `Secure` or `SameSite=Strict`. The existing clears use `SameSite=lax` with no `Secure` flag. For `aiqadam-refresh` specifically, which is the HttpOnly session cookie set by the API, the client-side JS clear will only succeed if the API-issued cookie is NOT HttpOnly. If the API issues the refresh cookie as HttpOnly (as it should per INV-11 and security.md), the client-side JS clear has no effect on it — the actual revocation must come from the server-side logout flow (Authentik RP-Initiated Logout). This is pre-existing behavior; the JS clear is a belt-and-suspenders defense only. No regression introduced.

---

## BLOCKER Findings

None.

---

## MAJOR Findings

None (MAJOR-1 resolved; MAJOR-2 reclassified as deferred advisory below).

---

## Deferred Advisories

### ADVISORY-1: CSP not implemented (pre-existing gap)

**File:** No single file — architectural gap.

**Problem:** `security.md` §XSS requires: *"Content Security Policy (CSP) strict, no `unsafe-inline`, no `unsafe-eval`."* No CSP header is emitted anywhere in `apps/web-next/`. Adding the external Plausible script without a CSP means the browser applies no `script-src` restriction.

This gap pre-exists this PR. The Plausible script is not the cause, but it makes eventual CSP configuration marginally more complex (one additional allowed origin).

**Recommended follow-up action:** Create a new issue/FR to implement Traefik-level CSP middleware (or Astro middleware header injection) covering at minimum: `script-src 'self' https://plausible.io 'unsafe-inline'` (the `unsafe-inline` constraint is forced by Astro's `is:inline` scripts and the `window.__AIQADAM_AUTH__` injection), `connect-src 'self' https://plausible.io https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`, `img-src 'self' data: https:`.

**Status:** Deferred — must be addressed before FQDN flip sends real user traffic to `aiqadam.org`. This PR is not blocked.

---

## Gate Result

```yaml
gate_result:
  agent: security-reviewer
  workflow_instance_id: wf-20260625-feat-025
  status: passed
  summary: >
    All MAJOR findings resolved. MAJOR-1 (robots.txt crawl exposure) has
    been fixed: Disallow: /workspace/ and Disallow: /me/ are now in place
    before the catch-all Allow: /, preventing operator and member URL trees
    from being indexed. The fix is correctly ordered and introduces no new
    issues. All other checks pass: cookie parity swap preserves the 24h
    overlap window correctly; OG tags are Astro-escaped with no XSS risk;
    ssrAuthJson injection uses the correct </script> escape mitigation;
    signed-out.astro cookie clear order is correct; Plausible script is a
    known-safe analytics provider. The pre-existing CSP absence (ADVISORY-1)
    is deferred — it is not introduced by this PR and must be addressed
    before FQDN flip in a dedicated follow-up. Security gate: PASSED.
  blockers: []
  majors: []
  deferrals:
    - id: ADVISORY-1
      description: "CSP headers not implemented (pre-existing gap, not introduced by this PR)"
      file: "apps/web-next/astro.config.mjs (or Traefik middleware)"
      action: "Create follow-up FR to implement CSP before FQDN flip"
      blocking: false
```
