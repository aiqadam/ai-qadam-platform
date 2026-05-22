# ADR-0035: Single-place admin UI + invite-link operator onboarding

## Status
Accepted, 2026-05-22

> Set by Viktor on 2026-05-22 after the M365-style design pass. Establishes (1) the operator-management surface as `/workspace/admin/*` cabinets (no CLI scripts, no Authentik admin), and (2) the invite-link flow as the canonical way new operators land in the system. Closes the "Viktor is forever the CLI guy" failure mode that surfaced when provisioning the first Authentik user manually.

## Context

### The trigger

On 2026-05-21 we provisioned the founder's Authentik user (`viktor.drukker@aiqadam.org`) via the admin API directly: POST to `/api/v3/core/users/`, then a second call to `/api/v3/core/users/{id}/set_password/`, then a group-assignment call. The session worked, but it surfaced two real problems:

1. **There is no operator-facing way to create users.** Every operator the platform has ever onboarded has either been Viktor running a CLI script, or Claude Code running it on Viktor's behalf. Neither scales beyond N=1 and neither is auditable in a way an operator can read.
2. **The temp-password pattern is hostile to the invitee.** "Here is your temp password, sign in and change it" is the 2010s pattern. Modern equivalents (M365, Google Workspace, Notion, Linear, GitHub) all moved to invite-link: admin creates a placeholder, system mails / messages a single-use link, invitee sets their own password + accepts terms in one flow.

### What ADR-0032 + ADR-0033 already locked

- [ADR-0032](./0032-operator-tools-must-sso-or-embed.md): every operator-facing tool SSOs via Authentik OR embeds in `workspace.aiqadam.org`. Authentik admin UI is engineer-only.
- [ADR-0033](./0033-community-member-graph.md): operators get five purpose-built cabinets covering ~80% of operator work. Directus admin is engineer-only. Cabinets are the operator surface.

This ADR is the **operator-management equivalent**: there is no admin cabinet today, so the only way to create an operator is to bypass ADR-0032 (engineer enters Authentik admin) or run a script. Both violate the spirit of ADR-0032 §Exceptions.

### The full design space we considered

| Pattern | Verdict | Why |
|---|---|---|
| Multi-step wizard (M365 "Add user" with 6 panels) | Rejected | Six panels for the median case (just-create-an-operator) is high friction. Wizards belong on country-provisioning where steps are genuinely orthogonal — not on user-create where 90% of fields are role-derived defaults. |
| Single-form admin page + temp-password email | Rejected | Temp-password pattern is hostile; sends plaintext credential over email channel; doesn't capture AUP acceptance. |
| **Single-form admin page + invite-link** | **Accepted** | Admin fills email + role + country in one form; system mints a single-use, time-limited, SHA256-stored token; mails / Telegrams / copy-pastes the link; invitee sets their own password + accepts AUP in one flow. M365/Linear/GitHub pattern. |
| Self-service signup with admin approval | Rejected for operators (kept for members via lead form) | Operators are a different trust class — admin-initiated only. |

## Decision

### Part 1 — Single-place admin UI

All operator-management lives under `/workspace/admin/*`, gated by the `aiqadam-super-admin` group (Authentik). v1 surface:

| Route | Purpose |
|---|---|
| `/workspace/admin/users` | List all operators + status (active / invited-pending / suspended) + role + country |
| `/workspace/admin/users/new` | Create operator → mint invite link |
| `/workspace/admin/users/[id]` | View / suspend / revoke / re-invite a single operator |
| `/workspace/admin/invites` | List all outstanding + recently-consumed invites; revoke an unconsumed invite |

Future cabinets in this namespace (deferred to their own ADRs / sprints): `/workspace/admin/countries` (country provisioning per Sprint 4), `/workspace/admin/tenants` (when multi-tenant), `/workspace/admin/rbac` (group / policy editor — depends on F-S2.2 RBAC sync).

### Part 2 — Invite-link onboarding flow

Sequence:

```
admin fills form        →  POST /api/admin/invites
  (email, role_groups,     creates operator_invites row (status=pending)
   country, notes)         creates Authentik user (no password set)
                           returns { invite_id, invite_url } ONCE

admin sends invite_url   →  email (Postal) | Telegram (tg.dispatch.v1) | copy-paste
  via one of 3 channels      Channel is admin's choice in the form

invitee opens link       →  /onboard?token=<plaintext-token>
                           Server hashes, looks up by hash, validates not expired/consumed
                           Renders: profile review + AUP text + password fields

invitee submits          →  POST /api/onboard/accept (token + new password + aup_ack)
                           Sets Authentik password via admin API
                           Assigns role_groups
                           operator_invites.status → consumed, consumed_at = now
                           operator_invites.aup_accepted_at = now, aup_version = current
                           Issues redirect to /workspace
```

### Part 3 — Token security

- **Generation:** 32 bytes from `crypto.randomBytes`, base64url-encoded. Shown in plaintext exactly once at creation (admin sees it; never logged in plaintext).
- **At rest:** only SHA256 hash stored in `operator_invites.token_hash`. First 8 chars stored separately as `token_prefix` for support lookup ("which invite is this for?" without rainbow-table risk).
- **Single-use:** `consumed_at` set on first successful `/api/onboard/accept`. Subsequent attempts with the same token return 410 Gone.
- **Time-limited:** default 7 days from creation; `expires_at` enforced server-side. Past-expiry tokens return 410 Gone.
- **Revocable:** admin can flip `status` to `revoked` from `/workspace/admin/invites`; `revoked_by` + `revoked_at` recorded. Revoked tokens return 410 Gone even if pre-expiry and unconsumed.

### Part 4 — Country-lead invites: scaffold + feature flag OFF

Country-leads are part of the role_groups choices but the flow is **feature-flagged off** by `ENABLE_COUNTRY_LEAD_INVITES=false` (default) until G-1 (country-lead compensation) is resolved per [business-process-gaps.md](../business-process-gaps.md). Per Viktor 2026-05-22: country-leads won't be paid for at least one year (through 2028); scaffold + prepare the code path, ship it dormant.

When the flag is on, country-lead invites include an additional AUP section (data-handling responsibilities + compensation TBD acknowledgement). When off, the role-group option is hidden from `/workspace/admin/users/new` and rejected at the API.

### Part 5 — Audit trail (v1: structured logs)

Invite lifecycle events (`invite.created`, `invite.consumed`, `invite.revoked`, `invite.expired`) emit structured JSON to stdout (Loki-indexed):

```json
{ "event": "invite.created", "actor_id": "<admin-uuid>",
  "target_email": "<email>", "invite_id": "<uuid>",
  "role_groups": ["..."], "country": "kz", "ts": "..." }
```

This is intentionally a v1 shortcut — when Sprint 2.5 lands the full `audit_events` Directus collection, the invite emissions migrate to a structured writer (same field shape; no schema change). Documenting the contract here so the migration is mechanical.

## Consequences

### Positive

- **Zero CLI required for operator creation.** Viktor (or any super-admin) creates operators from `/workspace/admin/users/new`. No engineer needed.
- **Invitee experience matches modern SaaS.** Sets own password; accepts AUP in-flow; no temp-password email.
- **AUP acceptance is captured + auditable.** `operator_invites.aup_accepted_at` + `aup_version` survive in the row indefinitely.
- **Token security follows current best practices.** SHA256-at-rest, single-use, time-limited, revocable — same posture as GitHub PATs.
- **Admin cabinet namespace established.** `/workspace/admin/*` is the home for all future operator-management features (countries, tenants, RBAC editor).

### Negative

- **Three new API endpoints + one cabinet namespace.** Larger surface than "run a CLI script". Justified because the CLI-only path doesn't scale beyond Viktor.
- **AUP is placeholder until legal-reviewed.** v0 AUP lives at [`docs/policies/aup-v0.md`](../policies/aup-v0.md); explicitly marked as placeholder. Lawyer review tracked as a separate concurrent task per roadmap §11.
- **Telegram-channel delivery depends on the bot repo.** Until the [aiqadam-telegram-bot](https://github.com/viktordrukker/aiqadam-telegram-bot) repo ships its outbox consumer, Telegram-delivery option degrades to "publish to outbox; admin uses copy-paste link in the meantime". Email + copy-paste channels work day-one.

### Neutral

- ADR-0032 + ADR-0033 unchanged — this is their application to the operator-management surface.
- No change to RBAC manifest (ADR-0021). Invite-link consumption just calls Authentik's group-assignment endpoint; RBAC sync (F-S2.2) propagates to Directus + Plausible downstream as it would for any group change.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Invite-link interception (email forwarded / Telegram screenshot leaks) | Medium | Single-use + 7-day default expiry. Admin can revoke an unconsumed invite from `/workspace/admin/invites`. SHA256 storage means the leaked DB doesn't yield reusable tokens. |
| AUP version not preserved if AUP doc moves | Low | `aup_version` field stores the version string at consumption time (e.g. "v0.1-placeholder-2026-05-22"). Doc moves are append-only — v0.1 stays in git history. |
| Country-lead flag accidentally enabled in prod | Medium | Default `false`; explicit env var to flip; PR-2 ships a Vitest spec asserting the flag is false in the default config. |
| Admin form lets a super-admin invite themselves into a stronger role | Low | Server-side check: caller's groups ⊇ requested role_groups. Admin cannot grant a role they don't hold. |
| Loki audit logs lost during a Loki outage | Medium | Documented in Sprint 2.5 migration plan — switching to `audit_events` Directus collection makes audit durable. Until then, accepted as a known v1 limitation. |
| Authentik user created but invite never consumed → orphan accounts | Low | `/workspace/admin/invites` lists outstanding invites; revoke action also disables the Authentik user (status=inactive). Cron sweep deferred to F-S2.7-followup if it becomes painful. |

## What changes in the roadmap

| Roadmap item before | After this ADR |
|---|---|
| (missing) Sprint 2.7 — Operator invite cabinet | **New.** Adds `/workspace/admin/users/*` + `/workspace/admin/invites` + `/onboard?token=` invitee flow. Three PRs: this ADR (PR-1), API (PR-2), Web (PR-3). |
| Sprint 4.3 — Country-lead onboarding runbook AUP | Reframed: AUP placeholder lands now ([`aup-v0.md`](../policies/aup-v0.md)) so the invite flow has consumable content; Sprint 4.3's full AUP work is now "lawyer review of v0.1 + revision to v1.0". |
| Sprint 2.5 — Audit log integration | Unchanged in scope; gains a noted upstream contract — invite events emit Loki-compatible structured logs in v1 and migrate to `audit_events` collection when Sprint 2.5 ships. |

## References

- [ADR-0032](./0032-operator-tools-must-sso-or-embed.md) — every operator tool SSOs or embeds; this is its application to operator management
- [ADR-0033](./0033-community-member-graph.md) — operator surface = cabinets; same pattern, different namespace (`/admin` vs `/members`/`/announce`/etc.)
- [ADR-0021](./0021-rbac-manifest.md) — RBAC manifest; invite consumption calls Authentik group assignment, RBAC sync downstream is unchanged
- [`docs/policies/aup-v0.md`](../policies/aup-v0.md) — the AUP text invitees accept (placeholder, pending legal review)
- [`docs/business-process-gaps.md`](../business-process-gaps.md) G-1 — country-lead compensation; gates `ENABLE_COUNTRY_LEAD_INVITES`
- [`docs/community-platform-roadmap.md`](../community-platform-roadmap.md) §7 Sprint 2.7 — feature line
- [aiqadam-telegram-bot](https://github.com/viktordrukker/aiqadam-telegram-bot) — the outbox consumer; Telegram delivery option degrades to "publish to outbox" until the bot ships
- Pattern references (strategic context): M365 admin "Add user" + invite email · Linear "Invite teammates" · GitHub org invitations · Notion workspace invites
