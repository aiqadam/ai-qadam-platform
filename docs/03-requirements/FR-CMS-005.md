---
code: FR-CMS-005
name: Telegram audience segment builder (operator)
status: Shipped
module: CMS / Content (CMS)
phase: V1 (#294-c) / Rebuild M2.7 (V2, Not Started)
---

## Description

Operators define named audience segments using criteria (country, event registration, topic interests, account age) to target Telegram broadcasts. Segments are reusable across multiple broadcasts. A live preview shows the estimated audience size.

## Users

Organizers, Country Admins, Super Admin.

## Functional scope

1. **Segments collection** — `tg_segments` Directus collection: `name`, `criteria_jsonb`, `country`, `created_by`.
2. **Criteria DSL** — Directus-filter-shaped JSON with supported criteria:
   - `{ "country": { "_in": ["uz", "kz"] } }`
   - `{ "registered_for_event": "<event-id>" }`
   - `{ "preferred_topics": { "_contains": "ai-ml" } }`
   - `{ "linked_within_days": 30 }` (recently linked Telegram accounts)
   - `{ "telegram_opted_out_at": { "_null": true } }` (always auto-applied)
   - Criteria combined with `_and` / `_or`.
3. **Segment resolver** — `SegmentResolverService.resolve(segmentId)`: translates `criteria_jsonb` to API queries, runs them, returns matching `directus_user_id[]`. Always excludes users with `telegram_opted_out_at` set.
4. **Segments builder UI** — `/workspace/integrations/telegram/segments` (`TgSegmentsList` + `CriteriaBuilder` island):
   - Create segment: enter name + criteria via chip/dropdown builder (or raw JSON escape hatch).
   - Live preview: resolved audience count + anonymized sample ("A. Member, 247 others").
   - Manage: list, edit, delete segments.
5. **Segment usage** — Segments referenced by broadcasts in FR-CMS-004. Segment is evaluated at send time (not cached at segment-creation time).

## Acceptance criteria

- [ ] Creating a segment with `country=uz` and `registered_for_event=<id>` resolves only UZ members registered for that event.
- [ ] The live preview shows the audience count within 3 seconds of criteria change.
- [ ] A segment always excludes users with `telegram_opted_out_at` set, regardless of other criteria.
- [ ] Editing criteria for a saved segment and saving updates the segment; the next broadcast using it uses the new criteria.
- [ ] The raw JSON escape hatch allows direct `criteria_jsonb` input for advanced operators.
- [ ] An empty segment (0 members) shows a warning in the composer before sending.

## Notes

- The DSL was chosen to mirror Directus filter syntax for minimal translation cost. The `CriteriaBuilder` UI abstracts it behind chips/dropdowns.
- V2 (web-next): M2.7 is not started.
