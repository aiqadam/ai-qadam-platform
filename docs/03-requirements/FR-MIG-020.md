---
code: FR-MIG-020
name: /onboard + /welcome/[slug] — new-member flow
status: Implemented
module: Migration (MIG)
phase: Rebuild M3
---

## Description
The Telegram acquisition funnel entry point. New members arriving from a Telegram invite link land on `/welcome/[slug]`, complete the onboarding form, and are redirected to `/onboard`.

## Users
New members completing first-time onboarding.

## Functional scope
1. `pages/welcome/[slug].astro` — per-source welcome page (UTM context + community intro). CTA: "Join AI Qadam". Slug maps to a UTM campaign; page content comes from Directus.
2. `pages/onboard.astro` — multi-step onboarding form: (1) profile basics (name, location, job title), (2) skills + interests (`<SkillTagger>`), (3) consent + AUP.
3. POST `/v1/onboard` on completion → creates member profile + awards first-join points.
4. Redirect to `/me` on success.
5. AuthGate on `/onboard` (must be signed in to complete).

## Acceptance criteria
- [ ] `/welcome/[slug]` renders with correct CTA for the given slug.
- [ ] Onboarding form collects all three steps before submitting.
- [ ] Completing onboarding creates the member profile and redirects to `/me`.
- [ ] Revisiting `/onboard` after completion redirects to `/me` (already onboarded).
- [ ] `pnpm arch:check` + `astro check` + `pnpm build` pass.

## Notes
- v1 reference: `apps/web/src/pages/onboard.astro` + `welcome/[slug].astro` + `OnboardingForm.tsx`.
- `<SkillTagger>` block already exists in web-next.
- Related: FR-USR-001 (signup / first-time experience).
