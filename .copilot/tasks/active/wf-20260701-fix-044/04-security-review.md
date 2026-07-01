# 04-security-review — wf-20260701-fix-044 (ISS-LEAD-DISC-001)

**Recorded:** 2026-07-01
**Author:** SecurityReviewer

## Summary

**All 11 standard invariants (INV-1..INV-11) and all 10 task-specific invariants pass.** The diff is template + JSON only: a section reorder in `index.astro`, one new `id="newsletter"` anchor, one inline `scroll-margin-top: 72px`, one new nav link `href="/#newsletter"`, and two new locale keys. No controller, service, DTO, query, schema, dependency, or auth surface is touched. `LeadCaptureForm.tsx` is byte-identical to `main`; honeypot remains off-screen with `tabIndex={-1}` + `aria-hidden`. No `dangerouslySetInnerHTML` in `Nav.astro`. The new href is fragment-only, not a parameter — no XSS vector. No `/newsletter` route exists. **Zero BLOCKER, zero MAJOR findings. Gate: `passed`.**

## Code Changes Reviewed

| File | Verified by | Diff summary |
|---|---|---|
| `apps/web/src/pages/index.astro` | direct read + `git diff main` | One `<section>` block moved up; `id="newsletter"` + `scroll-margin-top: 72px` added inline; old-position block removed. |
| `apps/web/src/components/Nav.astro` | direct read + `git diff main` | One `<a href="/#newsletter">` line inserted between Leaderboard and Sign-in. |
| `apps/web/src/locales/en.json` | direct read + `git diff main` | One new flat key `nav.get_updates: "Get updates"`. |
| `apps/web/src/locales/ru.json` | direct read + `git diff main` | One new flat key `nav.get_updates: "Новости"`. |
| `apps/web/src/components/LeadCaptureForm.tsx` | direct read (not in diff) | Byte-identical to `main`. Honeypot field intact. |
| `apps/web/src/layouts/Layout.astro` | direct read (not in diff) | Byte-identical to `main`. Auth-blob injection unchanged. |

## Task-specific invariant evidence

| # | Invariant | Result | Evidence |
|---|---|---|---|
| 1 | Tenant isolation | ✅ | `id="newsletter"` is a DOM attribute, no data. Nav `href="/#newsletter"` is hash-only. Section renders inside tenant-scoped `<main>`. |
| 2 | Auth enforcement | ✅ | No controller modified. Nav anchor initiates no HTTP request. |
| 3 | Zod / class-validator contract byte-identical | ✅ | `LeadCaptureForm.tsx` not in diff; POST body shape unchanged. |
| 4 | No secrets in code | ✅ | Diff has zero `password`/`secret`/`apiKey`/`token`/`Bearer` literals. |
| 5 | No cross-schema queries | ✅ | No SQL touched. |
| 6 | Rate limiting | ✅ | No new endpoint; `POST /v1/leads` rate limit unchanged. |
| 7 | CSRF protection | ✅ | No new state-changing browser op; nav anchor is GET-equivalent. |
| 8 | XSS in nav | ✅ | `grep_search "dangerouslySetInnerHTML"` → 0 matches in `Nav.astro`. New href is fragment-only. i18n values contain no HTML metacharacters. |
| 9 | Honeypot integrity | ✅ | `LeadCaptureForm.tsx` not in diff. Lines 212–218 still have `tabIndex={-1}`, `aria-hidden="true"`, and off-screen positioning. |
| 10 | No `id="newsletter"` collision | ✅ | `file_search apps/web/src/pages/newsletter*` → 0 matches. `grep_search id="newsletter"` → exactly 1 (the section itself). `grep_search href="/#newsletter"` → exactly 1 (the new nav link). No Astro route, no API handler under that path. |

## Canonical invariant table

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | Yes | **Pass** | Anchor is a DOM attribute; nav href is hash-only; section renders inside tenant-scoped `<main>`. |
| INV-2 Secrets by reference | Yes | **Pass** | Zero secret-like literals in diff. |
| INV-3 Auth at controller level | Yes | **Pass** | No controller modified; nav anchor issues no HTTP request. |
| INV-4 Validation at boundaries | Yes | **Pass** | `LeadCaptureForm.tsx` byte-identical, POST body shape unchanged. |
| INV-5 No cross-schema queries | Yes | **Pass** | No SQL touched. |
| INV-6 Rate limiting | Yes | **Pass** | No new endpoint. |
| INV-7 CSRF protection | Yes | **Pass** | No new state-changing browser op. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | **Pass** | Zero matches in changed files; Astro text interpolation is auto-escaped. |
| INV-9 No N+1 queries | Yes | **Pass** | No new query at all. |
| INV-10 Drizzle parameterization | Yes | **Pass** | No SQL surface touched. |
| INV-11 HttpOnly tokens | Yes | **Pass** | No token storage changed. |

## BLOCKER Findings

**None.**

## MAJOR Findings

**None.**

## MINOR / Informational

- Nav copy `"Get updates"` / `"Новости"` is a UX/branding decision — flagged by ImpactAnalyzer and CodeDeveloper, not a security concern.
- Above-the-fold claim is a stacked-padding estimate. TestDesigner / TestRunner must confirm with Playwright bounding-box assertions. Out of scope for security review.

## Honesty Disclosure

- I read all four changed files directly and compared against `git diff main`. Diff is small enough to read in full.
- I did **not** run `astro check` / `biome check` myself — the diff is template + JSON only, and the CodeDeveloper reports 0 errors / 0 warnings on the changed files. TestRunner will re-run in step 5.
- I did **not** fire a `POST /v1/leads` myself — AC-4 / AC-5 verification belongs to TestRunner. This review is about the diff itself, not runtime behaviour of unchanged code.
- **There is genuinely nothing to flag.** This is the smallest possible discoverability fix.

## Gate Result

```yaml
gate_result:
  status: passed
  gate_name: security_review
  decided_at: "2026-07-01T20:22:00Z"
  decided_by: security_reviewer
  retry_count: 0
  notes: >-
    All 11 standard invariants (INV-1..INV-11) and all 10 task-specific
    invariants pass. The diff is template + JSON only: a section reorder
    in index.astro, one new id="newsletter" anchor, one inline
    scroll-margin-top: 72px, one new nav link href="/#newsletter", and
    two new locale keys (en: "Get updates", ru: "Новости"). No controller,
    service, DTO, query, schema, dependency, or auth surface is touched.
    LeadCaptureForm.tsx is byte-identical to main; honeypot remains
    off-screen with tabIndex=-1 + aria-hidden. No dangerouslySetInnerHTML
    anywhere in Nav.astro. The new href is a fragment-only URL, not a
    parameter — no XSS vector. No /newsletter route exists to collide with
    the in-page anchor. Zero BLOCKER, zero MAJOR findings.
```
