# Test Design — wf-20260804-feat-208-linked-accounts-management

## Summary

Unit tests for `LinkedAccountsService` (FR-AUTH-007), following the
direct-instantiation-with-mocks pattern established in
`apps/api/test/telegram-bot-me-service.spec.ts`.

---

## Tests Written

### Unit Tests

| File | Count | Focus |
|------|-------|-------|
| `apps/api/test/linked-accounts.service.spec.ts` | 17 | `getLinkedAccounts` + `unlinkProvider` — all happy paths, all error paths, IDOR guard |

### Integration Tests

Not written in this step (no new database schema; service is a pure orchestration
layer over Authentik + Directus HTTP clients that are mocked above).

### E2E Tests

Not written in this step. UI-level flow (LinkedAccountsPanel) is covered by
existing Playwright smoke suite; no new E2E file added.

---

## Test Case Inventory

### `getLinkedAccounts`

| # | Description | Assertion type |
|---|-------------|----------------|
| 1 | All 4 providers linked → full row shapes with canUnlink=true | `toEqual` |
| 2 | `has_usable_password=false` → email `linked=false`, `handle=null` | `toEqual` |
| 3 | Email `canUnlink` is always `false` even as sole method | `toBe(false)` |
| 4 | Google connection present + totalLinked>1 → `linked=true`, `canUnlink=true` | `toEqual` |
| 5 | Google only method (totalLinked==1) → `canUnlink=false` | `toBe(false)` |
| 6 | GitHub connection present → `linked=true`, `canUnlink=true` | `toBe` |
| 7 | `telegram_user_id` set → `linked=true`, `handle=@username` | `toBe` |
| 8 | `telegram_user_id=null` → `linked=false`, full row shape | `toEqual` |
| 9 | `resolveDirectusId` returns null → `directus.get` not called, tg `linked=false` | `not.toHaveBeenCalled` |
| 10 | `getUserByEmail` returns null → `NotFoundException` | `rejects.toBeInstanceOf` |
| 11 | IDOR: `getUserByEmail` called with JWT email, not caller-supplied PK | `toHaveBeenCalledWith` |

### `unlinkProvider`

| # | Description | Assertion type |
|---|-------------|----------------|
| 12 | `provider='email'` → `ConflictException` always | `rejects.toBeInstanceOf` |
| 13 | `provider='email'` → `getUserByEmail` never called (fast-path) | `not.toHaveBeenCalled` |
| 14 | Google is last method → `ConflictException` | `rejects.toBeInstanceOf` |
| 15 | Telegram is last method → `ConflictException` | `rejects.toBeInstanceOf` |
| 16 | Unlink google → `deleteUserSourceConnection` called with server-resolved `pk` | `toHaveBeenCalledWith` |
| 17 | Unlink github → `deleteUserSourceConnection` called with server-resolved `pk` | `toHaveBeenCalledWith` |
| 18 | Unlink google already gone → no delete call, resolves cleanly (idempotent) | `not.toHaveBeenCalled` |
| 19 | Unlink telegram → `directus.patch` called with all three fields set to null | `toHaveBeenCalledWith` |
| 20 | Unlink telegram, no Directus row (directusId=null) → no PATCH call (idempotent) | `not.toHaveBeenCalled` |
| 21 | `getUserByEmail` returns null → `NotFoundException` | `rejects.toBeInstanceOf` |

---

## Acceptance Criteria Coverage

| AC | Test(s) | Status |
|----|---------|--------|
| Returns 4 provider rows for any authenticated user | #1 | verified |
| Email row: `linked` reflects `has_usable_password`; `canUnlink` always false | #2, #3 | verified |
| Google/GitHub rows: `linked` reflects presence in `getUserSourceConnections` | #4, #5, #6 | verified |
| Telegram row: `linked` reflects `telegram_user_id != null`; `handle` is `@username` | #7, #8, #9 | verified |
| `canUnlink=false` when that provider is the sole linked method | #5, #14, #15 | verified |
| `unlinkProvider('email')` → 409 ConflictException | #12, #13 | verified |
| `unlinkProvider` last-method guard → 409 ConflictException | #14, #15 | verified |
| Google/GitHub unlink: `deleteUserSourceConnection` called with server-resolved pk | #16, #17 | verified |
| IDOR: connection pk never derived from user input | #11, #16, #17 | verified |
| Telegram unlink: PATCH nulls out `telegram_user_id`, `telegram_username`, `telegram_linked_at` | #19 | verified |
| Idempotent unlink (provider already gone) resolves without error | #18, #20 | verified |

---

Gate: passed
