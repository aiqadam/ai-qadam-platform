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
- [ ] AC-4: After sign-out, the platform session is cleared (the `aiqadam-refresh` cookie is removed immediately on sign-out click); a subsequent protected page visit shows no authenticated-only content to the anonymous visitor (via either an in-page sign-in CTA on hub surfaces such as `/me` — e.g. "Sign in to view your hub", rendered by `<AuthGate signInLabel="Sign in to view your hub">` in `apps/web-next/src/pages/me/index.astro` — or a hard redirect to `/auth/sign-in` on single-purpose authenticated surfaces such as `/workspace`). The two mechanisms cover the same security intent (the live Playwright spec's hard assertion `authedOnlyContent.toHaveCount(0)` at `apps/e2e/tests/uat/BP-UAT-009.spec.ts:387` is the contract-of-record for `/me`'s "no authed-only content" guarantee; `BP-UAT-009` `Neg 001` remains the contract-of-record for `/workspace`'s hard-redirect).

### Why two anon-gating mechanisms?

`/me` is a hub page (FR-MIG-018, `apps/web-next/src/pages/me/index.astro`,
shipped 2026-06-23 in PR [#24](https://github.com/tvolodi/aiqadam/pull/24))
— its anon fallback renders a server-side `<AuthGate signInLabel="Sign in
to view your hub">` block (see
[`apps/web-next/src/blocks/common/AuthGate.astro:36`](../../web-next/src/blocks/common/AuthGate.astro)),
which is friendly to deep-links and shared `/me` URLs. A hard redirect
to `/auth/sign-in` would lose the URL the visitor was trying to reach,
defeating `next`-param flows like `/auth/sign-in?next=%2Fme` (see Step
006). `/workspace`, by contrast, is a single-purpose authenticated
surface (events / members / broadcasts) where the hard client-side
redirect to sign-in matches the "no anonymous content period" product
intent.

The smoke test at `apps/e2e/tests/smoke-auth-gates.spec.ts`
(`/me dashboard renders for anon (client island shows sign-in CTA)`)
codifies the legacy `apps/web` AnonView contract for the pre-MIG-018
implementation; for the current `apps/web-next` SSR rendering (the
shipped production state since FR-MIG-018 merged on 2026-06-23) the
literal CTA text is "Sign in to view your hub" — rendered from
`AuthGate.astro`'s `signInLabel` prop on
`apps/web-next/src/pages/me/index.astro`. Both phrases share the same
"sign in to view your hub" intent; the literal text drifts between
the two surfaces' evolutionary generations. `BP-UAT-009` `Neg 001`
codifies `/workspace`'s hard-redirect as the contract-of-record.
Both mechanisms are acceptable per the issue body of
`ISS-UAT-009-2`, which confirms the security intent (no authenticated-only
content leaked to anon visitors) is met by either path. The
product/UX consistency question of whether the two surfaces should
converge on a single anon-gating pattern is logged in `ISS-UAT-009-2`
(Resolution § "Product/UX consistency decision") and is **not**
blocking the close of this BP.
- [ ] AC-5: Visiting a protected page without a session redirects to `/auth/sign-in`.
- [ ] AC-6: An absolute-URL `next` param (open redirect attempt) is rejected; user lands at `/me`.
- [ ] AC-7: After completing Authentik's invalidation confirmation (clicking "Log out of authentik" on the interstitial), the browser lands at `/auth/signed-out` showing the AI Qadam-branded sign-out confirmation. The Authentik RP-Initiated Logout interstitial itself is expected UX (see Step 004 notes) and is NOT an AC-7 failure.

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

**Expected UI state:**

Two-phase landing is the expected outcome with the Authentik
2024.x `default-provider-invalidation-flow` bound to the
`aiqadam-platform-local-provider` (see
[`docs/04-development/architecture/auth-architecture.md` §5.3.7](../../04-development/architecture/auth-architecture.md)):

1. **Interstitial (immediate)** — the browser is at Authentik's own
   RP-Initiated Logout confirmation page (`http://localhost:9000/...`)
   showing the heading "You've logged out of AI Qadam Platform (local)."
   with three buttons: **Go back to overview**, **Log out of authentik**,
   **Log back into AI Qadam Platform (local)**. The `aiqadam-refresh`
   cookie is **already cleared** at this point (the API cleared it in
   step 3 of `/v1/auth/sign-out` before returning the logoutUrl — this
   is the security-critical half of SSO ⇒ SLO and is independent of
   what the user clicks on the interstitial).

2. **Post-confirmation** — when the user clicks **Log out of
   authentik**, Authentik completes the invalidation, the IdP session
   is killed, and the browser 302s to
   `http://localhost:4321/auth/signed-out` (AI Qadam-branded sign-out
   confirmation). At that point the assertion in **AC-7** is satisfied.

The intermediate interstitial is **expected UX**, not a product bug.
Per OIDC RP-Initiated Logout 1.0 §2 the IdP "MAY" skip the
confirmation page when a valid `id_token_hint` is present, but
"MAY" is not a guarantee; Authentik 2024.x's default invalidation flow
always renders it. The API constructs the OIDC-correct URL (with
`id_token_hint` + `post_logout_redirect_uri`) — the rendered UX is
controlled by the IdP's flow binding, not by us. See ISS-UAT-009-1 for
the trade-off rationale (security > silent-redirect UX).

**What AC-7 actually asserts (post-confirmation):** browser lands at
`http://localhost:4321/auth/signed-out` with AI Qadam branding and the
`aiqadam-refresh` cookie is absent.

**What AC-4 actually asserts (idempotence + session kill):** the local
`aiqadam-refresh` cookie is cleared immediately after the sign-out
button click (verifiable via `context.cookies()` while still on the
interstitial), AND the Authentik IdP session is terminated when the
user clicks **Log out of authentik** (verifiable via the subsequent
sign-in attempt NOT silently SSO'ing the user back in).

**Screenshot labels:**
- `step-004a-authentik-interstitial.png` — the immediate post-click interstitial
- `step-004b-signed-out-page.png` — `/auth/signed-out` after the user clicks "Log out of authentik"

---

### Step 005 — Protected page after sign-out is anon-safe (per-surface mechanism)

**AC ref:** AC-4

**Precondition:** Step 004 completed. No session cookie present.

**Action:** Navigate directly to `http://localhost:4321/me`.

**Expected UI state (per surface):**

- **`/me` (the surface this step exercises):** the browser does **not**
  redirect. The server returns `HTTP 200`, and the SSR-rendered
  `<AuthGate signInLabel="Sign in to view your hub">` block (see
  [`apps/web-next/src/pages/me/index.astro`](../../web-next/src/pages/me/index.astro)
  and
  [`apps/web-next/src/blocks/common/AuthGate.astro`](../../web-next/src/blocks/common/AuthGate.astro))
  renders an in-page sign-in CTA with the literal text **"Sign in to
  view your hub"** and an anchor `href` of the form
  `/api/v1/auth/login?next=%2Fme` (i.e. contains `/auth/sign-in` or
  `/api/v1/auth/login`). No authenticated-only content is visible —
  specifically, none of the `Your registrations` / `Check-in QR` /
  `Leaderboard points` widgets are present (the Playwright spec's
  hard assertion `authedOnlyContent.toHaveCount(0)` at
  `apps/e2e/tests/uat/BP-UAT-009.spec.ts:387` enforces this). The
  site nav shows **Sign in** (the session is genuinely anonymous).

  _Note: the legacy `apps/web/src/components/MeDashboard.tsx`
  `AnonView` (rendered before the FR-MIG-018 migration to
  `apps/web-next`) used the text "Sign in to see your dashboard".
  Production has been on `apps/web-next` since 2026-06-23. The
  security intent ("no authed-only content visible to anon") is
  identical across both renderings; the literal text differs.
  `smoke-auth-gates.spec.ts` codifies the legacy text, this step
  codifies the current rendering._

- **`/workspace` (sister surface, exercised by `Neg 001`):** the
  browser **does** hard-redirect, but the redirect target in the
  current `apps/web-next` build (since FR-MIG-031 production cutover
  on 2026-06-25) is `/workspace/dashboard` (a server-side
  `Astro.redirect('/workspace/dashboard', 302)` from
  [`apps/web-next/src/pages/workspace/index.astro`](../../web-next/src/pages/workspace/index.astro),
  not the pre-MIG legacy `window.location.replace('/auth/sign-in')`
  mechanism recorded in the issue body of `ISS-UAT-009-2`). The
  landed page `/workspace/dashboard` then renders its own
  `<AuthGate role="aiqadam-operators">` block which surfaces the
  sign-in CTA. See `Neg 001` for the assertion. The end-state UX
  (anon cannot reach authenticated workspace content) is satisfied
  regardless of the redirect hop's specific target.

The two surfaces intentionally use different anon-gating mechanisms
because they have different product shapes (a hub page vs. a
single-purpose authenticated surface). See the "Why two anon-gating
mechanisms?" paragraph under the Acceptance Criteria section above
for the rationale and `ISS-UAT-009-2` for the product/UX consistency
decision (accept-as-is).

**Contract of record:**
- Smoke test: `apps/e2e/tests/smoke-auth-gates.spec.ts`,
  test `/me dashboard renders for anon (client island shows sign-in CTA)`.
- Live UAT assertion: `apps/e2e/tests/uat/BP-UAT-009.spec.ts`, Step 005
  (line 337). The hard assertion is `authedOnlyContent.toHaveCount(0)`;
  the two `expect.soft` lines record the spec/actual mismatch for
  BusinessAnalyst and remain in place as a regression signal.

**Screenshot label:** `step-005-redirect-after-signout` *(historical
label — retained because the live Playwright spec at
`apps/e2e/tests/uat/BP-UAT-009.spec.ts:371` hardcodes the file name
in its `shot(page, 'step-005-redirect-after-signout')` call. The label
does **not** describe the new expected outcome; the outcome for `/me`
is "HTTP 200 + AnonView CTA + no authed-only content", as stated
above.)*

---

### Step 006 — Sign in with valid `next` param

**AC ref:** AC-2

**Precondition:** User is signed out.

**Action:** Navigate to `http://localhost:4321/auth/sign-in?next=/leaderboard`. Complete sign-in (Step 002 credentials).

**Expected UI state:** After successful sign-in, the browser lands at `http://localhost:4321/leaderboard`, not at `/me`. The leaderboard page is visible.

The signed-in user's leaderboard row (self-row) must render with a clear visual separation between the display name and the `YOU` self-indicator:

- The self-row shows a distinct badge boundary between the display name and the `YOU` chip — the two read as separate elements, not as concatenated text (the pre-fix defect: `UAT MemberYou` — see ISS-UAT-009-3).
- The `YOU` chip uses the canonical `.badge.mono` design-system pattern: closed palette, mono uppercased label, visible 1px border, same visual language as the rank-label chips on the podium card.
- The chip is **not** concatenated against the display name; there is a visible gap between the truncated name and the chip.
- Non-self rows carry **no** `YOU` chip and **no** `.me-name-wrap` wrapper — only the signed-in user's row carries the chip.

**Screenshot label:** `step-006-next-param-redirect`

**Screenshot review note:** When reviewing `step-006-next-param-redirect.png`, the visual reviewer must confirm (a) the self-row chip is clearly separated from the display name with a visible gap and badge border, and (b) no other row in the screenshot carries a `YOU` chip or self-row wrapper. The pre-fix concatenation `UAT MemberYou` is the regression this contract guards against (see ISS-UAT-009-3).

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
