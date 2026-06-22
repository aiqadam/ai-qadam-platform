---
code: FR-MIG-022
name: /events/[id]/survey + /feedback/csat + /leads/* pages
status: Not Started
module: Migration (MIG)
phase: Rebuild M3
---

## Description
Six short-form conversion and feedback pages. All are either post-event flows or lead-magnet landing pages — low-complexity, high-business-value.

## Users
Members completing post-event surveys; leads converting from marketing.

## Functional scope
1. `pages/events/[id]/survey.astro` — post-event survey form (renders a specific form schema linked to the event). Tokenized URL (`?t=<token>`).
2. `pages/feedback/csat.astro` — standalone CSAT (1–5 + comment). Tokenized URL.
3. `pages/leads/thank-you.astro` — lead-magnet conversion confirmation page.
4. `pages/leads/verified.astro` — email-verified lead confirmation.
5. `pages/leads/verify-failed.astro` — verification failure with retry CTA.
6. All tokenized pages: validate token server-side; show "link expired" if invalid.

## Acceptance criteria
- [ ] Survey page renders the correct form for the event's linked survey form slug.
- [ ] CSAT submission saves a rating + comment via POST.
- [ ] Expired token shows "This link has expired" without a stack trace.
- [ ] All three leads pages render correctly with no auth requirement.
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/events/[id]/survey.astro`, `feedback/csat.astro`, `leads/*.astro`.
- Tokenized URL handling: validate `?t=` param in Astro frontmatter, redirect to error view if invalid.
- Related: FR-EVT-006 (post-event survey), FR-REG-001 (registration leads into thank-you).
