# 06 — Test Design: FR-AUTH-005 Telegram Account Linking

Agent: TestDesigner
Workflow: wf-20260803-feat-198

## Gate result: passed

---

## Tests Written

### Unit / Integration

| File | Count | Focus | Required? |
|---|---|---|---|
| `apps/bot/tests/test_api_client_link.py` | 13 | `request_link_start` and `request_link_confirm` — request shape, every status code → exception class mapping | Yes |
| `apps/bot/tests/test_link_handler.py` | 16 | All three handlers in `handlers/link.py` — guard paths, FSM transitions, every error outcome, state-always-cleared invariant | Yes |
| `apps/bot/tests/test_main_wiring.py` | Modified (2 assertions) | Added `"link"` to `BOT_COMMANDS` expected set and `build_dispatcher` router-names subset | Yes |
| `apps/api/test/telegram-link-service.spec.ts` | +2 `it()` cases | `confirmLink` 409 guard (different account) and idempotent re-link (same account) | Yes |
| `apps/web-next/src/blocks/customer/TelegramLinkStatus.test.tsx` | 9 | Render-variant logic (6 cases), linked-text formatting (2), not-linked copy (1) | Yes |

### E2E

None required — the full link flow requires a live bot + API + Directus + email stack. Deferred to BP-UAT verification (post-merge UAT per `AGENTS.md §6.1`).

---

## Acceptance Criteria Coverage

| AC | Test(s) | Status |
|---|---|---|
| AC-1: unknown/unresolved user sees unavailable message | `test_link_command_shows_unavailable_when_user_context_is_none`, `test_link_command_shows_unavailable_when_user_is_unknown` | verified |
| AC-2: known user gets email prompt + enters awaiting_email state | `test_link_command_prompts_for_email_and_enters_awaiting_email_state` | verified |
| AC-3: invalid email format re-prompts without leaving awaiting_email or calling API | `test_link_email_reply_reprompts_on_invalid_format_without_calling_api` | verified |
| AC-4: rate-limited → clears state, shows rate_limited message | `test_link_email_reply_shows_rate_limited_and_clears_state` | verified |
| AC-5: API unavailable on start step → clears state, shows unavailable | `test_link_email_reply_shows_unavailable_and_clears_state_on_api_500` | verified |
| AC-6: successful email step — challenge_id stored, transitions to awaiting_code | `test_link_email_reply_stores_challenge_id_and_transitions_to_awaiting_code` | verified |
| AC-7: wrong code / attempts exhausted → clears state, shows wrong_code (both map to 401 → LinkInvalidCodeError) | `test_link_code_reply_shows_wrong_code_and_clears_state_on_401` | verified |
| AC-8: member not found on confirm → clears state, shows no_account | `test_link_code_reply_shows_no_account_and_clears_state_on_404` | verified |
| AC-9: already linked to different account → clears state, shows already_linked_other | `test_link_code_reply_shows_already_linked_other_and_clears_state_on_409` | verified |
| AC-10: successful confirm → clears state, shows success | `test_link_code_reply_shows_success_and_clears_state_on_200` | verified |
| AC-11 (API surface): 409 guard throws ConflictException when tg_user_id differs | `telegram-link-service.spec.ts` new it() case | verified |
| AC-12 (API surface): same-account re-link is idempotent, directusPatch called | `telegram-link-service.spec.ts` new it() case | verified |
| AC-13 (Web): linked state shows @username | `TelegramLinkStatus.test.tsx` linked-with-username variant | verified |
| AC-14 (Web): null telegram_user_id shows not-linked copy | `TelegramLinkStatus.test.tsx` not-linked variant | verified |

---

## Known Test Gaps

1. **`LinkExhaustedError` has no dedicated test.** The class is defined in `api_client.py` but `request_link_confirm` never raises it — the API returns 401 for exhausted attempts, which maps to `LinkInvalidCodeError`. The handler has no separate branch for `LinkExhaustedError`. A `# TODO(testdesigner, 2026-08-03): if API ever returns a distinct status for exhausted, add LinkExhaustedError branch to handler and test it` comment is appropriate if this becomes a future requirement.

2. **E2E / live bot test deferred.** The full 3-step flow (bot /link → email OTP → /confirm) requires a live Telegram bot + API + Directus + Mailpit stack. This is out-of-scope for unit tests and covered by the post-merge BP-UAT run per `AGENTS.md §6.1`.

3. **`handle_link_command` is available to both temp and full accounts** (no `is_temp` short-circuit). This is intentional per the handler's design notes and is tested implicitly (all test fixtures use `is_temp=False`). A future requirement that restricts `/link` to full accounts only would require updating `AC-2` tests.

---

## Files Written / Modified

| Path | Action |
|---|---|
| `apps/bot/tests/test_api_client_link.py` | Created (13 tests) |
| `apps/bot/tests/test_link_handler.py` | Created (16 tests) |
| `apps/bot/tests/test_main_wiring.py` | Modified (+2 assertions updated) |
| `apps/api/test/telegram-link-service.spec.ts` | Modified (+2 it() cases, +ConflictException import, +telegram_user_id on FakeMember) |
| `apps/web-next/src/blocks/customer/TelegramLinkStatus.test.tsx` | Created (9 tests) |
