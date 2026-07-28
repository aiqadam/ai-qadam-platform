---
code: FR-ADM-011
name: Admin user and role management screen
status: Proposed
module: Admin / Operator (ADM)
phase: Not phased
business_process: [BP-UAT-021]
---

## Description

Generalizes the existing `/workspace/admin/users` screen (currently
invite-list only, per `FR-ADM-005`) into a full user/role management
screen: super-admins can search for any existing user, view their current
role(s) in plain language (not raw Authentik group slugs), and grant or
revoke roles through form controls. Every role change is followed by a
live re-read of the user's actual Authentik group membership, displayed
to the admin as confirmation — closing the silent-failure gap that
caused GitHub issue #107 (a script that claimed to grant super-admin but
silently did not apply). Enforces the ADR-0021 ≤3-super-admin cap as a
blocking check on any grant.

Originated from GitHub issue #107, refined via
`docs/02-business-processes/operator-playbook/admin-user-management.md`
(business-process-development workflow `wf-20260728-bp-147`).

## Users

Super Admin. (Scoped-admin, e.g. `country_lead`, access to a
country-limited subset of this screen is explicitly out of scope for this
FR — flagged as a follow-up candidate, not decided here; see "Notes.")

## Functional scope

1. **Route** — extends `/workspace/admin/users` (existing `AdminInvitesList`
   island/route) with a new tab or mode: "Manage users" alongside the
   existing "Invites" view — exact IA (tab vs. separate route) is
   CodeDeveloper's call within `docs/04-development/design-system/`
   constraints, not prescribed here.
2. **User search** — search/filter existing users by email/name.
3. **Current role display** — for the selected user, show their role(s) in
   plain language derived from their Authentik `groups` claim (e.g.
   "Country Lead — Uzbekistan", not `aiqadam-country-lead-uz`) — reuses
   the same role-label mapping `apps/web-next/src/lib/roles.ts` already
   encodes as predicates; CodeDeveloper should extract/reuse rather than
   duplicate that mapping.
4. **Role change form** — dropdown/checkbox controls to grant or revoke a
   role. No free-text role entry.
   - **Cap check:** if the change would result in > 3
     `aiqadam-super-admin` members, the grant is blocked with an
     explanatory message citing the ADR-0021 cap. Not a warning — a hard
     block. Shared enforcement logic with `FR-ADM-010`'s bootstrap-time
     check (single source of truth for "how many super-admins exist and
     is 3 the limit," not two independent implementations).
5. **Apply + verify** — On submit, the change is sent to Authentik (via
   `AuthentikClient.setUserGroups()`, the same client `FR-ADM-007`'s sync
   service and `FR-ADM-010`'s bootstrap already use), and the screen then
   re-reads the target user's live group membership and displays the
   actual post-change state — not an optimistic "success" toast based
   only on the request having been sent without error.
6. **Audit log entry** — the change (requested + actually-applied state)
   is recorded via the existing audit log (`FR-ADM-008`).
7. **API** — `GET /v1/admin/users/:id/roles` (current roles, plain-language
   + raw group names), `PATCH /v1/admin/users/:id/roles` (grant/revoke;
   returns the re-read post-change state, not just an ack).

## Acceptance criteria

- [ ] AC-1: A super-admin can search for an existing user and see their
      current role(s) displayed in plain language, not raw Authentik
      group slugs.
- [ ] AC-2: Granting a role updates Authentik group membership, and the
      screen displays the actually-re-read post-change state (not an
      optimistic assumption) before the admin navigates away.
- [ ] AC-3: Attempting to grant `super_admin` when 3 members already exist
      is blocked with a message referencing the ADR-0021 cap — the grant
      does not go through.
- [ ] AC-4: Revoking a role updates Authentik group membership and is
      reflected in the same live-verified confirmation as AC-2.
- [ ] AC-5: Every grant/revoke produces an audit log entry
      (`FR-ADM-008`) showing requester, target user, role, and
      before/after state.
- [ ] AC-6: A non-super-admin cannot access this screen or its API
      endpoints (same guard pattern as `FR-ADM-005`/`FR-ADM-007`).

## Notes

- **Deferred, not decided:** whether scoped admins (e.g. `country_lead`)
  get any access to a country-limited version of this screen. The
  business-process draft explicitly left this open per the user's own
  direction to let RequirementAnalyst "develop use case scenarios" —
  recorded here as an open question for a follow-up FR, not silently
  assumed either way. `country_lead` already has "manage organizer
  roster" in ADR-0021's permission table, which is the strongest candidate
  scenario if this is picked up.
- Depends on `FR-ADM-010` only in the sense that both share the
  cap-enforcement rule and the `AuthentikClient` dependency — this FR does
  not require `FR-ADM-010` to ship first (the existing manual bootstrap
  can continue to produce the first super-admin in the meantime; this FR
  only changes how *subsequent* role changes happen).
- Business-process linkage: `BP-UAT-021` (reserved, authored at Step 4 of
  the originating workflow).
