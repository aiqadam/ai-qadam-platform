# ISS-BOT-ME-TG-LINK-001 — Bot-side FR-AUTH-007 work (`/me` Telegram link status) was implemented locally but never committed, pushed, or merged

| Field | Value |
|---|---|
| ID | ISS-BOT-ME-TG-LINK-001 |
| Severity | minor |
| Module | apps/bot (submodule) |
| Status | resolved |
| Reported | 2026-08-04 |
| Resolved | 2026-08-04 |
| Workflow | wf-20260804-fix-210-bot-me-telegram-link-status |
| Reporter | User (asked "Is it OK that bot subproject uncommitted?" after noticing `apps/bot` dirty during ISS-CI-SUPPLYCHAIN-FASTURI-001) |
| Business-Process | — |
| GitHub-Issue | — |

## Symptom

While resolving an unrelated CI issue (#265), `apps/bot` showed as a
dirty submodule (`git status` → `m apps/bot`). Investigation found two
uncommitted, unpushed source changes in the local `apps/bot` checkout:

```
M src/handlers/me.py
M src/services/api_client.py
```

on local branch `feature/bot-003-operator-commands` (a stale name from
an earlier, already-merged feature).

## Root cause

`wf-20260804-feat-208-linked-accounts-management` (PR #260, merged
`4edb1c4`) implemented FR-AUTH-007 on the **API side only**
(`LinkedAccountsService`, 3 new endpoints, `telegramLinked`/
`telegramUsername` added to `TelegramMeResult`) and the **web side**
(`LinkedAccountsPanel` replacing `TelegramLinkStatus` on `/me`). Its
own `workspace-state.md` summary claimed "bot `/me` updated with
Telegram link state" as already done — but the actual bot-side code
consuming the new API fields was only ever written into the local
working tree, never committed. The platform repo's `apps/bot`
submodule pointer on `main` (`db3275b`, set by the earlier
FR-AUTH-005 PR #245) never advanced, so the deployed bot never gained
this capability. The gap sat invisible until the dirty submodule was
noticed by chance during an unrelated session.

## Resolution

- **Workflow:** wf-20260804-fix-210-bot-me-telegram-link-status
- **Bot repo commit:** [`aiqadam/aiqadam-telegram-bot@ed2228c`](https://github.com/aiqadam/aiqadam-telegram-bot/commit/ed2228c)
  on branch `feat/auth-007-bot-me-telegram-link-status` (no PR — this
  repo has no CI and no PR history; commits land on a branch and the
  platform repo's submodule-pointer PR is what gates and records the
  change, matching the existing precedent for every prior bot feature).
- **Platform repo PR:** <pending — back-filled below>
- **Fix:**
  - `/me` now renders the caller's real Telegram link state
    (`"@handle — Telegram linked"` or a `/link` prompt) instead of the
    old static "link your account on the web" CTA, using the
    `telegramLinked`/`telegramUsername` fields the API's
    `TelegramMeResult` already exposes (sourced from
    `directus_users.telegram_user_id`, the same field FR-AUTH-005's
    `/link` command writes).
  - Moved the two new strings into the `en`/`ru` locale tables
    (`me.telegram_linked`, `me.telegram_not_linked`), matching every
    other line in `me.py` — the found-uncommitted diff had hardcoded
    English strings directly in the handler, which this fix corrected
    before committing.
  - Deleted the now-dead `me.link_web_cta` locale key (no remaining
    callers after this change) rather than leaving it unused.
  - Corrected `me.py`'s module docstring, which described the
    "no linked-status concept exists" scope decision as still current;
    it is now marked as closed by FR-AUTH-005/FR-AUTH-007, with the
    original reasoning preserved for context.
  - Updated `FR-AUTH-007.md`'s AC-5 and added a scope note: the bot's
    "linked providers summary" is Telegram-only, since the bot's
    identity model (`TelegramAuthService`) has no read path to
    Email/Google/GitHub link state (that lives in Authentik's admin
    API, called only by the NestJS API for the web panel). A full
    4-provider bot summary would need a new API surface — out of
    scope here, noted as a real, disclosed gap, not silently dropped.
- **Tests:** existing `test_render_me_always_includes_link_web_cta`
  (which asserted the now-removed static CTA) replaced with 3 new
  tests covering linked/not-linked/linked-without-username render
  paths; 2 new `ApiClient.get_me_summary` parsing tests
  (`telegramLinked`/`telegramUsername` present, and absent-defaults-
  to-not-linked for backward compatibility with older API responses).
  Full bot suite: 212/212 passing. `ruff check`/`ruff format --check`
  clean on every changed file (pre-existing drift in
  `test_operator_commands.py`, `api_client.py:1107`, and several
  `link.*` locale strings confirmed unrelated via `git stash` diff —
  left untouched).
- **Merged:** <pending — Step 12.5 back-fills the squash SHA.>

## Business-process linkage note

`FR-AUTH-007.md`'s own `business_process: [BP-UAT-003]` is left
unchanged (it represents the FR as a whole, and the web
`LinkedAccountsPanel` genuinely touches BP-UAT-003's `/me/profile`
surface). This workflow's own `business_process` is `[]` — checked
`BP-UAT-003.md` directly and it is entirely about the web
`/me/profile` cabinet (core fields, skills, interests, employments);
zero steps touch the bot or Telegram link status. Forcing a link here
would overclaim post-merge UAT coverage for a surface BP-UAT-003 never
re-verifies. Same posture prior workflows (e.g. `wf-20260801-feat-178`)
already took when their own surface didn't match the FR-level BP-UAT.
