---
code: FR-ADM-002
name: Member directory and cohort builder
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild Phase 2 (V2, Shipped)
---

## Description

Operators can browse and search the full member list for their country, apply saved filter combinations (cohorts), and export cohorts for use in announcements and Telegram broadcasts. The member directory is the primary tool for community management.

## Users

Organizers, Country Admins (country-scoped); Super Admin (all countries).

## Functional scope

1. **Route** — `/workspace/members` (`MemberDirectory` island, operator auth required).
2. **Member table** — Columns: display name, email, role, registration count, last-seen, country. Sortable by column headers. Pagination via "Load more."
3. **Search** — Free-text search on name and email.
4. **Filters** — 7 Directus-native filter dimensions:
   - Country
   - Registration status (has registered for ≥ N events)
   - Event attended (registered for a specific event)
   - Topic interest (has interest in a topic)
   - Role (member / speaker / organizer)
   - Account type (full / temporary)
   - Joined date range
5. **Cohort save/load** — A filter combination can be named and saved as a cohort (`POST /v1/workspace/cohorts`). Saved cohorts are listed in a side panel and can be loaded, edited, and deleted. Cohorts are referenced in the announcement composer (FR-ADM-003) and segment builder (FR-CMS-005).
6. **API** — `GET /v1/workspace/members` (accepts filter params, country-scoped). `POST/GET/DELETE /v1/workspace/cohorts`.

## Acceptance criteria

- [ ] Filtering by "attended event X" returns only members who checked in at event X.
- [ ] Saving a filter combination as a cohort makes it available in the announcement composer.
- [ ] A country admin sees only members from their country.
- [ ] Free-text search on email returns the expected member within 1 second.
- [ ] Deleting a cohort removes it from the list; broadcasts referencing it show a warning.

## Notes

- V2 (web-next): shipped in RB-P2 (`MemberDirectory` block). M2.3 adds "Members filter panel + cohort save/load."
