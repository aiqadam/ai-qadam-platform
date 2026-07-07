---
type: member-runbook
---

# Runbook: I forgot my password

**Audience:** members.
**Pre-reading:** [auth-architecture.md §6.6](../../04-development/architecture/auth-architecture.md), [BP-USR-PWRESET.md](../uat/BP-USR-PWRESET.md) (operator-side UAT).
**Ships:** ISS-USR-PWRESET-001 (blocker) + Authentik Recovery Flow wiring.

## What to do when you can't sign in

You don't need to email anyone or open a ticket. On the sign-in screen there is a **Forgot password?** link underneath the password field. Click it, enter the email address you registered with, and our identity provider (Authentik) will send you a one-time reset link. The email subject is **"Reset your AI Qadam password"** — if you see that in your inbox, it's a genuine reset email from us.

Open the link in the same browser, choose a new password, and confirm it on the second field. Once Authentik confirms the reset, you can return to the sign-in screen and sign in with your new password. You don't need to remember your old one — that's the whole point of the link.

## What if the email doesn't arrive

Reset emails usually arrive within a minute. If nothing shows up after five minutes, check spam or junk — reset emails are sometimes filtered there on the first send. Make sure you typed the same email you used to sign up; if you're not sure which email is on the account, sign in with one of the social providers (Google, Microsoft, Telegram) instead and your dashboard will show the email we have on file.

If the email address you entered doesn't match any account, Authentik shows a neutral message ("if an account with this email exists, you'll receive an email shortly"). This is deliberate — we don't tell you whether an account exists so that strangers can't probe the platform for valid addresses. If you're sure you used the right email and still got nothing after ten minutes, ask a Super Admin to reset it manually (see [BP-USR-PWRESET.md](../uat/BP-USR-PWRESET.md) for the operator-side steps).

## After you've reset

Sign in with the new password. Authentik will drop you on its user settings page — click the **AI Qadam** logo at the top, or navigate to [aiqadam.org/me](https://aiqadam.org/me), to land back on your member dashboard. Your registrations, profile, and points are untouched; only the password changed.

If you also want to set up two-factor authentication or change your sign-in method, Authentik's user settings page has both — the link lives at the top right of the post-reset screen. For everything else (profile photo, bio, interests, employments), your member profile page at `/me/profile` is the place — see [member-profile.md](./member-profile.md) for what lives there.

## Related

- [`auth-architecture.md` §6.6](../../04-development/architecture/auth-architecture.md) — design intent for forgot-password and how Authentik's Recovery Flow is wired.
- [`BP-USR-PWRESET.md`](../uat/BP-USR-PWRESET.md) — operator-side UAT spec covering happy path, negative path (unknown email), and non-regression against BP-UAT-009.
- [FR-USR-001](../../03-requirements/FR-USR-001.md) — member signup / first-time experience (related: the same Authentik user is reused for recovery).
- [auth runbook](../../04-development/infrastructure/runbooks/auth.md) — for operators handling the Super Admin manual-reset path.