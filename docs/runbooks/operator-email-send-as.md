# Runbook: Setting up Send-as for your `@aiqadam.org` address (in Gmail)

> **⚠ DEPRECATED (F-S2.12, 2026-05-25).**
> The Cloudflare-forwarding + Gmail Send-as flow described below is no
> longer in use. Operators now get a real `@aiqadam.org` mailbox on the
> self-hosted docker-mailserver (DMS) stack, provisioned automatically
> via the Authentik LDAP outpost the moment they finish onboarding at
> `/onboard`. There is nothing to set up in Gmail.
>
> **What to do instead:** sign in at <https://webmail.aiqadam.org/> with
> your `<username>@aiqadam.org` address and the password you set during
> onboarding. For desktop/mobile mail clients use IMAP
> `mail.aiqadam.org:993` (SSL/TLS) and SMTP `mail.aiqadam.org:465`
> (SSL/TLS) with the same credentials.
>
> This runbook is kept for historical reference only — do not follow it.

---

**Audience:** AI Qadam operators (board members, country leads, volunteers with a personal `@aiqadam.org` address).
**Time:** ~10 minutes per operator.
**Pre-reading:** [ADR-0009](../adr/0009-email-stack-saas-exception.md) for the architecture context (optional).

## What this enables

After this setup, when you compose mail in Gmail you can choose `name@aiqadam.org` as the sender. Recipients see your message coming from `name@aiqadam.org`, with proper SPF/DKIM/DMARC alignment — not from your personal Gmail address.

Inbound mail to `name@aiqadam.org` is forwarded by Cloudflare to your personal Gmail; replies (when configured per step 6 below) automatically use `name@aiqadam.org` as the sender.

## What you need before starting

- A personal Gmail account (Workspace works too, but if your Workspace admin has restricted Send-as, you may need their permission)
- Your AI Qadam project lead has set up:
  1. Cloudflare Email Routing rule forwarding `<your-name>@aiqadam.org` → your Gmail
  2. A per-operator **Resend API key** (string starting with `re_…`) just for you
- The Resend API key (you should have received it via secure channel, not via email/Telegram unencrypted)

## Step-by-step

### Step 1 — Open Gmail Settings

1. Open Gmail in a browser.
2. Click the **⚙ gear** (top right) → **See all settings**.
3. Click the **Accounts and Import** tab.

### Step 2 — Start adding the address

In the **Send mail as** section, click **Add another email address**.

A popup window opens. Two screens follow.

### Step 3 — First popup screen (identity)

| Field | Value |
|---|---|
| **Name** | What recipients see in their inbox. e.g., `Viktor Drukker` or `Abdu Muzaffariy • AI Qadam` |
| **Email address** | `<your-name>@aiqadam.org` |
| **Treat as alias** | **UNCHECK this** ⚠️ |

About "Treat as alias":

- **Checked**: Gmail treats it as just another label for your personal address. Replies to mail forwarded to `@aiqadam.org` use your **personal Gmail** as the From: by default.
- **Unchecked** (recommended): Gmail treats it as a separate identity. Replies use `@aiqadam.org` automatically. Cleaner UX.

Click **Next Step**.

### Step 4 — Second popup screen (SMTP)

| Field | Value |
|---|---|
| **SMTP Server** | `smtp.resend.com` |
| **Port** | `587` |
| **Username** | `resend` |
| **Password** | Paste your **Resend API key** (the one starting with `re_…`) |
| **Secured connection using** | **TLS** (radio button) — not SSL |

Click **Add Account**.

### Step 5 — Verification

Gmail says "A confirmation email has been sent to verify ownership of `<your-name>@aiqadam.org`." It sends a verification email **to** your `@aiqadam.org` address.

What happens next:

1. Email arrives at `<your-name>@aiqadam.org`.
2. Cloudflare Email Routing forwards it to your personal Gmail.
3. You receive it within seconds.
4. **Two ways to verify** (use either):
   - **Click the verification link** in the email (easiest), OR
   - **Copy the 9-digit code** from the email body and paste into the Gmail popup that's still open.

Once verified, the popup closes and `<your-name>@aiqadam.org` shows up in **Send mail as**.

### Step 6 — Recommended reply behavior

Still in **Accounts and Import** → **Send mail as** section, find:

> **When replying to a message:**

Select **Reply from the same address the message was sent to**.

This makes "reply" do the right thing automatically — when you reply to mail forwarded to `@aiqadam.org`, the From: defaults to `@aiqadam.org`.

## Test it

1. **Compose** a new email in Gmail.
2. The **From:** field is now a dropdown — click it → select `<your-name>@aiqadam.org`.
3. Send a test to your other email address (or even back to your own personal Gmail at a different address).
4. The recipient should see:
   - From: `<Your Name> <your-name@aiqadam.org>`
   - Headers showing DKIM signed by `aiqadam.org` (Resend), SPF passing on `send.aiqadam.org`.

If you Reply to that test from the recipient side, the reply should land back in your Gmail (via Cloudflare Routing forwarding `<your-name>@aiqadam.org`).

## Troubleshooting

### Verification email never arrives within 2 minutes

In order of how often this is the issue:

1. **Check Gmail's Spam folder.** Google's own verification emails sometimes land there ironically.
2. **Cloudflare Email Routing dashboard** → `aiqadam.org` → **Email** → **Activity log**. You'll see whether mail to `<your-name>@aiqadam.org` arrived at Cloudflare and what happened to it.
3. **Routing rule mistype** — your project lead checks the rule is `<your-name>@aiqadam.org` (not `<your-name>@` alone, no trailing space).
4. **Destination not verified** — Cloudflare → Email → Email Routing → **Destination Addresses** must show your Gmail as **Verified**.
5. **Resend SMTP failure** — if Gmail says "couldn't send verification email," the SMTP credentials in step 4 are wrong. Re-check the API key (re-copy from password manager) and the username `resend`.

### Test mail goes to recipient's spam folder

This typically means SPF/DKIM headers aren't aligning. Inspect the test mail's headers — the recipient should see something like:

```
Authentication-Results: ...
  spf=pass smtp.mailfrom=send.aiqadam.org
  dkim=pass header.d=aiqadam.org
  dmarc=pass action=none header.from=aiqadam.org
```

If `dkim=fail` or `spf=fail`: ping your project lead — likely a DNS record issue at the platform level.

### Receiving mail at `<your-name>@aiqadam.org` but reply From: shows your personal address

Step 6 (reply behavior setting) wasn't done. Repeat step 6.

### "smtp.resend.com:587" connection error

Two possible causes:

1. **API key has wrong permission** — Resend API key must have **Sending access**. If only "Read", SMTP fails. Project lead generates a new key with Sending access.
2. **API key was leaked / rotated** — project lead revoked the old key. New key needed; redo steps 4–5.

## Per-operator API key, by design

Each operator has their own Resend API key (rather than sharing one). This means:

- If your Gmail Send-as setup leaks (e.g., screen-shared, screenshot saved), only your key is compromised — not the platform's outbound or other operators' setups.
- Offboarding an operator = revoking one API key, no impact elsewhere.
- The platform's transactional sends (registration confirmations, password resets, newsletters) use a separate `aiqadam-platform` service-account key.

## After this works

Send the project lead a quick "I'm set up, sent test, all green." They'll mark you as Send-as-verified in the operator roster.

## When automation arrives

Phase 1 weeks 4–6 brings the [Send-as automation](../adr/0012-operator-send-as-automation.md): an Astro page where you click "Connect your Gmail," accept Google's OAuth consent, and the rest happens automatically (~30 seconds). Until then, this manual procedure is the path. Even after automation lands, this runbook stays as fallback documentation — automation can fail and humans need a path.
