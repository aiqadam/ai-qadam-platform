# 03 — Code Summary: FR-AUTH-004 (Magic-link authentication)

## Requirement Implemented

FR-AUTH-004's general-purpose magic-link mechanism, per the Scope Boundary
in `01-requirement-validation.md`: Authentik `magic-link-login` flow
provisioning, the `POST /v1/auth/magic-link` request endpoint, the
`apps/web-next` UI entry point (new page + a real-markup upgrade of
`sign-in.astro`), and reuse of the existing `AuthController.callback()`
session-issuance path (AC-7) with a comment-only FR-AUTH-006 extension
seam. Both open technical questions Step 1/2 flagged were pre-resolved by
the Orchestrator's live spike (`02b-authentik-spike-findings.md`) and
implemented exactly as recommended there — no re-derivation was needed.

Does **not** implement (per the binding Scope Boundary): the
`is_temporary` flip, points backfill, CRM sync, or the
`POST /v1/internal/telegram/upgrade-temp` endpoint / bot `/upgrade`
command (all FR-AUTH-006 / FR-BOT-002 PR 6/6).

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `scripts/provision-authentik-magic-link-flow.sh` | New | Idempotent resolve-or-create provisioning script for the `magic-link-login` Authentik flow. Mirrors `provision-authentik-recovery-flow.sh`'s exact pattern; deliberately has no Brand-binding step (not needed — see Key Design Decisions). Run live against `http://localhost:9000`; prints `EMAIL_STAGE_UUID=<uuid>` on its own line. |
| `apps/api/src/modules/admin-invites/authentik.client.ts` | Modified | Added `sendMagicLinkEmail(userPk, emailStageUuid)` calling `POST /api/v3/core/users/{id}/recovery_email/?email_stage=<uuid>` (204, no body). |
| `apps/api/src/config/env.ts` | Modified | Added `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` (optional string, Zod-validated), following the same "optional, degrades gracefully" pattern as `AUTHENTIK_ADMIN_TOKEN`. |
| `apps/api/.env.example` | Modified | Added matching `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID=` entry with explanatory comment (non-secret config id). |
| `apps/api/.env` (local, untracked) | Modified | Set `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID=cce8a11d-203a-49d7-ab07-be8c16a60094` — the live-resolved UUID from running the provisioning script against the local Authentik instance. Per CLAUDE.md's dev/test `.env` exception: non-secret config flag, stated here in chat per that policy's disclosure requirement. |
| `apps/api/src/modules/auth/magic-link.service.ts` | New | `MagicLinkService` — look-up-or-create Authentik user by email, then `sendMagicLinkEmail`. Exports `magicLinkRequestSchema` (reuses `emailField`). All internal errors (except missing config) are swallowed + logged, never rethrown — see Known Limitations for the security trade-off. |
| `apps/api/src/modules/auth/auth.module.ts` | Modified | Registered `MagicLinkService` as a provider. No new module imports needed — `AuthentikModule` was already imported. |
| `apps/api/src/modules/auth/auth.controller.ts` | Modified | Added `POST /v1/auth/magic-link` (public, `ThrottlerGuard` + 5/15min, always returns `{ ok: true }`). Added a comment-only FR-AUTH-006 extension-seam marker in `callback()` at the `upsertByAuthentikSubject()` call site — no behavioral change. |
| `apps/web-next/src/blocks/customer/MagicLinkForm.tsx` | New | React island — fetch-based (`apiClient`) JSON submit, `idle`/`submitting`/`success`/`error` phase state machine, Lucide `Mail`/`MailCheck` icons, `.input`/`.btn .btn-primary` primitives. Modeled on `LeadCaptureForm.tsx`, explicitly NOT `SignUpForm.tsx`'s native-form-302 pattern. |
| `apps/web-next/src/blocks/customer/index.ts` | Modified | Added `MagicLinkForm` barrel export. |
| `apps/web-next/src/pages/auth/sign-in-magic-link.astro` | New | New sibling page hosting `<MagicLinkForm client:load />`, modeled on `sign-up.astro` (PageHead, Layout, already-signed-in bounce guard). Carries the `@generated-from gen:page` marker required by ADR-0038 §Locks #3 (`arch:check`). |
| `apps/web-next/src/pages/auth/sign-in.astro` | Modified | Gained real markup for the first time: two options, "Continue with password" (preserves the exact prior bare-redirect target/`?next=` sanitize logic, now as a link) and "Sign in with email link" (links to the new page). Already-signed-in bounce-to-`/me` guard added (previously absent — the old bare redirect had no such check). |

## Key Design Decisions

1. **No `Brand.flow_recovery`-style binding step in the provisioning
   script.** Unlike the recovery flow, `magic-link-login` is reached only
   via `AuthentikClient.sendMagicLinkEmail`'s direct `email_stage=<uuid>`
   query param (confirmed live by the spike) or the flow's own slug URL —
   never through a `Brand.flow_*` field. Adding a Brand-binding step would
   have been dead code; the task brief explicitly said to skip it, and the
   live run confirms the flow works without one (`/if/flow/magic-link-login/`
   returns 200; the API-triggered email send doesn't touch Brand at all).

2. **`sign-in.astro` gained real markup rather than staying a bare
   redirect with the magic-link option bolted on elsewhere.** The impact
   analysis offered both options ("add markup to `sign-in.astro`" or "leave
   it a bare redirect and only add the new sibling page") as architecturally
   sound. I chose the real-markup path because the FR's own AC-1 wording
   ("On `/auth/sign-in`, a 'Sign in with email link' option appears")
   requires the option to be discoverable from that exact URL, not just
   reachable from somewhere else — a bare SSR redirect page cannot host a
   "second option" by definition. The prior redirect behavior is preserved
   exactly as a `<a href="/api/v1/auth/login?next=...">Continue with
   password</a>` link (same target, same `?next=` sanitize logic, still a
   plain top-level navigation) — no regression to the existing password
   path.

3. **`MagicLinkService.requestMagicLink()` always swallows internal
   errors and never throws past the "not configured" case.** See Known
   Limitations below for the full security-vs-availability trade-off
   this required weighing, and why I resolved it toward the safer choice.

4. **Username derivation duplicates `RegistrationService.deriveUsername`
   verbatim** (same `[a-z0-9.]` slug rules + `randomBytes(3)` suffix)
   rather than extracting a shared helper. Both call sites are small,
   stable, and independently owned by services with no existing shared
   module to home a cross-cutting helper in without a new import edge;
   given `AGENTS.md`'s bias toward small, focused diffs over
   pre-emptive refactors, I left the duplication rather than introduce a
   new shared utility module for two 10-line call sites. Flagging this in
   case the SecurityReviewer or a later pass wants to consolidate.

5. **The Email stage's `token_expiry` is explicitly set to 15**, not
   copied from the recovery flow's Email stage (which ships with 30) —
   required by FR-AUTH-004 AC-3 and confirmed live: `curl` against the
   provisioned stage shows `"token_expiry": 15`.

## Architecture Rule Compliance

- **Module boundaries:** `MagicLinkService` lives in `AuthModule`, calls
  `AuthentikClient` via the already-imported `AuthentikModule` — no new
  module import, no cross-module entity reach.
- **Tenant scoping:** N/A — magic-link identity resolution is
  global/user-scoped (Authentik user records have no `country_code`),
  consistent with every other Authentik-identity call in this codebase.
- **Zod at boundaries:** `magicLinkRequestSchema` validates the controller
  body via `safeParse` before any service call, matching `registerSchema`'s
  exact convention.
- **No cross-schema queries:** all Authentik state access goes through
  `AuthentikClient`'s REST wrapper; no direct `authentik` Postgres schema
  touch.
- **No `any`:** confirmed — `tsc --noEmit` clean, no `any` introduced.
- **Auth guard at controller level:** `POST /v1/auth/magic-link` carries
  no `AuthGuard` (deliberately public, per the FR) but does carry
  `ThrottlerGuard` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })`,
  matching `register`/`telegram/exchange`'s exact decorator pair.
- **Custom typed errors:** `AuthentikError` (existing) is caught and
  logged, not rethrown as a bare `Error`; `ServiceUnavailableException`
  used for the configuration-gap case, matching
  `telegram-auth.service.ts`'s `getBotToken()` convention.
- **RFC 7807 / response shape:** the endpoint's only success shape is
  `{ ok: true }` (HTTP 200), by design (anti-enumeration) — no error body
  is ever returned to the caller for this endpoint; `BadRequestException`
  still applies for malformed input (Zod validation failure), matching
  every other endpoint in this controller.
- **React component rules:** `MagicLinkForm` is functional, no
  `dangerouslySetInnerHTML`, explicit prop types (none needed — no props),
  component file well under 200 lines.
- **Astro page rules:** both `sign-in-magic-link.astro` and the modified
  `sign-in.astro` check `Astro.locals.auth` before rendering protected/
  redirect-relevant content (bounce to `/me` if already signed in).

## Formatter Check

`pnpm biome check --write` run against all changed TS/TSX files — **no
fixes applied, all clean** (both before and after other validation steps).
`.astro` files are covered by `astro check` (typecheck), not biome — also
clean.

## Known Limitations

1. **FR-AUTH-006's temp-account upgrade logic is NOT built here.** Only a
   comment-only extension seam exists in `AuthController.callback()` at
   the `upsertByAuthentikSubject()` call site. No `is_temporary` branching,
   no points backfill, no CRM sync — all explicitly out of this workflow's
   scope per the validated requirement.

2. **AC-2 (single-use) and AC-3 (15-minute expiry) are Authentik-native
   behaviors this workflow *configures* (via the provisioning script) but
   does not itself unit-test.** They will be verified live by the
   Orchestrator at Step 8/13 against the real Authentik instance, per the
   impact analysis's Test Scope guidance. This code summary only confirms
   the *configuration* is correct (`token_expiry: 15` verified live via
   `curl`; single-use is Authentik's own Email-stage token semantics,
   unconfigurable/inherent, same as the existing recovery flow already
   relies on).

3. **Playwright E2E for the actual link-click completion is out of this
   step's scope.** Only the form-submission-to-confirmation-state path
   (fill email → see "Check your email") is covered by this
   implementation; TestDesigner/TestRunner own the click-through E2E (or
   its live-UAT equivalent, if the local SMTP catcher doesn't expose a
   pollable REST API) at Steps 6-8, per the impact analysis's Test Scope
   section.

4. **Error-handling trade-off in `MagicLinkService.requestMagicLink()` —
   documented per the task brief's explicit request to note this
   decision.** The task brief asked me to weigh: match the codebase's
   existing "Authentik is a hard dependency, surfaced as 502/503"
   convention (`AuthentikClient`'s own header comment; `telegram-auth
   .service.ts`'s `getBotToken()`) vs. avoid creating a
   distinguishable-response enumeration oracle. I resolved this by
   **always returning `{ ok: true }`** for any failure *after* the
   configuration check (Authentik unreachable mid-request, user-creation
   failure, the `sendMagicLinkEmail` call itself failing) — the error is
   logged server-side via the existing `Logger` convention and swallowed,
   never surfaced as a 5xx to the caller. The one exception is a
   **configuration gap** (`AUTHENTIK_ADMIN_TOKEN` or
   `AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID` unset) — this still throws
   `ServiceUnavailableException` (503), because that failure is identical
   for every request regardless of the submitted email (a deployment
   state, not a per-request outcome), so it carries no enumeration signal
   — the same reasoning that makes `getBotToken()`'s 503 safe. **Trade-off
   accepted:** a genuine Authentik outage while processing a *specific*
   email is now invisible to the caller and to monitoring that only
   watches HTTP status codes — it's only visible via the `logger.warn`
   line. I judged the anti-enumeration guarantee (this endpoint must never
   let a scripted client distinguish "no such account" from "transient
   infra hiccup" from "created successfully") as the higher-priority
   security property for a public, unauthenticated endpoint, consistent
   with the impact analysis's Risk Flag #2 explicitly calling out
   `register`'s prior enumeration retrofit as the failure mode to avoid
   repeating. If this trade-off should instead favor observability (e.g.
   emit a metric/ops-event on the swallowed-error path so an operator can
   detect a total Authentik outage without email content leaking), that's
   a straightforward follow-up — flagging for SecurityReviewer /
   Orchestrator judgment rather than deciding it silently.

5. **Username-derivation duplication** between
   `RegistrationService.deriveUsername` and
   `MagicLinkService.deriveUsername` — see Key Design Decisions #4.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-AUTH-004's magic-link mechanism (Authentik flow provisioning, request endpoint, apps/web-next UI, FR-AUTH-006 extension seam) is implemented per the validated requirement's Scope Boundary. All self-validation checks pass clean: pnpm --filter api typecheck/lint/build, pnpm --filter web-next typecheck/lint/build, pnpm arch:check, pnpm biome check --write (no fixes applied). The provisioning script was run live twice against the local Authentik instance (first run created all objects; second run confirmed full idempotency) and independently verified via follow-up curl GETs against the Email stage, flow instance, and flow bindings — all three match the script's own printed output exactly."
  findings:
    - "Resolved Email stage UUID (live, local Authentik): cce8a11d-203a-49d7-ab07-be8c16a60094. Flow UUID: dce29da3-a459-4161-aafa-61b711c4079d (slug=magic-link-login). Identification stage: ad30983a-3b5b-4cca-8a9d-66b63c414486. UserLoginStage (existing built-in, resolved not created): e4445e89-c0ed-40ae-8f9a-13203d6d6997 (name=default-authentication-login) — matches 02b-authentik-spike-findings.md's own live-queried pk exactly."
    - "apps/api/.env (local, untracked) was directly edited to set AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID to the resolved UUID above, per CLAUDE.md's dev/test .env exception — a non-secret config flag, disclosed here per that policy's requirement."
    - "arch:check initially failed on the new sign-in-magic-link.astro page (ADR-0038 §Locks #3 requires the @generated-from gen:page marker) because pnpm gen:page could not be used without either overwriting the hand-crafted content or requiring a two-step generate-then-edit dance; fixed by adding the identical marker comment sign-up.astro already carries. Re-ran arch:check clean afterward (274 files scanned)."
    - "Deviation from the task brief worth flagging: MagicLinkService.requestMagicLink() swallows ALL internal errors (including genuine Authentik-unreachable failures) to preserve the anti-enumeration guarantee, rather than surfacing them as 502/503 the way AuthentikClient's other hard-dependency callers do. This was an explicit, reasoned choice under the task brief's own 'if genuinely torn, prefer the security-safer choice' guidance — see Known Limitations #4 for the full trade-off writeup and an operator-observability follow-up suggestion."
    - "FR-AUTH-006's extension seam is comment-only, exactly as scoped — no is_temporary branching, no hook registration, no webhook/event emitter introduced."
```
