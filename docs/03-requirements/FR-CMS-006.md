---
code: FR-CMS-006
name: UTM URL builder (operator tool)
status: Shipped
module: CMS / Content (CMS)
phase: Phase 1 (V1)
---

## Description

Operators have an in-browser UTM URL builder at `/marketing/url-builder`. It generates trackable links with validated UTM parameters for use in Telegram posts, email campaigns, and social media. The tool enforces the platform's canonical UTM scheme to maintain attribution data quality.

## Users

Organizers, Country Admins, Super Admin.

## Functional scope

1. **Route** — `/marketing/url-builder` (SSG, public — intended for operators but currently unrestricted). `UtmUrlBuilder` React island.
2. **Fields** — Base URL, `utm_source`, `utm_medium` (dropdown of 13 canonical values), `utm_campaign`, `utm_term` (optional), `utm_content` (optional).
3. **Validation** — Per-field: lowercase, `a-z0-9_-` only, max 64 chars, no leading/trailing/double hyphens, no `{placeholder}` literals. `utm_medium` must be one of the 13 canonical mediums. Invalid fields shown with inline error.
4. **Live preview** — Final URL displayed as the user types; copy-to-clipboard button.
5. **Canonical mediums** — `email`, `telegram`, `social_organic`, `social_paid`, `referral`, `partner`, `qr`, `event`, `press`, `direct`, `organic_search`, `paid_search`, `other`.

## Acceptance criteria

- [ ] Building a URL with all required fields produces a valid UTM-encoded URL.
- [ ] Selecting a non-canonical `utm_medium` via a text input is rejected with a validation error.
- [ ] The copy button copies the final URL to the clipboard.
- [ ] Invalid characters in any UTM field trigger an inline validation error.
- [ ] The live preview URL updates on every keystroke without lag.

## Notes

- This is a pure client-side tool (no API calls). All validation runs in the browser via `lib/utm.ts`.
- The canonical UTM scheme is defined in `lib/utm.ts` and must be kept in sync with Plausible's analytics dashboards.
- Page should be gated to operator role in V2 (currently public in V1 — `web-v1-feature-surface.md` notes "currently public, intended operator later").
