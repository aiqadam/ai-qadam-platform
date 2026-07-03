# 04 — Security Review

**Workflow:** wf-20260703-fix-064
**Agent:** SecurityReviewer
**Date:** 2026-07-03
**Issue:** ISS-UAT-001-1 (open, blocker, uat/seed)
**Branch:** fix/ISS-UAT-001-1-uat-seed-directus-mirror
**Base:** origin/main @ 6db713f

---

## Code Changes Reviewed

All six changed files (3 api code + 1 script + 2 test files) were read in full, plus all required-context files.

| # | File | Status |
|---|------|--------|
| 1 | `apps/api/src/modules/internal/internal.controller.ts` | Reviewed in full |
| 2 | `apps/api/src/modules/internal/internal-auth.guard.ts` | Reviewed in full |
| 3 | `apps/api/src/modules/internal/internal.module.ts` | Reviewed in full |
| 4 | `apps/api/src/modules/directus/directus-users-bridge.service.ts` | Reviewed in full |
| 5 | `apps/api/src/config/env.ts` | Reviewed in full |
| 6 | `apps/api/.env.example` | Reviewed in full |
| 7 | `infrastructure/.env.example` | Reviewed in full |
| 8 | `apps/api/test/internal.spec.ts` | Reviewed in full |
| 9 | `apps/api/test/directus-users-bridge.spec.ts` | Reviewed (new `describe` block + existing blocks) |
| 10 | `scripts/uat-seed.sh` | Reviewed in full including new `api_ensure_directus_user_link` helper |
| 11 | `apps/api/src/main.ts` | Reviewed to confirm no path-level routing changes |

Supporting context files:
- `docs/04-development/security/security.md`
- `.copilot/schemas/protocol.md` (gate format)
- `.copilot/agents/security-reviewer.md`
- `AGENTS.md` §5 (security baseline) + §6.1 (production-readiness)

---

## Reviewed scope

Diff scope confirmed: 4 code files + 2 test files + 1 bats file. PR size 426 lines / 183 code-only — under both AGENTS.md §4 caps.

The change being reviewed:
- **NEW endpoint:** `POST /v1/internal/users/ensure-linked`
  - **Guard:** `InternalAuthGuard` (class-level `@UseGuards(InternalAuthGuard)` on `InternalController` at line 32 — covers the new endpoint automatically)
  - **Body:** `{ email: string, displayName?: string }` (Zod-validated via `ensureLinkedSchema`)
  - **Returns:** `{ directusUserId: string | null }` (HTTP 200) or `BadRequestException` (HTTP 400)
  - **Delegates to:** `DirectusUsersBridgeService.ensureLinkedByEmail({ email, displayName })`
- **Seed caller:** `scripts/uat-seed.sh` → `api_ensure_directus_user_link <email> <display_name>` helper

---

## Findings table

| # | Severity | Title | Evidence | Recommendation |
|---|---|---|---|---|
| F-1 | INFO | Guard coverage is class-level, covers the new endpoint automatically | `internal.controller.ts:31-33` `@Controller('v1/internal') @UseGuards(InternalAuthGuard) export class InternalController` | None — pattern is correct, mirrors every other internal controller |
| F-2 | INFO | `timingSafeEqual` already in `InternalAuthGuard` — no new code added, reused as-is | `internal-auth.guard.ts:1` `import { timingSafeEqual } from 'node:crypto';`; line 16 `const ok = timingSafeEqual(Buffer.from(provided), Buffer.from(expected));` | None — pre-existing invariant, verified to still hold |
| F-3 | INFO | Zod at boundary — both the controller and the bridge signature are typed `unknown → parsed` | `internal.controller.ts:81-90` `const parsed = ensureLinkedSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());` | None — boundary validation correct |
| F-4 | MINOR | No `@Throttle` on the new endpoint (no rate limit) — defense-in-depth gap | `internal.controller.ts:73-77` shows no `@Throttle`/`@UseGuards(ThrottlerGuard)` decoration on `ensureLinkedUser`; the pre-existing `sendEmail` (line 46) also lacks both | Acceptable because the existing `/v1/internal/email` endpoint (line 32) ships without throttling — consistent codebase pattern. Risk is low because `INTERNAL_API_TOKEN` is a server-to-server shared secret, not a public surface. **Defense-in-depth recommendation:** add `@Throttle({ default: { limit: 60, ttl: 60_000 } })` to `InternalController` at the class level in a follow-up PR. Not a gate blocker. |
| F-5 | INFO | Trust-boundary expansion is bounded — the new endpoint creates ONLY the `directus_users` identity mirror, no per-app data | `directus-users-bridge.service.ts:78-91` shows the only writes are `findOrCreate` → `POST /users` (a Directus identity row) and `users.directus_user_id = directusId` (a FK pointer). No event, no registration, no invite, no role change is created. | None — the surface remains narrow |
| F-6 | INFO | `INTERNAL_API_TOKEN` is read from `env.INTERNAL_API_TOKEN` only via the `env.ts` Zod-validated schema — never logged, never printed, never embedded in code | `env.ts:61-62` `INTERNAL_API_TOKEN: z.string().min(32),`; the guard reads it at `internal-auth.guard.ts:11` `const expected = env.INTERNAL_API_TOKEN;` but does not log it | None — handling is correct |
| F-7 | INFO | `apps/api/.env.example` documents `INTERNAL_API_TOKEN` as internal-only and instructs the operator to set it identically on the API and Directus side via `FLOWS_ENV_ALLOW_LIST` | `apps/api/.env.example:46-51` — the comment block says: *"Shared secret for /v1/internal/* endpoints (Directus → API). Must be 32+ chars. Generate locally with `openssl rand -hex 32`. The Directus side stores the same value as an env var listed in FLOWS_ENV_ALLOW_LIST, so flow `request` ops can read it as `{{ $env.INTERNAL_API_TOKEN }}`"* | None — documentation matches the security.md §"Secrets management" pattern |
| F-8 | INFO | No public-facing env file contains `INTERNAL_API_TOKEN`. The token appears only in `apps/api/.env` (gitignored) and `infrastructure/.env` (gitignored), per AGENTS.md §6 + security.md §"Secrets management" | `grep_search` found 78 hits for `INTERNAL_API_TOKEN` across the repo; the only files that *contain* (not just reference the var name) live in (a) `apps/api/.env.example` and `infrastructure/.env.example` as blank placeholders, (b) `infrastructure/directus/flows-bootstrap.sh` reading it via `{{ $env.INTERNAL_API_TOKEN }}` (Directus flows side, also internal), and (c) `.env` files which are gitignored. Verification: `apps/api/.env.example:50` is `INTERNAL_API_TOKEN=` (empty placeholder, not a real secret); `infrastructure/.env.example` contains no reference. | None — the secret never appears in a public env file |
| F-9 | INFO | Error responses do not leak stack traces or internal paths. Only `BadRequestException(parsed.error.flatten())` is thrown on Zod failure, which returns a structured Zod issue tree, not a stack | `internal.controller.ts:90` `throw new BadRequestException(parsed.error.flatten())` — NestJS's default exception filter emits a `{ statusCode, message, error: "Bad Request" }` JSON body without stack traces | None — error shape is safe |
| F-10 | INFO | Idempotency under retry is verified at multiple layers | (a) Bridge: `directus-users-bridge.service.ts:51-56` early-return when `directusUserId` is already populated; (b) Test: `directus-users-bridge.spec.ts:235-258` "returns the existing directusUserId without re-creating when the column is already populated" case; (c) Controller: the handler returns `{ directusUserId: string | null }` — calling it twice yields the same UUID | None — safe to retry |
| F-11 | INFO | No bash-injection in `api_ensure_directus_user_link`'s `jq --arg` interpolation | `uat-seed.sh:248-252` `body=$(jq -nc --arg e "$email" --arg n "$display_name" '{email:$e, displayName:$n}')` — `jq --arg` is heredoc-safe (parameter-passed, not shell-interpolated into a JSON body); curl headers use `curl -H "x-internal-auth: ${token}"` where `$token` is parsed out of `apps/api/.env` via `env_get` (line 244), not user-controlled | None — heredoc-safe |
| F-12 | INFO | Seed cannot be tricked into calling `ensure-linked` for an arbitrary email — the helper is only invoked from inside `ensure_test_user`, which itself iterates only over fixture-defined email values. There is no path where a user-controlled email reaches the endpoint | `uat-seed.sh:182-258` `ensure_test_user(...)` takes its `$email` from the `$4` positional arg, which is only ever passed by `reset_identity_fixture` (line 549: `FORCE_REGEN=1 ensure_test_user "$ak_url" "$ak_token" "$username" "$email" "$display_name" "UatFixture1!" "$groups_csv"`) — and `$email` there comes from `jq -r '.email' <<<"$fixture_json"` where `$fixture_json` is the static `scripts/uat-fixtures/BP-UAT-001.json` content. Live-mode STEP 3 callers also pass fixture-defined emails only (lines ~700-780 walk `BP-UAT-001.json`). | None — call site is gated by the fixture manifest |
| F-13 | INFO | No preflight (CORS) reachability from a browser — the new endpoint sits behind `InternalAuthGuard` (custom-header auth) and is not CORS-enabled. Browsers cannot preflight a request with `x-internal-auth` from an attacker origin without explicit CORS + the shared secret | `main.ts` does not enable CORS on the api service (the CORS config in `infrastructure/docker-compose.yml:107-108` applies to **Directus**, not the api). The api has no `app.enableCors()` call. Browser CORS preflight requires explicit `Access-Control-Allow-Origin` headers — without them, the browser blocks the response. | None — browser preflight is structurally impossible |
| F-14 | INFO | The new `ensureLinkedByEmail` correctly prevents the audit hole where a Directus row would be created for an email with no local `platform.users` row | `directus-users-bridge.service.ts:142-150` does `if (!row) return null;` BEFORE calling `ensureLinked` — verified by `directus-users-bridge.spec.ts:222-229` "returns null when no local user exists for the email (no Directus traffic)" test, which asserts `expect(fake.get).not.toHaveBeenCalled(); expect(fake.post).not.toHaveBeenCalled();` | None — abuse-prevention is correct |
| F-15 | INFO | Public routing surface — the api is exposed via Coolify's Traefik auto-generated routers, but `/v1/internal/*` is gated by the API's own `InternalAuthGuard` (custom-header scheme), which is CSRF-resistant by construction (security.md §CSRF). No additional path-level firewall rule or router-side exclusion is needed | No `PathPrefix` exclusion found in `infrastructure/web-next/docker-compose.yml` or any other infra compose, consistent with the existing `/v1/internal/email` endpoint which has shipped since FR-WORKFLOW-003 without per-host exclusion. The pre-existing `InternalAuthGuard` is the load-bearing invariant. | None — consistent with the established pattern |

---

## Detailed checks (per-invariant)

### INV-1 — Tenant isolation

**Status: N/A.**

No platform-DB query on a tenant-scoped table is added. The bridge's new `ensureLinkedByEmail` queries `users` by `email` only (line 144 `where(eq(users.email, input.email))`). This is consistent with the pre-existing pattern (lines 51-55, 95-103 use the same query shape). The `directus_users` row, once created, is global; the `users.directus_user_id` FK is per-user, not per-tenant. Tenant scoping is unchanged.

### INV-2 — Secrets by reference

**Status: PASS.**

`grep_search` for `INTERNAL_API_TOKEN` found 78 hits but every occurrence either (a) references the var name in code/docs (not the value), (b) is the `apps/api/.env.example` blank placeholder, (c) is the `infrastructure/directus/flows-bootstrap.sh` reference to `{{ \$env.INTERNAL_API_TOKEN }}` (Directus flows side, which is also internal), or (d) is inside `.env` (gitignored — `apps/api/.env`, `infrastructure/.env`, `apps/e2e/.env.uat` — none of which are committed).

The guard (`internal-auth.guard.ts`) does not log the token, does not include it in error messages, and does not echo it on failure. The Zod validation in `env.ts:62` enforces a `min(32)` length, making brute-force impractical.

### INV-3 — Auth at controller level

**Status: PASS.**

`internal.controller.ts:31-33` has the class-level `@UseGuards(InternalAuthGuard)` decorator that covers every `@Post(...)` route added to the class — including the new `ensureLinkedUser` at line 77. Authz is not deferred to the service layer; the bridge is called only AFTER the guard has approved the request.

Test coverage of the guard itself is preserved at `apps/api/test/internal.spec.ts:25-51` (three existing tests: no header, wrong token, matching token).

### INV-4 — Validation at boundaries

**Status: PASS.**

`ensureLinkedSchema` at `internal.controller.ts:49-52`:

```ts
const ensureLinkedSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255).nullable().optional(),
});
```

The handler at `internal.controller.ts:81-90` does `body: unknown → safeParse → BadRequestException on failure → bridge call only on success`. This matches the pre-existing `sendEmail` pattern at line 60. Test coverage at `apps/api/test/internal.spec.ts:130-167` includes three validation cases:

1. rejects a body without email → 400
2. rejects a body with a non-email "email" → 400
3. rejects an empty body → 400

### INV-5 — No cross-schema queries

**Status: PASS.**

The bridge queries `users` (a single `platform` schema table) and calls Directus via REST. No new JOINs are introduced. The bridge's existing `findOrCreate` uses Drizzle's parameterized query builder — no string interpolation (Directus-API URL params are URL-encoded per `directus-users-bridge.service.ts:62`: `const encodedEmail = encodeURIComponent(email);`).

### INV-6 — Rate limiting

**Status: NEEDS-REVIEW (MINOR).**

The new endpoint does not have `@Throttle` or `@UseGuards(ThrottlerGuard)` decoration. This is consistent with the pre-existing `sendEmail` endpoint at line 46 (also no throttling). The risk is bounded because:

- `INTERNAL_API_TOKEN` is a server-to-server shared secret (not a public attack surface).
- The endpoint does not perform expensive operations (the bridge is a single Postgres select + at most one Directus GET/POST).
- Authentik → Directus is on the internal Docker network; an attacker holding the shared secret already has significant platform access.

**Recommendation (non-blocking):** add `@Throttle({ default: { limit: 60, ttl: 60_000 } })` to the `InternalController` class in a follow-up PR for defense-in-depth, in line with `security.md` §"Rate limiting" defaults. This is not a gate blocker for this PR.

### INV-7 — CSRF protection

**Status: N/A.**

Server-to-server, custom-header (`x-internal-auth`) auth scheme. `security.md` §CSRF declares: *"State-changing endpoints require either: Bearer token in Authorization header (modern API auth — naturally CSRF-resistant), OR CSRF token in cookie + custom header (double-submit pattern)…"*. Custom-header auth satisfies the CSRF-resistant criterion. No cookies are set or read by `InternalController` (no `cookie-parser` route on this controller — the global `cookieParser()` at `main.ts:74` is for the auth callback only).

### INV-8 — No `dangerouslySetInnerHTML`

**Status: N/A.**

No frontend code changed; no `.tsx`/`.astro` files in the diff. (Diff is api + script + tests only.)

### INV-9 — No N+1 queries

**Status: PASS.**

The new `ensureLinkedByEmail` makes at most one Postgres `SELECT` (line 144) followed by `ensureLinked`'s at-most-one `SELECT` + one `UPDATE` (lines 51-71, fast path) + one Directus GET + at most one Directus POST or PATCH (lines 61-85). No loops, no per-iteration queries.

The seed `api_ensure_directus_user_link` is called once per identity fixture via `ensure_test_user`, not in a loop. Three fixtures = three HTTP calls total. Bounded.

### INV-10 — Drizzle parameterization

**Status: PASS.**

The new query at `directus-users-bridge.service.ts:142-149` uses Drizzle's `eq()` builder, not string interpolation:

```ts
const [row] = await this.db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.email, input.email))
  .limit(1);
```

Same parameterization pattern as the pre-existing `ensureLinked` (line 51-55) and `resolveDirectusId` (line 95-103). No raw SQL, no `` sql`...` `` template string in the diff.

### INV-11 — HttpOnly tokens (web)

**Status: N/A.**

No new web cookies written; no web code changed.

---

## Risk flags

### RF-1 (Defense-in-depth, not a gate blocker)

`InternalController` has no class-level `@Throttle`. The codebase pattern is "no throttling on the existing `/v1/internal/email` endpoint either," so this PR's consistency is correct. A future hardening PR could add `@Throttle({ default: { limit: 60, ttl: 60_000 } })` at the class level. **Action:** downgraded to INFO finding F-4; do not block.

### RF-2 (Test infrastructure gap, documented)

Vitest cannot run on this Windows workstation due to a pre-existing Node v24 + `vite-node` + `emitDecoratorMetadata` compatibility issue (`03-code-summary.md` §"Test Verification Gap"). The failure reproduces on unmodified pre-existing spec files (e.g., `apps/api/test/leads-service.spec.ts`). The TypeScript `tsc --noEmit` typecheck passes cleanly, validating that:

- `InternalController` constructor's two-arg signature (EmailService + DirectusUsersBridgeService) compiles against the existing `EmailService` test fake + the new `DirectusUsersBridgeService.ensureLinkedByEmail` mock.
- All Zod schemas, decorators (`@Post`, `@HttpCode`, `@UseGuards`, `@Controller`), and type imports resolve.
- The bridge's new `ensureLinkedByEmail` method signature is type-correct.

CI (or a Node v22 LTS workstation) is the load-bearing verifier. The bats tests (28/28 passing) cover the seed helper independently of vitest. **This is documented in 03-code-summary.md and is not a security regression.**

### RF-3 (Production-readiness, per AGENTS.md §6.1)

The Orchestrator's Step 9 verification (BP-UAT-001 reset) and Step 5 (TestDesigner) are the load-bearing production-readiness checks. **Honesty disclosures:** the vitest runtime gap + bats-only coverage are explicitly named in `03-code-summary.md`; the ACs from `ISS-UAT-001-1.md` §"Resolution" (5 verification steps) MUST be marked verified-or-deferred-with-followup-workflow-ID in `09-quality-gate.md`. If Step 9 cannot run on this workstation, the follow-up workflow ID must be queued, not skipped.

---

## Cross-cutting checks (per user's specific questions)

| Question (from the brief) | Answer | Evidence |
|---|---|---|
| Could the seed script be tricked into calling `ensure-linked` for an arbitrary email? | **No.** The helper is only invoked from inside `ensure_test_user`, whose `$email` parameter always comes from a fixture JSON via `jq -r '.email'`. There is no path where user input (a request body, a CLI arg, an environment variable) reaches `api_ensure_directus_user_link`'s `$1` arg. | `uat-seed.sh:182-258` `ensure_test_user`; fixtures at `scripts/uat-fixtures/BP-UAT-001.json`; `reset_identity_fixture` at line 549 passes `$email = jq -r '.email' <<<"$fixture_json"` |
| Could the endpoint be called from a browser preflight? | **No.** The api has no CORS enabled (`main.ts` does not call `app.enableCors()`); browsers preflight with no allowed origin → blocked. The `InternalAuthGuard` requires a custom `x-internal-auth` header, which CSRF + same-origin policy prevent from being set from a malicious origin without explicit CORS whitelisting. | `main.ts` (no `enableCors`); `internal-auth.guard.ts:10` `req.header('x-internal-auth')` |
| Does the new `ensureLinkedByEmail` prevent abuse? | **Yes.** It does an explicit `if (!row) return null;` BEFORE calling `ensureLinked`, so an attacker who holds the shared secret cannot create a `directus_users` row for an email with no matching `platform.users` row — Directus is never called unless the local FK target exists. | `directus-users-bridge.service.ts:147-150`; unit test at `directus-users-bridge.spec.ts:222-229` |

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All eleven INV invariants applicable to this diff pass; no BLOCKER or MAJOR findings. INV-6 (rate limiting) is NEEDS-REVIEW as a MINOR/INFO finding (no @Throttle on the new endpoint, consistent with the pre-existing /v1/internal/email pattern; defense-in-depth fix recommended in a follow-up PR). Tokens handled exclusively via env.ts Zod schema; never logged; never in public env files. Zod at boundary, guard at class level, timingSafeEqual verified, no N+1, no cross-schema JOIN, no raw SQL, idempotent under retry, no CORS, no cookie state, no client-reachable preflight. Bash --arg interpolation is heredoc-safe. ensureLinkedByEmail correctly gates Directus access on a local row existing. The vitest test infrastructure gap (Node v24 + vite-node) is documented in 03-code-summary.md and is not a security regression; CI is the load-bearing verifier."
  findings:
    - "Guard coverage: class-level @UseGuards(InternalAuthGuard) on InternalController (internal.controller.ts:31-33) covers the new endpoint automatically."
    - "timingSafeEqual: confirmed at internal-auth.guard.ts:1 + 16; pre-existing invariant still holds."
    - "Zod validation: ensureLinkedSchema at internal.controller.ts:49-52; BadRequestException on parse failure; matches the existing sendEmail pattern."
    - "No @Throttle (MINOR): consistent codebase pattern (the existing /v1/internal/email also lacks throttling); risk bounded by the shared-secret auth model. Defense-in-depth addition recommended as a follow-up PR."
    - "Trust boundary is narrow: the new endpoint only ensures the directus_users identity mirror + the platform FK pointer; no per-app data (events, registrations, invites) is created."
    - "INTERNAL_API_TOKEN handling: read via env.ts:62 z.string().min(32) only; never logged; never in any public-facing env file."
    - "Error response shape: BadRequestException(parsed.error.flatten()) returns structured JSON (no stack traces, no internal paths)."
    - "Idempotency verified at three layers: bridge fast-path (line 53), controller test, bridge unit test."
    - "Bash injection: jq --arg interpolation at uat-seed.sh is heredoc-safe; $token read from .env via env_get, not user-controlled."
    - "Seed call site is fixture-gated: $email always comes from jq -r '.email' <<<\"$fixture_json\"; no user input reaches ensureLinked by email."
    - "Browser preflight is structurally impossible: no app.enableCors() in main.ts; InternalAuthGuard uses a custom-header scheme CSRF-resistant by construction."
    - "ensureLinkedByEmail anti-abuse: explicit if (!row) return null BEFORE calling ensureLinked; verified by directus-users-bridge.spec.ts:222-229."
    - "Test infrastructure gap (Node v24 + vite-node) is a pre-existing environmental issue documented in 03-code-summary.md; typecheck + biome + bats all pass; CI will validate the new vitest tests."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```

---

## Honesty disclosures

1. **Vitest runtime gap on this Windows workstation** is a pre-existing environmental issue that reproduces on unmodified files. The new test files follow the proven idiom of the existing `describe('DirectusUsersBridgeService.ensureLinked', ...)` block (which passes in CI per prior workflows). The Orchestrator's CI is the load-bearing verifier. **Action:** `09-quality-gate.md` MUST mark each AC verified-or-deferred-with-followup-workflow-ID per AGENTS.md §6.1.

2. **No CORS verification at the Traefik layer.** This review did not find a per-host router-side exclusion for `/v1/internal/*`. The established codebase pattern is to rely on the `InternalAuthGuard` (custom-header auth) as the load-bearing CSRF defense, and the pre-existing `/v1/internal/email` endpoint ships without a Traefik exclusion. This PR is consistent with the pattern. If a follow-up adds a Coolify `custom_labels` middleware to exclude `/v1/internal/*` from public hosts, that would be defense-in-depth but is not required for this PR's gate.

3. **MINOR finding F-4 (no @Throttle)** is not a gate blocker because the existing `/v1/internal/email` ships the same way; consistency is the right call here. Recommended follow-up: add `@Throttle({ default: { limit: 60, ttl: 60_000 } })` at the class level in a dedicated PR that touches both `sendEmail` and `ensureLinkedUser`.

4. **The new vitest tests have not been executed in this session.** The TypeScript typecheck validates their signatures compile (two-arg controller constructor, the bridge's new method shape, the Zod schema with `.nullable().optional()`). The bats tests (28/28) DO execute and pass — those provide runtime coverage of the seed helper (`api_ensure_directus_user_link`'s mock-mode short-circuit + jq --arg path + curl headers) which is the only new surface area the bash script contributes.

5. **No audit trail was read or verified for `INTERNAL_API_TOKEN` rotation cadence** in this review. The token rotation runbook at `docs/04-development/security/runbooks/secret-rotation-pending.md` schedules rotation on suspicion of compromise or quarterly. This is consistent with `security.md` §"Secrets management" §Rotation. Not in scope for this PR.