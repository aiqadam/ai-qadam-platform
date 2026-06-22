---
code: FR-USR-001
name: Member signup and first-time experience
status: Shipped
module: Users (USR)
phase: Phase 1 (V1)
---

## Description

New members join the platform through one of several entry points: email/password sign-up via Authentik, a social OAuth provider, or Telegram bot. After first sign-in, members are guided to complete their profile. Members who are invited as operators follow a separate `/onboard` flow.

## Users

New members; invited operators.

## Functional scope

1. **Standard sign-up** — Authentik handles all registration (email/password). No custom sign-up page in the platform; Authentik's default registration flow is used.
2. **Post-signup redirect** — After first sign-in, user lands at `/me`. If profile completeness is below a threshold, a nudge is shown (see FR-USR-003).
3. **Founding Member badge** — Users who register during the Phase 1 launch period receive a "Founding Member" badge automatically (see FR-GAM-002).
4. **Operator onboarding (`/onboard`)** — Token-gated page for invited operators. Flow: preview invite details → set password + accept AUP → mailbox provisioning screen (DMS mailbox + IMAP/SMTP settings displayed). Handled by `OnboardingForm` island.
   - `GET /v1/onboard/preview` — returns invite details for the token.
   - `POST /v1/onboard/accept` — sets password via Authentik admin API, marks invite as used, provisions mailbox.
   - Returns `410 Gone` if token already used or expired.
5. **Lead capture** — Anonymous visitors can submit their email via `LeadCaptureForm` on the homepage and events list. `POST /v1/leads` (no auth required, honeypot anti-spam). Email verified via `GET /v1/leads/verify?token=...`. Result pages: `/leads/thank-you`, `/leads/verified`, `/leads/verify-failed`.

## Acceptance criteria

- [ ] A new user who completes sign-up via Authentik and returns to the platform lands at `/me`.
- [ ] Operator invite link (`/onboard?token=...`) shows invite details and allows password set + AUP acceptance.
- [ ] Using an already-accepted invite token returns a `410 Gone` page.
- [ ] Lead capture form submits successfully; the submitter receives a verification email within 60 seconds.
- [ ] Submitting the lead form twice with the same email returns `202` (idempotent) without sending a second email.
- [ ] The honeypot field in the lead form, if filled, silently discards the submission.

## Notes

- Platform does not host a custom registration form. All credential management is Authentik's responsibility.
- "Founding Member" badge award logic is part of FR-GAM-002.
- Plus-addressing (`+`) in email local parts is rejected at every form that accepts an email.
