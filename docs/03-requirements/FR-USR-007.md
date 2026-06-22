---
code: FR-USR-007
name: Public member profile (/u/[handle])
status: Shipped
module: Users (USR)
phase: Phase 1 (V1)
---

## Description

Every member has a public profile page at `/u/<handle>`. It shows their professional identity, community stats, activity heatmap, recent events, and badges. Visibility of each section is controlled by the member's own privacy settings (FR-USR-002).

## Users

Public (any visitor); the page is indexed by search engines.

## Functional scope

1. **Route** — `/u/[handle]` (SSR, `prerender=false`). Returns `404` redirected to `/leaderboard` when handle not found.
2. **Profile card** — Avatar (initials fallback), display name, role, bio, job title (if `show_job_title=true`), employer (if `show_employer=true`), location (if `show_location=true`), LinkedIn / GitHub links (if respective toggles enabled).
3. **Community stats** — 3 stat cards: events registered, events attended, points total.
4. **52-week activity heatmap** — GitHub-style activity grid for the last 52 weeks. Cells filled by weeks with at least one `checked_in` registration.
5. **Recent events** — Last 5 events the user attended (checked_in), with event title and date.
6. **Badges strip** — All badges earned, grouped or listed.
7. **Handle uniqueness** — Handles are unique per-platform (not per-country). Stored on `users.handle` in the platform DB.
8. **SEO** — `og:title`, `og:description`, `og:image` (avatar or default), `canonical` URL. `JSON-LD` Person schema.

## Acceptance criteria

- [ ] `/u/validhandle` renders correctly with bio, stats, heatmap, and recent events.
- [ ] `/u/nonexistenthandle` returns a 302 redirect to `/leaderboard`.
- [ ] Fields hidden via privacy toggles (e.g., `show_employer=false`) do not appear on the public profile.
- [ ] The 52-week heatmap correctly reflects the user's attendance history.
- [ ] The page loads under 2 seconds on a simulated 4G connection.
- [ ] OG meta tags are set correctly; preview in Telegram/Slack shows correct title, description, and image.
- [ ] Temporary accounts (`is_temporary=true`) do not have a public profile page (404 → leaderboard).

## Notes

- Handle is set by the operator or chosen during the onboarding upgrade flow.
- The profile page is not yet ported to V2 (web-next) as of the requirements registry snapshot (listed as Shipped in Phase 1, meaning it exists in V1 and was rebuilt in the Phase-1 customer read surfaces milestone RB-P1).
