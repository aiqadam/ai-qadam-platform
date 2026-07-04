# Step 2 — Impact Analysis

**Workflow:** wf-20260704-fix-085
**Issue:** ISS-UAT-BRIDGE-001 (blocker, api/directus-bridge)
**Branch:** `fix/ISS-UAT-BRIDGE-001-bridge-no-local-row-fallback` (base `698c8d9`)
**Timestamp:** 2026-07-04
**Agent:** ImpactAnalyzer

---

## Requirement Implemented

`ISS-UAT-BRIDGE-001` — Option A. Relax the public contract of
`DirectusUsersBridgeService.ensureLinkedByEmail` so that, when no row
exists in `platform.users` for the supplied email, the bridge still
attempts to find-or-create the Directus mirror through the **existing**
private `findOrCreate` helper
([directus-users-bridge.service.ts:74-92](apps/api/src/modules/directus/directus-users-bridge.service.ts#L74-L92)).
On Directus success the method returns the Directus id (string); on
Directus failure it logs a `warn` and returns `null`, matching the
swallow semantics already used by `ensureLinked` (`:67-72`). The
"link-back write" into `platform.users.directus_user_id`
([:63-66](apps/api/src/modules/directus/directus-users-bridge.service.ts#L63-L66))
is best-effort and is simply **skipped** when no local row exists — there
is no row to update.

This unblocks the `scripts/uat-seed.sh` `reset_domain_fixture` path
(`scripts/uat-seed.sh:669-`) which fails today because freshly-seeded
Authentik fixtures (`uat-member-c@aiqadam.test`, `uat-member-nc@aiqadam.test`)
exist in Authentik and Directus but never in `platform.users` (no
OIDC sign-in has fired yet), causing the existing `ensureLinkedByEmail`
to return `null` at
[directus-users-bridge.service.ts:147-149](apps/api/src/modules/directus/directus-users-bridge.service.ts#L147-L149)
and the consent-row FK lookup
(`member_consents.member -> directus_users.id`) to fail.

---

## Files Affected

| File | Change type | Lines (current) | Reason |
|---|---|---|---|
| [apps/api/src/modules/directus/directus-users-bridge.service.ts](apps/api/src/modules/directus/directus-users-bridge.service.ts) | **modify** | `:138-156` (whole method) | Replace the short-circuit `if (!row) return null;` with a fallback branch that calls the private `findOrCreate` and swallows Directus errors. ≈15 lines per the issue-file sketch. |
| [apps/api/test/directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts) | **modify** | `:215-239` (one test case rewrites); no change to `:241-262`, `:264-286`, `:288-308` | The first `ensureLinkedByEmail` describe-block test (`:215-239`, "returns null when no local user exists for the email (no Directus traffic)") must flip per AC-3 of the issue file. The other three cases stay as-is and continue to assert the OIDC-callback contract. |
| [apps/api/test/directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts) | **modify** | new cases appended at end of the `ensureLinkedByEmail` describe block (`:213`) | Per the issue file's "Recommended workflow to resolve → test-designer": add three new cases — (i) no local row + no Directus row → POSTs + returns id; (ii) no local row + Directus row with mismatched `provider` → PATCHes backfill + returns id; (iii) no local row + Directus lookup throws → returns null + warn. |

No other production-code files, scripts, shared-types, or DTOs change.
The controller
[apps/api/src/modules/internal/internal.controller.ts:113-115](apps/api/src/modules/internal/internal.controller.ts#L113-L115)
is **not** touched — its existing call
`this.directusBridge.ensureLinkedByEmail({ email, displayName })` already
treats a `null` return as a soft warning (response shape
`{ directusUserId: string | null }` at `:65-69`). The contract becomes
strictly more permissive: callers that already get a non-null id today
keep getting one; callers that got `null` before may now get an id
(or still null if Directus fails).

---

## Affected Modules / Layers

**Single NestJS module touch:** `apps/api/src/modules/directus/` (one
service). No cross-module wiring change. `InternalModule` already
imports `DirectusModule` (per `wf-20260703-fix-064/02-impact-analysis.md`
and verified at
[internal.controller.ts:35](apps/api/src/modules/internal/internal.controller.ts#L35)
which constructor-injects `DirectusUsersBridgeService`). No new modules
imported, no new circular dependency risk.

**Other layers** (search-verified empty for this fix):

- **DB schema:** unchanged. [users schema:13-29](apps/api/src/modules/users/schema.ts#L13-L29) already has `email`, `displayName`, `directusUserId`. No Drizzle schema file mutation; no migration.
- **Shared types** `packages/shared-types/` — no change. The
  `ensureLinkedByEmail` signature
  (`{ email; displayName | null } → Promise<string|null>`) is internal
  to the api module; it is not consumed by web, bot, or workers.
- **Frontend** `apps/web/`, `apps/web-next/` — no change. No UI surface
  is added or modified.
- **Bot** `apps/bot/` — no change. Bot does its own Telegram-internal
  provisioning and does not call this method (verified by
  `grep_search ensureLinkedByEmail` showing zero bot references).
- **Workers** `apps/workers/` — no change. No BullMQ queue or job added.
- **Scripts** `scripts/uat-seed.sh` — no change. It already invokes the
  endpoint via `api_ensure_directus_user_link` (`:215-251`) and treats
  null return as a soft warning via `ok`/`fail` heuristics at `:271` and
  `:391-`. The fix relaxes the bridge so the non-mock branch of
  `ensure_test_user` (`:294-`) now actually creates the Directus row
  instead of always returning null.
- **Drizzle migrations** `apps/api/drizzle/` — no change (see
  "Migration Required" below).

---

## Migration Required

**No.** Same columns are touched (`users.directusUserId` via optional
UPDATE on the local-row branch only; `directus_users` rows via the
existing `DirectusClient.get`/`post`/`patch` calls in `findOrCreate`
and `maybeBackfill`, both pre-existing). No schema file mutation, no
`drizzle-kit generate` invocation, no migration committed.
`DBMigrationAuthor` is **not** required for this workflow.

---

## Security & Multi-Tenant Boundary Impact

### Multi-tenant boundary

**No weakening.** Per
`docs/04-development/architecture/architecture.md` ("Data ownership"
table, "Multi-tenancy implementation" §1–5): the `users` table is
**global** (no `country_code` column — verified at
[users/schema.ts:13-29](apps/api/src/modules/users/schema.ts#L13-L29),
where every column is shown and `country_code` is absent). The bridge's
existing local-row SELECT by email at `:144-149` is already
tenant-agnostic; extending it to **omit** the local lookup entirely
(when no row exists) does not introduce any cross-tenant data flow
that wasn't already permitted. `directus_users` is also global (per the
same architecture doc, the `directus` schema's data ownership is
"NestJS reads via Directus API / Directus admin UI"). No module boundary
violation.

### Security invariants (`docs/04-development/security/security.md`)

| Invariant | Status | Evidence |
|---|---|---|
| **Input validation at boundaries** | **OK / improved.** Controller already validates the request body with Zod ([internal.controller.ts:107-110](apps/api/src/modules/internal/internal.controller.ts#L107-L110) enforces `email: z.string().email()` and `displayName: z.string().min(1).max(255).nullable().optional()`); the bridge does not accept arbitrary payloads. The fix adds no new input surface. | [internal.controller.ts:54-58](apps/api/src/modules/internal/internal.controller.ts#L54-L58) (`ensureLinkedSchema`); [internal-auth.guard.ts:14-22](apps/api/src/modules/internal/internal-auth.guard.ts#L14-L22) (timingSafeEqual, pre-existing). |
| **No secrets in logs / output** | **OK.** The warn-log branch the fix introduces logs only the email address (a public-ish identifier per `security.md` "Data classification → Confidential: user emails … Access logged") and `err.message`. No tokens, no passwords, no full request bodies. Matches the existing pattern at [directus-users-bridge.service.ts:71](apps/api/src/modules/directus/directus-users-bridge.service.ts#L71) (already-loggable: email + reason). | Issue file sketch at `ISS-UAT-BRIDGE-001.md` ("Option A — Sketch" warn-block); existing warn at `:71`. |
| **Authentication enforced at controller, not relied upon in services** | **OK.** Bridge is only reached via `InternalController.ensureLinkedUser` which sits behind class-level `@UseGuards(InternalAuthGuard)` at [internal.controller.ts:39-40](apps/api/src/modules/internal/internal.controller.ts#L39-L40). No new auth model. | [internal-auth.guard.ts:7-25](apps/api/src/modules/internal/internal-auth.guard.ts#L7-L25); [internal.controller.ts:38-40](apps/api/src/modules/internal/internal.controller.ts#L38-L40). |
| **Rate limiting on public endpoints** | **OK / unchanged.** The endpoint is `InternalAuthGuard`-protected (shared secret), not public. Per the related fix (`wf-20260703-fix-064/02-impact-analysis.md` Security §4) this endpoint already lacks `@Throttle`. That is **pre-existing**, not introduced by this fix, and is **out of scope** for wf-20260704-fix-085 (tracked separately if needed). | [internal.controller.ts:108-116](apps/api/src/modules/internal/internal.controller.ts#L108-L116); not modified by this fix. |
| **Parameterized SQL** | **OK.** Bridge uses Drizzle query-builder (`select({ id }).from(users).where(eq(users.email, …))`) per security.md §"SQL injection → Defenses". No raw SQL introduced. | [directus-users-bridge.service.ts:144-148](apps/api/src/modules/directus/directus-users-bridge.service.ts#L144-L148). |
| **Output encoding / XSS** | N/A — bridge returns a string-or-null to an internal JSON endpoint. | — |
| **CSRF** | **OK.** Internal endpoint requires `x-internal-auth` header (not a session cookie), so it is naturally CSRF-resistant per security.md §"Cross-site request forgery". | [internal-auth.guard.ts:14](apps/api/src/modules/internal/internal-auth.guard.ts#L14). |
| **Tenant isolation** | **OK.** Bridge continues to act on global rows only — see "Multi-tenant boundary" above. | — |
| **Directus RBAC** | **OK.** `findOrCreate` POSTs with `provider: 'authentik', external_identifier: email, status: 'active'` at [directus-users-bridge.service.ts:84-90](apps/api/src/modules/directus/directus-users-bridge.service.ts#L84-L90) — identical to the existing OIDC-callback path. No new permission scope introduced. | `:84-90`. |
| **Backfill PATCH safety** | **OK.** `maybeBackfill` (`:94-109`) is gated on a shape check (`:96`) and swallows errors with warn. No new mutation vector. | [directus-users-bridge.service.ts:94-109](apps/api/src/modules/directus/directus-users-bridge.service.ts#L94-L109). |

**Overall:** the fix is **strictly safer** than the symptom — today, the
seed consumes the `null` return as "warn, but continue" (per
`scripts/uat-seed.sh` mock-mode helper at `:215-251`); after the fix, in
the non-mock branch it will resolve a Directus id and unblock consent-row
FK creation. No tenant-isolation invariant is weakened. No security
invariant is weakened. SecurityReviewer step is required per the related
`wf-20260703-fix-064/02-impact-analysis.md` precedent and per AGENTS.md
§6.2 convention for endpoint-affecting changes.

---

## Test Surface

### Unit tests (vitest)

| Test file / case | Status | Owner |
|---|---|---|
| [directus-users-bridge.spec.ts:215-239](apps/api/test/directus-users-bridge.spec.ts#L215-L239) "returns null when no local user exists for the email (no Directus traffic)" | **REWRITE** — flip expected outcome to match the new contract: when no local row exists, the bridge must still try the Directus lookup; assert that `fake.get` **is** called (mirroring the existing happy-path at `:264-286`), `fake.post` is called when no Directus row exists, and a non-null id is returned. The Testcontainers-Postgres seed row must be deliberately skipped (no `await seedUser(...)`) to keep the "no local row" precondition. | TestDesigner / TestRunner |
| [directus-users-bridge.spec.ts:241-262](apps/api/test/directus-users-bridge.spec.ts#L241-L262) "returns the existing directusUserId without re-creating when the column is already populated" | **KEEP AS-IS** — local-row path remains unchanged. | — |
| [directus-users-bridge.spec.ts:264-286](apps/api/test/directus-users-bridge.spec.ts#L264-L286) "creates the Directus row + persists directusUserId when the local row exists but the column is null" | **KEEP AS-IS** — local-row → `ensureLinked` delegation is unchanged. | — |
| [directus-users-bridge.spec.ts:288-308](apps/api/test/directus-users-bridge.spec.ts#L288-L308) "logs + returns null when Directus is unreachable (caller must not block on a bridge failure)" | **KEEP AS-IS** for the local-row branch; **DUPLICATE the shape for the no-local-row branch** in a new test at end of the describe block (no `seedUser`, assert `id === null` after `get` rejects). | TestDesigner / TestRunner |
| [directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts) — new case: "no local row + Directus row with mismatched provider → backfills + returns existing id (no link-back)" | **ADD** — issue file §"Recommended workflow → test-designer" bullet (ii). Mirrors `:226-247` (the "backfills provider+external_identifier" test for the local-row path) but with no local `seedUser`. | TestDesigner / TestRunner |
| [directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts) — new case: "no local row + no Directus row → POSTs and returns the new id" | **ADD** — issue file §"Recommended workflow → test-designer" bullet (i). Mirrors `:179-211` happy path. | TestDesigner / TestRunner |

### Controller / integration tests

| Test file | Status | Owner |
|---|---|---|
| [internal.spec.ts:122-185](apps/api/test/internal.spec.ts#L122-L185) `InternalController.ensureLinkedUser` describe block (5 cases) | **NO CHANGE** — controller is untouched; existing `vi.fn`-mocked `ensureLinkedByEmail` continues to satisfy the controller's contract. The relaxed bridge contract is **strictly more permissive**: the controller's `{ directusUserId: null }` test at `:181-184` still holds because the bridge may return null on Directus failure. | — |

### Bash regression tests (`scripts/tests/`)

| Test file | Status | Owner |
|---|---|---|
| `scripts/tests/uat-seed.bats` | **NO CHANGE** — `api_ensure_directus_user_link` helper signature unchanged; the mock-mode short-circuit at `uat-seed.sh:222-225` is byte-equivalent to the previous contract per `wf-20260703-fix-064/03-code-summary.md` "byte sequence preserved". | — |
| `scripts/tests/uat-seed-retries.bats`, `scripts/tests/uat-preflight-check.bats`, `scripts/tests/uat-seed-iss-001.bats` | **NO CHANGE** — unrelated to this fix. | — |

### E2E (Playwright)

**No new Playwright case required** — the endpoint is server-to-server;
no user-facing flow is touched.

### Live infrastructure verification (uat-runner at Step 9)

Per the issue file's acceptance criteria:

- **AC-1:** `GET /users?filter[email][_eq]=uat-member-c@aiqadam.test`
  returns 1 row → expect `data[0].id != null`.
- **AC-2:** `GET /items/member_consents?filter[purpose][_eq]=events&fields=id,member.email`
  → expect the consent row's `member.email = uat-member-c@aiqadam.test`.
- **AC-3:** unit-test the new "no local row → POSTs Directus" branch
  directly in [directus-users-bridge.spec.ts](apps/api/test/directus-users-bridge.spec.ts).
- **AC-4:** existing four `ensureLinkedByEmail` test cases (after the
  rewrite of case 1) still pass — no contract regression for
  OIDC-callback callers.

This is the same verification matrix already proven by
`wf-20260703-fix-064/07-test-results.md`; the live stack (Postgres +
Authentik + Directus + api) is reachable from the workstation host per
`wf-20260703-uat-064/03-uat-verification.md` precedent. **No new
infrastructure is required.**

---

## Risks & Open Questions

### Risks

1. **Audit hole (acknowledged in the issue file).** Before this fix,
   `ensureLinkedByEmail({email})` was a **strict read-no-side-effect**
   when no local row existed — a security audit could lean on that to
   assert "the bridge cannot create a Directus row for a user that
   doesn't exist locally." The fix **removes that property** — the
   bridge WILL create a Directus row from just an email + displayName.
   Mitigations:

   - The endpoint is `InternalAuthGuard`-protected (shared secret),
     reachable only by callers with `INTERNAL_API_TOKEN`. Per
     `.env.example:49-50` and [apps/api/src/config/env.ts:62](apps/api/src/config/env.ts#L62),
     this token is a long random string stored in `apps/api/.env`
     (gitignored). Not exposed publicly.
   - The seed (`scripts/uat-seed.sh`) is the only current caller. The
     future admin-invitation flow discussed in
     `wf-20260703-fix-064/02-impact-analysis.md` "Recommendation (a vs b)
     … 4. Future callers benefit" is also `InternalAuthGuard`-guarded.
   - **Recommendation:** the SecurityReviewer step should explicitly
     re-state this tradeoff in `04-security-review.md` and confirm no
     public-surface caller exists. **No code change needed; just
     documentation.**

2. **Displayname authority drift.** When the bridge creates a Directus
   row from the no-local-row path, the `first_name` field is set from
   `displayName ?? null` at [directus-users-bridge.service.ts:87](apps/api/src/modules/directus/directus-users-bridge.service.ts#L87)
   — same as the OIDC path. If an admin-invitation flow supplies a
   different displayName later, the existing `maybeBackfill`
   (`:94-109`) does **not** re-PATCH `first_name` (it only patches
   `provider` and `external_identifier`). This is **pre-existing**
   behavior unrelated to this fix; calling it out for the record only.

3. **No tenants — no risk.** Confirmed at [schema.ts:13-29](apps/api/src/modules/users/schema.ts#L13-L29)
   — `users` is global; no `country_code` to filter on.

### Open questions for the orchestrator

- **None blocking.** All scope decisions are answered by the issue
  file's Option A sketch + the related prior-work artifacts. Two
  minor choices for the TestDesigner:
  - Should the new "no local row + Directus throws" test use the
    same `makeBridge` / `FakeDirectus` pattern (recommended — keeps
    diff minimal) or extract a shared helper for the four cases that
    fakes the `db` as a no-op?
  - Should the renamed/rewritten first test keep the original test
    phrase "returns null when no local user exists" in any form
    (e.g., a sub-`describe` like
    `ensureLinkedByEmail → with local row → returns null on bridge failure`)?
    Tests stay self-documenting — pick the labeling that helps the
    next reader.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >-
    Impact fully analyzed. Single-service fix
    (DirectusUsersBridgeService.ensureLinkedByEmail in
    apps/api/src/modules/directus/directus-users-bridge.service.ts:138-156),
    ~15 lines plus test rewrites/additions in
    apps/api/test/directus-users-bridge.spec.ts. No DB migration, no
    schema change, no cross-module wiring, no frontend/bot/worker
    surface. Multi-tenant boundary preserved (users table is global).
    All four existing ensureLinkedByEmail test cases either remain
    valid or are explicitly rewritten; three new cases appended.
    SecurityReviewer step required (audit-hole tradeoff is the only
    documented concern). QualityGate will verify AC-3 (no-local-row
    POSTs Directus) via the new unit test plus live verifier
    (uat-runner) confirms AC-1/AC-2 via curl probes against a
    freshly-seeded BP-UAT-001 stack.
  findings:
    - "ISS-UAT-BRIDGE-001 root cause confirmed: ensureLinkedByEmail:147-149 returns null unconditionally for no-local-row; the existing private findOrCreate (directus-users-bridge.service.ts:74-92) already has the logic to create the Directus mirror without a local row."
    - "Only one production caller of ensureLinkedByEmail exists: apps/api/src/modules/internal/internal.controller.ts:113 (POST /v1/internal/users/ensure-linked, InternalAuthGuard-protected). The controller already returns { directusUserId: string | null }, so the relaxed contract is strictly more permissive with zero caller-side changes."
    - "auth.controller.ts:165, referrals.service.ts:59,69,79 use ensureLinked (userId-keyed) — NOT affected by this fix."
    - "scripts/uat-seed.sh:215-251 (api_ensure_directus_user_link) is the only client of the endpoint; the non-mock branch at :294- (ensure_test_user) will now actually create the Directus row instead of always returning null."
    - "DBMigrationAuthor NOT needed: no column added, no constraint changed. users schema (apps/api/src/modules/users/schema.ts:13-29) is unchanged; directus_users writes go through the pre-existing findOrCreate + maybeBackfill (directus-users-bridge.service.ts:74-109)."
    - "Multi-tenant boundary: zero weakening. users table is global (no country_code — verified at schema.ts:13-29); directus_users is also global per architecture.md 'Data ownership' table. No new cross-schema, cross-tenant, or cross-module data flow."
    - "Security invariants: input validation at boundary OK (Zod schema at internal.controller.ts:54-58); swallow-and-warn on Directus failure OK (matches :71 pattern, logs only email + err.message); auth at controller OK (InternalAuthGuard pre-existing); CSRF N/A (header-auth); parameterized SQL OK (Drizzle query-builder). One documented tradeoff: the no-local-row branch will create a Directus user from just an email+displayName — mitigated by InternalAuthGuard (INTERNAL_API_TOKEN is a shared secret, .env.example:49-50, not publicly reachable)."
    - "Test surface: 1 test rewrites (line 215-239 in apps/api/test/directus-users-bridge.spec.ts), 3 new cases appended, 3 existing cases unchanged. apps/api/test/internal.spec.ts unchanged. scripts/tests/*.bats unchanged. Playwright unchanged."
    - "PR file-count: 1 code (directus-users-bridge.service.ts) + 1 test (directus-users-bridge.spec.ts) = 2 files. Under the AGENTS.md §4 small-PR rule (≤400 lines, ≤5 code files)."
    - "Live verification (uat-runner) requires the docker compose stack already used in wf-20260703-uat-064: Postgres + Authentik + Directus + api. No new infrastructure needed."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```

**Recommendation for Orchestrator:** Advance to **Step 4
(CodeDeveloper)**. The CodeDeveloper should (1) rewrite the
`ensureLinkedByEmail` body at
[directus-users-bridge.service.ts:138-156](apps/api/src/modules/directus/directus-users-bridge.service.ts#L138-L156)
per the Option A sketch in [ISS-UAT-BRIDGE-001.md](.copilot/issues/ISS-UAT-BRIDGE-001.md),
and (2) leave all other files untouched. The TestDesigner should run in
parallel and target the test file
[directus-users-bridge.spec.ts:213-308](apps/api/test/directus-users-bridge.spec.ts#L213-L308)
for the rewrite (case 1) + 3 new appends. The SecurityReviewer is
**required** (Step 5) and should explicitly confirm the audit-hole
tradeoff is acceptable given the `InternalAuthGuard` boundary. The
QualityGate (Step 11) must verify AC-3 via the new unit test and delegate
AC-1/AC-2 to the uat-runner for live curl probes against a freshly-seeded
BP-UAT-001 stack.
