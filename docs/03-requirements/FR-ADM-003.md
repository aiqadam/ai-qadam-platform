---
code: FR-ADM-003
name: Announcement composer (email to cohort)
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild M2.4 (V2, Shipped)
---

## Description

Operators can compose and send targeted email announcements to a cohort of members from the workspace. This is for ad-hoc operator communications (not event notifications), such as community news, workshop invitations, or survey requests.

## Users

Organizers, Country Admins.

## Functional scope

1. **Route** — `/workspace/announce` (`AnnounceComposer` island, operator auth required).
2. **Flow** — (1) Select a saved cohort or define a one-off audience filter. (2) Compose subject + body (plain text or markdown). (3) Preview rendered email. (4) Send.
3. **Cohort selection** — Dropdown of saved cohorts from FR-ADM-002. Shows estimated recipient count after selection. A "preview recipients" option shows an anonymized sample (max 10 names).
4. **Consent respect** — Before sending, the API filters out recipients where `notification_email_enabled=false` or relevant email-topic consent is revoked.
5. **Send** — `POST /v1/workspace/announce` → body `{ cohortId, subject, body_md }`. API resolves the cohort, applies consent filters, dispatches via notification dispatcher (FR-NTF-001).
6. **Preview endpoint** — `POST /v1/workspace/announce/preview` → returns estimated recipient count + sample names. Used by the composer before send.

## Acceptance criteria

- [ ] Selecting a cohort and clicking "Preview" shows the recipient count and up to 10 anonymized names.
- [ ] Clicking "Send" dispatches emails to all eligible cohort members (respecting consent).
- [ ] Members with `notification_email_enabled=false` are excluded from the send.
- [ ] Only operators for the current country can send announcements; super-admin can send to any country.
- [ ] The composer shows a confirmation dialog before sending to > 100 recipients.
- [ ] After sending, a success message shows the final sent count.

## Notes

- V2 (web-next): shipped as M2.4 (`AnnounceComposer` block).
- This is email-only. Telegram broadcasts are the separate FR-CMS-004 flow.
