# ADR-0030: Photo consent at events — capture, propagation, revocation

## Status
Accepted, 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../decision-batch-process.md). Recurring cost is negligible — wristbands ~$5/event × ~10 events/year/country ≈ $150/year across UZ+KZ+TJ; the schema work + cron sit alongside the F-S3.0 graph. Unblocks Phase ζ moderation work + sponsor PII boundary integrity per ADR-0033.

## Context

Events generate photographs that show attendees. Per ADR-0033, AI Qadam is community-as-platform; photos with attendee faces feed sponsor recap decks + the social-card + recap pipelines (F-S5.4 + F-S1.1c). Operator photographers + member-volunteer photographers + sponsor staff all take photos at events. Without an explicit consent model, every published photo is a potential GDPR / regional privacy violation + a trust hit if a member is surprised to see their face on a sponsor's recap.

[`ux-and-content-guidelines.md`](../ux-and-content-guidelines.md) (§11 onboarding scripts + §15 empty/error states) mentions registration-time consent but doesn't define the photo-consent flow specifically. Existing primitives:

- `member_consents.purpose=content` (per ADR-0033) — coarse-grained, covers "may we use your contributions including your name in our content"
- `eula_acceptances` (per Sprint 5.5/2) — event-EULA-bound consent, immutable
- `consent_records` (per Sprint 5.5/2) — operator × intent × scope ledger

What's missing: an event-scoped, photo-specific, member-revocable consent.

Constraints:
- Photo consent must be GDPR-shaped + Central-Asia-regional-privacy-respectful (UZ has a personal data protection law since 2019; KZ has its 2013 law; TJ is loosest).
- Operator UX must be lightweight — at the door, no operator wants a 10-step consent flow per attendee.
- Member revocation must propagate: once a member revokes, the photo must be hidden from public surfaces + flagged for re-edit on archived materials.

## Options

### Option A — Implicit consent at registration (status quo)
Event EULA references "you may appear in photos"; no per-event toggle; no revocation flow.

- **Pros:** zero operator overhead at the door; familiar pattern.
- **Cons:** consent is buried; revocation is not real (nothing in code listens for it); high trust risk if a member complains; GDPR-weak.

### Option B — Per-event opt-in checkbox + colored-wristband at door
Registration form includes a per-event "photo opt-in" checkbox (default OFF); at the door, opt-in members receive a colored wristband (e.g. green); operator photographers know to point cameras toward green wristbands + away from others.

- **Pros:** strong consent signal; member can decide per event; wristband makes the consent state physically visible.
- **Cons:** wristband logistics (operator stocks them per event); photographer training; doesn't solve revocation post-event; group shots inevitably include opt-out members in the background.

### Option C — Per-event opt-in stored in the member graph + photo-tagging workflow
Registration form includes "photo opt-in for this event" (default OFF, member self-toggle in /me/profile too). Photos uploaded into Directus (per F-S3.4 event cabinet) are tagged with `member_ids` who appear in them. Public publish flow filters out photos that contain ≥ 1 opted-out member, OR offers an automated face-blur step for those members.

- **Pros:** consent is real + revocable + auditable; member can revoke retroactively + the system re-filters; supports the trust signal AI Qadam needs.
- **Cons:** face-tagging is operator labor (or AI-assist with review); blur tooling is non-trivial; revocation that triggers re-edit of an already-published recap is expensive.

### Option D — Hybrid: Option B at the door + Option C for archival + permanent-revocation
At door: colored wristband (Option B) — fast signal for photographers. Post-event: Option C — photos tagged for archived consent state. Permanent-revocation request from a member triggers a manual operator workflow (operator removes / blurs the photo, marks revocation in the audit log).

- **Pros:** operator-friendly at the door + member-rights-respectful in archive; the wristband is the primary signal so most photographers do the right thing in real time.
- **Cons:** still has the operator-effort cost of Option C; the dual-system (wristband + tagging) needs operator training to avoid confusion.

## Recommendation

**Option D (hybrid: wristband at door + tag + revocation propagation)** with these specifics:

### Schema additions (separate F-S3.0-follow-up PR; not in scope for this ADR)

- `event_photos` collection (or extend `directus_files` with custom metadata): `event_id` FK, `uploaded_by` FK, `pictured_members` array of FK `directus_users.id`, `consent_state` enum (`unknown / consented_all_pictured / partial_consent / revoked / blurred`), `published_at` timestamp.
- `photo_consent` field on `registrations` (boolean, default `false`, member self-controls via /me/profile or per-registration form).
- Member can revoke retroactively: API endpoint `/v1/photos/revoke` sets revocation marker; ops cron re-runs publication filter.

### Operator process (lightweight)

- **Pre-event:** operator confirms wristband stock for the country lead's photo-consent system.
- **At-door:** registration check-in flow (already a workflow per F-S3.4 cabinet) shows operator a green chip for opted-in members + offers a wristband; opted-out members get a "no photo" mental note. Operator hands wristbands in <5 sec/attendee.
- **At-event:** photographer briefed: green wristband = OK to point camera; no wristband = OK to shoot wide / from behind / not at all.
- **Post-event:** uploader of photos selects attendees pictured (drop-down from registration list). Cabinet auto-computes whether publishable per per-attendee consent state. If unpublishable: operator either crops, blurs, or asks for explicit consent.
- **Member revocation:** member toggles "remove me from event X photos" in /me/profile → revocation marker → ops cron re-runs filter + emails operator about specific photos needing re-edit within 7 days.

### Public + sponsor publication rules

- Public recap surfaces (event recap page, social cards): only photos where ALL `pictured_members.photo_consent = true` for that event. Other photos: archive-only, not published.
- Sponsor recap PDF (per F-S3.8): same rule as public; sponsor sees aggregated cohort analytics per ADR-0033 sponsor PII boundary, never raw photos.
- Press / media coverage requests: photos handled per-request per [`security.md`](../runbooks/security.md) for press-data-sharing approvals (TBD as we hit our first inbound press request).

### EULA integration

The event EULA (per Sprint 5.5/2 `eulas` collection) gets a `photo_consent_required_for_publication` field. Registration form for events with this flag presents the photo consent as an explicit step (not buried). Acceptance is recorded in `eula_acceptances`.

## Consequences

- Schema work: 1 small follow-up PR (~150 lines) on top of F-S3.0; not in this ADR's scope.
- Operator effort: ~5 min training per event for wristband distribution; ~30 min per event for post-event photo tagging.
- Wristband cost: ~USD 5/event for 100 disposable bands.
- Revocation propagation: cron + 7-day SLO; if violated, manual escalation to the country lead.
- Compliance posture: aligned with GDPR-style "informed + revocable" consent; documented in [`audit.md`](../runbooks/audit.md) for quarterly review.

## References

- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — `member_consents` primitive + sponsor PII boundary
- [Sprint 5.5/2 EULA + consent infrastructure](../community-platform-roadmap.md) — `eulas` + `eula_acceptances` + `consent_records` collections
- [`ux-and-content-guidelines.md`](../ux-and-content-guidelines.md) §11 — onboarding scripts (where the consent UX surfaces)
- [`audit.md`](../runbooks/audit.md) — audit-log queries that read this consent state
- [`marketing-and-pr-playbook.md` §14](../marketing-and-pr-playbook.md) — per-event playbook (where the wristband step slots in)
