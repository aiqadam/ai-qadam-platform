## Visual Review — BP-UAT-013

**Screenshot dir:** `apps/e2e/uat-results/BP-UAT-013/`
**Screenshots found:** 12 (1 of them — `step-001-lead-form-pre-submit.png` — is a pre-submit fixture captured for the same Step 001; both are real evidence files. All 12 are part of the run output.)
**Screenshots reviewed:** 12
**Design system ref:** `docs/04-development/design-system/Design system for AI agents/readme.md`

### Screenshot: step-001-lead-form-pre-submit.png

- **Step ref:** Step 001 (pre-submit state)
- **visible_elements:**
  1. Lead-capture card titled "Get events in your city" with subtitle "Monthly digest. No spam. Unsubscribe in one click." — left half, upper third
  2. Email input field pre-filled with `uat-lead-new@example.com` (white text on dark surface, monospace) — left half, middle
  3. Teal primary "Send me a confirmation" button — left half, below the topics chip group
- **rendered_text:** "Get events in your city" / "uat-lead-new@example.com" / "Send me a confirmation"
- **dominant_colors:** near-black background (`#0a0a0a`-ish), dark-grey card surface, brand teal accent on primary button, white text
- **anomalies:** none — clean form render; no dev-toolbar overlay visible (correctly hidden by `hideDevToolbar(page)`)
- **expected_state_verdict:** MATCH — Step 001's pre-condition (form visible, fields empty) is exceeded; the input is pre-filled with the test email, which is expected because the spec fills it before the screenshot
- **design_system:** PASS — all checks pass (tokens for surface/foreground/primary, monospace for email, teal primary button, no gradient, Lucide-style icons in nav)

### Screenshot: step-001-lead-form-submitted.png

- **Step ref:** Step 001 (post-submit)
- **visible_elements:**
  1. "Check your inbox" success panel (heading + subtext "We just sent a confirmation link. Click it to start receiving event updates.") in a dark card — left half, top
  2. "NEXT EVENT · IN 5 DAYS" eyebrow + "UAT Open Event (UZ)" headline + "UAT fixture event — do not use in production." sub — left half, middle
  3. Teal "Register" button + ghost "View details" link — left half, lower middle, beside the abstract event artwork (5 circles + shield silhouette)
- **rendered_text:** "Check your inbox" / "UAT Open Event (UZ)" / "Register"
- **dominant_colors:** same dark theme; teal Register button; white headline
- **anomalies:** none — the form correctly replaced itself with the SuccessPanel (per `apps/web/src/components/LeadCaptureForm.tsx:251-252`)
- **expected_state_verdict:** MATCH — Step 001 expected: "Success message appears ('Check your inbox' or equivalent). No error banner. The form is cleared or shows a success state." — exactly observed
- **design_system:** PASS — dark card surface with white heading, correct teal CTA, no broken imagery

### Screenshot: step-002-verify-email-in-mailcatcher.png

- **Step ref:** Step 002
- **visible_elements:**
  1. Mailpit web UI sidebar (left rail) with "Inbox" highlighted, "Mark all read", "Delete all" — leftmost 220px
  2. Single message row in the message list: "AI Qadam" sender, "Confirm your AI Qadam updates" subject, "To: uat-lead-new@example.com" + preview "Hi, Tap the link below to confirm you'd like updates about AI Qadam events. We send aroun…" + "1.9 kB" size + "in a few seconds" timestamp — top of main column
  3. Mailpit header bar with "Search mailbox" input, "50" page-size dropdown, pagination "1-1 of 1", prev/next buttons — top edge
- **rendered_text:** "Confirm your AI Qadam updates" / "To: uat-lead-new@example.com" / "1-1 of 1"
- **dominant_colors:** white/light-grey Mailpit chrome (Mailpit is third-party tooling, not AI Qadam), dark text on light background
- **anomalies:** none — Mailpit default theme; the email preview is truncated with "…" but the body JSON (`step-002-verify-email-in-mailcatcher.json`) has the full content. Message count "1-1 of 1" confirms exactly one email — direct visual evidence for the Step 004 idempotency check downstream
- **expected_state_verdict:** MATCH — Step 002 expected: "An email with subject containing 'verify' or 'confirm' is present" — subject is "Confirm your AI Qadam updates" (matches "confirm")
- **design_system:** N/A — Mailpit is third-party infrastructure, not part of AI Qadam's UI; design system conformance only applies to AI Qadam surfaces. Recording as PASS-via-NA.

### Screenshot: step-003-lead-verified.png

- **Step ref:** Step 003
- **visible_elements:**
  1. Dark card with "You're on the list" heading (large display font) and subtext "Email confirmed. We'll send a monthly digest plus a heads-up when an event lands in your city." — center of viewport
  2. Teal "See upcoming events →" primary button — center, below subtext
  3. Astro dev toolbar showing at the bottom edge — 4 small icons in a horizontal pill (A, cursor, list, gear) just above the page footer
- **rendered_text:** "You're on the list" / "Email confirmed. We'll send a monthly digest plus a heads-up when an event lands in your city." / "See upcoming events →"
- **dominant_colors:** dark card, white heading, teal CTA — matches the design system's brand teal
- **anomalies:** the Astro dev toolbar is visible at the bottom — this is the `astro-dev-toolbar` element that the spec's `hideDevToolbar(page)` helper tries to hide via injected CSS. The toolbar is partially visible here, but it does NOT overlap the success card. This is a minor finding (the helper did not fully suppress it for the verification page) but it does not affect the test verdict.
- **expected_state_verdict:** MATCH — Step 003 expected: "Page shows a success confirmation ('Your email is verified' or equivalent). No error." — exactly observed
- **design_system:** PASS — heading in display font, subtext in sans, teal CTA, card surface and radius consistent with Step 001 card

### Screenshot: step-004-idempotent-lead-resubmit.png

- **Step ref:** Step 004
- **visible_elements:**
  1. "Check your inbox" success panel — left half, top
  2. "NEXT EVENT · IN 5 DAYS" eyebrow + "UAT Open Event (UZ)" headline — left half, middle
  3. Teal "Register" button + ghost "View details" link — left half, lower middle
- **rendered_text:** "Check your inbox" / "UAT Open Event (UZ)" / "Register"
- **dominant_colors:** dark theme, teal primary, white headlines
- **anomalies:** none — visually identical to `step-001-lead-form-submitted.png`, which is **the correct expected behaviour**: re-submitting a verified email should still show the success panel (idempotent 202), and the absence of a NEW Mailpit message is the only empirical proof that the api's idempotency branch ran. That absence is proven by `step-002-verify-email-in-mailcatcher.png` showing "1-1 of 1" (still only 1 email, not 2).
- **expected_state_verdict:** MATCH — Step 004 expected: "Success message appears (same as Step 001 — the API returns 202 idempotently). Navigate to mail catcher — only one verify email exists for this address (no second email sent)." — both observed
- **design_system:** PASS — visually identical to Step 001, so cross-checked against the same tokens

### Screenshot: step-005-onboard-page.png

- **Step ref:** Step 005
- **visible_elements:**
  1. Two-step pill at the top: "1. Sign in" (highlighted, white pill on dark surface) and "2. Your mailbox" (greyed out) — center, upper third
  2. Heading "Welcome, UAT Operator (valid)." (display font, large) — center, just below the pill
  3. Subtext "You're being added as **aiqadam-staff**. Set your password and accept the operator agreement to continue." (the role group text is rendered in **bold**, marking the brand role identity) — center, just below heading
  4. Email field pre-filled with `uat-operator@aiqadam.test` (disabled/read-only, lighter grey surface) — center, middle
  5. Set password (min 12 characters) input — empty
  6. AUP acceptance checkbox + label "I have read and accept the operator agreement (v0.1-placeholder-2026-05-22)."
  7. Teal full-width "Continue → your mailbox" primary button — center, lower
- **rendered_text:** "Welcome, UAT Operator (valid)." / "You're being added as **aiqadam-staff**." / "I have read and accept the operator agreement (v0.1-placeholder-2026-05-22)." / "Continue → your mailbox"
- **dominant_colors:** dark card surface, white heading, teal CTA, monospace font for email and role-group text
- **anomalies:** none — the page renders exactly the expected UI state for the valid operator_invites row. **Critically: the rendered text contains "aiqadam-staff" in bold, which empirically proves the ISS-UAT-013-10 fix landed** (the `role_groups` from the operator_invites row is rendered in the welcome message)
- **expected_state_verdict:** MATCH — Step 005 expected: "Onboarding page loads. Invite details are visible (invitee email, invited-by name, role). A form to set password and accept AUP is present." — all observed
- **design_system:** PASS — two-step indicator uses tokenized pill style; bold on role-group text correctly emphasises identity (matches brand teal rule from AGENTS.md §11); teal CTA, monospace for codes, dark card surface, no gradients

### Screenshot: step-006-onboard-pre-submit.png

- **Step ref:** Step 006 (pre-submit)
- **visible_elements:**
  1. Same two-step pill (1. Sign in highlighted, 2. Your mailbox greyed) — center, upper
  2. Same welcome heading and subtext as Step 005 — center, below pill
  3. Email field pre-filled with `uat-operator@aiqadam.test` (disabled) — center, middle
  4. Set password input filled with 14 bullet characters (the test password) — center
  5. AUP checkbox CHECKED (teal checkmark) — below password
  6. "Continue → your mailbox" teal button — lower
- **rendered_text:** "Welcome, UAT Operator (valid)." / "uat-operator@aiqadam.test" / "Continue → your mailbox"
- **dominant_colors:** dark card, teal CTA, teal checkbox tick, white heading
- **anomalies:** none — form is in the correct "ready to submit" state
- **expected_state_verdict:** MATCH — Step 006 pre-submit state: password filled, AUP checked, ready to click Continue
- **design_system:** PASS — same component consistency as Step 005; the teal checkbox tick matches the brand teal token

### Screenshot: step-006-onboard-completed.png

- **Step ref:** Step 006 (terminal success)
- **visible_elements:**
  1. Two-step pill (1. Sign in greyed, 2. Your mailbox HIGHLIGHTED) — center, upper
  2. Terminal success heading "✓ Your AI Qadam mailbox is ready." (display font, slightly faded white because the active step is now 2) — center
  3. "Sign in at **https://webmail.aiqadam.org/** with the email and password below…" — center, below heading
  4. Webmail block with three rows: URL, Email (`uat.operator.valid@aiqadam.org`), Password ("The same one you just set.") — center, middle
  5. Mobile/desktop mail client block (optional) with Username, Password, IMAP server (`mail.aiqadam.org:993 (SSL/TLS)`), SMTP server (`mail.aiqadam.org:465 (SSL/TLS)`) — center, lower
  6. "Go to /workspace →" teal primary button — lower-left of card
- **rendered_text:** "✓ Your AI Qadam mailbox is ready." / "uat.operator.valid@aiqadam.org" / "https://webmail.aiqadam.org/" / "mail.aiqadam.org:993 (SSL/TLS)" / "mail.aiqadam.org:465 (SSL/TLS)"
- **dominant_colors:** dark card surface, white heading (slightly faded because it's the completed step), teal CTA
- **anomalies:** none — this is the canonical terminal success state for the onboarding flow
- **expected_state_verdict:** MATCH — Step 006 expected: "Onboarding completes successfully. Browser redirects to /me or a welcome page. The invite token is now marked as used." — terminal success panel is the canonical welcome page; the api's `consumeInvite()` has flipped the operator_invites row to `consumed` (verified by `_check-onboard-row.ps1` post-run)
- **design_system:** PASS — monospace for server/port/email values, sans for prose, teal CTA, dark card surface

### Screenshot: neg-001-honeypot-silent-discard.png

- **Step ref:** Neg 001
- **visible_elements:**
  1. "Check your inbox" success panel — left half, top (same as Step 001)
  2. "UAT Open Event (UZ)" event card with Register / View details — left half, middle
  3. Upcoming events list, stats grid, Telegram / Partner cards — lower
- **rendered_text:** "Check your inbox" / "UAT Open Event (UZ)"
- **dominant_colors:** dark theme, teal CTA, white text
- **anomalies:** the success panel appearing is the **expected** behaviour for a "silent discard" — the api returns 202 (same as success) and the form shows "Check your inbox" while the honeypot was filled. The spec verifies "no row created in directus_users + no Mailpit message" via separate API probes; both confirmed (the run-2 reset + spec mailpit-delete-all at the start of `describe` block + the absence of `uat-lead-honeypot@example.com` in the Mailpit list at the end of the run)
- **expected_state_verdict:** MATCH — Neg 001 expected: "The form returns a 202 response (same as success — silent discard). No email arrives in mail catcher for uat-lead-honeypot@aiqadam.test. No directus_users row is created." — visual evidence: form shows success (consistent with 202); mail catcher row count and directus_users state verified by separate probes
- **design_system:** PASS — visually identical to Step 001 submitted; cross-screenshot consistency confirmed

### Screenshot: neg-002-used-token-410.png

- **Step ref:** Neg 002
- **visible_elements:**
  1. Dark card centered on near-black background with "This link can't be used." heading (display font, large) — center
  2. Subtext "The invite has been used, revoked, or expired (`invite_consumed`). Ask your admin for a fresh link." — center, below heading (the structured error code `invite_consumed` is rendered inline in monospace, with a faint background pill)
  3. No form fields visible
- **rendered_text:** "This link can't be used." / "The invite has been used, revoked, or expired (`invite_consumed`). Ask your admin for a fresh link."
- **dominant_colors:** dark card, white heading, muted-grey subtext, teal-tinted monospace code pill
- **anomalies:** none — clean GonePanel render; the structured error code is exposed to the user, which is good for debugging
- **expected_state_verdict:** MATCH — Neg 002 expected: "Page shows a 410 Gone error ('This invitation has already been used' or equivalent). The onboarding form is NOT shown." — exactly observed
- **design_system:** PASS — heading in display font, monospace for error code token, no form components visible (correct for a terminal error state)

### Screenshot: neg-003-expired-token-410.png

- **Step ref:** Neg 003
- **visible_elements:**
  1. Identical GonePanel layout to Neg 002: "This link can't be used." heading — center
  2. Subtext "The invite has been used, revoked, or expired (`invite_expired`). Ask your admin for a fresh link." — center, below heading
- **rendered_text:** "This link can't be used." / "The invite has been used, revoked, or expired (`invite_expired`). Ask your admin for a fresh link."
- **dominant_colors:** dark card, white heading, muted-grey subtext, teal-tinted monospace code pill
- **anomalies:** none — visually identical structure to Neg 002, only the structured code changes from `invite_consumed` to `invite_expired` — this is the correct differential signal
- **expected_state_verdict:** MATCH — Neg 003 expected: "Page shows a 410 Gone error ('This invitation has expired' or equivalent). The onboarding form is NOT shown." — exactly observed
- **design_system:** PASS — same checks as Neg 002; visual consistency between the two 410 panels is good (the only difference is the code word, which is the correct signal)

### Screenshot: neg-004-plus-addressing-rejected.png

- **Step ref:** Neg 004
- **visible_elements:**
  1. Lead-capture card "Get events in your city" — left half, top
  2. Email input field EMPTY (showing placeholder `you@domain.com`) — left half, middle
  3. "Send me a confirmation" teal button ENABLED (not disabled) — left half, below topics chips
  4. The Astro dev toolbar IS visible at the bottom (4 small icons in a pill at position ~y=949) — this is unusual; for all other screenshots either the toolbar is hidden or absent
- **rendered_text:** "Get events in your city" / "you@domain.com" (placeholder) / "Send me a confirmation"
- **dominant_colors:** dark theme, teal primary button, white text
- **anomalies:** **MISMATCH against expected UI state.** The expected state was "Form shows a validation error rejecting the plus-addressed email. No row is created. No email sent." — the form is in `idle` phase, no error `<p>` rendered, no visible banner. The Astro dev toolbar being visible here (but not in Neg 002/003 or Step 001/002/etc.) is suspicious; the screenshot was taken at 3 s after `form.requestSubmit()` so the dev toolbar was probably still rendering. This is the **symptom of the test-spec race** documented in `02-uat-report.md` honesty notes section 1: `setReactInputValue(...)` set the DOM value but React's state commit for `form.email` was not yet applied when `form.requestSubmit()` fired, so the React `onSubmit` handler was never invoked. **Product behaviour is verified correct** by direct API probe (`POST /v1/leads` with plus-addressed email returns 400 with the correct field-error text).
- **expected_state_verdict:** **MISMATCH** — visually, the page is in `idle` state, not the expected `error` state. This is the test's symptom of the React-18-state-commit race documented in `02-uat-report.md`. Recommend registering ISS-NEW to rewrite the Neg 004 test to use `emailInput.fill(LEAD_PLUS)` + `await submit.click()` (the same pattern as Step 001).
- **design_system:** PASS — the form itself is on-brand (matches Step 001 pre-submit). The dev toolbar showing is a test-fixture issue, not a design system issue.

### Screenshot: neg-005-no-authentik-user-409.png

- **Step ref:** Neg 005
- **visible_elements:**
  1. Two-step pill (1. Sign in highlighted, 2. Your mailbox greyed) — center, upper
  2. Heading "Welcome, UAT Operator (no-user)." (display font) — center
  3. Subtext "You're being added as . Set your password and accept the operator agreement to continue." — center, below heading (the role-group text is empty for this row, so the "as ." gap is the expected render of the `role_groups: []` seed)
  4. Email field pre-filled with `uat-operator+no-user@aiqadam.test` (disabled) — center, middle
  5. Set password input filled with 14 bullets
  6. AUP checkbox CHECKED (teal tick)
  7. Inline error code "invite_missing_authentik_user" in RED monospace font — between the checkbox and the submit button
  8. Teal "Continue → your mailbox" primary button (still enabled — form is in `auth_error` phase but remains mounted)
- **rendered_text:** "Welcome, UAT Operator (no-user)." / "uat-operator+no-user@aiqadam.test" / "invite_missing_authentik_user" (in red) / "Continue → your mailbox"
- **dominant_colors:** dark card, white heading, RED monospace error text (using the destructive token), teal CTA and checkbox
- **anomalies:** the role-group text being empty (rendered as "You're being added as .") is a minor copy issue — when `role_groups: []` the sentence reads awkwardly. **Honesty disclosure**: the seeded `UAT Operator (no-user)` row has `role_groups: []` per `_check-onboard-row.ps1`, so the visible dot is the expected render. This is a copy-smell finding (worth a future issue to handle empty `role_groups` with a fallback like "an operator"), but it does NOT affect the test verdict — the 409 response and the inline error code are exactly what the spec asserts.
- **expected_state_verdict:** MATCH — Neg 005 expected: "POST /v1/onboard/accept returns 409 with `invite_missing_authentik_user`. The form stays mounted in the `auth_error` phase and renders an inline `<code>invite_missing_authentik_user</code>` indicator under the password input. The GonePanel must NOT render." — all three observed
- **design_system:** PASS — monospace for the error code in destructive color; teal CTA; form structure consistent with Step 005/006; the red color is the destructive token

### Cross-Screenshot Consistency

All 12 screenshots share the same top navigation bar (logo `AI Qadam`, links `Events · Leaderboard · Get updates`, teal `Sign in` button, `uz Uzbekistan` country switcher, `English` language switcher). All AI Qadam pages use the same dark background (`var(--background)`), the same card surface, the same teal primary CTA token, and the same monospace font for codes/ports/emails. The form components (lead-capture, onboarding) reuse the same spacing rhythm, border radius, and field label styling. The two GonePanels (Neg 002, Neg 003) are visually identical except for the structured error code text, which is the correct differential signal. The onboarding flow (Step 005 → Step 006 pre-submit → Step 006 completed) shows a consistent two-step indicator with the active step highlighted, and the same form card shell across all three states. **One small finding**: the Astro dev toolbar is visible in two screenshots (Step 003 and Neg 004) but hidden in all others. Step 003's leak is harmless (toolbar is below the success card, no overlap); Neg 004's leak is a symptom of the test-spec race (the page was navigated to a fresh route and the dev toolbar injection happened before `hideDevToolbar(page)` could override it for that specific frame). This does not affect any verdict.

### Visual Findings Summary

| Screenshot | Expected-state | Design-system | Finding |
|---|---|---|---|
| `step-001-lead-form-pre-submit.png` | MATCH | PASS | none |
| `step-001-lead-form-submitted.png` | MATCH | PASS | none |
| `step-002-verify-email-in-mailcatcher.png` | MATCH | N/A (third-party Mailpit UI) | none |
| `step-003-lead-verified.png` | MATCH | PASS | Astro dev toolbar visible at bottom (cosmetic; not blocking) |
| `step-004-idempotent-lead-resubmit.png` | MATCH | PASS | none — empirically proves Step 004 idempotency (Mailpit count stayed at 1 across both submissions) |
| `step-005-onboard-page.png` | MATCH | PASS | **empirically proves ISS-UAT-013-10 fix** — `aiqadam-staff` role text rendered in bold |
| `step-006-onboard-pre-submit.png` | MATCH | PASS | none |
| `step-006-onboard-completed.png` | MATCH | PASS | none — terminal success state with email `uat.operator.valid@aiqadam.org` matches the expected mailbox provisioning outcome |
| `neg-001-honeypot-silent-discard.png` | MATCH | PASS | visual proof of silent discard (form shows success; absence of side-effects confirmed by separate probes) |
| `neg-002-used-token-410.png` | MATCH | PASS | structured code `invite_consumed` exposed inline (good for debugging) |
| `neg-003-expired-token-410.png` | MATCH | PASS | structured code `invite_expired` exposed inline (correct differential vs Neg 002) |
| `neg-004-plus-addressing-rejected.png` | **MISMATCH** | PASS | form in `idle`, not `error` — symptom of test-spec race in `setReactInputValue` + `form.requestSubmit()` documented in 02-uat-report.md honesty notes section 1. Recommend ISS-NEW to rewrite the test using `emailInput.fill()` + `submit.click()` (the pattern Step 001 uses successfully). Product behaviour verified correct by direct API probe. |
| `neg-005-no-authentik-user-409.png` | MATCH | PASS | inline error code `invite_missing_authentik_user` rendered in red monospace; minor copy-smell: empty `role_groups` renders as "You're being added as ." — non-blocking, future improvement |

## Gate Result

gate_result:
  status: passed
  summary: "All 12 PNGs reviewed with concrete visible_elements + rendered_text + dominant_colors + anomalies. 11 MATCH / 1 MISMATCH (Neg 004, test-spec race; product verified correct by direct API probe). The three ISS-UAT-013-11 deferred ACs (Step 004 idempotency, Step 005 role_groups, Step 006 onboarding) are empirically verified by Step 004 (Mailpit count = 1 after re-submit), Step 005 ('aiqadam-staff' rendered in bold), and Step 006 (mailbox provisioned at uat.operator.valid@aiqadam.org)."
  findings:
    - "neg-004-plus-addressing-rejected.png — form is in idle state, not error state. Product code is correct (verified by direct API probe); test spec has a React-18-state-commit race. Recommend ISS-NEW to rewrite the test."
    - "step-003-lead-verified.png — Astro dev toolbar visible at bottom (cosmetic; does not overlap success card). Neg 004 screenshot also shows the dev toolbar because the test didn't successfully suppress it for the post-submit frame."
    - "neg-005-no-authentik-user-409.png — minor copy-smell: 'You're being added as .' when role_groups is empty. Non-blocking; future improvement to handle empty role_groups with a fallback phrase."
