---
code: FR-CRM-002
name: Contact sync — members to CRM
status: Planned
module: CRM (CRM)
phase: Roadmap Sprint 5
---

## Description

When a new member signs up or their profile changes, the platform syncs them to Twenty CRM as a Person record. This gives the operator team a CRM view of all community members. Temporary Telegram-only accounts are also synced (tagged `temp_telegram`).

## Users

System (automated sync); Country Admins, Super Admin (view in CRM).

## Functional scope

1. **Sync endpoint** — `POST /v1/internal/crm/sync-contact` in `apps/api/src/modules/internal/crm.controller.ts`. Body: `{ directusUserId, email, firstName, lastName, country }`. Upserts a Twenty Person via Twenty's REST API (admin token from `TWENTY_API_TOKEN` env). Idempotent: matches on email as unique key.
2. **CRM client** — `crm-client.ts` — thin wrapper around Twenty's REST API (admin token). Methods: `upsertPerson(data)`, `logActivity(personId, activity)`.
3. **Directus trigger** — Directus flow `crm-contact-sync` fires on `directus_users.items.create` and `directus_users.items.update`. Calls `POST /v1/internal/crm/sync-contact`.
4. **Temporary account handling** — Temp users (FR-AUTH-002) are synced from day 1 with tag `temp_telegram`. On upgrade (FR-AUTH-006), the Person record is updated: real email replaces synthetic email, `temp_telegram` tag removed.
5. **Verification** — After a new user signs in via OIDC, a Person appears in Twenty's workspace within 5 seconds.

## Acceptance criteria

- [ ] A new member signing up via email/password appears as a Twenty Person within 10 seconds.
- [ ] A new Telegram-only member appearing from bot `/start` appears as a Twenty Person with `temp_telegram` tag.
- [ ] Updating a member's email in Authentik triggers a CRM sync that updates the Twenty Person's email.
- [ ] Calling `sync-contact` twice with the same email upserts (no duplicate Person created).
- [ ] On account upgrade (FR-AUTH-006), the synthetic email is replaced with the real email in Twenty.
- [ ] `TWENTY_API_TOKEN` is only present in the API env; never in the web or bot environments.

## Notes

- Twenty's data model for People should be confirmed during implementation (field names may have changed across Twenty versions).
- The endpoint `/v1/internal/crm/sync-contact` is internal: requires the `X-Internal-Token` shared secret, not a user JWT.
