---
code: FR-ADM-005
name: Operator invites management
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild Phase 2 (V2, Shipped)
---

## Description

Super Admins can invite new operators (organizers, country admins) to the platform by generating one-time invite links. The invite flow provisions an operator mailbox and role. Invites can be revoked before acceptance.

## Users

Super Admin (create, revoke invites); Invited operators (accept).

## Functional scope

1. **Invite list** — `/workspace/admin/users` (`AdminInvitesList` island): table of all pending and accepted invites. Columns: email, role, country, status, `token_prefix` (first 8 chars of token, for identification). "Revoke" button per pending invite.
2. **Create invite** — `/workspace/admin/users/new` (`AdminUserCreateForm` island): fields: email, role (organizer/country_admin), country. On submit: `POST /v1/admin/invites`. Returns a one-time `invite_url` displayed in a copy panel (shown once only).
3. **Invite acceptance** — Invited user visits `/onboard?token=<token>`. See FR-USR-001 for the full onboarding flow.
4. **Revocation** — `DELETE /v1/admin/invites/:id`. Marks invite as revoked; the `/onboard` URL returns `410 Gone`.
5. **Mailbox provisioning** — On invite acceptance (`POST /v1/onboard/accept`), a DMS email mailbox is provisioned for the operator (if applicable). Mailbox credentials shown on the onboarding screen.

## Acceptance criteria

- [ ] Creating an invite generates a one-time URL; the URL is shown exactly once.
- [ ] Visiting the invite URL on `/onboard` shows the invite details (name, role, country).
- [ ] Revoking a pending invite causes the `/onboard?token=...` URL to return `410 Gone`.
- [ ] An accepted invite cannot be revoked (returns an appropriate error).
- [ ] The invite list shows `token_prefix` (not the full token) for security.
- [ ] Only super-admins can access `/workspace/admin/users`.

## Notes

- V2 (web-next): `AdminInvitesList` + `AdminUserCreateForm` blocks shipped in RB-P2.
- Email address uniqueness is enforced: creating an invite for an already-registered email returns `409`.
- Plus-addressing (`+`) in invite email addresses is rejected (same rule as all platform email inputs).
