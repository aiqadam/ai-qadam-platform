---
code: FR-USR-002
name: Member profile editing (/me/profile)
status: Shipped
module: Users (USR)
phase: Phase 1 (V1) / Rebuild Phase 3 (V2)
---

## Description

Members can view and edit their own profile: professional information, bio, skill tags, topic interests, employment history, and per-purpose privacy consents. The profile is the member's identity within the community.

## Users

Members (own profile).

## Functional scope

1. **Profile core** — `GET /v1/me/profile` returns and `PATCH /v1/me/profile` updates: `job_title`, `seniority` (enum), `industry_tags` (CSV or array), `is_student` (bool), `bio_md` (markdown, max 2000 chars), and 5 visibility toggles (`show_employer`, `show_job_title`, `show_location`, `show_linkedin`, `show_github`).
2. **GDPR consents** (7 purposes) — `PATCH /v1/me/profile/consents`: per-purpose opt-in/opt-out for: newsletter, sponsor offers, speaker promotion, analytics, community features, research, data export. Displayed as toggle rows.
3. **Skills** — `POST /v1/me/profile/skills` (add tag) / `DELETE /v1/me/profile/skills/:id` (remove). Tag pills display; autocomplete from existing tags.
4. **Topic interests** — `POST/DELETE /v1/me/profile/interests/:id`. Multi-select from platform's topic list; drives notification fan-out (FR-NTF-002) and event matching.
5. **Employments** — `POST /v1/me/profile/employments` / `PATCH /v1/me/profile/employments/:id` / `DELETE /v1/me/profile/employments/:id`. Fields: employer name, role, start date, end date (null = current), `share_with_sponsors` bool.
6. **Profile completeness** — Server-side completeness score based on 6 signals (avatar, bio, job_title, skills ≥ 1, employment ≥ 1, consents accepted). Score shown as a nudge on `/me`.

## Acceptance criteria

- [ ] Editing profile core fields and saving persists all changes; page reload shows updated values.
- [ ] Toggling a consent changes the stored state optimistically and persists on refresh.
- [ ] Adding a skill tag appends it to the list; removing it deletes the row.
- [ ] Adding an employment with `is_current=true` and `end_date=null` displays correctly.
- [ ] Profile completeness score updates in the `/me` nudge after profile edits.
- [ ] `PATCH /v1/me/profile` with an unsigned request returns `401`.
- [ ] `bio_md` exceeding 2000 characters is rejected with `400`.
- [ ] Visibility toggles control what appears on the public `/u/[handle]` profile (see FR-USR-007).

## Notes

- In V2 (web-next), this page is in the M3 milestone; not yet started as of the requirements registry snapshot.
- The 7 consent purposes align with ADR-0033.
