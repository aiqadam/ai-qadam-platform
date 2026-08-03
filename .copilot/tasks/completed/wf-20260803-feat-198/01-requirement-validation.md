# 01 — Requirement Validation: FR-AUTH-005

Agent: RequirementAnalyst
Workflow: wf-20260803-feat-198
Branch: feature/AUTH-005-telegram-account-linking

## Raw Input

`docs/03-requirements/FR-AUTH-005.md` (status: Planned, module: Auth, phase: Roadmap
Sprint 6, github_issue #138). Key claims in original:

> "Link initiation via POST /v1/auth/telegram/link-token on /me; link completion via
> bot calling POST /v1/internal/telegram/link-user; sets attributes.telegram_id on the
> existing Authentik user."

---

## Analysis

### Completeness Issues Found

**Issue 1 — Data model incorrect (blocker-class conflict).**
The requirement says the link writes `attributes.telegram_id` on the Authentik user.
The real architecture stores the link in Directus:
`directus_users.{telegram_user_id, telegram_username, telegram_linked_at, telegram_opted_out_at}`.
Evidence:
- `apps/api/src/modules/telegram/schema.ts` header: "The canonical member-link fields live on `directus_users` in Directus per ADR-0033 — those are NOT in this file."
- FR-NTF-004 correction note (wf-20260803-feat-197): "`attributes.telegram_id` does not exist anywhere in the codebase."
- `telegram.service.ts` `writeLinkToDirectus()`: PATCHes `/users/${memberId}` with `{ telegram_user_id, telegram_username, telegram_linked_at, telegram_opted_out_at: null, gdpr_deleted_at: null }`.

**Issue 2 — API endpoints incorrect (blocker-class conflict).**
FR states `POST /v1/auth/telegram/link-token` and `POST /v1/internal/telegram/link-user`. Neither exists.
What was actually built (live, fully tested):
- `POST /v1/telegram/link/start` — body `{ tg_user_id, email }`. Bot-initiated. Sends 6-digit OTP to email.
- `POST /v1/telegram/link/confirm` — body `{ challenge_id, code, tg_user_id, tg_username? }`. Verifies OTP, writes link to Directus.
Both are in `TelegramController`, with full integration tests in `apps/api/test/telegram-link-service.spec.ts`.

**Issue 3 — Flow direction incorrect (design conflict).**
FR describes a **web-initiated** flow: `/me` → link-token → QR/deep-link → bot `/start link_<token>`.
What was built is a **bot-initiated email-code** flow: user types `/link` in bot → bot calls `link/start` → API emails 6-digit OTP → user pastes code → bot calls `link/confirm`.
OTP TTL is 5 minutes (`CODE_TTL_MS = 5 * 60 * 1000`), not 10 minutes as stated in the FR ACs.

**Issue 4 — Scope item 4 ("Notification unlock") is incorrect.**
FR-NTF-004 (Shipped) already works independently against `directus_users.telegram_user_id` / `telegram_opted_out_at` — it does NOT depend on FR-AUTH-005.

**Issue 5 — Bot `/link` command not yet built.**
`apps/bot/src/handlers/upgrade.py` explicitly marks FR-AUTH-005 as `status: Planned` / not built.

**Issue 6 — Web `/me` Telegram status not yet built.**
No Telegram link status section exists in `apps/web-next/src/pages/me/` (verified by code search).

### Assumption resolved: re-link behavior
Current `writeLinkToDirectus()` overwrites unconditionally. **Assumed: add `409 Conflict` guard** for re-link to a different Telegram account (matching original FR AC intent); same account is idempotent.

### Conflicts with Existing Features

- **FR-NTF-004 (Shipped):** Explicitly independent. No conflict.
- **FR-AUTH-002 (In Progress):** Correctly cross-references FR-AUTH-005. No conflict.
- **FR-AUTH-007 (Planned, depends on AUTH-005):** Downstream inconsistency when it ships; not a blocker here.

### Architectural Feasibility

1. **API layer** — ALREADY IMPLEMENTED. Surface A requires one small addition: `409 Conflict` guard in `confirmLink()`.
2. **Bot `/link` command** — Buildable. Standard aiogram FSM (same pattern as `handlers/upgrade.py`).
3. **Web `/me` status display** — Buildable. Extend existing Directus member profile fetch; add read-only status section.

---

## Formalized Requirement

**FEAT-AUTH-005** — Telegram account linking (existing web account → Telegram bot)

**Three surfaces:**

**Surface A — API layer (DONE + minor fix):**
`POST /v1/telegram/link/start` and `POST /v1/telegram/link/confirm` in
`telegram.controller.ts` / `telegram.service.ts`. OTP TTL 5 min, max 3 active
challenges per user, max 5 confirm attempts. Writes `directus_users.telegram_user_id`
on success. Full integration tests pass in `telegram-link-service.spec.ts`.
Minor fix needed: add `409 Conflict` guard in `confirmLink()` for re-link to a
different Telegram account.

**Surface B — Bot `/link` command (TODO):**
New `apps/bot/src/handlers/link.py` aiogram handler. FSM: prompt email → call
`link/start` → prompt 6-digit code → call `link/confirm`. Available to all users
regardless of `is_temp`. State always cleared after each outcome.

**Surface C — Web `/me` Telegram status (TODO):**
Read-only section on `/me`. Shows "@username (linked)" or "Not linked — type /link in
@aiqadam_bot". Extend Directus member profile query to include `telegram_user_id` and
`telegram_username`. Phase 1: plain-text instruction only; no QR code.

---

## Acceptance Criteria

**Surface A (API):** Already verified by `telegram-link-service.spec.ts` + 409 guard addition.

**Surface B — bot `/link`:**
- AC-1: `/link` prompts for email; bot calls `link/start` and confirms the code was sent.
- AC-2: Correct 6-digit code within 5 minutes links the account; `directus_users.telegram_user_id` is set.
- AC-3: Reusing a consumed code returns an error (single-use OTP).
- AC-4: Unknown email: "no account found" without leaking email existence.
- AC-5: Five wrong codes exhausts the challenge; even the correct code is then rejected.
- AC-6: Re-linking to a different Telegram account returns `409 Conflict`; same account is idempotent.

**Surface C — web `/me` status:**
- AC-7: Member with linked Telegram sees "@username (linked)" on `/me`.
- AC-8: Member without linked Telegram sees "not linked" with bot `/link` instructions.
- AC-9: Reloading `/me` after bot `/link` completes shows the newly linked handle.

---

## Business Process Linkage

Nearest existing UAT: **BP-UAT-009** (Auth sign-in and sign-out).
Setting `business_process: BP-UAT-009` in FR-AUTH-005.md frontmatter.
New **BP-UAT-022** (Telegram account linking — cross-surface) recommended to DocWriter.

---

## Feature Code Confirmation

**FEAT-AUTH-005** is correct. Module `AUTH`, number `5`, registry position #56.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: >
    FR-AUTH-005 corrected and formalized. 3 blocker-class conflicts resolved (data
    model, endpoint names, flow direction). Corrected requirement produced. API layer
    already done (Surface A + 409 guard); remaining work is bot /link command (Surface B)
    and web /me status display (Surface C). Proceeding to ImpactAnalyzer.
  feature_code: FEAT-AUTH-005
  business_process: BP-UAT-009
```
