# RequirementAnalyst — Validation of FR-ADM-010

**Workflow:** wf-20260728-feat-148
**Agent:** RequirementAnalyst
**Input:** `docs/03-requirements/FR-ADM-010.md` (status: Proposed; drafted by a
prior `business-process-development` workflow, `wf-20260728-bp-147`, and
already audited by BusinessProcessAuditor)

---

## Raw Input

FR-ADM-010 — "Platform admin bootstrap (no manual scripts)." Full text read
from `docs/03-requirements/FR-ADM-010.md`. Summary of functional scope (7
numbered steps) and 5 acceptance criteria:

1. On API boot/job trigger, check `aiqadam-super-admin` group membership
   count via `AuthentikClient`.
2. If count is 0, call `AuthentikClient.createUser()` with a fixed
   documented email (`admin@aiqadam.org`) and a fixed documented default
   password (`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` in `.env.example`).
3. Call `AuthentikClient.setUserGroups()` to add the seeded user to
   `aiqadam-super-admin`.
4. Trigger Authentik's native "require password change on next login"
   behavior — explicitly flagged in the FR's own Notes as needing
   CodeDeveloper confirmation of the exact API field, and explicitly NOT
   `createRecoveryLink()`.
5. Bootstrap check doubles as first enforcement of the ≤3-super-admin cap;
   ongoing cap enforcement is FR-ADM-011's job, not this FR's.
6. First login uses the standard OIDC flow, no bootstrap-specific path.
7. Authentik intercepts the login and forces the password change before
   completing the OIDC handshake.

Also read for context: `admin-bootstrap.md` (source business process,
status Draft), `BP-UAT-020.md` (linked UAT script, status Draft, explicitly
"not runnable today"), `auth-architecture.md` §1/§2, `ADR-0021` §9
(superseded bootstrap step, with an explicit supersession note already
pointing at FR-ADM-010), and `authentik.client.ts` (current method surface).

---

## Analysis

### Completeness Issues Found

None that block CodeDeveloper. Two items are legitimately open technical
questions rather than gaps in the requirement — both already flagged by the
FR's own authors, and both addressed below rather than treated as reasons
to fail the requirement:

1. **Exact Authentik field/mechanism for "force password change on next
   login."** See dedicated section below. This is an implementation detail
   to resolve during coding, not a requirements gap — the *behavior*
   (block the OIDC handshake until the password is changed, using
   Authentik's native capability, not a platform-built feature) is fully
   specified. CodeDeveloper needs a starting hypothesis to avoid an
   unbounded research spike; one is provided below.

2. **Bootstrap trigger mechanism** ("API startup, or a dedicated
   bootstrap endpoint/job") is explicitly left as "implementation detail
   for CodeDeveloper" in FR-ADM-010 step 1, and BP-UAT-020 Step 001 mirrors
   this ("mechanism TBD by CodeDeveloper"). This is an appropriate
   delegation, not an omission — the AC (AC-1/AC-2) is written against
   observable outcome (idempotent create-or-noop), not against a specific
   trigger point, so any reasonable implementation (NestJS `OnModuleInit`
   lifecycle hook, or an internal `POST /v1/internal/admin/bootstrap`
   endpoint called from a deploy script) satisfies it. Recommend
   CodeDeveloper default to an `OnModuleInit` hook scoped to the admin
   module (simplest, runs automatically on every boot including local dev
   `pnpm dev`, no new route to guard) unless PR review surfaces a reason
   to prefer an explicit endpoint (e.g. wanting bootstrap decoupled from
   process startup timing in prod). Not escalating this — it's a
   reasonable default, not a blocking ambiguity.

3. **Minor, non-blocking:** the FR does not explicitly state what happens
   if `AuthentikClient.createUser()` or `setUserGroups()` fails mid-way
   (e.g., user created but group-assignment call fails, leaving an
   Authentik user in `aiqadam-member`-only state with no
   `aiqadam-super-admin` membership and no retry). AC-1/AC-2 test the
   happy path and the no-op path but not partial failure. This is a
   reasonable implementation-level concern (log loudly + fail the boot
   step vs. silently continue) rather than a requirements gap — flagging
   for CodeDeveloper to handle defensively (log at ERROR level, do not
   swallow), consistent with `authentik.client.ts`'s existing pattern of
   throwing `AuthentikError` on non-2xx and callers surfacing failures
   rather than retrying silently. Not severe enough to warrant
   `needs-clarification` — the ADR-0021 §7 partial-failure precedent
   (log loudly, no silent partial state) already gives CodeDeveloper the
   house style to follow.

None of the three items above rise to the level of "incomplete" under the
5-criteria test below — they are implementation-detail delegations the FR
correctly leaves open, with reasonable defaults now supplied.

### Conflicts with Existing Features

**No conflict or duplication found.** Checked:

- `docs/03-requirements/requirements-registry.md` — FR-ADM-010 is the only
  entry at that code; the ADM module table lists it once, alongside
  FR-ADM-011 (cap-enforcement UI/API, a distinct concern per both FRs'
  own "Notes" sections — FR-ADM-010 owns bootstrap-time cap enforcement,
  FR-ADM-011 owns ongoing/UI-triggered cap enforcement, and FR-ADM-011's
  own Notes explicitly disclaim needing FR-ADM-010 to ship first).
- Full-text search of `docs/03-requirements/*.md` for
  `bootstrap|super-admin|super_admin` — 28 hits, all either FR-ADM-010
  itself, FR-ADM-011 (the sibling, not a duplicate — confirmed by reading
  its "Notes" section: "this FR does not require FR-ADM-010 to ship
  first... this FR only changes how *subsequent* role changes happen"),
  or unrelated mentions (RBAC sync, CRM roles, migration status docs).
- `FR-ADM-005` (Operator invites, Shipped) — different mechanism entirely:
  invite-and-self-set-password via `/onboard?token=`, for
  organizer/country_admin roles, not super-admin, and the invitee sets
  their own password rather than receiving a seeded default. No overlap
  with FR-ADM-010's zero-admin bootstrap scenario (invites require an
  existing admin to send them — impossible on a truly fresh environment,
  which is precisely the gap FR-ADM-010 fills).
- `FR-ADM-007` (RBAC sync, Shipped) — reconciles Authentik group
  membership into Directus/Plausible on an *existing* user's group
  change; does not create users or handle the zero-admin bootstrap case.
  FR-ADM-010 depends on the same `AuthentikClient` but exercises
  different methods for a different trigger (boot-time check, not a
  webhook/poll on an existing user).
- `ADR-0021` §9 — the manual procedure FR-ADM-010 explicitly supersedes.
  The ADR already carries a forward-reference note ("Step 3 below...is
  SUPERSEDED by FR-ADM-010") added when the business process was drafted,
  so this is a documented, intentional supersession, not an
  undocumented conflict.

No other FR file references admin bootstrap, seeded credentials, or
zero-admin environment handling. Confirmed clean.

### Architectural Feasibility

**Feasible, no violations.**

- **"Only Authentik sees a password" (`auth-architecture.md` §2).**
  FR-ADM-010's design routes the seeded password through
  `AuthentikClient.setPassword()` / `createUser()` — the platform's API
  never stores, hashes, or validates this password; it only holds the
  fixed default value as a documented config constant
  (`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`) that it hands to Authentik's API
  at creation time and never reads back. This is architecturally
  identical in kind to how `FR-ADM-005`'s invite flow already calls
  `AuthentikClient.createUser()` — no new exception to §2's guarantee,
  as the FR's own Description states and I independently confirm by
  reading `auth-architecture.md` §2 and the `AuthentikClient` surface.
  One nuance worth CodeDeveloper's attention (not a blocker): the fixed
  default password itself lives in an env var, which is a secret-adjacent
  value even though the platform never "sees" a *user's* password in the
  ongoing sense §2 is about — this is consistent with AC-5's requirement
  to document it in `.env.example`, and the project's `.env` handling
  rules (CLAUDE.md's dev/test exception) do not cover *inventing* a new
  secret, only toggling existing flags — so the actual prod value still
  needs the user to supply/rotate it per that rule, which AC-5 already
  anticipates by requiring documentation "identical in spelling/format
  across... deployment configs" without mandating the value be committed
  anywhere sensitive.

- **Module boundaries (`architecture.md` "Rules for module boundaries").**
  FR-ADM-010 calls `AuthentikClient` from `apps/api/src/modules/admin-invites/`
  — an existing exported service, not a direct reach into another
  module's DB tables or entities. This is the same pattern
  `FR-ADM-007`'s sync service and (per FR-ADM-011's own Notes) the
  planned admin-user-management screen both use. No new module-boundary
  violation. Whichever module ends up owning the bootstrap trigger
  (`admin-invites` itself, or a new lightweight `admin-bootstrap`
  concern) should call `AuthentikClient` via its service interface, same
  as existing callers — CodeDeveloper's call, not prescribed by the FR,
  and not something that needs to be prescribed here since the pattern
  is already established.

- **No cross-schema query, no new database schema.** FR-ADM-010 does not
  touch Postgres directly — the seeded user lives only in Authentik
  (per `admin-bootstrap.md`'s "Architectural resolution" section, which
  explicitly chose the Authentik-only option over a platform-DB-owned
  credential). Consistent with `ADR-0021` §1 ("Authentik is the source
  of truth... Postgres `users.role` is advisory, never authoritative").

- **Single monorepo / pnpm workspaces.** No new package or app boundary
  crossed.

No inviolable architectural rule is broken. Feasibility confirmed.

---

## Specific technical question: exact Authentik field for forced password change

Per the FR's own Notes, this is flagged as something "CodeDeveloper should
still verify... during implementation" — not treated as a blocker by the
FR's authors, and I concur it should not block this gate. Research
findings and a reasoned default:

**Is this a legitimate, resolvable implementation task?** Yes. Authentik's
core `User` model (the same `/api/v3/core/users/` resource
`AuthentikClient` already talks to for `createUser`/`setPassword`/
`setUserGroups`) supports forcing a password change on next login as a
documented capability. Authentik does not expose this as a single boolean
field on the plain user-update PATCH body the way, say, `is_active` is
(confirmed by reading the full `authentik.client.ts` surface — none of
the existing PATCH-based methods like `setUserGroups`/`patchAttributes`/
`disableUser` reference such a field, and no doc or code in this repo
references one either — a full-repo grep for `password_change`,
`require_password`, `change_password`, and `path_change_required` found
zero hits outside FR-ADM-010's own text). Based on Authentik's documented
architecture (source-of-truth-checkable against goauthentik.io docs, which
I cannot fetch live in this environment but can reason about from stated
mechanics), the two real mechanisms are:

1. **`attributes.ak_login_password_change_required` -style user attribute**
   — the FR's own draft alludes to this ("Authentik's own user-update API
   setting the appropriate field") and `AuthentikClient.patchAttributes()`
   already exists and is the natural carrier: Authentik's stock
   "Default authentication flow" includes a **Password Expiry Policy**
   stage (or, in some Authentik versions, an **"Prompt for new password"**
   stage bound to a per-user or per-attribute condition) that reads a
   user attribute to decide whether to interject a forced-change prompt.
2. **`createRecoveryLink()`-adjacent but distinct: setting the user's
   password via `set_password/` with a flag, or relying on Authentik's
   password *policy* "expiry" mechanism** (`password_change_date`
   tracked internally by Authentik, compared against a bound Password
   Policy's `password_change_frequency` or equivalent), which would make
   the seeded password "already expired" at creation time — forcing a
   change on first use without any extra API call, purely through policy
   configuration on the Authentik side (infra/provisioning, akin to how
   `scripts/provision-authentik-recovery-flow.sh` already provisions flow
   bindings for password reset).

**Recommendation for CodeDeveloper (reasonable default, not a mandate):**
Start from option 1 — attempt `AuthentikClient.patchAttributes(userPk, {
ak_login_password_change_required: true })` (or whatever the exact
attribute key surfaces as once CodeDeveloper hits Authentik's live
`/api/v3/core/users/{id}/` schema / admin UI in the actual dev
environment, which is authoritative over any documentation guess made
here) as the first implementation attempt, since `patchAttributes()`
already exists on `AuthentikClient` and requires no new client method —
only a new call site. If that does not produce the desired forced-change
behavior when verified against a live Authentik instance (this repo's
`docker compose` Authentik service), fall back to option 2 (provisioning
a bound password-expiry policy so the seeded user's password is
pre-expired). Either path satisfies AC-1/AC-3's observable behavior
("password-change required on next login" / "forces a password-change
screen before any other page is reachable") — the FR is correctly
written against the *outcome*, not the specific field, so CodeDeveloper
has room to pick whichever mechanism verifies correctly against the real
Authentik instance without needing a requirement change either way.

**Conclusion: this is a legitimate, scoped implementation task, not a
requirements gap and not a blocker to starting development.** The FR
already flags it correctly; I am not elevating it to `needs-clarification`
status. CodeDeveloper should record which mechanism actually worked (for
the next engineer) in a code comment on the call site, following the same
documentation discipline `authentik.client.ts` already models (see the
`createRecoveryLink()` comment recording the ISS-USR-REDIRECT-002 finding
about the real vs. assumed response shape).

---

## Formalized Requirement

**FEAT-ADM-010** — Platform admin bootstrap (no manual scripts)

FR-ADM-010 is already fully formalized as drafted; no re-authoring needed.
Cross-refs (all already present in the FR, verified accurate):

- Depends on: `AuthentikClient` (`apps/api/src/modules/admin-invites/authentik.client.ts`)
  — `createUser`, `setPassword`, `setUserGroups`, `resolveGroupNames`
  present and verified by reading the file directly (all confirmed to
  exist with matching signatures to what the FR assumes).
- Relates to: `FR-ADM-005` (shares `AuthentikClient`, different flow, no
  conflict), `FR-ADM-007` (shares `AuthentikClient`, different trigger,
  no conflict), `FR-ADM-011` (shares the ≤3-super-admin cap-check logic
  as a "single source of truth" per FR-ADM-011's own Notes — CodeDeveloper
  implementing FR-ADM-010 first should write the cap-check as an
  extractable/reusable function anticipating FR-ADM-011's later reuse,
  not a hard requirement of this FR but a reasonable
  forward-compatibility note).
- Supersedes: `ADR-0021` §9 step 3 (already cross-referenced from the ADR
  itself).
- Business process: `docs/02-business-processes/operator-playbook/admin-bootstrap.md`.
- UAT script: `BP-UAT-020` (Draft, not runnable until this FR ships —
  correctly sequenced; its Step 001 trigger mechanism will need a small
  update once CodeDeveloper picks the actual trigger implementation, but
  that is TestDesigner/TestRunner's concern at a later workflow step, not
  a blocker here).

No new module code / feature identifier assignment needed — `ADM-010` is
already the assigned, registry-listed code.

---

## Acceptance Criteria (draft)

The FR's own 5 ACs are complete, specific, and testable as written. Passed
through unchanged (TestDesigner should formalize into Gherkin/BP-UAT step
form; BP-UAT-020 already drafts this):

- **AC-1:** Given a fresh environment with zero `aiqadam-super-admin`
  members, when the bootstrap job runs, then exactly one admin user is
  created in Authentik, assigned to `aiqadam-super-admin`, with a
  password-change requirement set for next login.
- **AC-2:** Given an environment with ≥1 existing `aiqadam-super-admin`
  member, when the bootstrap job runs again (e.g. on redeploy), then no
  duplicate account is created and no existing account's password or
  group membership is altered.
- **AC-3:** Given the seeded credentials, when signing in for the first
  time via the standard OIDC flow, then a password-change screen is
  forced before any other page is reachable, and the platform process
  never receives or logs the old or new password value at any point.
- **AC-4:** Given the forced password change has completed, when the
  account is used thereafter, then it functions as a normal super-admin
  with no further special-casing (verifiable once FR-ADM-011's screens
  exist, or in the interim via any existing super-admin-gated route,
  e.g. `/workspace/admin/countries`).
- **AC-5:** Given the seeded email and default password constant, then
  both are documented identically (same spelling/format) in
  `.env.example` and `auth-architecture.md`, across local/QA/prod
  deployment configs.

Additional AC recommended (not in the current FR — optional strengthening,
not a blocking gap; TestStrategist/CodeDeveloper can decide whether to
formalize it or treat it as implicit in AC-1/AC-2):

- **AC-6 (suggested):** Given `AuthentikClient.createUser()` succeeds but
  the subsequent `setUserGroups()` call fails, when the bootstrap job
  next runs (e.g. next boot), then the system detects the partial state
  (a user named `admin@aiqadam.org` exists but is not yet in
  `aiqadam-super-admin`) and either completes the group assignment or
  fails loudly rather than silently treating the existing user as "already
  bootstrapped." This closes the partial-failure gap noted in Analysis
  item 3 above. Not escalating over this — flagging as a nice-to-have
  CodeDeveloper can fold into the idempotency check's logic (e.g. check
  group membership directly, not merely "does a user with this email
  exist").

---

## Gate Result

```yaml
gate_result:
  agent: requirement-analyst
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    FR-ADM-010 is specific, testable, non-conflicting, scoped to one
    module layer (admin/auth, via the existing AuthentikClient service
    interface), and fully referenced. No conflicting or duplicate FR
    exists (checked requirements-registry.md and all ADM-module FRs;
    FR-ADM-011 is a confirmed sibling, not a duplicate). No architectural
    violation (auth-architecture.md §2's "only Authentik sees a password"
    is preserved; module-boundary rules are respected via the existing
    AuthentikClient export). The FR's own flagged open question (exact
    Authentik API field for forced password-change) is a legitimate,
    narrowly-scoped implementation task, not a requirements gap — a
    researched default (attempt AuthentikClient.patchAttributes() with a
    password-change-required attribute first, falling back to a
    provisioned password-expiry policy if that doesn't verify against
    the live Authentik instance) is recorded above for CodeDeveloper to
    start from and confirm empirically.
  completeness_criteria:
    specific: true
    testable: true
    non_conflicting: true
    scoped_to_one_module_layer: true
    referenced: true
  open_items_not_blocking:
    - "Exact Authentik field/mechanism for forced password-change on next login — CodeDeveloper to confirm empirically against the live Authentik instance; default hypothesis and fallback documented above."
    - "Bootstrap trigger mechanism (OnModuleInit hook vs. internal endpoint) — implementation detail, default recommendation (OnModuleInit) provided above."
    - "Partial-failure handling between createUser() and setUserGroups() — suggested AC-6 above, optional strengthening."
  next_agent: code-developer
```
