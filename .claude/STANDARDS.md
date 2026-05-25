# STANDARDS.md — Code Standards

This document codifies our code quality standards. Inspired by NASA's Power of Ten (safety-critical systems), Google Engineering Practices (scale and review culture), and Bulletproof React (modern frontend patterns), adapted for our stack.

**These are not aspirational.** They are enforceable. Pre-commit hooks, CI, and PR reviews enforce them.

---

## Part I — Universal principles

### 1. Readability over cleverness

Code is read 10× more than it's written. Optimize for the reader.

- **Names describe intent**, not implementation. `getUserById` not `dbLookupUser`. `isEligibleForRegistration` not `checkUserFlag`.
- **Long names are fine if they clarify.** `pendingEmailVerifications` over `pev`.
- **Reserved short names:** `i` for index, `e` for caught error, `_` for ignored. Nothing else.
- **Boolean variables and functions read like questions:** `isReady`, `hasPermission`, `canRegister`, `shouldNotify`.

### 2. Functions are small and single-purpose

NASA rule 4 adapted: functions fit on one screen — **60 lines maximum**.

- One function does one thing.
- If you describe the function with "and" — split it.
- Maximum 4 parameters. More → pass an object with named keys.
- Cyclomatic complexity ≤ 10 (ESLint enforces).
- Maximum nesting depth: 3 levels.

### 3. Errors are first-class

- **Errors are typed.** Custom error classes per domain (`EventCapacityExceeded`, `RegistrationAlreadyExists`).
- **No throwing strings or plain Error.** Always typed errors.
- **Promises never go unhandled.** Either `await`, `.catch`, or explicit `.catch(noop)` with comment.
- **Don't swallow errors silently.** If catching to ignore, log at debug level and comment why.
- **Don't catch what you can't handle.** Let it propagate to a layer that knows what to do.

### 4. State is minimized

NASA rule 6: variables in smallest possible scope.

- **No module-level mutable variables.** Module-level constants are fine.
- **Prefer pure functions.** State changes happen in well-marked places (controllers, services, reducers).
- **No singletons except for shared infrastructure** (Drizzle client, Redis client).
- **No globals.** Configuration is passed in, not imported from a global.

### 5. Constants are named

NASA rule 3 + Google style: no magic numbers, no magic strings.

```typescript
// ❌ Bad
if (user.failedLoginAttempts > 5) { lockAccount(); }

// ✅ Good
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
if (user.failedLoginAttempts > MAX_FAILED_LOGIN_ATTEMPTS) { lockAccount(); }
```

Exception: `0`, `1`, `-1`, empty string, true/false are allowed as literals when their meaning is obvious in context.

---

## Part II — TypeScript specifics

### Type safety

```json
// tsconfig.json — required settings
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Forbidden patterns

- `any` — use `unknown` and narrow.
- `@ts-ignore` — use `@ts-expect-error` with reason comment, as last resort.
- `as` cast without a comment explaining why TypeScript can't infer it.
- Non-null assertion `!` — replace with explicit check or guard.
- `Function` type — use specific signature like `(x: number) => string`.
- `Object` type — use `Record<string, unknown>` or specific interface.

### Preferred patterns

- **Discriminated unions over enums** for finite states:
  ```typescript
  type RegistrationStatus =
    | { state: 'pending'; createdAt: Date }
    | { state: 'confirmed'; confirmedAt: Date; qrToken: string }
    | { state: 'cancelled'; cancelledAt: Date; reason: string };
  ```
- **Branded types for IDs** to prevent mixing:
  ```typescript
  type UserId = string & { __brand: 'UserId' };
  type EventId = string & { __brand: 'EventId' };
  ```
- **Zod for runtime validation at boundaries.** Every input from outside (HTTP, queue, file) is validated.

---

## Part III — Validation and assertions

NASA rule 5: at least one assertion per function.

### Boundary validation (Zod)

Every controller action validates input:

```typescript
const RegisterForEventSchema = z.object({
  eventId: z.string().uuid(),
  customFields: z.record(z.string()).optional(),
});

@Post(':eventId/register')
async register(@Body() body: unknown, @CurrentUser() user: User) {
  const parsed = RegisterForEventSchema.parse(body);
  return this.registrations.create(parsed, user);
}
```

### Internal assertions

Inside services, document invariants:

```typescript
async cancelRegistration(id: RegistrationId, userId: UserId) {
  const registration = await this.repo.findById(id);
  assert(registration, `Registration ${id} not found`);
  assert(registration.userId === userId, `User ${userId} cannot cancel registration ${id} owned by ${registration.userId}`);
  // ... rest of logic
}
```

Use `node:assert` or a project-wide `invariant()` helper. Failures should not be caught — they indicate bugs.

---

## Part IV — Testing standards

### The test pyramid

| Type | What | How many | Tooling |
|------|------|----------|---------|
| Unit | Pure functions, single class methods | Many (~70%) | Jest / Vitest |
| Integration | Service + DB, API endpoints | Medium (~25%) | Jest + Testcontainers |
| E2E | Full user flows | Few (~5%) | Playwright |

### Unit test rules

- One file per source file, same name + `.test.ts`.
- One `describe` block per function/class.
- AAA pattern: Arrange, Act, Assert — explicit, separated by blank lines.
- One assertion per test (logical assertion — multiple `expect()` for one fact is fine).
- No shared mutable state between tests. Each test sets up its own world.

### Integration tests

- Use **Testcontainers** for Postgres and Redis. Never mock the database.
- Each test runs against a fresh database (transaction rollback or schema reset).
- Test the public interface of a module, not internals.
- One file per module's integration surface.

### E2E tests

- Cover **critical happy paths** only — login, event registration, check-in.
- Run in CI on every PR.
- Headless by default, headed for debugging.
- Use Page Object Model — no selectors in test bodies.

### Coverage

- **Target:** 80% line coverage, 70% branch coverage.
- **Required:** 100% coverage of error paths in business logic.
- **Not measured:** generated code, infrastructure scripts, mocks.

---

## Part V — Style and formatting

Prettier handles formatting. ESLint handles linting. These are not debates.

### File and folder names

- **TypeScript files:** `kebab-case.ts` (events.service.ts, register-button.tsx)
- **Folders:** `kebab-case`
- **React components in dedicated files:** `PascalCase.tsx` (EventCard.tsx)
- **Test files:** mirror source file name with `.test.ts` or `.spec.ts`

### Code organization within a file

```typescript
// 1. Imports (auto-sorted by ESLint)
import { ... } from 'external-package';
import { ... } from '@/shared';
import { ... } from './local';

// 2. Types and interfaces
interface RegistrationInput { ... }

// 3. Constants
const MAX_RETRIES = 3;

// 4. Helper functions (not exported)
function normalizeEmail(email: string) { ... }

// 5. Main export
export class RegistrationsService { ... }
```

### Comments

- **Why, not what.** The code shows what. Comments explain why.
- **TODO format:** `// TODO(viktor, 2026-05-14): switch to BullMQ when Redis cluster is up`
- **FIXME:** for known bugs awaiting fix, same format.
- **NOTE:** for non-obvious behavior worth flagging.
- **No commented-out code in commits.** Git has history.

### Imports

- Absolute imports for cross-module (`@/modules/events/...`).
- Relative imports within a module (`./repository`, `../shared`).
- No deep imports across module boundaries (`@/modules/events/internal/...` is forbidden).

---

## Part VI — Database conventions

### Schema design

- **Table names:** `snake_case`, plural (`event_registrations`, `users`).
- **Column names:** `snake_case`, descriptive (`created_at` not `created`).
- **Primary keys:** `id`, type `uuid`, default `gen_random_uuid()`.
- **Foreign keys:** `<table>_id` (`user_id`, `event_id`).
- **Timestamps:** `created_at`, `updated_at` — always present, timezone-aware (`TIMESTAMPTZ`).
- **Soft delete:** `deleted_at` nullable timestamp where soft delete is needed; default is hard delete.

### Indexes

- **Index every foreign key** unless rarely queried.
- **Index tenant columns** (`country_code`) on tenant-scoped tables.
- **Compound indexes** for known query patterns, ordered by selectivity.
- **No premature optimization** — add indexes when slow query log shows the need, except for FKs and tenant columns which are always indexed.

### Migrations

- **Generated via `drizzle-kit`**, not hand-written. See [ADR-0013](../docs/adr/0013-orm-drizzle-over-prisma.md) for the ORM choice.
- **Reversible.** Every up has a down. `drizzle-kit` supports both forward-only and reversible migration styles — we use reversible. When data migrations make true reversal impossible (e.g., destructive column drop on a populated table), the migration file documents the impossibility in a comment and the rollback strategy is "restore from backup."
- **Tested locally** before commit.
- **One logical change per migration.**
- **Migrations are immutable** once merged. Errors fixed with new migrations, not edits.

---

## Part VII — API standards

### Response shapes

Success:
```json
{
  "data": { ... },
  "meta": { "pagination": { ... } }
}
```

Error (RFC 7807):
```json
{
  "type": "https://aiqadam.org/errors/event-not-found",
  "title": "Event not found",
  "status": 404,
  "detail": "No event with id 'xyz' exists",
  "instance": "/v1/events/xyz"
}
```

### HTTP status codes — actual usage

- `200` OK — successful read
- `201` Created — successful create
- `204` No Content — successful delete or no body action
- `400` Bad Request — validation error in input
- `401` Unauthorized — missing or invalid credentials
- `403` Forbidden — authenticated but not authorized
- `404` Not Found — resource doesn't exist (or shouldn't be exposed)
- `409` Conflict — state conflict (already registered, capacity full)
- `422` Unprocessable Entity — semantic validation error (rare, use 400)
- `429` Too Many Requests — rate limited
- `500` Internal Server Error — bug, our fault
- `503` Service Unavailable — dependency down, maintenance

### Idempotency

- **GET, HEAD, OPTIONS** — always idempotent.
- **PUT, DELETE** — must be idempotent.
- **POST** — accepts `Idempotency-Key` header for critical operations (registration, payment).

---

## Part VIII — Frontend specifics

### React component rules

- **Functional components only.** No class components.
- **Hooks called at top level only.** ESLint enforces.
- **One component per file** in dedicated component files.
- **Component file ≤ 200 lines.** If longer, extract sub-components or hooks.
- **Props typed explicitly.** No prop types, no inference from defaults.

### State management priority

1. **URL state** (search params) — for shareable state.
2. **Server state** (TanStack Query) — for remote data.
3. **Local component state** (`useState`) — for ephemeral UI state.
4. **Context** — for app-wide concerns (theme, locale, current user).
5. **Global state libraries** — forbidden unless explicitly justified.

### Performance budgets

- **JS bundle (initial):** < 150 KB gzipped per page.
- **LCP:** < 2.5s on 4G.
- **CLS:** < 0.1.
- **INP:** < 200ms.

Measured in CI with Lighthouse. PRs that regress these are blocked.

### Design system tokens (apps/web-next/)

ADR-0038 §Locks #1 forbids inline `style=` in blocks/pages and hardcoded colors/sizes/radii outside L2 atoms. The mechanism in `apps/web-next/`:

- **Canonical tokens** live in `design-system/tokens.css` (OKLCH values, single source of truth). v1 and v2 both import this file.
- **Tailwind v4 bridge** is the `@theme inline` block in `apps/web-next/src/styles/globals.css`. It maps each token to a Tailwind utility namespace (e.g. `--primary` → `--color-primary` → `bg-primary`/`text-primary`). `inline` means no copy — token edits in `design-system/` reflow every atom immediately.
- **L2 atoms** (`apps/web-next/src/kit/*`) bind via the Tailwind utilities; never `bg-[#hexvalue]` and never raw `var(--token)` lookups.

When you add or rename a token in `design-system/tokens.css`, also add the matching line in the `@theme inline` block — otherwise the new token exists but no Tailwind utility exposes it (and renamed tokens silently fall back to whatever Tailwind defaults to). This coupling is brittle by design: it keeps the bridge minimal. If tokens.css ever moves to a generated/typed format, the bridge generates from the same source and this rule goes away.

---

## Part IX — Logging and observability

### Log levels

- **`fatal`** — process is dying, recover impossible.
- **`error`** — operation failed, user is affected.
- **`warn`** — recoverable issue, attention needed.
- **`info`** — significant business events (registration, login).
- **`debug`** — useful in development, off in production by default.
- **`trace`** — fine-grained, never in production.

### Structured logging

- **JSON format** in production.
- **Required fields:** `level`, `time`, `service`, `traceId`, `userId` (when relevant), `tenantId`.
- **Never log:** passwords, tokens, full PII, full request bodies (sanitize first).

### Metrics

- Every endpoint exposes:
  - request count
  - latency histogram (p50, p95, p99)
  - error count by status code
- Every BullMQ queue exposes:
  - queue depth
  - processing rate
  - failure rate

---

## Part X — Documentation standards

### What gets documented

- **Public API endpoints** — OpenAPI auto-generated from code.
- **Public service methods** — JSDoc/TSDoc on every public method.
- **Module README** — every module has a README explaining its purpose and interface.
- **ADRs** — every significant architectural decision.
- **Runbooks** — every operational scenario (deploy, rollback, restore from backup).

### What doesn't get documented

- **Implementation details** of private functions — the code is the documentation.
- **Obvious behavior** — no "this function adds two numbers" comments.

### Documentation that lies is worse than no documentation

If you change behavior, update docs in the same PR. CI checks that public APIs match their OpenAPI spec.

---

## Part XI — Performance principles

### Defaults

- **Don't optimize until you measure.** Premature optimization is the root of complexity.
- **Profile in production-like environments.** Local "feels fast" means nothing.
- **Cache the right things, expire them correctly.** Stale data is worse than slow data.

### Standard patterns

- **N+1 queries are bugs**, not performance issues. Fix immediately when found.
- **Pagination is mandatory** for any endpoint returning lists. No "return all".
- **Async I/O for everything I/O bound.** Promise.all for parallel calls.
- **CPU-bound work goes to workers.** Don't block the request thread.

### Frontend

- **Lazy-load by route.** Each page loads only its own code.
- **Lazy-load below the fold.** Images, heavy widgets defer.
- **Use the right image format.** WebP/AVIF, with PNG/JPG fallback.

---

**End of STANDARDS.md.** When in doubt: simple, tested, named clearly, validated at boundaries.
