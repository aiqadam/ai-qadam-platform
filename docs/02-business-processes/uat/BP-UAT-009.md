---
code: BP-UAT-009
name: "Auth sign-in and sign-out"
status: Ready
process_ref: "docs/03-requirements/FR-AUTH-001.md"
environment: "http://localhost:4321"
seed_required: true
last_run: ""
---

# BP-UAT-009 — Auth Sign-In and Sign-Out

## Purpose

Verifies that a member can sign in via email/password through Authentik OIDC,
lands at the correct post-login destination, and that sign-out terminates both
the platform session and the Authentik SSO session. Also verifies that protected
pages redirect unauthenticated users to sign-in, and that an open-redirect
attempt via `next` is blocked. Source: [FR-AUTH-001](../../03-requirements/FR-AUTH-001.md).

## Acceptance Criteria

- [ ] AC-1: Clicking "Sign in" from a public page redirects to the Authentik login UI.
- [ ] AC-2: After successful sign-in, the user lands at `/me` (or a valid `next` path).
- [ ] AC-3: The `aiqadam-refresh` cookie is present and is `HttpOnly`.
- [ ] AC-4: After sign-out, the platform session is cleared; a subsequent protected page visit redirects to sign-in.
- [ ] AC-5: Visiting a protected page without a session redirects to `/auth/sign-in`.
- [ ] AC-6: An absolute-URL `next` param (open redirect attempt) is rejected; user lands at `/me`.
- [ ] AC-7: The `/auth/signed-out` page is shown after sign-out.

## Seed Fixtures Required

| Fixture | Description |
|---|---|
| `uat-member` | Member account (`uat-member@aiqadam.test`, password `UAT_MEMBER_PASSWORD` from `.env.test`), active Authentik user |

## Steps

### Step 001 — Navigate to sign-in from public homepage

**AC ref:** AC-1

**Precondition:** User is not signed in. No `aiqadam-refresh` cookie present.

**Action:** Navigate to `http://localhost:4321`. Click the **Sign in** button in the site navigation.

**Expected UI state:** Browser redirects to the Authentik login page (`http://localhost:9000` or configured Authentik URL). The Authentik login form is visible with email and password fields.

**Screenshot label:** `step-001-authentik-login-page`

---

### Step 002 — Submit credentials

**AC ref:** AC-2, AC-3

**Precondition:** Step 001 completed. Authentik login form is visible.

**Action:** Fill **Email** with `uat-member@aiqadam.test` and **Password** with `UAT_MEMBER_PASSWORD`. Click **Log in** (or equivalent Authentik submit button).

**Expected UI state:** Browser completes the OIDC callback and lands at `http://localhost:4321/me`. The member dashboard is visible. The `aiqadam-refresh` cookie is set (verify in browser devtools → Application → Cookies → `HttpOnly` flag is checked).

**Screenshot label:** `step-002-signed-in-me-page`

---

### Step 003 — Verify HttpOnly cookie

**AC ref:** AC-3

**Precondition:** Step 002 completed. User is signed in.

**Action:** Open browser devtools → Application → Cookies → `http://localhost:4321`. Find the `aiqadam-refresh` cookie.

**Expected UI state:** Cookie `aiqadam-refresh` is present with `HttpOnly` flag = true. Value is not empty.

**Screenshot label:** `step-003-httponly-cookie`

---

### Step 004 — Sign out

**AC ref:** AC-4, AC-7

**Precondition:** Step 002 completed. User is signed in at `/me`.

**Action:** Click the **Sign out** button (in user menu / account chip in the nav).

**Expected UI state:** Browser redirects through Authentik's `end_session_endpoint` and ultimately lands at `http://localhost:4321/auth/signed-out`. The page shows a sign-out confirmation message. The `aiqadam-refresh` cookie is no longer present.

**Screenshot label:** `step-004-signed-out-page`

---

### Step 005 — Protected page after sign-out redirects to sign-in

**AC ref:** AC-4

**Precondition:** Step 004 completed. No session cookie present.

**Action:** Navigate directly to `http://localhost:4321/me`.

**Expected UI state:** Browser redirects to `http://localhost:4321/auth/sign-in`. The `/me` dashboard content is NOT visible.

**Screenshot label:** `step-005-redirect-after-signout`

---

### Step 006 — Sign in with valid `next` param

**AC ref:** AC-2

**Precondition:** User is signed out.

**Action:** Navigate to `http://localhost:4321/auth/sign-in?next=/leaderboard`. Complete sign-in (Step 002 credentials).

**Expected UI state:** After successful sign-in, the browser lands at `http://localhost:4321/leaderboard`, not at `/me`. The leaderboard page is visible.

**Screenshot label:** `step-006-next-param-redirect`

---

## Negative Scenarios

### Negative 001 — Protected page without session redirects to sign-in

**AC ref:** AC-5

**Precondition:** User is not signed in.

**Action:** Navigate directly to `http://localhost:4321/workspace`.

**Expected rejection:** Browser redirects to `/auth/sign-in`. The workspace is NOT visible.

**Screenshot label:** `neg-001-protected-page-redirect`

---

### Negative 002 — Open-redirect via absolute `next` is blocked

**AC ref:** AC-6

**Precondition:** User is not signed in.

**Action:** Navigate to `http://localhost:4321/auth/sign-in?next=https://evil.example.com`. Complete sign-in.

**Expected rejection:** After sign-in, the browser lands at `/me` (or another safe internal URL), NOT at `https://evil.example.com`. The `next` param with an absolute URL is discarded.

**Screenshot label:** `neg-002-open-redirect-blocked`

---

### Negative 003 — Wrong password shows Authentik error

**AC ref:** AC-1

**Precondition:** User is on the Authentik login form.

**Action:** Fill email `uat-member@aiqadam.test` and password `wrong-password`. Click **Log in**.

**Expected rejection:** Authentik displays a login error ("Invalid credentials" or similar). No session is established. User remains on the Authentik login page.

**Screenshot label:** `neg-003-wrong-password-error`

---

## Notes

- This script tests the web OIDC flow only. The Authentik admin UI at `http://localhost:9000` must be seeded with the `uat-member` user before running.
- Authentik's login page HTML is outside the platform's control — UATRunner should screenshot it as-is; BusinessAnalyst should not flag Authentik's own styling as a product bug.
- Cookie `HttpOnly` flag verification (Step 003) must be done via devtools screenshot; Playwright cannot read `HttpOnly` cookies via `context.cookies()` — it can only verify their presence and that `document.cookie` does not expose them.
- Legacy cookie name `__Host-aiqadam-refresh` should also be accepted during transition (see FR-AUTH-001 notes); UATRunner records whichever name is present.
