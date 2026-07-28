# Step 2: Impact Analysis

**Workflow:** wf-20260728-fix-139 · **Issue:** [ISS-USR-REDIRECT-001](../../../issues/ISS-USR-REDIRECT-001.md)

## Affected surface

Both `apps/web` and `apps/web-next` share the identical defect pattern
(same code shape, independently duplicated):

| File | Role |
|---|---|
| `apps/api/src/modules/auth/auth.service.ts` (`postLoginRedirectUrl`) | Computes the final post-callback redirect target from `next`. |
| `apps/api/src/modules/auth/auth.controller.ts` (`login`, `callback`) | Reads `next` query param (default `undefined`→sanitised to `/`… actually default is set upstream, see below), stores it in the signed flow cookie, calls `postLoginRedirectUrl(next)` after a successful callback. |
| `apps/web-next/src/pages/auth/sign-in.astro` | `rawNext = url.searchParams.get('next') ?? '/'` — defaults to `/` when no `?next=` is present. |
| `apps/web/src/pages/auth/sign-in.astro` | Same default-to-`/` pattern. |
| `apps/web-next/src/blocks/common/AppNav.astro` | "Sign in" CTA: `next=<currentPath>` — for a first-time visitor clicking "Sign in" from the homepage, `currentPath` is `/`. |
| `apps/web-next/src/blocks/customer/SignUpForm.tsx` + `apps/api/src/modules/auth/registration.service.ts` | Self-registration's welcome email carries an Authentik-hosted one-time recovery link (`authentik.createRecoveryLink`) that is **not** minted through `/v1/auth/login?next=`, so no `next=/me` is ever attached to that path either. |

## Root cause

`postLoginRedirectUrl(next)` in `auth.service.ts:169-173` redirects the
browser to `next` verbatim (or bare `env.WEB_BASE_URL` when `next` is
falsy/unsafe). **No code path in the app ever sets `next=/me`.** Every
entry point that constructs the `/v1/auth/login?next=...` URL defaults to
the *current page path* (typically `/` for a first-time or homepage
visitor) or omits `next` entirely (both `sign-in.astro` variants default
`rawNext` to `/` when the query param is absent). The self-registration
welcome-email recovery link bypasses this parameter entirely.

`FR-USR-001` AC-1 requires: "A new user who completes sign-up via
Authentik and returns to the platform lands at `/me`." No code currently
implements this — the redirect target has only ever been "wherever the
user was before clicking Sign in," which for a brand-new user is almost
always `/` (homepage), not `/me`. This is not a regression from a prior
correct state — grepping git history and the existing `ISS-USR-REG-*`
issue trail shows this was never implemented, only assumed covered by the
generic `next` passthrough.

## Fix approach

Distinguish two cases at the point `next` is decided:
1. **Returning user with explicit context** (clicked "Sign in" from a
   gated page, e.g. `/workspace`, `/events/123`) — keep today's behavior:
   redirect back to where they came from. This is correct and must not
   regress (`ISS-UAT-009-2`/BP-UAT-009 already cover this).
2. **No explicit `next` supplied** (bare `/auth/sign-in` visit, or the
   self-registration recovery-link path with no flow cookie at all) —
   default target must be `/me`, not `/`.

Simplest, lowest-blast-radius fix: change the default in both
`sign-in.astro` files from `'/'` to `'/me'` when `?next=` is absent, and
change `AppNav.astro`'s CTA to omit `next` (or pass `/me`) when
`currentPath` is `/` (the homepage) — since arriving at sign-in from the
homepage is exactly the "no real context to return to" case. Do **not**
touch `postLoginRedirectUrl` itself (it's a pure passthrough and is
correctly shared infra); do **not** touch the flow-cookie mechanism.

**Self-registration recovery-link path — CONFIRMED live via Authentik
API, separate finding filed, not in scope of this fix.** Queried
`aiqadam-authentik-server` directly (`GET
/api/v3/flows/instances/?slug=default-recovery-flow` +
`/api/v3/stages/all/?flow=<pk>`): the recovery flow consumed by
`POST /api/v3/core/users/{pk}/recovery/`'s link has exactly two stages —
`aiqadam-recovery-identification` (`ak-stage-identification-form`) and
`aiqadam-recovery-email` (`ak-stage-email-form`). There is no login stage
and no user-write/redirect stage bound to this flow, and
`AuthentikClient.createRecoveryLink()` (`admin-invites/authentik.client.ts:239`)
passes no `next`/redirect target when minting the link. This means
consuming the welcome email's one-time link does **not** re-enter our
OIDC `authorize`/`callback` endpoints at all — it re-triggers Authentik's
own "recover your account" email flow (asks the user to re-verify by
email again) with no path back into the app. This is a **separate,
more severe bug** than the reported symptom (first-time sign-in via the
welcome-email link doesn't work at all, rather than landing on the wrong
page) and is filed as **ISS-USR-REDIRECT-002** (see registry) — out of
scope for this fix per AGENTS.md §13 (not silently folding in an
unrelated, larger-blast-radius defect). This workflow fixes the `next`
defaulting bug only, which covers the direct "Sign in" entry points
(nav CTA, bare `/auth/sign-in` visit) that AC-1 of FR-USR-001 exercises
in its own acceptance test (a returning/already-provisioned user
completing sign-in via Authentik's standard authorize flow).

**User decision (2026-07-28, in-chat):** given both bugs are real and
both affect first-time sign-in, fix both within this session rather than
deferring ISS-USR-REDIRECT-002. Sequenced as two PRs to respect
AGENTS.md §4 (small-PR cap) and because they're independently testable:
- **PR 1 (this workflow, wf-20260728-fix-139):** `next` defaulting fix —
  app code only, closes GitHub issue #89 / ISS-USR-REDIRECT-001.
- **PR 2 (follow-up workflow, queued immediately after this one closes):**
  Authentik recovery-flow redirect fix for ISS-USR-REDIRECT-002 — bind a
  login/redirect stage on the recovery flow (or switch the welcome-email
  link to route through the app's own `/v1/auth/login` after establishing
  the Authentik session) so the welcome-email link actually lands the new
  member in the app instead of re-triggering Authentik's own recovery
  email prompt.

## Files to modify

- `apps/web-next/src/pages/auth/sign-in.astro` — default `next` to `/me`.
- `apps/web/src/pages/auth/sign-in.astro` — same, for parity (both apps
  share this defect; `apps/web-next` is the production-traffic app per
  `ISS-WEB-NEXT-I18N-001` precedent, but `apps/web` is still reachable and
  under active E2E coverage).
- `apps/web-next/src/blocks/common/AppNav.astro` — Sign-in CTA: only pass
  `next=<currentPath>` when `currentPath` is not `/` (i.e. don't send a
  homepage visitor back to the homepage).

No DB migration needed. No API contract change (query param default only,
BC-safe — explicit `?next=` callers unaffected).

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Root cause: no code path ever sets next=/me; sign-in.astro (both apps) and AppNav.astro default to the current/home path. Fix: default next to /me when absent. Self-registration recovery-link flow-cookie gap flagged as a possible separate, more severe issue pending live confirmation."
```
