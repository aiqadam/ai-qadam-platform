# ADR-0021: RBAC manifest — single source of truth for cross-engine roles

## Status
Proposed, 2026-05-20

> Drafted by Agent-Docs per `docs/community-platform-roadmap.md` §7 Sprint 0.6.
> PM flips to **Accepted** via the weekly decision-batch process
> ([ADR-0022 onward — see Sprint 0.12](./)). Until Accepted, no
> downstream code may rely on this manifest.

## Context

[SECURITY.md §Authorization](../../.claude/SECURITY.md) commits us to RBAC via Authentik groups + JWT claims, default-deny, controller-level checks, and tenant isolation. Today the implementation is partial and unevenly enforced:

- `users.role` is a Postgres enum with `member | organizer | country_admin | super_admin` ([migration 0009](../../apps/api/src/db/migrations/0009_smooth_pretty_boy.sql)). It is set manually after the first promotion comment in the migration — no Authentik linkage.
- [`SECURITY.md`](../../.claude/SECURITY.md#roles-in-ai-qadam) lists seven roles (the four above plus `speaker`, `bot_service`, `worker_service`). The two service roles have no carrier in either Postgres or Authentik today.
- [`auth-architecture.md` §6.7](../auth-architecture.md#67-add-per-country--per-resource-rbac-the-planned-next-step) sketches `users.scope_country_codes text[]` for per-country gating. Not implemented.
- Sprint 4.5 migrated authoritative user storage to Directus ([migration-to-directus-centric.md](../migration-to-directus-centric.md)). Directus has its own permission-policy model. Twenty CRM (Sprint C5) has workspace-level roles. Plausible has site-level access. Discourse (Phase ζ.2) adds yet another permission model.

Sprint 2.2 (RBAC sync service) must reconcile Authentik group membership into all four of those engines on every change, and partial failures must be visible — never silent. Before that code can be written, we need one canonical manifest answering: which roles exist, what they map to in each engine, how sync is triggered, who wins in a conflict, what happens when an engine is unreachable.

This ADR is that manifest.

## Decision

### 1. Authentik is the source of truth

Every role is a group in Authentik. No app reads `users.role` from Postgres for authorisation any more — the `role` column becomes a denormalised display field synced from Authentik group membership on each `/v1/auth/refresh`. Postgres `users.role` is **advisory**, never authoritative. Removing it is out of scope for this ADR (the column has downstream readers); it is frozen as denormalised cache.

Authorisation decisions in our API read JWT claims (`groups`, `country_codes`) populated at token mint time from Authentik's id_token, never from Postgres. Authentik is the only place an operator changes someone's role.

### 2. Roles inventory (canonical)

| Role | Authentik group name | Scope | Sample permissions | Notes |
|---|---|---|---|---|
| **member** | `aiqadam-member` | Self + public content | Read public content, manage own profile, register for events, submit feedback | Default for every Authentik user. All other roles are **additive** on top. |
| **speaker** | `aiqadam-speaker` | Own speaker record | + Edit own speaker profile, view own past-talk analytics, propose next talk | Per [roadmap §3.2](../community-platform-roadmap.md#32-speaker-lifecycle). Cabinet read-mostly. |
| **sponsor_rep** | `aiqadam-sponsor-rep` | Own sponsoring org's events | + View sponsored-event analytics, download opt-in lead list (per [PII data-flow](../pii-data-flow.md), aggregate-only fields by default), download co-marketing kit | Multiple reps per sponsoring org via Authentik group `aiqadam-sponsor-rep-<org-slug>`. |
| **organizer** | `aiqadam-organizer-<country>` | Events in assigned country | + Create/edit events in country, view registrations, run check-in, send announcements, see CSAT | Country-scoped. One group per country (`aiqadam-organizer-uz`, `aiqadam-organizer-kz`, `aiqadam-organizer-tj`, `aiqadam-organizer-demo`). |
| **country_lead** | `aiqadam-country-lead-<country>` | All operations within country | + Manage organizer roster, manage sponsor pipeline, approve speakers, see member PII for matching workflows, run the activate-country wizard for sub-regions | Renamed from `country_admin` for plain-language consistency with the [country-lead lifecycle](../community-platform-roadmap.md#34-operator--country-lead-lifecycle). The old enum value `country_admin` is preserved in Postgres for the denormalised cache during migration. |
| **super_admin** | `aiqadam-super-admin` | All operations everywhere | + Break-glass operations, add countries, edit roles, see everything | Limited to ≤ 3 humans. MFA mandatory (Sprint 5 follow-up). |
| **bot_service** | `aiqadam-svc-bot` | Internal API surface for Telegram bot | Issue/refresh user JWTs via `/v1/internal/bot/oauth-callback`, write check-ins, read leaderboard | Machine principal. Audience-separated JWT per [auth-architecture §6.4](../auth-architecture.md#64-add-a-telegram-bot-or-other-api-consumer). |
| **worker_service** | `aiqadam-svc-worker` | Internal API surface for BullMQ workers | Read/write `interactions`, `deliveries`, `responses`; dispatch emails | Machine principal. Audience-separated JWT. |

**Rules:**
- Roles are **additive**. A `country_lead` of `uz` is also a member, an organizer of `uz`, a speaker if their record exists, and a sponsor_rep if their employer is sponsoring.
- A user can be `organizer` or `country_lead` in **multiple countries** by membership in multiple `aiqadam-organizer-<country>` / `aiqadam-country-lead-<country>` groups.
- `super_admin` is global; the `<country>` suffix does not apply.
- Service principals (`bot_service`, `worker_service`) are issued via Authentik's API token / service-account flow, **not** human OIDC. Their JWTs carry `aud: aiqadam-internal`, distinct from human tokens (`aud: aiqadam-web`).

### 3. JWT claim shape

On every `/v1/auth/refresh` we mint an access JWT carrying:

```json
{
  "sub": "<authentik-subject-uuid>",
  "email": "viktor@aiqadam.org",
  "groups": ["aiqadam-member", "aiqadam-country-lead-uz", "aiqadam-organizer-uz"],
  "country_codes": ["uz"],
  "roles": ["member", "country_lead", "organizer"],
  "aud": "aiqadam-web",
  "iss": "https://aiqadam.org/v1/auth",
  "jti": "<uuid>",
  "exp": <15min>
}
```

- `groups` is the verbatim Authentik group list (the source of truth).
- `roles` and `country_codes` are **derived projections** computed at mint time from the group list for ergonomic guard code. Guards never decide auth on `roles` if `groups` is present; `roles` exists for templating + UI gating.
- The derivation is a pure function (see §6 implementation note). Both views agree by construction.

### 4. Authentik groups → engine permissions mapping

#### 4.1 Directus permission policies

Directus is the data plane (collections: `events`, `registrations`, `users`, `sponsors`, …). Each Authentik group maps to one Directus policy that filters by `country_code`:

| Authentik group | Directus policy | Effect |
|---|---|---|
| `aiqadam-member` | `policy.member` | Read public collections; CRUD on own `directus_users` row; create `registrations`, `feedback_responses` keyed to self. |
| `aiqadam-speaker` | `policy.speaker` | + Update own `speakers` row, read own `event_speakers` rows. |
| `aiqadam-sponsor-rep-<org>` | `policy.sponsor_rep` + dynamic filter `{ sponsorships: { sponsor_id: { _eq: $CURRENT_USER.sponsor_id } } }` | Read own org's sponsorships and opt-in leads only. |
| `aiqadam-organizer-<country>` | `policy.organizer` + filter `{ country_code: { _eq: "<country>" } }` | CRUD `events`, `registrations`, `event_speakers` in country. Read PII fields per [PII data-flow §3](../pii-data-flow.md) only on opt-in flag. |
| `aiqadam-country-lead-<country>` | `policy.country_lead` + filter `{ country_code: { _eq: "<country>" } }` | Organizer permissions + roster management + sponsor pipeline + see PII. |
| `aiqadam-super-admin` | Directus built-in `Admin` policy | Unrestricted. |
| `aiqadam-svc-bot` | `policy.svc_bot` (no filter) | Read all `events`, write `registrations.checked_in_at`, read `point_awards`. No PII fields except `telegram_user_id`. |
| `aiqadam-svc-worker` | `policy.svc_worker` (no filter) | CRUD `interactions`, `deliveries`, `responses`. No registration writes. |

Authoritative declaration: `infrastructure/directus/bootstrap.sh` (owned by Agent-Schema — Sprint 0.1 already seeded the `country=demo` policy). The RBAC sync service (Sprint 2.2) **does not** create policies; it only assigns existing policies to users by writing to `directus_users.policies[]` based on group membership.

#### 4.2 Twenty CRM workspace roles

Twenty has workspace-level roles (`MEMBER`, `ADMIN`) plus per-object permission rules. We do **not** propagate every Authentik group; we propagate operator-class only:

| Authentik group | Twenty workspace role | Twenty workspace tag |
|---|---|---|
| `aiqadam-country-lead-<country>` | `ADMIN` | `country:<country>` |
| `aiqadam-organizer-<country>` | `MEMBER` | `country:<country>` |
| `aiqadam-super-admin` | `ADMIN` | (none — sees all) |

Members, speakers, sponsor_reps, and service principals do **not** get Twenty seats. They never log into the CRM directly.

#### 4.3 Plausible Analytics site access

Plausible has per-site `viewer | admin | owner` roles. We propagate the operator-class only:

| Authentik group | Plausible site | Plausible role |
|---|---|---|
| `aiqadam-country-lead-<country>` | `<country>.aiqadam.org` | `admin` |
| `aiqadam-organizer-<country>` | `<country>.aiqadam.org` | `viewer` |
| `aiqadam-super-admin` | all sites | `owner` |

Marketing dashboard (Sprint 5.8) reads via Metabase, not Plausible UI — so non-operator roles do not need Plausible seats.

#### 4.4 Discourse (Phase ζ.2 — deferred)

Out of scope for this ADR. Re-open when Discourse is provisioned. Provisional plan: Authentik OIDC SSO + group claim → Discourse `groups` array → Discourse trust-level rules. No code today.

### 5. Sync trigger — webhook, with poll as belt-and-braces

**Primary: webhook from Authentik's `Event` action** on group-membership changes.

Authentik exposes a [webhook notification transport](https://docs.goauthentik.io/docs/sys-mgmt/events/notifications#notification-transports). We register a transport pointing to `POST /v1/internal/rbac/authentik-webhook` on our API, signed with a shared HMAC secret (`AUTHENTIK_WEBHOOK_SECRET`). The trigger binds to the `user_write` model action filtered to `Group.users` field changes. Webhook payload: `{ user: { pk, email, groups: [...] }, action: "model_updated", model: "Group" }`.

On receipt the API:
1. Verifies the HMAC.
2. Reads the full group list for the affected user from Authentik's `/api/v3/core/users/<pk>/` (do not trust the webhook payload's group list alone — the webhook may arrive out of order; always pull canonical state).
3. Enqueues a BullMQ `rbac.sync` job keyed by `userId` (job key dedupes concurrent webhooks for the same user).
4. The job runs the per-engine state machine (§7).

**Backup: nightly poll** (Sprint 2.2). A BullMQ cron job at 03:30 UTC walks every Authentik user, recomputes the expected per-engine state from group membership, and reconciles any drift. This catches missed webhooks, hand-edits made directly in an engine's admin UI, and provider outages.

Webhook chosen over pure polling because: (a) human-perceived latency on role grant ≤ 5 s instead of up to 24 h, important during the activate-country wizard; (b) every poll iterates ~N users — webhook fires only on the changed user. Polling chosen as backup because webhook delivery is best-effort and our infra (single-VM Coolify) will have occasional outages.

### 6. Conflict resolution

**Authentik wins, every time.** If Twenty / Directus / Plausible disagree with the manifest, sync rewrites the engine. The reverse — letting an engine's local change override Authentik — is prohibited, because the operator who hand-edits a Directus policy or a Twenty seat has not gone through the audit trail that Authentik provides.

Concretely, on every sync (webhook-triggered or poll-triggered):

1. Compute the *expected* per-engine state from the user's Authentik group list using the table in §4.
2. Read the *current* state from each engine.
3. Diff. Apply the delta. Log every add/remove to `audit_events` (collection shipped in Sprint 2.5).
4. If a user has been **deleted in Authentik** but still exists in an engine, the sync **revokes** all engine memberships (does NOT delete the engine record itself — orphaned records remain for audit, marked `status: revoked`).
5. If a user has been **added directly in an engine** without an Authentik mirror (e.g., someone clicked "invite" inside Twenty), the sync **revokes** that engine seat. Operators get a one-time email: "Add `<user>` to Authentik group `<group>` instead — see [country-lead runbook](../runbooks/country-lead-activation.md)."

### 7. Per-engine state machine + partial-failure handling

Each `rbac.sync` job runs a small state machine, persisted in a new Directus collection `rbac_sync_jobs` (Agent-Schema, Sprint 2.2):

```
fields:
  id               uuid PK
  user_id          fk → directus_users
  triggered_by     enum(webhook | poll | manual_retry | activate_country)
  expected_state   jsonb            // { directus: {...}, twenty: {...}, plausible: {...} }
  directus_status  enum(pending | applied | failed | skipped)
  directus_error   text
  twenty_status    enum(pending | applied | failed | skipped)
  twenty_error     text
  plausible_status enum(pending | applied | failed | skipped)
  plausible_error  text
  attempt          int default 1
  started_at       timestamp
  finished_at      timestamp
```

Status semantics:
- `pending` — work scheduled, not yet attempted.
- `applied` — engine acknowledges desired state.
- `failed` — engine returned 4xx/5xx or timed out three times.
- `skipped` — manifest does not require this engine for this user (e.g., a plain `member` does not get a Twenty seat).

Retry policy per engine: 3 attempts with exponential backoff (1s, 5s, 25s). On the third failure the engine's status flips to `failed` and the job finishes with overall `partial`. **No silent partial state** — the workspace dashboard (Sprint 2.4) surfaces `rbac_sync_jobs` rows with any `failed` status as a **prominent banner with a retry button**. A failed sync **does not** retry on its own beyond the three attempts; an operator clicks Retry, which enqueues a fresh job with `triggered_by: manual_retry`.

Why not auto-retry forever? Two reasons. First, an engine outage that lasts hours generates thousands of retry attempts and a noisy queue; the nightly poll (§5) reconciles drift anyway. Second, repeated failure usually means **wrong manifest, not transient engine error** — for example, the operator created a country in Authentik but Agent-Infra has not yet provisioned the matching Plausible site. Failing loudly forces the human to look.

Per-engine status is also surfaced on the user's own `/me/access-log` page (Sprint 2.5), so members can see whether their granted permissions have actually landed.

### 8. Membership in service-account groups

`aiqadam-svc-bot` and `aiqadam-svc-worker` carry **service-account** principals, not humans. They are issued via Authentik's "Service Account" creation (an Authentik user with `is_service_account=true`, password-disabled, API-token-only). Sync rules:

- A human user must **never** be a member of a `aiqadam-svc-*` group. The webhook validates and rejects (`409`) such assignments and emits `audit_events.severity=high`.
- Service-account tokens carry `aud: aiqadam-internal`. The web AuthGuard rejects them. A separate `InternalAuthGuard` (Sprint 2.2) accepts them only on `/v1/internal/*` paths.

### 9. Bootstrap procedure (one-time, before Sprint 2.2 ships code)

1. **Agent-Schema** seeds the eight Directus policies named in §4.1 (`policy.member`, `policy.speaker`, `policy.sponsor_rep`, `policy.organizer`, `policy.country_lead`, `policy.svc_bot`, `policy.svc_worker`) via `infrastructure/directus/bootstrap.sh`. Sprint 0.1 already covered `country=demo`; this extends to the seven role policies.
2. **Operator (HUMAN)** creates the eight country-agnostic groups in Authentik (`aiqadam-member`, `aiqadam-speaker`, `aiqadam-sponsor-rep`, `aiqadam-super-admin`, `aiqadam-svc-bot`, `aiqadam-svc-worker`) plus per-country pairs for every active country (`uz`, `kz`, `tj`, `demo`): `aiqadam-organizer-<c>`, `aiqadam-country-lead-<c>`. Runbook: `docs/runbooks/rbac-bootstrap.md` (Agent-Docs, follow-up PR).
3. **Operator** assigns Viktor to `aiqadam-super-admin`. Validates by signing in and seeing all engines.
4. **Agent-Infra** (Sprint 2.4) ensures Plausible has per-country sites named `<country>.aiqadam.org`.
5. **Agent-API** (Sprint 2.2) ships the webhook receiver, the BullMQ sync worker, the state machine, and the nightly poll cron.

### 10. Open sub-decisions deferred to ADRs

- **ADR-0032 — break-glass override path for RBAC sync failure** (future): if Authentik is unreachable AND a country activation is in progress, how does a `super_admin` mint a one-shot token bypassing webhooks? Default direction: existing break-glass admin path (Sprint 0.2) is the answer; document explicitly when written.
- **Discourse mapping** (Phase ζ.2): re-open §4.4 when Discourse is provisioned.

## Rationale

### Why Authentik-as-source-of-truth, not a custom roles table

Three reasons:

1. **One audit ledger.** Authentik's Events table already records every group-membership change. Replicating that auditing in our schema doubles the maintenance.
2. **OIDC group claim is standard.** Other apps we add later (Discourse, Listmonk, Metabase) all read group claims from the OIDC id_token. Anchoring there means each new app is two config lines, not a custom integration.
3. **Operators already know Authentik.** Country leads are trained on the Authentik admin UI (Sprint 4.3 runbook). Asking them to also learn a second roles UI is a poor trade.

The downside is that Authentik becomes a single point of failure for authorisation changes. Mitigated by (a) the break-glass admin path (Sprint 0.2) lets a `super_admin` skip Authentik in a fire scenario, (b) the nightly poll catches drift if a webhook is missed, (c) JWTs are 15-min-lived so revoked permissions clear quickly even without engine sync.

### Why per-country groups instead of one group + a `country_codes` claim attribute

We considered: one `aiqadam-organizer` group + a custom Authentik user attribute `country_codes: ["uz"]`. Two problems:

1. Authentik's webhook fires on group changes but **not** on user-attribute changes — we would have to poll constantly to detect a country grant. Per-country groups give us webhook coverage for free.
2. Directus filter policies natively take group membership; matching against a custom attribute requires a custom policy filter that's harder to audit.

Per-country groups scale to ~20 countries × 2 groups = 40 groups. Below Authentik's no-trouble line.

### Why `country_lead` instead of `country_admin`

Consistency with [`community-platform-roadmap.md` §3.4](../community-platform-roadmap.md#34-operator--country-lead-lifecycle) and [`ux-and-content-guidelines.md` §1](../ux-and-content-guidelines.md#1-voice) (plain words, not jargon). The Postgres enum keeps `country_admin` as a denormalised cache value until the column itself is retired in a future migration; the JWT/Authentik canonical name is `country_lead`.

### Why no per-resource ACLs (sharing) in Phase 1

Some apps (Notion, Google Drive) let an admin override role-based defaults per resource ("share this one event with bob@…"). We are not building this. RBAC + tenant filter is the entire authorisation model. If a sharing use case appears we re-open this ADR.

## Consequences

- ✅ One canonical document Sprint 2.2 (RBAC sync), Sprint 3.x (cabinets), Sprint 4 (country provisioning) all reference.
- ✅ Adding a new country is two Authentik group creates plus a Plausible site (Agent-Infra) + a Directus filter (Agent-Schema). Both already scripted by existing scaffolding.
- ✅ Service principals separated from human principals at the JWT-audience boundary — XSS on the web app can never mint a worker token.
- ✅ Partial-failure visibility eliminates the silent-corruption mode that ungated cross-engine sync usually has.
- ⚠️ **Authentik becomes load-bearing**. An Authentik outage means: no new sign-ins, no role changes, but in-flight 15-min JWTs continue to work. Mitigated by the break-glass admin path (Sprint 0.2).
- ⚠️ **Group sprawl** if we grow to many countries (40+ groups at 20 countries). Acceptable below 20 countries; revisit if Phase 2 exceeds.
- ⚠️ **The bootstrap is human-paced.** Steps 2–3 of §9 require an operator to hand-create groups in Authentik before Sprint 2.2 code can be exercised end-to-end. Documented in the runbook ([`docs/runbooks/rbac-bootstrap.md`](../runbooks/rbac-bootstrap.md), follow-up).
- 📝 Postgres `users.role` enum is now advisory. Future ADR may retire the column once all readers are migrated.
- 📝 The `speaker` role only governs the speaker cabinet (Sprint 3.3). A speaker's basic permissions to register / give CSAT come from their parallel `member` membership.

## Updates / amendments

- 2026-05-20: Initial draft (Proposed). Awaiting decision-batch review.

## References
- [`docs/community-platform-roadmap.md` §7 Sprint 0.6 + Sprint 2.2](../community-platform-roadmap.md) — the requirement this implements
- [`docs/auth-architecture.md` §6.7](../auth-architecture.md#67-add-per-country--per-resource-rbac-the-planned-next-step) — the placeholder this ADR makes concrete
- [`.claude/SECURITY.md` §Authorization](../../.claude/SECURITY.md) — the principle and starting role list
- [`.claude/GLOSSARY.md`](../../.claude/GLOSSARY.md) — domain terms (Country Admin, Role, Tenant)
- [`docs/migration-to-directus-centric.md`](../migration-to-directus-centric.md) — why Directus permission policies are the data-plane gate
- [ADR-0001](./0001-docs-live-in-claude-folder.md), [ADR-0016 — Auth bootstrap](./0016-auth-bootstrap.md) — format + auth context
- [Authentik webhook docs](https://docs.goauthentik.io/docs/sys-mgmt/events/notifications)
