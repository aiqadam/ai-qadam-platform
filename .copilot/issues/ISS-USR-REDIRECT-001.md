# ISS-USR-REDIRECT-001 — First-time sign-in does not land the user on `/me`

| Field | Value |
|---|---|
| ID | ISS-USR-REDIRECT-001 |
| Severity | bug |
| Module | web-next/auth (post-signup redirect) |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-139 |
| Reporter | tvolodi (GitHub issue) |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/89 |
| Business-Process | BP-UAT-013 |

## Symptom

Reported verbatim: "After the first login in the application user not
routed to his profile." Cites `FR-USR-001` > "Post-signup redirect not
working."

`FR-USR-001` AC-1 states: "A new user who completes sign-up via Authentik
and returns to the platform lands at `/me`." The reporter observes this is
not happening — after completing sign-up/first sign-in, the user does not
end up on their profile (`/me`).

## Scope clarification

Both `apps/web` and `apps/web-next` share the identical defect
independently. Affects any first-time sign-in through the standard
"Sign in" entry points (nav CTA from the homepage, bare `/auth/sign-in`
visit) — not limited to brand-new accounts, but that's the case the
reporter hit and the one FR-USR-001 AC-1 specifies.

A second, more severe, distinct bug was discovered during impact
analysis (the self-registration welcome-email one-time link never
re-enters the app at all) — filed separately as
[ISS-USR-REDIRECT-002](ISS-USR-REDIRECT-002.md), queued as
`wf-20260728-fix-140-recovery-flow-redirect`, fixed as its own PR per
user instruction (fix both, sequenced as 2 PRs to respect AGENTS.md §4).

## Root cause

`postLoginRedirectUrl(next)` (`apps/api/src/modules/auth/auth.service.ts:169`)
redirects the browser to whatever `next` it's given — that logic was
never wrong. The bug is that **no code path ever set `next=/me`**. Every
entry point that constructs `/v1/auth/login?next=...` defaulted to the
*current page path* (typically `/` for a first-time/homepage visitor) or
omitted `next` entirely, and both `apps/web-next` and `apps/web`'s
`sign-in.astro` defaulted the missing param to the literal `/` — never
`/me`. `FR-USR-001` AC-1 ("...returns to the platform lands at `/me`")
was never actually implemented; the redirect target had only ever been
"wherever the user was before clicking Sign in."

## Fix

Changed the *default value* only, in 4 files (both apps' `sign-in.astro`
+ both apps' nav component):
- `apps/web-next/src/pages/auth/sign-in.astro` / `apps/web/src/pages/auth/sign-in.astro` —
  `next` defaults to `/me` (was `/`) when `?next=` is absent from the URL.
- `apps/web-next/src/blocks/common/AppNav.astro` / `apps/web/src/components/Nav.astro` —
  "Sign in" CTA passes `next=/me` instead of `next=/` specifically when
  the visitor is on the homepage (every other page's CTA is unchanged —
  it still passes its own real page context).

No changes to `postLoginRedirectUrl`, the OIDC flow-cookie mechanism, or
any shared auth infrastructure — this was a pure default-value fix at
the two points where `next` is first chosen.

## Regression test

`apps/e2e/tests/uat/sign-in-default-redirect.spec.ts` — 3 cases (2
document the original bug, 1 guards the existing "return to gated page"
behavior against regression). Fail-before/pass-after verified live via
`git stash` against the running `apps/web-next` dev server: 2/3 fail
pre-fix (`Received: "/"` where `/me` expected), all 3 pass post-fix.

## Verification

- **Live, pre-fix:** `curl -D - http://localhost:4322/auth/sign-in` →
  `location: /api/v1/auth/login?next=%2F`.
- **Live, post-fix:** same curl → `location: /api/v1/auth/login?next=%2Fme`.
- **`astro check`** (both apps): 0 errors, 0 warnings (pre-existing hints
  only, unrelated to this change).
- **`pnpm test`**: `apps/web-next` 932/932 passing; `apps/web` 54/54
  passing — no regressions.
- **`biome check`** on the new spec file: clean.

### Honesty disclosures (AGENTS.md §6.1)

- This fix covers the standard "Sign in" entry points only. The
  self-registration welcome-email recovery-link path remains broken —
  tracked as [ISS-USR-REDIRECT-002](ISS-USR-REDIRECT-002.md), queued as
  `wf-20260728-fix-140-recovery-flow-redirect`, to be run as a follow-up
  workflow immediately after this one closes (same session, per user
  instruction — not an indefinite deferral).
- No live QA verification of the deployed fix (this workflow does not
  push to QA) — verified live against the local dev server pre/post-fix
  instead, same evidentiary pattern as prior `ISS-USR-REG-*` issues on
  this surface.

## Resolution

- **Workflow:** wf-20260728-fix-139
- **PR:** <pending>
- **Root cause:** No code path ever set `next=/me`; both apps' sign-in
  entry points defaulted `next` to the current/home path instead.
- **Fix:** Default `next` to `/me` in both apps' `sign-in.astro` and
  both apps' nav "Sign in" CTA (homepage case only).
- **Regression test:** `apps/e2e/tests/uat/sign-in-default-redirect.spec.ts`
- **Merged:** <pending>
