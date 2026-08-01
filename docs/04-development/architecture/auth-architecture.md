# AI Qadam — Authentication Architecture

> **Status:** authoritative as of 2026-05-17.
> **Audience:** engineers + operators who need to understand, debug, or
> extend the sign-in / sign-out / session lifecycle.
> **Companions:** [ADR-0016 — Web auth flow](../../adr/0016-web-auth-flow.md),
> [Authentik runbook](../infrastructure/runbooks/authentik-local-bootstrap.md).

---

## 1. The one-paragraph version

We use **OIDC Authorization Code Flow with PKCE** (RFC 6749 §4.1 + RFC 7636)
to delegate password handling to **Authentik**, an enterprise OIDC provider
running at `auth.aiqadam.org`. The user's password never touches our API or
our browser code — only Authentik sees it. After Authentik validates the
user, we mint **our own session** (a short-lived signed JWT for
authorization + an opaque rotating refresh row in Postgres) tied to a
**cross-subdomain cookie** so one sign-in is good across uz / kz / tj /
admin / global. Sign-out **revokes** the refresh row and **deny-lists** the
current JWT's `jti` in Redis so the rest of its lifetime can't be used.

---

## 2. Why this design

We considered three approaches before landing here. Notes carried forward
so future-you doesn't re-litigate this.

| Option | What | Verdict |
|---|---|---|
| OIDC redirect (this doc) | User clicks Sign in → bounced to `auth.aiqadam.org` → bounced back signed in | **Chosen.** Most secure + most mature. Battle-tested by Google, Microsoft, Spotify, every AWS console. |
| ROPC password grant | App POSTs email+password to Authentik token endpoint | **Removed in Authentik 2024+.** RFC 6749 itself deprecates it. |
| Local password storage | argon2id hashes in our `users` table | Forces us to own brute-force / lockout / MFA / breached-password detection. Authentik gives us all four free. |

The "user sees a different subdomain" objection (which biases people away
from OIDC redirect) is reframed here as a **security feature**:

- **Cookie isolation.** Auth cookies are on `auth.aiqadam.org`; app cookies
  are on `.aiqadam.org`. A bug in our app code cannot expose Authentik's
  session.
- **Anti-phishing.** Users learn "passwords only on `auth.aiqadam.org`."
  A clone at `uz.aiqadam.org-evil.com` asking for a password is more
  obviously fake.
- **Audit clarity.** Authentik's Events table is the single ledger for
  every authentication attempt (success, fail, lockout). No "is this our
  log or theirs?" confusion.

We brand `auth.aiqadam.org` to look like AI Qadam (logo, color, type) so
users perceive a continuous brand experience even though the URL changes.

---

## 3. Components

```
┌──────────────────┐      ┌────────────────────┐      ┌────────────────────┐
│  Browser (user)  │      │  AI Qadam Web      │      │  AI Qadam API      │
│                  │      │  (Astro SSR)       │      │  (NestJS)          │
└──────────────────┘      └────────────────────┘      └────────────────────┘
         │                          │                            │
         │ 1. Visit /admin          │                            │
         │─────────────────────────▶│                            │
         │                          │ render anon page           │
         │                          │ with [Sign in] button      │
         │ 2. Click Sign in         │                            │
         │─────────────────────────────────────────────────────▶ │
         │                          │ GET /v1/auth/login         │
         │                          │ ?next=/admin               │
         │                          │                            │
         │ 3. 302 → Authentik       │                            │
         │ + flow cookie set        │                            │
         │ ◀───────────────────────────────────────────────────  │
         │                                                       │
         │ 4. user enters password on auth.aiqadam.org           │
         │                                                       │
         │ 5. 302 → /v1/auth/callback                            │
         │     ?code=&state=                                     │
         │─────────────────────────────────────────────────────▶ │
         │                                                       │
         │                          ┌──────────────────────────┐ │
         │                          │  Authentik (OIDC IdP)    │ │
         │                          │  auth.aiqadam.org        │ │
         │                          └──────────────────────────┘ │
         │                          │ exchange code+verifier    ▲│
         │                          │ for id_token              ││
         │                          └───────────────────────────┘│
         │                                                       │
         │                                                       │ upsert user,
         │                                                       │ mint session,
         │                                                       │ set refresh cookie
         │                                                       │ on .aiqadam.org,
         │ 6. 302 → /admin                                       │ redirect to next
         │ ◀───────────────────────────────────────────────────  │
         │                                                       │
         │ 7. GET /admin (now signed in)                         │
         │─────────────────────────▶│                            │
         │                          │ AdminDashboard island      │
         │                          │ XHR POST /v1/auth/refresh  │
         │                          │  (sends refresh cookie)    │
         │                          │─────────────────────────▶  │
         │                          │  (returns access JWT)      │
         │                          │ ◀────────────────────────  │
         │                          │ XHR GET /v1/admin/dashboard│
         │                          │  Authorization: Bearer ... │
         │                          │─────────────────────────▶  │
         │                          │  (data)                    │
         │                          │ ◀────────────────────────  │
         │ 8. Rendered page         │                            │
         │ ◀────────────────────────│                            │
```

### 3.1 Web (Astro, `apps/web`)

- `pages/auth/sign-in.astro` — branded landing for `/auth/sign-in?next=…`.
  Sanitises `next` (must be same-origin relative path) before passing
  to the island.
- `components/SignInForm.tsx` — a single button linking to
  `/api/v1/auth/login?next=…`. No credentials handled here.
- `pages/auth/signed-out.astro` — confirmation landing after sign-out.

### 3.2 API (NestJS, `apps/api/src/modules/auth`)

- `auth.controller.ts` — five routes:
  - `GET  /v1/auth/login?next=…` — kicks off the OIDC flow.
  - `GET  /v1/auth/callback` — completes the OIDC flow.
  - `POST /v1/auth/refresh` — rotates the refresh cookie + returns a new access JWT.
  - `POST /v1/auth/sign-out` — revokes refresh row + deny-lists the JWT.
  - `GET  /v1/auth/me` — returns the signed-in user.
- `auth.service.ts` — OIDC dance (startAuthorization / completeAuthorization)
  + session minter.
- `jwt.service.ts` — signs/verifies access JWTs. Each token gets a unique
  `jti`; verify consults the Redis deny-list.
- `jti-revocation.service.ts` — Redis `SETEX jwt:revoked:<jti> <ttl> 1`
  on sign-out; AuthGuard reads it on every protected request.
- `refresh-token.service.ts` — Postgres-backed opaque refresh tokens with
  rotation + replay detection (a previously-used token kills the whole family).
- `auth.guard.ts` — Nest guard for `@UseGuards(AuthGuard)`.
- `admin.guard.ts` + `roles.decorator.ts` — role gate that layers on top.
- `oidc-client.provider.ts` — discovery + Authentik client setup.

### 3.3 Authentik (`auth.aiqadam.org`)

- Runs in Coolify alongside the app.
- Backing store: Postgres (separate DB from ours).
- The OAuth2 provider for AI Qadam has redirect URIs whitelisted for
  every country subdomain.
- **Branded** (see §7) so the login page reads as AI Qadam.

### 3.4 Redis

- One key namespace today: `jwt:revoked:<jti>` (sign-out deny-list).
- Used by BullMQ later for jobs; same instance.

---

## 4. The token + cookie model

| Thing | Lives in | TTL | Purpose | What kills it |
|---|---|---|---|---|
| Authentik session cookie | Browser, scoped to `auth.aiqadam.org` | Authentik default | Lets Authentik recognise the user across sign-ins | Authentik sign-out OR cookie expiry |
| Flow cookie `aiqadam-oauth-flow` | Browser, `.aiqadam.org` | 60s | Carries OAuth state + PKCE verifier + `next` URL across the round trip to Authentik | Verified + cleared on /callback |
| Refresh cookie `aiqadam-refresh` | Browser, `.aiqadam.org` | 14 days rolling | Lets the user stay signed in across browser restarts; rotates on every use | /sign-out OR 14d inactivity OR replay-detect on the family |
| Refresh row | Postgres `refresh_tokens` table | 14 days | Server-side record of the live refresh token (`tokenHash`); supports replay detection and family-wide revoke | Updated on rotate; row marked revoked on /sign-out or replay |
| Access JWT | In memory (never persisted client-side) | 15 minutes | Bearer token sent on `Authorization` header for protected routes | `exp` claim OR jti deny-list entry in Redis OR re-sign on rotate |
| Bearer header | `Authorization: Bearer …` | per request | What guards verify | not stored |

The two important invariants:

1. **Access JWTs are signed by us** with `JWT_SIGNING_SECRET`. Authentik's
   tokens are never sent to the browser. (Authentik mints id_tokens that
   our API consumes server-side during the callback exchange.)
2. **Refresh tokens are opaque random bytes.** Their hash (sha256) is what
   lives in Postgres; the plain value never appears server-side after the
   issue call. The full table is in `apps/api/src/modules/auth/refresh-token.schema.ts`.

---

## 5. Lifecycle walkthrough

### 5.1 Sign-in

1. User visits any protected page (e.g. `uz.aiqadam.org/admin`).
2. The island bootstraps with `POST /v1/auth/refresh` — no cookie → 401.
3. UI shows `[Continue to sign in]` link to `/auth/sign-in?next=/admin`.
4. User clicks → SSR page shows branded card with `[Continue to sign in]`
   button → link to `GET /v1/auth/login?next=/admin`.
5. API computes `state`, `code_verifier`, `code_challenge`, packs all three
   + `next` into a JWT signed flow cookie (60s TTL), 302s to Authentik's
   `/application/o/authorize/`.
6. User submits credentials on `auth.aiqadam.org` (branded as AI Qadam).
7. Authentik validates, 302s to `GET /v1/auth/callback?code=&state=`.
8. API reads the flow cookie, verifies the OAuth state matches, exchanges
   the code (+ stored verifier) for an `id_token` against
   Authentik's `/application/o/token/`.
9. Identity claims (`sub`, `email`, `name`) get extracted and **upserted**
   into our `users` table (keyed by `authentik_subject` = OIDC `sub`).
10. We mint our session pair: a 15-min access JWT (with random `jti`) and a
    14-day refresh row.
11. Set `aiqadam-refresh` cookie on `.aiqadam.org`, clear the flow cookie,
    302 the browser to `next` (`/admin` in this example).
12. `/admin` reloads. The island re-runs `POST /v1/auth/refresh` — cookie
    is now present → API rotates it + returns a new access token.
13. The island uses that access token to fetch `/v1/admin/dashboard`.
    AdminGuard verifies the JWT (not in deny-list) + role check passes →
    dashboard renders.

### 5.2 Token rotation

- Every `POST /v1/auth/refresh` consumes the current cookie and issues a
  **new** refresh token in the **same family** (`familyId` from the consumed
  row). The new value goes into a new row + replaces the cookie.
- The old row is left in the DB with `usedAt` set. If anyone presents that
  used token again, the whole family is revoked — this is **refresh token
  replay detection** (RFC 6819 / OAuth Security BCP).
- Access tokens are minted fresh on every refresh — they never rotate by
  themselves; they expire and are replaced.

### 5.3 Sign-out

1. User clicks Sign out (currently in `MeDashboard`).
2. Client fetches a fresh access token via `/v1/auth/refresh`.
3. Client POSTs `/v1/auth/sign-out` with `Authorization: Bearer <access>`.
4. API:
   a. Reads the refresh cookie → calls `consume()` → marks the row used →
      calls `revokeFamily()` to revoke every other row in the same family.
   b. Verifies the bearer token → puts `jti` in Redis with TTL = remaining
      JWT lifetime. AuthGuard refuses any further use immediately.
   c. Clears both new + legacy cookies on `.aiqadam.org` and on the current
      host.
   d. Builds an Authentik `end_session_endpoint` URL via
      `AuthService.buildLogoutUrl()` — with `id_token_hint` +
      `post_logout_redirect_uri` when an id_token is available, or no-hint
      when only a valid bearer survives a refresh-token race.
5. Client navigates the browser to that logoutUrl. Authentik runs the
   invalidation flow bound to the provider (the built-in
   `default-provider-invalidation-flow`; see `.copilot/bootstrap-oidc.sh`
   for the PK). That flow **always renders an RP-Initiated Logout
   confirmation interstitial** — heading "You've logged out of AI Qadam
   Platform (local)." with three buttons (Go back to overview / Log out
   of authentik / Log back into AI Qadam Platform (local)) — even when a
   valid `id_token_hint` is present. Per OIDC RP-Initiated Logout 1.0 §2
   the IdP "MAY" skip that confirmation when the hint is present; the
   word "MAY" is not a guarantee and Authentik's default flow does not
   skip it. This is the trade-off accepted on 2026-05-23 (PR #234):
   IdP-session-termination wins over silent auto-redirect, because
   silent re-sign-in on a platform that promises SSO sign-out is the
   worse failure mode. See ISS-UAT-009-1 for the full rationale.
6. When the user clicks **Log out of authentik** on the interstitial,
   Authentik completes the invalidation, the IdP session is killed,
   and the browser 302s to `post_logout_redirect_uri` =
   `https://auth.aiqadam.org/.../auth/signed-out` (per
   BP-UAT-009 Step 004, AC-7). The local `aiqadam-refresh` cookie is
   already absent from this point on — it was cleared in step 4c.

### 5.4 What happens if Redis is down

- `JtiRevocationService.isRevoked()` throws or returns false.
- AuthGuard sees `isRevoked === false` → token passes verification.
- Effect: sign-out becomes best-effort during a Redis outage. The refresh
  cookie is still cleared (browser-side); the JWT's remaining 15 minutes
  could in principle be reused if the user has the bearer cached.
- Mitigation: keep Redis up; the same instance powers BullMQ jobs, so
  outages should be very visible.

---

## 6. How to scale this

### 6.1 Add a new app subdomain

Cookie is `.aiqadam.org`-scoped, so a new app subdomain inherits the
session automatically. The only operational step is adding the subdomain
to the Authentik provider's `redirect_uris` list so the OIDC flow can
land at it:

```bash
AK_TOKEN=…
curl -sH "Authorization: Bearer $AK_TOKEN" \
  -X PATCH "https://auth.aiqadam.org/api/v3/providers/oauth2/1/" \
  -H "content-type: application/json" \
  --data '{"redirect_uris":[…existing…, {"matching_mode":"strict","url":"https://newapp.aiqadam.org/api/v1/auth/callback"}]}'
```

If the new app has its own API, it should reuse the same `JWT_SIGNING_SECRET`
to verify tokens. Same key = same audience = same trust boundary.

### 6.2 Add MFA (TOTP, WebAuthn)

Configure Authentik's **authentication flow** to chain a
`Multi-factor Validation` stage after the password stage. From our app's
perspective nothing changes — the OIDC callback still arrives with an
id_token; Authentik just took an extra step in between. No code change in
this repo.

Roll it out gradually: bind the MFA stage to a policy that targets only
the `super_admin` and `country_admin` roles first; expand to all members
later.

### 6.3 Add federated identity providers (Google / Microsoft / Telegram)

In Authentik: add an OAuth source for the provider. On the user-facing
login page, Authentik renders "Sign in with Google" etc. alongside the
password form. No code change in this repo.

### 6.4 Add a Telegram bot or other API consumer

Two options:

- **Same identity:** the bot signs in with OIDC just like the web app
  (using a public client + device-code grant). Get back the same id_token,
  exchange for our session JWT through a new endpoint, use it.
- **Service-to-service:** issue a separate signing key for machine-to-machine
  tokens (a different `aud` claim). Don't reuse the user-facing
  `JWT_SIGNING_SECRET`.

### 6.5 Rotate the JWT signing secret

1. Generate a new 32+ char secret.
2. Add it alongside the current one as `JWT_SIGNING_SECRET_NEXT`.
3. `jwt.service.verify()` accepts both; `sign()` uses NEXT.
4. After the 15-minute access TTL elapses, retire the old one.

(Currently `verify()` only accepts the current secret — graceful rotation
is a TODO; document this trade-off when first rotating.)

### 6.6 Add account self-service (profile edit, password change)

- **Profile edit** lives in our app — `/me/profile` calls a new
  `PATCH /v1/users/me` endpoint. No Authentik changes; we update the
  denormalised `displayName` etc. in our `users` table.
- **Password change** should go through Authentik's user-self-service flow.
  Expose a link `https://auth.aiqadam.org/if/user/#/settings` from `/me`.
  Authentik handles its own UI; the user comes back without our session
  changing.
- **Forgot password** is wired via Authentik's Recovery Flow. The flow
  is enabled in `infrastructure/authentik/` provisioning via
  [`scripts/provision-authentik-recovery-flow.sh`](../../../scripts/provision-authentik-recovery-flow.sh),
  which is invoked at UAT env-setup STEP 7b/9. The recovery email
  subject is branded to `'Reset your AI Qadam password'`. The flow
  resolves at `${AUTHENTIK_URL}/if/flow/recovery/`; Authentik's login
  UI automatically renders the "Forgot password?" link once
  `Brand.flow_recovery` is bound — no `apps/web` or `apps/web-next`
  edit required. Member-facing docs:
  [`BP-USR-PWRESET.md`](../02-business-processes/uat/BP-USR-PWRESET.md).
  Member-facing runbook:
  [`member-password-reset.md`](../02-business-processes/operations/member-password-reset.md).

### 6.7 Add per-country / per-resource RBAC (the planned next step)

The `AdminGuard` + `@Roles(...)` pattern is already in place. To enforce
"country_admin only sees their own country":

1. Add a `users.scope_country_codes text[]` column (or a join table
   `user_country_scopes`).
2. Extend `AdminGuard` to read it and store the allowed list on
   `req.user.scopes`.
3. Every tenant-scoped admin query already takes `countryCode`; have the
   service reject if `req.user.scopes` doesn't include the caller's
   tenant.

### 6.8 Audit logging

Authentik's "Events" table is the auth-event log of record. Anything we
generate (registrations, points awards) lives in our Postgres. To
correlate: every action stamped with `userId`, which maps 1:1 to
`authentikSubject`, which maps 1:1 to Authentik's user PK.

### 6.9 Add a passwordless magic-link flow (FR-AUTH-004)

**Shipped** (`wf-20260801-feat-179`). A second, independent Authentik
flow — `magic-link-login` — lets any member (in particular Telegram-only
temp accounts with no password set) sign in via a one-time emailed link
instead of a password. Provisioned by
[`scripts/provision-authentik-magic-link-flow.sh`](../../../scripts/provision-authentik-magic-link-flow.sh),
which mirrors `provision-authentik-recovery-flow.sh`'s idempotent
resolve-or-create shape but diverges from it at two points documented
here because both were **wrong on the first live-tested attempt** and
the fix is non-obvious. Anyone provisioning a new Authentik flow this way
should read this section before assuming the recovery-flow script's
pattern transfers directly.

**Entry point:** `apps/web-next/src/pages/auth/sign-in-magic-link.astro`
→ `POST /v1/auth/magic-link` (public, throttled 5/15min like `register`
and `telegram/exchange`) → `MagicLinkService.requestMagicLink()` →
`AuthentikClient.sendMagicLinkEmail()`. Completion reuses the **same**
`AuthController.callback()` OIDC funnel every other sign-in method uses
— no parallel session-issuance path was introduced. A comment-only
extension seam sits at the `upsertByAuthentikSubject()` call site inside
`callback()` for FR-AUTH-006 (temp-account upgrade: `is_temporary` flip
+ points backfill) to hook into later; that logic is not built yet.

**Gotcha #1 — the link-minting endpoint is not flow-parameterized, it's
Brand-parameterized.** Authentik's only server-to-server "mint a one-time
sign-in link and email it" primitive is
`POST /api/v3/core/users/{id}/recovery_email/?email_stage=<uuid>` (the
same endpoint `AuthentikClient.createRecoveryLink()`-style calls use).
The `email_stage` query param controls **only the sent email's
subject/template** — it has no effect on which flow the link's token
resumes. The link is always minted into whatever flow is bound at
**`request.brand.flow_recovery`**, and `Brand` is resolved **per-request
from the `Host` header** (`iendswith`-matched against `Brand.domain`,
falling back to the row with `default=True` —
`authentik/brands/middleware.py` + `authentik/brands/utils.py`
`get_brand_for_request()`). There is no per-call flow-slug argument
anywhere in this chain.

Consequence: reusing this endpoint for a second flow **without** a second
Brand silently mints links into the default Brand's `flow_recovery`
(`default-recovery-flow`, i.e. password-reset) — sends the right subject
line with the wrong link and the wrong (password-reset) email body copy.
This shipped as a real bug in this workflow's first pass and was only
caught by reading the actual received email body during live UAT, not by
any mocked/unit test or by reading the OpenAPI schema shape.

**The fix:** provision a **second Authentik `Brand`** (own `domain`,
`default: false`, `flow_recovery` bound to the new flow — the default
Brand's own `flow_recovery` is left untouched, so the existing
password-reset flow is unaffected) and send the outbound
`recovery_email/` request with a `Host` header equal to that Brand's
`domain`. One implementation trap along the way: Node's global `fetch`
(undici) treats `Host` as a WHATWG "forbidden request header" and
**silently drops/overwrites** any value passed via `init.headers` —
confirmed by a standalone repro before relying on it. Use
`node:http`/`node:https` directly for this one call (see
`AuthentikClient`'s `httpRequestWithHostOverride()`); no new dependency
was needed.

**Gotcha #2 — a `FlowToken` resumes its ENTIRE bound stage list from the
top, not from "this identity is already verified."** This is the deeper,
easier-to-miss issue: even after gotcha #1 is fixed and the emailed link
correctly targets the new flow, the flow's own **stage bindings** matter
in a way that doesn't mirror the recovery flow's topology. Authentik
builds a `FlowToken`'s pickled `FlowPlan` **once, in full**, at
`_create_recovery_link()` time, covering every stage **bound to the
flow**, in order, starting from the first one. Clicking the emailed link
restores that plan and resumes it from its first bound stage — it does
**not** mean "skip straight to session issuance because this email was
already verified by virtue of receiving the link." If an Identification
stage and an Email stage are bound ahead of a `UserLoginStage` (the
recovery flow's own topology, extended by naive analogy), every click
re-runs the whole flow from Identification — the user is asked to
re-enter their email, then told to check their inbox again, silently
sending a **second** email instead of completing sign-in in one click.
This is not "slightly suboptimal UX," it's a completely broken magic
link that happens to still return `200`/`{"ok":true}` at every step,
which is why a live **click-through** (not just confirming the email's
link targets the right flow) was required to catch it.

**The fix:** `magic-link-login`'s bound-stage list must contain **only**
`UserLoginStage` (the built-in `default-authentication-login`), bound
alone. The Identification and Email stage **objects** still need to
exist and stay resolvable by name/UUID (the Email stage's UUID is still
required by `sendMagicLinkEmail`'s `email_stage` param — it controls
subject/template, per gotcha #1) — they are just never **bound into the
flow's plan**. This works because `recovery_email()`'s `for_user`
argument already sets `PLAN_CONTEXT_PENDING_USER` on the token's plan at
mint time, which is all `UserLoginStage` needs to act immediately with no
re-identification step. The provisioning script's
`ensure_flow_stage_NOT_bound()` helper actively un-binds Identification/
Email if a stale environment (e.g. one only ever provisioned by an older
version of the script) still has them bound, so re-running the script
converges to the correct topology from either starting state — verified
live in both directions, not just designed on paper.

**Verification discipline this gotcha reinforces:** for any new
Authentik flow meant to issue a session directly from an emailed/minted
link (as opposed to a flow that ends in a password-set stage, like
recovery), "the link resolves and returns 200" and even "the link
targets the right flow" are **not sufficient** proof of correctness —
only an actual click-through that reaches an authenticated `GET
/api/v3/core/users/me/ → 200` in one hop proves the stage topology is
right. Budget for this explicitly in any future flow-provisioning
workflow's test plan; see AGENTS.md §6.1 on live-verification discipline
generally.

**Known, disclosed, unresolved-by-design limitations** (not fixed by
this flow, tracked in [`FR-AUTH-004.md`](../../03-requirements/FR-AUTH-004.md)'s
own Notes, not repeated in full here):
- The magic-link email's **body copy** is Authentik's generic
  password-reset template text (subject is correctly branded; body is
  not sign-in-specific). Authentik 2024.12.x ships no bundled template
  with appropriate copy; a real fix needs a custom mounted Django
  template — infra work beyond this flow's scope.
- The link's actual TTL is governed by the platform-wide Authentik
  `Tenant.default_token_duration` setting (observed ~29 minutes locally),
  **not** by the Email stage's own `token_expiry` field, which this
  server-to-server call path ignores entirely. This setting is shared
  with the recovery/password-reset flow — lowering it is a deliberate,
  cross-flow ops decision, not a per-flow code change.

### 6.10 Temporary-account upgrade (FR-AUTH-006)

A Telegram-only member (`attributes.is_temporary=true` in Authentik, no
`platform.users`/`directus_users` row yet) upgrades to a full member by
supplying a real email via `POST /v1/internal/telegram/upgrade-temp`
(`UpgradeService.requestUpgrade()`, `apps/api/src/modules/auth/upgrade.service.ts`).
Completing Authentik's magic-link Email stage (§6.9's mechanism, reused
as-is) fires `AuthController.callback()`'s upgrade branch, which flips
`is_temporary=false` and lets the existing `upsertByAuthentikSubject`/
`ensureLinked` machinery create the member's first `platform.users`/
`directus_users` rows.

**Design decision this FR's live-verification forced (Finding #0):**
`AuthentikClient.sendMagicLinkEmail` (→ `recovery_email`) always emails
the user's CURRENT on-file `email` — confirmed by reading Authentik
2024.12.3's own source, no override parameter exists. So the target
email is PATCHed onto the Authentik user as part of `/upgrade-temp`
request handling itself (`is_temporary` stays `true` throughout the
verification window — only the email-of-record changes), not deferred
to `callback()`. `callback()`'s upgrade branch therefore only flips
`is_temporary` and consumes the upgrade record; the email is already
correct by the time it runs.

**Correlation is by `authentikUserPk`, not a token round-tripped
through `next`.** The original design sketch assumed the emailed
magic-link URL could carry a caller-supplied token via `next=`, the way
`GET /v1/auth/login?next=...` does. It cannot: neither
`sendMagicLinkEmail` nor `createRecoveryLink` accept ANY caller-supplied
redirect/state parameter — the emailed link's target flow is resolved
entirely server-side from the request's `Host` header (Brand routing,
§6.9). The shipped mechanism instead resolves the verified email
`callback()` receives back to an Authentik pk (`getUserByEmail`) and
looks up the most recent live (unexpired, unconsumed) row in the new
`upgrade_intents` table for that pk — the fact that this specific
Authentik user just completed Authentik's own verified email-stage flow
IS the proof of intent. See `upgrade-intent.schema.ts`'s header comment
and `upgrade.service.ts`'s module doc for the full trace.

**Race-condition handling.** Authentik's `User.email` field is NOT
unique at Authentik's own data layer (`unique=False`, confirmed by
reading the Django model directly) — the application's own
`getUserByEmail`-based collision check is the only guard against two
concurrent `/upgrade-temp` calls claiming the same target email.
`requestUpgrade()` re-checks immediately before the email PATCH (no
intervening `await`), and `AuthController.callback()` defers the
`is_temporary` flip until AFTER `upsertByAuthentikSubject()` has
actually succeeded — so a losing racer's Authentik record simply stays
`is_temporary=true` with its upgrade record still live/retryable,
never `is_temporary=false` with no member row. See
`wf-20260801-feat-181/04-security-review.md` for the full MAJOR-1
finding/fix trace and its live-Postgres-constraint regression test.

**Local dev-testing gotcha (discovered during this FR's own live
verification, not previously documented anywhere in this repo):**
driving the full magic-link-click → OIDC-authorize → `/callback` round
trip in one headless-browser session requires care with Authentik's
per-Brand cookie scoping. The magic-link Brand's session cookie
(`authentik_session`) is host-only-scoped to `magic-link.aiqadam.internal`
(§6.9's second Brand); Authentik's DEFAULT Brand (used by
`/application/o/authorize/` when `OIDC_ISSUER_URL`/`OIDC_REDIRECT_URI`
point at plain `localhost:9000`) is a **different cookie-scope origin**
locally, so a naive `/v1/auth/login` call after clicking the magic link
re-prompts for login instead of auto-approving via SSO. Fix: capture
`/v1/auth/login`'s raw `Location`/`Set-Cookie` response (un-redirected,
e.g. via a raw Node `http.get`) and rewrite only the authority
(scheme+host+port) of the `/application/o/authorize/...` URL to
`magic-link.aiqadam.internal:9000` before navigating — same query
string, same `client_id`/`redirect_uri`/`code_challenge`, just issued
against the origin that actually holds the just-established session
cookie. This is a local-multi-Brand-on-one-machine testing artifact
only; production (one real top-level domain) would not hit this. Use
Chromium's `--host-resolver-rules=MAP magic-link.aiqadam.internal
127.0.0.1` launch flag (no `/etc/hosts` edit needed) to make the
hostname resolve at all in a fresh environment.

---

## 7. Branding Authentik so it looks like AI Qadam

Done via Authentik's `Brand` model (formerly "Tenant"). Edit via API:

```bash
AK_TOKEN=…
# List brands
curl -sH "Authorization: Bearer $AK_TOKEN" "https://auth.aiqadam.org/api/v3/core/brands/" | jq

# Patch the default brand
curl -sH "Authorization: Bearer $AK_TOKEN" -H "content-type: application/json" \
  -X PATCH "https://auth.aiqadam.org/api/v3/core/brands/<brand-uuid>/" \
  --data '{
    "branding_title": "AI Qadam",
    "branding_logo": "/static/dist/assets/icons/aiqadam-logo.png",
    "branding_favicon": "/static/dist/assets/icons/aiqadam-mark.png"
  }'
```

For deeper customisation (page CSS, button colors): Authentik exposes
**Brand custom CSS** — write a small CSS file using our design tokens
and POST it to the brand. The user only needs to see the AI Qadam logo +
teal primary color to perceive continuity with the app.

---

## 8. Threat model (what we defend against, what we don't)

| Threat | Defence |
|---|---|
| Stolen access token via XSS | Refresh cookie is `HttpOnly` (JS can't read it). Access token lives only in memory of an island, never `localStorage`. Even if exfiltrated it expires in ≤15 min and stops working immediately on sign-out (deny-list). |
| Stolen refresh cookie via XSS | Same: `HttpOnly` prevents JS access. Stolen via CSRF: `SameSite=Lax` blocks cross-origin POST cookie sends. |
| CSRF on state-changing endpoints | `SameSite=Lax` + we require `Authorization: Bearer` on mutating routes (cookie alone isn't enough). |
| Replay of a leaked refresh token | Refresh-token rotation + replay detection: presenting a `usedAt`-marked token revokes the entire family. |
| OAuth callback hijack | PKCE (S256) — the code can't be exchanged without the verifier in our flow cookie. State value defeats CSRF. |
| Open redirect via `?next=` | Server-side sanitisation: must be a relative path beginning with `/` but not `//`. |
| Brute force at the IdP | Authentik's built-in rate limit + the "Brute-force" policy. |
| Stolen password | Mitigated by Authentik's password policy + future MFA + future breached-password check. |
| Compromised JWT signing secret | All issued tokens trusted until expiry. Mitigation: rotate the secret (§6.5) + force sign-out across all users by revoking every refresh family. |
| Compromised Redis (deny-list bypass) | Attacker who can write to Redis can keep tokens alive. Mitigated by network isolation: Redis isn't exposed outside the Coolify network. |

What we do **not** defend against today:

- Stolen device with an unlocked browser. The 14-day refresh is sufficient
  to let the thief in until the user signs out from another device.
- TLS downgrade. We rely on Cloudflare's TLS termination + HSTS preload at
  the apex.
- Authentik admin compromise. They can mint id_tokens for any user.
  Mitigation: limit Authentik admin to one person, MFA-protected.

---

## 9. Operational runbooks (pointers)

- [Authentik provider setup](../infrastructure/runbooks/authentik-local-bootstrap.md)
- [Reset a forgotten Authentik admin password](../infrastructure/runbooks/authentik-ropc.md)
  (the ROPC file is retained for the password-reset commands at the bottom,
  even though we no longer use ROPC for sign-in.)
- Coolify env vars per app: `OIDC_REDIRECT_URI`, `WEB_BASE_URL`,
  `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
  `JWT_SIGNING_SECRET`, `INTERNAL_API_URL`, `REDIS_URL`,
  `DATABASE_URL`. See `apps/api/.env.example`.

---

## 9.5. Platform-admin bootstrap (FR-ADM-010)

Replaces the manual, human-operated bootstrap procedure formerly
described at ADR-0021 §9 step 3 (now superseded — see the note there).

On every API boot, `AdminBootstrapService`
(`apps/api/src/modules/admin-invites/admin-bootstrap.service.ts`) checks
whether the `aiqadam-super-admin` Authentik group has zero members. If it
does, the service creates exactly one seeded admin account directly in
Authentik via `AuthentikClient`, assigns it to `aiqadam-super-admin`, and
sets an Authentik user attribute intended to force a password change on
next login. If the group already has ≥1 member, bootstrap is a no-op —
safe to run on every redeploy.

No Postgres writes: the seeded identity lives only in Authentik (ADR-0021
§1 — Authentik is the source of truth, `users.role` is advisory only).
The platform's API never stores, hashes, or reads back the seeded
password beyond the one `set_password/` call at creation time — the same
"only Authentik sees a password" guarantee §2 above describes for every
other account-creation path (e.g. FR-ADM-005's operator-invite flow).

**Credentials — format/location only, not a live value.** The seeded
email and default password are configured identically (same variable
names, same spelling) in `apps/api/.env.example` and here:

- `ADMIN_BOOTSTRAP_EMAIL` — not a secret; defaults to `admin@aiqadam.org`
  if unset.
- `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` — a genuine secret. No default value
  anywhere in this repo, including `.env.example` (blank `=`) — each
  environment (local/QA/prod) generates and supplies its own. If unset,
  `AdminBootstrapService` logs a WARN and skips gracefully rather than
  crashing boot (same degraded-mode pattern as `AUTHENTIK_ADMIN_TOKEN`
  being unset).

**Forced password-change mechanism — NOT LIVE-VERIFIED, REOPENED
2026-08-01 (post-merge, `wf-20260801-fix-190` Step 13).** The service
attempts to force a password-change prompt on first login via
`AuthentikClient.setForcePasswordChangeNextLogin(userPk, true)`, which
issues `PATCH /api/v3/core/users/{pk}/` with
`password_change_next_login: true` directly on the user body. The PATCH
returns HTTP 200 OK on Authentik 2024.12.3 (verified live in
docker logs at `15:57:42.984` and `15:57:43.157`), but the field is
**silently ignored** — it does not appear in the response, the
`User` model has no `password_change_next_login` attribute, and the
flow executor still routes the user straight to OIDC with no
password-change stage (same `xak-flow-redirect` to
`/application/o/authorize/...` shape as the original MISMATCH).
Re-verification of [`BP-UAT-020`](../../02-business-processes/uat/BP-UAT-020.md)
Step 002 against the merged code at `6a26a1e` returned the same
`verdict: 'MISMATCH'` as the original `wf-20260729-uat-154` finding —
**the original ISS-ADM-010-1 bug is NOT fixed by this PR.** The fix
replaced one ignored attribute-set with another ignored user-body
field; the AC is still unmet. Reopen follow-up: see
`docs/03-requirements/FR-ADM-010.md` Notes section.

The previous code's `ak_login_password_change_required` attribute-set
call had the same lack of observable effect (proved by
`wf-20260729-uat-154`'s live run); the new mechanism replaced that
self-deceiving call with a different self-deceiving call. The honest
data point now is that Authentik 2024.12.3 has **no native
"force password change on next login" mechanism** — the
`/api/v3/core/users/{pk}/` OPTIONS response does not list
`password_change_next_login` among writable fields, and the
`User._meta.fields` listing shows only `password`, `last_login`, and
`password_change_date` for password-related state. The fix landed a
cleaner API call (single PATCH, no attribute-set collisions) but the
business outcome is unchanged. A real fix needs a different shape:
e.g., sending a recovery-flow magic-link email to the bootstrap admin
on creation so the user must complete the `default-password-change`
flow before they can sign in normally.

**Idempotency detail.** The zero-admin check is keyed on
`aiqadam-super-admin` **group membership count**
(`AuthentikClient.resolveGroupNames(...)[0].users.length`), not on
whether the seeded email exists. This matters: if `createUser()` ever
succeeds but a subsequent `setUserGroups()` call fails, keying on email
existence would cause every later boot to treat the orphaned, group-less
user as "already bootstrapped" and never retry — leaving
`aiqadam-super-admin` permanently empty. Keying on membership count means
the next boot always retries until the group actually gains a member;
`AdminBootstrapService` also recovers from a duplicate-email error on
retry by looking up the orphaned user and continuing from there instead
of crash-looping.

---

## 10. Pointers into the code

| Concept | Where |
|---|---|
| OIDC `startAuthorization` / `completeAuthorization` | `apps/api/src/modules/auth/auth.service.ts` |
| `/login` + `/callback` + `/sign-out` + `/refresh` + `/me` | `apps/api/src/modules/auth/auth.controller.ts` |
| Access JWT sign/verify + deny-list check | `apps/api/src/modules/auth/jwt.service.ts` |
| jti deny-list (Redis) | `apps/api/src/modules/auth/jti-revocation.service.ts` |
| Refresh rotation + replay detection | `apps/api/src/modules/auth/refresh-token.service.ts` |
| `AuthGuard` (verifies access token) | `apps/api/src/modules/auth/auth.guard.ts` |
| `AdminGuard` + `@Roles(...)` | `apps/api/src/modules/auth/admin.guard.ts`, `roles.decorator.ts` |
| Platform-admin bootstrap (FR-ADM-010) | `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` |
| Sign-in UI | `apps/web/src/pages/auth/sign-in.astro`, `components/SignInForm.tsx` |
| Sign-out UI | `apps/web/src/components/MeDashboard.tsx` (signOut function) |
| Signed-out landing | `apps/web/src/pages/auth/signed-out.astro` |
| Magic-link sign-in (FR-AUTH-004, §6.9) | `apps/api/src/modules/auth/magic-link.service.ts`, `AuthentikClient.sendMagicLinkEmail()` in `apps/api/src/modules/admin-invites/authentik.client.ts`, `scripts/provision-authentik-magic-link-flow.sh` |
| Magic-link entry UI | `apps/web-next/src/pages/auth/sign-in.astro`, `apps/web-next/src/pages/auth/sign-in-magic-link.astro`, `apps/web-next/src/blocks/customer/MagicLinkForm.tsx` |
| Temp-account upgrade (FR-AUTH-006, §6.10) | `apps/api/src/modules/auth/upgrade.service.ts` (`requestUpgrade`/`resolvePendingUpgrade`/`commitUpgrade`), `apps/api/src/modules/auth/upgrade-intent.schema.ts`, `AuthentikClient.setUserEmail()` in `apps/api/src/modules/admin-invites/authentik.client.ts`, upgrade branch in `AuthController.callback()` (`auth.controller.ts`) |
