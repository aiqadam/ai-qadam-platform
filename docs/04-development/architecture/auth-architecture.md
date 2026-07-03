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
- **Forgot password** is Authentik's "Recovery Flow" — already a
  configurable feature. Brand the recovery email template in Authentik
  admin → Brand → "Recovery email".

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
| Sign-in UI | `apps/web/src/pages/auth/sign-in.astro`, `components/SignInForm.tsx` |
| Sign-out UI | `apps/web/src/components/MeDashboard.tsx` (signOut function) |
| Signed-out landing | `apps/web/src/pages/auth/signed-out.astro` |
