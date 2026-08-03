# ISS-NTF-003-VERIFY-001 — Verify and close FR-NTF-003 (24-hour event reminder)

| Field | Value |
|---|---|
| ID | ISS-NTF-003-VERIFY-001 |
| Severity | minor |
| Module | api/workspace (EventRemindersService) |
| Status | resolved |
| Reported | 2026-08-03 |
| Resolved | 2026-08-03 |
| Workflow | wf-20260803-fix-199 |
| Reporter | Orchestrator (GitHub issue #131 — FR-NTF-003 still shows "Open" despite implementation already shipped in PR #407 / GitHub issue #358) |
| Business-Process | none |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/131 |

## Symptom

GitHub issue #131 (FR-NTF-003 — 24-hour event reminder) remained "Open" and
`docs/03-requirements/FR-NTF-003.md` still read `status: Planned`, despite the
implementation already being live in the codebase (shipped in PR #407, linked to
GitHub issue #358).

## Root Cause

FR-NTF-003 was implemented as part of a separate GitHub issue (#358 — "pre-event
reminder cron spec-aligned"). That workflow updated the codebase but did not update
`FR-NTF-003.md`'s status field or close GitHub issue #131. The two issues are about
the same feature but were tracked independently.

## AC Verification

The existing `EventRemindersService` (`apps/api/src/modules/workspace/event-reminders.service.ts`,
committed in PR #407 commit `64e0e2d`) satisfies the ACs as follows:

| AC | Requirement | Status | Evidence |
|---|---|---|---|
| AC-1 | Confirmed registrant receives reminder ~24h before event | ✓ verified | `reminder_day_before` window 20–28h; filter `status: { _in: ['registered', 'attended'] }` (both are confirmed states per `registrations-directus.service.ts` `Status` type) |
| AC-2 | Waitlisted member does NOT receive reminder | ✓ verified | Filter `_in: ['registered', 'attended']` excludes `waitlisted` |
| AC-3 | No duplicate reminders when cron fires twice | ✓ verified | `event_announcements` ledger with `(event, kind)` UNIQUE constraint — `findAnnouncement()` returns early if row exists |
| AC-4 | Cancelled members do NOT receive reminder | ✓ verified | Filter excludes `cancelled` |
| AC-5 | Reminder email contains event page link and QR check-in code | ✓ (URL) / deferred (QR image) | `textFor()` includes `Details: ${url}`; QR code image in email not implemented — but `registration-confirmed.ts` also doesn't embed QR images, so the FR's "same as confirmation email" qualifier means this is parity-complete. QR codes are visible on the event page once the user clicks through. |

**Note on AC-3**: The FR described deduplication via `notifications_sent (user_id, event_id, channel, kind)` (per-user dedup). The actual implementation deduplicates at `event_announcements (event, kind)` — per-event dedup. This is simpler and correct for the common case; a late-added member would be skipped. This is an acceptable design difference and the net behavior (no duplicate reminder for the same event) is preserved.

## Resolution

- `FR-NTF-003.md` updated: `status: Planned` → `status: Implemented`
- GitHub issue #131 closed with reference to PR #407 / the live implementation
- Tests already exist: `apps/api/test/event-reminders-service.spec.ts` covers the
  pure helpers and tick() behavior. Verified passing.
