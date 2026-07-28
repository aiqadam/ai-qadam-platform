# ISS-USR-REDIRECT-002 — `createRecoveryLink()` reads the wrong Authentik response field

| Field | Value |
|---|---|
| ID | ISS-USR-REDIRECT-002 |
| Severity | blocker |
| Module | api/auth (admin-invites Authentik client) |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-140-recovery-flow-redirect |
| Reporter | Orchestrator (discovered during ISS-USR-REDIRECT-001 impact analysis) |
| Business-Process | BP-UAT-013 |

## Symptom

A new member who self-registers (`POST /v1/auth/register`) does not
receive the welcome email that should carry an Authentik recovery link
(`registration.service.ts`'s `dispatchWelcomeEmail`). Separately (and
more severely, discovered as a side effect of investigating this),
Telegram Login-Widget sign-in silently fails.

## Root cause (confirmed live, 2026-07-28)

`AuthentikClient.createRecoveryLink()`
(`apps/api/src/modules/admin-invites/authentik.client.ts:239-245`) read
`res.recovery_link` from Authentik's `POST
/api/v3/core/users/{pk}/recovery/` response. **Authentik's actual live
response field is `link`, not `recovery_link`:**

```
$ curl -X POST .../api/v3/core/users/6/recovery/
{"link":"http://localhost:9000/if/flow/default-recovery-flow/?flow_token=..."}
```

`res.recovery_link` was therefore always `undefined` in production.
Consequences, traced through every caller:

- `registration.service.ts` Step 8: `recoveryUrl` is `undefined` →
  `if (recoveryUrl)` is false → `dispatchWelcomeEmail` is **never
  called**. New members never receive a welcome email at all — not "the
  link doesn't work," but "no email is sent, silently," with only a
  `logger.warn` visible to operators.
- `telegram-auth.service.ts` `exchangeWidgetPayload` (called from
  `AuthController.telegramExchange`,
  `res.redirect(HttpStatus.FOUND, recoveryUrl)`): redirects the
  browser's 302 `Location` header to `undefined` — **Telegram
  Login-Widget sign-in is broken** for any user, not just first-time
  ones. Wider blast radius than the original GitHub issue #89 report;
  discovered as a side effect of this investigation, not independently
  reported before now.

The existing unit test for this method
(`apps/api/test/authentik-client.spec.ts`) mocked the HTTP response as
`{ recovery_link: RECOVERY_URL }` — i.e. it mirrored the code's own bug
instead of Authentik's real response shape, so it always passed despite
the method being broken end-to-end. This is why it went undetected.

## Fix

`apps/api/src/modules/admin-invites/authentik.client.ts` —
`createRecoveryLink()` now reads `res.link` (matches Authentik's real
response). `apps/api/test/authentik-client.spec.ts`'s mock corrected to
`{ link: RECOVERY_URL }` to match the real API and actually catch this
class of bug going forward.

No changes needed in `registration.service.ts` or
`telegram-auth.service.ts` — both already correctly propagate whatever
`createRecoveryLink()` returns; they were only ever being fed
`undefined`.

## Regression test

`apps/api/test/authentik-client.spec.ts`'s `createRecoveryLink` describe
block. Fail-before/pass-after verified live: with the test's mock fixed
to the real `{ link }` shape but the source still reading
`res.recovery_link` (via `git stash` on the source file only), the test
fails with `Expected: "https://..." / Received: undefined` — proving the
test genuinely catches the bug. With both fixed, it passes.

## Verification

- **Live:** `curl -X POST http://localhost:9000/api/v3/core/users/6/recovery/`
  confirms the real response shape is `{"link": "..."}`.
- **`pnpm exec vitest run test/authentik-client.spec.ts
  test/registration-service.spec.ts test/telegram-auth-service.spec.ts`:**
  47/47 passing, no regressions in either consumer's own test suite
  (both already correctly mock `AuthentikClient` at the method level, so
  they were unaffected by the bug or the fix).

## Scope note — a second, larger finding was split off, NOT fixed here

While verifying this fix live end-to-end (driving a real recovery link
through a browser via Playwright), a **third, more fundamental** problem
was discovered: Authentik's recovery-link mechanism does not behave like
a one-time login link at all. Loading a freshly-minted recovery link
lands the browser on Authentik's identification stage, which **still
prompts "Enter the email associated with your account"** — it does not
silently authenticate the user. Screenshot-confirmed live.

This means the module doc's original assumption ("a short-TTL, one-use
URL the browser visits to establish an authenticated OIDC session
without a password") does not match how this Authentik flow actually
behaves. Binding a redirect stage to `default-recovery-flow` (the fix
originally planned for this issue, briefly applied and then reverted
live after this discovery — see workflow artifacts) would only add a
redirect AFTER the identification+email re-verification the user would
have to complete manually — not the one-click experience the welcome
email promises.

This is a design question (what should "one-time login link" actually
be — a real Authentik one-time-login token mechanism, or an app-owned
short-lived JWT magic link?), not a bugfix. Filed separately as
**[ISS-USR-REDIRECT-003](ISS-USR-REDIRECT-003.md)** for proper
requirement-development treatment rather than being forced into this
issue-resolution workflow's scope.

### Honesty disclosures (AGENTS.md §6.1)

- This issue resolves Bug A only (field-name mismatch). It does NOT
  fully resolve "the welcome-email link gets a new member into the
  app" — that requires ISS-USR-REDIRECT-003's design work, not yet
  scheduled with a workflow ID (needs product/design input on which
  mechanism to build, not just an implementation).
- The Telegram sign-in fix (also unblocked by this same fix) has not
  been live-verified end-to-end against a real Telegram Login Widget
  (no test bot session in this environment) — verified only via the
  existing unit test suite (which correctly exercises the service-level
  contract) and by confirming the underlying `createRecoveryLink()` bug
  that was silently breaking it.

## Resolution

- **Workflow:** wf-20260728-fix-140-recovery-flow-redirect
- **PR:** [#92](https://github.com/aiqadam/ai-qadam-platform/pull/92)
- **Root cause:** `createRecoveryLink()` read `res.recovery_link`;
  Authentik's real response field is `res.link`. Always returned
  `undefined` in production.
- **Fix:** One-line field-name correction in
  `authentik.client.ts`; corrected the unit test mock that had been
  mirroring the same bug.
- **Regression test:** `apps/api/test/authentik-client.spec.ts` —
  `AuthentikClient.createRecoveryLink` describe block.
- **Merged:** `6f5400e` (squash, 2026-07-28)
