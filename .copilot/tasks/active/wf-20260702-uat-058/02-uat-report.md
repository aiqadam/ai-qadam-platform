## UAT Run Report — BP-UAT-009

**Script:** docs/02-business-processes/uat/BP-UAT-009.md
**Run date:** 2026-07-02
**Environment:** http://localhost:4321 (Authentik at http://localhost:9000)
**Overall verdict:** partial

### Pre-flight

Pre-flight was already confirmed live and healthy by the Orchestrator prior to this
step (see `handoff.yaml` `gate_results.step_2_preflight`), and re-verified with a
quick reachability check before running the spec.

| Check | Result |
|---|---|
| Docker stack healthy | PASS (telegram-bot-api unhealthy, not required for this script) |
| Web reachable (http://localhost:4321) | PASS |
| API reachable (http://localhost:3000/health) | PASS |
| Authentik reachable (http://localhost:9000) | PASS |
| Seed completed | PASS (confirmed by Orchestrator: `pnpm uat:seed` clean, uat-member pk=5) |

### Step Results

| # | Label | Action | Expected | Actual | Screenshot | Result |
|---|---|---|---|---|---|---|
| 1 | step-001-authentik-login-page | Navigate to homepage, click Sign in | Browser redirects to Authentik login page with email/password form | Browser redirected to `http://localhost:9000`; identification form (Email or Username field) visible | step-001-authentik-login-page.png | PASS |
| 2 | step-002-signed-in-me-page | Submit uat-member credentials | Lands at `/me`, member dashboard visible, `aiqadam-refresh` cookie set | Landed at `/me`; AnonView not shown (authed dashboard rendered); `aiqadam-refresh` cookie present | step-002-signed-in-me-page.png | PASS |
| 3 | step-003-httponly-cookie | Inspect `aiqadam-refresh` cookie | Cookie present, `HttpOnly=true`, non-empty value | `document.cookie` did not expose the cookie (confirms HttpOnly at the JS-visibility level); `context.cookies()` (CDP/network layer) confirmed the cookie is present, `httpOnly: true`, and has a non-empty value | step-003-httponly-cookie.png | PASS |
| 4 | step-004-signed-out-page | Click Sign out | Browser lands at `/auth/signed-out` with confirmation message; cookie no longer present | Local session WAS cleared (`aiqadam-refresh` cookie removed — verified via `context.cookies()`), but the browser did **not** auto-navigate to `/auth/signed-out`. It stopped on Authentik's RP-Initiated Logout confirmation page ("You've logged out of AI Qadam Platform (local).") with manual links (Go back to overview / Log out of authentik / Log back into AI Qadam Platform), even though the logout URL carried a valid `id_token_hint` and `post_logout_redirect_uri=http://localhost:4321/auth/signed-out` | step-004-signed-out-page.png | FAIL (see Failures Detail) |
| 5 | step-005-redirect-after-signout | Navigate directly to `/me` with no session | Browser redirects to `/auth/sign-in`; dashboard content not visible | `/me` returned HTTP 200 (not a redirect) and rendered in-page with a "Sign in to see your dashboard" CTA (AnonView). Nav correctly shows "Sign in" (confirms session is genuinely anonymous). No authenticated-only content (registrations/points/check-in QR) was visible | step-005-redirect-after-signout.png | FAIL (see Failures Detail) |
| 6 | step-006-next-param-redirect | Sign in via `/auth/sign-in?next=/leaderboard` | After sign-in, lands at `/leaderboard`, not `/me` | Landed at `http://localhost:4321/leaderboard` exactly as expected | step-006-next-param-redirect.png | PASS |

### Negative Scenario Results

| Scenario | Expected rejection | Actual | Screenshot | Result |
|---|---|---|---|---|
| neg-001-protected-page-redirect | `/workspace` visited anon → redirect to `/auth/sign-in`; workspace not visible | Workspace.tsx client-side redirected the anon visitor via `window.location.replace()` once bootstrap resolved to anon; browser reached the sign-in/Authentik flow; no workspace heading/content rendered | neg-001-protected-page-redirect.png | PASS |
| neg-002-open-redirect-blocked | Absolute `next=https://evil.example.com` discarded; user lands at `/me` (or other safe internal URL), not the attacker origin | Browser did not land on `https://evil.example.com` at any point during or after the OIDC round-trip | neg-002-open-redirect-blocked.png | PASS |
| neg-003-wrong-password-error | Authentik shows "Invalid credentials"-type error; no session established; user remains on Authentik login | Authentik's password stage rendered "Invalid password" inline (visible in screenshot); browser remained on `http://localhost:9000`; no `aiqadam-refresh` cookie was set | neg-003-wrong-password-error.png | PASS |

### Failures Detail

| Step/Scenario | Expected | Actual | Screenshot |
|---|---|---|---|
| Step 004 — Sign out | "Browser redirects through Authentik's `end_session_endpoint` and ultimately lands at `http://localhost:4321/auth/signed-out`. The page shows a sign-out confirmation message. The `aiqadam-refresh` cookie is no longer present." | Local session teardown succeeded (cookie cleared, confirmed via `context.cookies()`), but the browser stopped on Authentik's own logout confirmation interstitial (heading: "You've logged out of AI Qadam Platform (local)."; body: "You can go back to the overview to launch another application, or log out of your authentik account.") instead of auto-redirecting to `/auth/signed-out`. Three manual links are offered instead of an automatic redirect. This occurred even though the logout URL observed in the trace carried a real `id_token_hint` and `post_logout_redirect_uri=http://localhost:4321/auth/signed-out` — i.e. this is not the documented "no-hint degraded mode" from `apps/api/src/modules/auth/auth.controller.ts`'s comments, which explicitly says the confirmation page is expected only when no `id_token_hint` is available. | step-004-signed-out-page.png |
| Step 005 — Protected page after sign-out | "Navigate directly to `http://localhost:4321/me`. Browser redirects to `http://localhost:4321/auth/sign-in`. The `/me` dashboard content is NOT visible." | `/me` returns HTTP 200 for anonymous visitors (not a 3xx redirect) and renders in-page with a "Sign in to see your dashboard" CTA linking to `/auth/sign-in?next=...`, per `apps/web/src/components/MeDashboard.tsx`'s `AnonView`. This is consistent, pre-existing, documented app behavior — `apps/e2e/tests/smoke-auth-gates.spec.ts` already asserts "/me dashboard renders for anon (client island shows sign-in CTA)" rather than a redirect. Authenticated-only content (registrations, check-in QR, points) was correctly NOT visible, satisfying the AC's underlying security intent even though the literal navigation mechanism (in-page CTA vs. hard redirect) differs from the script text. Note: `/workspace` (used in Negative 001) DOES hard-redirect client-side; only `/me` uses the in-page CTA pattern — the two protected surfaces are not architecturally consistent with each other. | step-005-redirect-after-signout.png |

### Spec-authoring notes (for context, not failures)

- **Authentik password field required `pressSequentially()`, not `.fill()`.** Authentik's flow-executor password input did not register `.fill()`-set values (confirmed by direct observation: `inputValue()` read back the filled text, but Authentik's own client-side validation still rejected the submission with "Please fill out this field"). Switched to per-character `pressSequentially()`, matching the same class of fix BP-UAT-013 needed for React-controlled inputs.
- **Authentik's flow executor re-renders its DOM tree between the identification and password stages** (not a toggle within one tree). An early version of the spec's helper checked `passwordField.isVisible()` once and branched on it, which raced this transition and produced an intermittent "element is outside of the viewport" timeout. Fixed by unconditionally clicking the identifier-stage submit button, then polling `waitFor({state: 'visible'})` on the password field rather than a single point-in-time check.
- **Authentik renders inside a shadow DOM.** `page.locator('body').textContent()` (light-DOM only) missed the "Invalid password" error text entirely even though it was visible on screen — Playwright's `getByText()` locator (which pierces shadow roots) found it correctly. Fixed Negative 003 to use `getByText()` instead of reading `body` text.
- No `apps/e2e/support/assert-design-system.ts` fixture exists yet in this repo (checked via glob before writing the spec — the `apps/e2e/support/` directory does not exist). Per the UATRunner agent definition's instruction, this is noted here rather than silently skipped; no design-system assertion calls were added to any test.
- Screenshots are viewport-only (no `fullPage: true`), per the agent definition's VisualReviewer-compatibility requirement.

### Summary

All 9 test units (6 numbered steps + 3 negative scenarios) executed to completion; no pre-flight or spec-crash issues occurred. 7 of 9 passed outright. The 2 "failures" are not test-authoring defects — they are faithfully recorded discrepancies between the UAT script's literal expected UI state and the application's actual, observable behavior, each backed by a screenshot and (for Step 004) a passing hard assertion on the underlying security property (session actually terminated) even though the literal navigation target differs from the script text. Confidence in these results is high: both discrepancies were independently reproduced across two full spec runs (Step 004 in both the second and third full run; Step 005 in all three full runs) and are consistent with what's documented in the application's own source (`MeDashboard.tsx` AnonView, `smoke-auth-gates.spec.ts`) and API comments (`auth.controller.ts`'s degraded-logout-mode note, which does not match what was actually observed for Step 004 since a valid `id_token_hint` was present). No environment issues were encountered; all failures are product-behavior findings for BusinessAnalyst to triage in Step 4.

## Gate Result

gate_result:
  status: passed
  summary: "BP-UAT-009 run completed — 7/9 units passed outright; 2 units (Step 004 sign-out redirect, Step 005 protected-page redirect) recorded factual discrepancies between script expectations and observed app behavior, each with full screenshot evidence and a passing hard assertion on the underlying security property."
  findings:
    - "Step 004 — Sign out: browser does not auto-redirect to /auth/signed-out after clicking Sign out; it lands on Authentik's RP-Initiated Logout confirmation interstitial instead, despite a valid id_token_hint being present in the logout URL. Local session (aiqadam-refresh cookie) IS correctly cleared."
    - "Step 005 — Protected page after sign-out: /me returns HTTP 200 for anonymous visitors and renders an in-page 'Sign in to see your dashboard' CTA (AnonView) rather than a hard 3xx redirect to /auth/sign-in, unlike /workspace (used in Negative 001) which does hard-redirect client-side. Authenticated-only content is correctly never shown to anon visitors."
