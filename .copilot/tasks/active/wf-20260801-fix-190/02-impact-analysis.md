# 02 — Impact Analysis (ISS-ADM-010-1)

**Workflow:** wf-20260801-fix-190
**Issue:** GitHub #164 → `ISS-ADM-010-1`
**FR:** FR-ADM-010 (shipped, PR #110)
**Business-Process:** BP-UAT-020
**Step:** 2 of `issue-resolution`
**Date:** 2026-08-01
**Author:** ImpactAnalyzer

---

## Validated Requirement

`ISS-ADM-010-1` is a **defect in shipped behavior**, not a new feature.
The shipped FR-ADM-010 implementation (`AdminBootstrapService.seedAdmin`)
sets the Authentik user attribute `ak_login_password_change_required: true`
intending to force a password-change screen on first login, but live
verification (`wf-20260729-uat-154` against the docker-compose Authentik
service, 2024.x) shows that attribute has **no observable effect on the
flow executor** — submitting the seeded password returns
`{"component": "xak-flow-redirect", "to": "/application/o/authorize/..."}`
directly, no intermediate password-change stage.

The fix per the issue's documented fallback (`auth-architecture.md §9.5`,
`admin-bootstrap.service.ts`'s own code comment, `FR-ADM-010.md`'s Notes
section) is **provisioning-side, not code-side**: bind a
**password-expiry policy** to a **User Login stage** in the default
authentication flow so the seeded password is pre-expired at creation
time. **AC-3 (forced password-change screen on first login) is the
exclusive failure point** — AC-1, AC-2, AC-4, AC-5 already verified
`MATCH` live 2026-07-29 and remain unaffected.

The preferred-path, minimum-surface fix (per the analysis below) is
**`password_change_next_login: true` on the PATCH user body** — Authentik
2024.x native field that bypasses the policy/stage/flow-binding topology
change entirely. The provisioning-side path is the documented fallback
if live verification rejects the user-PATCH path.

---

## Authentik API surface — what I checked

I grepped `apps/api/src/**/*.ts` for `password_change_next_login` /
`password_expiry` / `force_password_change`: **zero hits in
`authentik.client.ts`**, only one in `apps/api/src`
(`admin-bootstrap.service.ts`'s `FORCE_PASSWORD_CHANGE_ATTRIBUTE` literal).
I grepped `scripts/**/*.sh` for the same: only `MAGIC_LINK_TOKEN_EXPIRY_MINUTES`
in `provision-authentik-magic-link-flow.sh` (unrelated email-stage field).

**No existing helper, script, or comment in this repo already exercises
Authentik's password-expiry policy endpoints** — this would be net-new
work, not an extension of an existing primitive.

`AuthentikClient` (`apps/api/src/modules/admin-invites/authentik.client.ts`,
the F-S2.7 wrapper per ADR-0035) currently exposes only
`/api/v3/core/users/...` and `/api/v3/providers/oauth2/...` endpoints. Any
policy/stage/flow-binding work needs either new methods on `AuthentikClient`
or a separate shell script talking to the admin API directly.

Authentik 2024.x supports both candidate mechanisms:
1. **`password_change_next_login: true` on the user PATCH body** — a
   user-body-level field Authentik honors directly during the next login
   attempt. Minimum-surface (one constant + one PATCH parameter).
2. **Password Expiry Policy + User Login Stage + flow-binding** — the
   documented Authentik way to apply expiry organization-wide; this is
   what `auth-architecture.md §9.5`'s own fallback proposal names.

**Recommended fix path:** try `password_change_next_login: true` on the
user-PATCH body **first**, because it is the minimum-surface change,
does not need any new provisioning script or flow topology change, and
is observable in the same `POST /api/v3/flows/executor/...` round-trip
that proved the current attribute-set call wrong. If live verification
(Step 8) finds `password_change_next_login` also has no observable
effect on this specific Authentik build/configuration, **fall back to
the password-expiry policy + stage binding** path.

---

## Affected Layers

### API (NestJS)

**`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`** —
primary code surface. Two changes:

1. **Remove the misleading attribute-set call** — the
   `patchAttributes(user.pk, { ...user.attributes,
   [FORCE_PASSWORD_CHANGE_ATTRIBUTE]: true })` call in `seedAdmin()`
   is an attribute Authentik ignores. Deleting it is a small
   honesty/cleanup change independent of which fix path is chosen.
   Update the long comment block on `FORCE_PASSWORD_CHANGE_ATTRIBUTE`
   to reflect the resolved state.
2. **Replace it with the chosen fix** — user-PATCH path: add
   `password_change_next_login: true` body field via a new
   `AuthentikClient` method. Policy-binding path: provisioning-side
   wiring only; `seedAdmin` stays untouched.

**`apps/api/src/modules/admin-invites/authentik.client.ts`** — small
addition if user-PATCH path is chosen:

- New method `setForcePasswordChangeNextLogin(userPk: number, value:
  boolean)` that does `PATCH /api/v3/core/users/{pk}/` with
  `{ password_change_next_login: value }` on the body.
- Composes cleanly with the duplicate-email recovery path
  (`createOrRecoverSeedUser`) where the user already exists.

### DB Changes Required

**No.** Zero Postgres writes either before or after this fix — the
seeded identity lives only in Authentik (ADR-0021 §1, reaffirmed in
`auth-architecture.md §9.5`). No `db-migration-author` agent needed.

### Shared Types

**No.** No `packages/shared-types/` types are affected. The fix is
either an admin-API parameter shape (private to `AuthentikClient`) or
purely provisioning-side.

### Frontend

**No.** No Astro pages, no React island components, no API-client calls
in `apps/web/` change. The forced-password-change screen is **Authentik's
own UI** (`auth-architecture.md §2` — "only Authentik sees a password").

### Bot

**No.** `apps/bot/` is unaffected.

### Workers

**No.** `apps/workers/` is unaffected.

### Infra / Provisioning

**`scripts/provision-authentik-rbac-groups.sh`** — unchanged on the
happy path; if policy-binding fallback is needed, a separate
`scripts/provision-authentik-pwd-policy.sh` is created (NOT folded into
the RBAC script — different API endpoint family, different lifecycle).

**New file: `scripts/provision-authentik-pwd-policy.sh`** — recommended
only if user-PATCH path is rejected by live verification. Follows the
`provision-authentik-magic-link-flow.sh` /
`provision-authentik-recovery-flow.sh` pattern:
- Idempotent resolve-or-create for the password-expiry policy (`POST
  /api/v3/policies/password_expiry/`).
- Idempotent resolve-or-create for a User Login Stage (`POST
  `/api/v3/stages/user_login/`) and binding it to the existing
  `default-authentication-flow` (`POST
  /api/v3/flows/instances/default-authentication-flow/stage_bindings/`).
- Safety guard mirroring the magic-link script's: refuse to run
  against non-localhost, non-`auth.aiqadam.org` Authentik hosts.
- `curl.exe` selection per AGENTS.md §6.1.

---

## API Surface Changes

| Endpoint (consumer-facing) | Method | Change | Breaking? |
|---|---|---|---|
| `POST /v1/auth/login` (existing) | unchanged | none | no |
| (Admin API to Authentik — internal) | | | |
| `PATCH /api/v3/core/users/{pk}/` (admin) | **changed body field** | if user-PATCH path: add `password_change_next_login: true` to body. | no |
| `POST /api/v3/policies/password_expiry/` (admin) | **new** (provisioning script only) | creates the policy binding. | no |
| `POST /api/v3/stages/user_login/` (admin) | **new** (provisioning script only) | creates User Login stage. | no |
| `POST /api/v3/flows/instances/default-authentication-flow/stage_bindings/` (admin) | **new** (provisioning script only) | binds stage into flow. | no |

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `AdminBootstrapService.seedAdmin` | `AuthentikClient.setForcePasswordChangeNextLogin` (NEW) | direct method call |
| `AuthentikClient.setForcePasswordChangeNextLogin` | Authentik admin API `PATCH /api/v3/core/users/{pk}/` | `this.request()` helper |

No cross-module NestJS service calls. No new permission requirements.

---

## Risk Flags

### Security Review Required: No (flag-only)

The fix removes an ineffective attribute-set and replaces it with an
Authentik-native mechanism. No new attack surface:
- The user-PATCH path adds one PATCH call to a user object that the
  same code already creates (same admin token, same user pk).
- The policy-binding path is purely declarative provisioning.

`SecurityReviewer` is **not required** for this fix in isolation.

### Architecture Rule Risks: None

- **No `.env` modifications.** No env-variable changes.
- **No migrations.** No DB changes.
- **No `--force` / no `--legacy-peer-deps`.**
- **No new dependencies.** No `package.json` change.
- **No `AuthentikClient` surface bloat.** Adding one well-named
  method (`setForcePasswordChangeNextLogin`).
- **Honesty in comments.** The fix removes the
  `FORCE_PASSWORD_CHANGE_ATTRIBUTE` literal and its stale
  unverified-claim block, replacing them with the live-verified
  resolution.

### Other risks

1. **Provisioning-script blast radius** (only if path 2 is taken):
   `provision-authentik-pwd-policy.sh` touches
   `default-authentication-flow`'s stage bindings — affects **every
   user** that signs in, not just seeded admins. The script's "refuse
   to run against non-localhost, non-auth.aiqadam.org" guard is
   mandatory.
2. **Authentik-version drift.** User-PATCH path is supported on 2024.x
   per the project's own container (`wf-20260801-feat-179`'s
   `07-test-results.md` confirms 2024.12.3). If a future upgrade
   deprecates `password_change_next_login`, the policy-binding
   fallback becomes mandatory.
3. **BP-UAT-020 re-verification cost.** Per `protocol.md`'s
   Business-Process Linkage section, this workflow re-runs BP-UAT-020
   against `local` post-merge. Step 002's MISMATCH was the discovery
   site for this issue — running it again will close the loop.
4. **Authentik openAPI-drift risk.** The schema-truth is what the
   running container accepts, not what the published schema says.
   Same instrumentation, same evidence shape.

---

## Test Scope

### Unit tests (Vitest, `apps/api/test/`)

`apps/api/test/admin-bootstrap.service.spec.ts` needs targeted updates:
- **Remove / rewrite assertions** that verify
  `authentik.patchAttributes` is called with
  `ak_login_password_change_required: true`. The rewrite should assert
  the new mechanism (`authentik.setForcePasswordChangeNextLogin` called
  with `true`).
- **Add a regression test** that asserts
  `authentik.patchAttributes` is NOT called from the bootstrap path
  with `ak_login_password_change_required`. This is the AGENTS.md §9
  honesty-in-tests discipline.
- **No changes** to the duplicate-email recovery test (same pattern,
  same rewrite).

No new `apps/api/test/authentik.client.spec.ts` required.

### Integration tests (Testcontainers)

**Not applicable.** No Testcontainers-Authentik double exists in this
repo (FR-ADM-010 Notes section explicitly calls out this gap).

### E2E tests (Playwright)

**`apps/e2e/tests/uat/BP-UAT-020.session.spec.ts`** — already exists
from `wf-20260729-uat-154`. Step 002's `verdict: 'MISMATCH'` block is
the discovery site. **No code change required** — Step 002's logic is
already the correct oracle for both "MISMATCH: no password-change
stage" and "MATCH: password-change stage observed."

The spec's own post-fix run, as this workflow's post-merge UAT, is the
AC-4 live verification. The fixture script `scripts/uat-bp-uat-020-fixture.sh`
already supports re-runs (idempotent within a session).

---

## Documentation surface to update

| File | Change |
|---|---|
| `docs/04-development/architecture/auth-architecture.md §9.5` | Replace "**Forced password-change mechanism — unverified, flagged for UAT**" warning block (which describes `ak_login_password_change_required` as chosen-but-unverified) with a "**Forced password-change mechanism — live-verified 2026-08-01**" block describing the chosen mechanism and citing evidence. |
| `docs/03-requirements/FR-ADM-010.md Notes` | Update the "**Deferred verification**" paragraph from "not verified against a live Authentik instance" to "verified live 2026-08-01, see `ISS-ADM-010-1.md`'s Resolution section." |
| `docs/02-business-processes/uat/BP-UAT-020.md` | Update the AC-3 checkbox from `[ ]` to `[x]` once Step 8's live verification re-runs and Step 002 flips to `MATCH`. Update the "Status note" paragraph and "First live run" Notes bullet. |

---

## Summary of files touched (recommended path = user-PATCH first)

| File | Action | Why |
|---|---|---|
| `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` | edit | Remove misleading attribute call; replace with new mechanism; update FORCE_PASSWORD_CHANGE_ATTRIBUTE comment block |
| `apps/api/src/modules/admin-invites/authentik.client.ts` | edit (small add) | New `setForcePasswordChangeNextLogin(userPk, value)` method |
| `apps/api/test/admin-bootstrap.service.spec.ts` | edit | Rewrite two assertions + add one regression assertion |
| `scripts/provision-authentik-pwd-policy.sh` | **new** (only if path 1 fails Step-8 live verification) | Policy + User Login stage + flow-binding, idempotent |
| `docs/04-development/architecture/auth-architecture.md` | edit | §9.5 mechanism block (warning → resolved) |
| `docs/03-requirements/FR-ADM-010.md` | edit | Notes "Deferred verification" → "Verified 2026-08-01" |
| `docs/02-business-processes/uat/BP-UAT-020.md` | edit (post-Step-8 only) | AC-3 checkbox + Status note + Notes |
| `apps/e2e/tests/uat/BP-UAT-020.session.spec.ts` | **no edit** | Step 002 logic is the correct oracle for both verdict directions |

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "Impact mapped — user-PATCH path (preferred, minimum-surface) on admin-bootstrap.service.ts + small AuthentikClient add; provisioning-script fallback for the documented password-expiry policy path if user-PATCH fails Step-8 live verification. No DB / shared-types / frontend / bot / workers surface."
  output_file: .copilot/tasks/active/wf-20260801-fix-190/02-impact-analysis.md
```
