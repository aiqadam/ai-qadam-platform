# Test Results: FEAT-AUTH-007 — Linked Accounts Management

**Workflow:** wf-20260804-feat-208-linked-accounts-management
**Agent:** TestRunner (Orchestrator-executed)
**Date:** 2026-08-04

---

## Summary

| Metric | Value |
|---|---|
| New test file | `apps/api/test/linked-accounts.service.spec.ts` |
| New tests | 21 |
| New tests passing | 21 |
| Total test files | 126 |
| Total tests | 1632 |
| Total passing | 1616 |
| Pre-existing failures | 11 |
| New failures introduced | **0** |

---

## New Tests (21/21 pass)

`linked-accounts.service.spec.ts` — two describe blocks:

**`LinkedAccountsService.getLinkedAccounts` (10 tests):**
- Returns 4 rows when all providers are linked
- Email row: linked=false when has_usable_password=false
- Email row: canUnlink is always false even when sole method
- Google row: linked=true and canUnlink=true when connection exists + totalLinked>1
- Google row: canUnlink=false when google is the only linked method
- GitHub row: linked=true when getUserSourceConnections returns a github connection
- Telegram row: linked=true and handle=@username when telegram_user_id is set
- Telegram row: linked=false when telegram_user_id is null
- Telegram row: linked=false and directus.get not called when resolveDirectusId returns null
- Throws NotFoundException when getUserByEmail returns null
- IDOR: getUserByEmail called with JWT email (not user input)

**`LinkedAccountsService.unlinkProvider` (11 tests):**
- Throws ConflictException when provider is 'email' (always)
- Throws ConflictException for email without calling Authentik (fast-path)
- Throws ConflictException when google is last linked method
- Throws ConflictException when telegram is last linked method
- Calls deleteUserSourceConnection with server-resolved pk for google (IDOR test)
- Calls deleteUserSourceConnection with server-resolved pk for github
- Idempotent for google: returns without error when connection not found (totalLinked>1 setup)
- PATCHes telegram fields to null when unlinking telegram
- Idempotent for telegram: returns without calling PATCH when directusId=null (totalLinked>1 setup)
- Throws NotFoundException when getUserByEmail returns null
- ConflictException message matches exact string "You must keep at least one sign-in method."

---

## Pre-existing Failures (unchanged)

| File | Count | Note |
|---|---|---|
| `test/interactions-service.spec.ts` | 10 | Pre-existing on `origin/main` before this PR — confirmed by stash/unstash run |
| `test/users.spec.ts` | 1 | Flaky timing test — pre-existing on `origin/main` before this PR |

---

## TypeScript

`pnpm exec tsc --noEmit` — 0 errors.

---

Gate: passed
