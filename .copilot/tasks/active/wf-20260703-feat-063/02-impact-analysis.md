# Impact Analysis — wf-20260703-feat-063

**Agent:** ImpactAnalyzer
**Step:** 2 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003`

---

## Validated Requirement

**FR-WORKFLOW-003 — UAT fixture state reset — order-independent, re-entrant UAT runs.**

`scripts/uat-seed.sh` is create-if-missing only; BP-UAT scripts mutate the
fixtures it creates (event status flips, invite tokens consumed,
registrations created), so re-running a script — or running scripts in a
different order — fails for state reasons, not product reasons. This FR adds
a `pnpm uat:seed --reset <BP-UAT-NNN>` mode (and `--reset all`) that deletes
and recreates every mutable domain fixture declared in a per-script JSON
manifest (`scripts/uat-fixtures/<BP-UAT-NNN>.json`) back to its documented
initial state, guarded so it can never run against a non-localhost target.

**v1 scope (per Step 1's applied amendment): `BP-UAT-001` and `BP-UAT-013`
only.** The remaining 16 BP-UAT files are explicitly out of scope for this
PR — no other BP-UAT doc file is touched.

Confirmed by re-reading `docs/03-requirements/FR-WORKFLOW-003.md` fresh
(not relying on the Step 1 validation doc's quotes): both amendments
recommended by RequirementAnalyst are already folded into the live FR file —
functional-scope item 2 states the v1 file list explicitly (BP-UAT-001,
BP-UAT-013) and functional-scope item 6 explicitly adds the
`business-analyst.md` 8th checklist row. Nothing further needs folding in
before CodeDeveloper starts.

This is entirely DevEx/tooling + docs + agentic-workflow-definition work.
**No NestJS module, no Drizzle schema, no shared-types package, no
frontend/bot/worker code is in scope.**

---

## Affected Layers

### API (NestJS) — N/A, not touched

Confirmed no hidden NestJS/DB touch point exists. Checked specifically
whether an admin API endpoint would be needed to support a reset:

- `scripts/uat-seed.sh` talks **directly** to Directus's REST API
  (`${DIRECTUS_URL}/items/operator_invites`, via `curl` + `DIRECTUS_TOKEN`)
  and to Authentik's admin REST API (via a token minted through
  `docker exec ak shell`, per `get_ak_admin_token()`, lines 86-107). Neither
  path goes through `apps/api`.
- Searched `apps/api/src` for `operator_invites`/`admin-invites` usage
  (22 files matched on module/controller boilerplate + the one real hit,
  `apps/api/src/modules/admin-invites/admin-invites.service.ts`). That
  service only **reads** `operator_invites` rows at accept/consume time
  (`consumeInvite()`) and creates new invite rows when an operator sends one
  through the product UI — it has no delete/reset capability and does not
  need one added. The `--reset` mode's delete-then-recreate calls are
  peer REST calls into the same Directus collection the service already
  reads from, not calls into the NestJS API.
- `country` / `country_lead` fields exist on `operator_invites`
  (confirmed via grep — `admin-invites.service.ts` lines 64, 81, 96, 108,
  207, 225, 236, 308, 327, 419, 462-463) and matter for RBAC group
  assignment, but this is a pass-through field the manifest must preserve
  verbatim in its recreate payload — no service logic needs to change to
  support that.
- **Conclusion: zero API-layer changes.** This is consistent with the FR's
  own out-of-scope section and with `uat-seed.sh`'s header rationale
  ("no Drizzle/TypeScript surface to write to").

### DB Changes Required — N/A, not touched

No Drizzle schema, no migration. `operator_invites`, `events`,
`registrations`, `member_consents`, `event_announcements` are all
Directus-owned collections (per architecture.md's Data Ownership table:
`directus` schema, written only via Directus's own REST/admin path — which
is exactly the access path `uat-seed.sh` already uses). No `platform`
schema (NestJS-owned) table is touched by this FR.

### Shared Types (`packages/shared-types/`) — N/A, not touched

No new Zod schema or TS type is needed. The fixture manifest is a bash/jq
consumption format, not a TypeScript contract; no code in `apps/web` or
`apps/api` reads `scripts/uat-fixtures/*.json`.

### Frontend (`apps/web/`) — N/A, not touched

No Astro page, no React island, no `apps/web/src/lib/api.ts` change. The
reset mode is invoked as a pre-flight step by the Orchestrator/human, never
by the running application.

### Bot (`apps/bot/`) — N/A, not touched

No aiogram handler or keyboard is affected.

### Workers (`apps/workers/`) — N/A, not touched

No BullMQ queue or processor is affected.

### DevEx / Tooling layer — primary surface, fully scoped below

| File | Change type | Detail |
|---|---|---|
| `scripts/uat-seed.sh` | Edit | New `--reset <BP-UAT-NNN>` / `--reset all` argument parsing; new manifest-read helper; new localhost guard function; new delete-then-recreate logic |
| `scripts/uat-fixtures/BP-UAT-001.json` | New file | Manifest: 4 fixture rows (2 Authentik identities referenced by id only + `uat-event-draft-uz` + no registrations needed for this BP) |
| `scripts/uat-fixtures/BP-UAT-013.json` | New file | Manifest: 4 `operator_invites` rows (valid/used/expired/no-user) |
| `docs/02-business-processes/uat/BP-UAT-001.md` | Edit | Add `id` column to "Seed Fixtures Required" table |
| `docs/02-business-processes/uat/BP-UAT-013.md` | Edit | Add `id` column to "Seed Fixtures Required" table |
| `docs/02-business-processes/uat/BP-UAT-template.md` | Edit | Document the new `id` column in the template's fixture table schema |
| `.copilot/agents/business-analyst.md` | Edit | Step 1 checklist table gains 8th row (manifest/doc drift check, per AC-5) |
| `.copilot/workflows/uat-verification.md` | Edit | Step 2 pre-flight: `pnpm uat:seed` → `pnpm uat:seed --reset <BP-UAT-NNN>`; document `failed-escalate` on non-zero exit |
| `scripts/tests/uat-seed.bats` | Edit | New tests: manifest parsing, delete-then-create ordering, localhost guard, unknown BP-UAT id, `--reset all` iteration |

`scripts/uat-fixtures/` does not exist yet on disk (confirmed via `ls` —
directory not found) — this FR creates it net-new. No naming collision.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| — | — | None. No `apps/api` endpoint is added, removed, or modified. | N/A |

The only "surface" this FR adds is a new CLI flag (`--reset`) on an internal
dev script, and direct Directus/Authentik REST calls the script already
makes using its existing idiom (`ak_get`/`ak_post`/`ak_patch`, `curl` against
`${DIRECTUS_URL}/items/<collection>`). A `DELETE
${DIRECTUS_URL}/items/<collection>/<id>` call will be new to the script
(zero delete calls exist today, confirmed by reading the full 576-line
file), but it is a call into Directus's already-used REST surface, not a
new API contract this repo owns.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `scripts/uat-seed.sh` (`--reset` branch) | Directus (`operator_invites`, `events` collections) | Direct REST (`curl` + `DIRECTUS_TOKEN` bearer), same idiom as existing `ensure_operator_invite()` |
| `scripts/uat-seed.sh` (`--reset` branch) | Authentik | `docker exec ak shell` admin token mint (existing `get_ak_admin_token()`, unchanged) + REST PATCH for group/password reset (existing `ensure_test_user()` `FORCE_REGEN` path, reused not duplicated) |
| `.copilot/agents/business-analyst.md` Step 1 | `scripts/uat-fixtures/<NNN>.json` vs BP-UAT doc fixture table | Diff comparison (doc-authoring-time check, not a runtime call) |
| `.copilot/workflows/uat-verification.md` Step 2 | `scripts/uat-seed.sh --reset <BP-UAT-NNN>` | Orchestrator shell invocation (pre-flight), replacing today's plain `pnpm uat:seed` |

No NestJS module calls another NestJS module as a result of this FR — there
is no NestJS involvement at all. No new cross-schema query is introduced
(Directus's own collections stay behind Directus's own REST API, per
architecture.md's "Cross-schema queries are forbidden" rule — this FR
doesn't touch that boundary since it was never inside it).

---

## Risk Flags

### Security Review Required: No, with one documented caveat

- The production guard (functional-scope item 5) is a **safety-critical**
  addition — `--reset` must exit 4 with zero side effects before any HTTP
  write if `DIRECTUS_URL`/`AK_URL` don't resolve to `localhost`/`127.0.0.1`.
  This is high-value to get right (destructive delete calls against a
  misconfigured non-local target would be a real incident), but the
  mechanism itself is a straightforward substring check on two variables
  already read as top-level script vars (`DIRECTUS_URL` line 433, `AK_URL`
  line 437) — no new secret handling, no new auth surface, no new token
  scope. TestDesigner/CodeDeveloper should treat AC-4 ("no writes performed"
  on guard trip) as the load-bearing test, not just the exit code — a bats
  test should assert zero POST/PATCH/DELETE calls were attempted in
  mock/guard-triggered mode, matching the FR's own AC-4 wording. I recommend
  a standard code-review pass (already part of the workflow) is sufficient;
  a dedicated SecurityReviewer escalation is not warranted since no new
  credential, endpoint, or trust boundary is introduced — this reuses the
  existing `DIRECTUS_TOKEN`/`AK_TOKEN` bearer patterns verbatim.

### Architecture Rule Risks: None found

- No module-boundary violation (this FR is entirely outside
  `apps/api/src/modules/*`, the layer those rules govern).
- No cross-schema query introduced.
- No stack deviation (still bash + `curl`/`jq` against Directus/Authentik
  REST, exactly as `uat-seed.sh`'s own header and `bootstrap.sh` already do).
- Confirms RequirementAnalyst's Step 1 finding: `failed-escalate` is not
  warranted for this FR.

### Cross-module / tenant-scoping check (explicit, per task instruction)

Checked whether resetting BP-UAT-013's `operator_invites` manifest touches
anything tenant-scoped that needs care:

- `operator_invites` rows carry a `country` field (confirmed via
  `admin-invites.service.ts` — used for country-lead RBAC group mapping,
  e.g. `country_lead_uz` → `aiqadam-country-lead-uz`). **All four
  BP-UAT-013 fixture rows use `country: null`** (they are plain
  `aiqadam-staff`/no-role invites, not country-lead invites — confirmed in
  `uat-seed.sh`'s current `ensure_operator_invite` calls, none of which pass
  a country argument). So the reset manifest for BP-UAT-013 has no
  tenant-scoping concern to reconcile — it's global-role fixture data.
  **Flag for CodeDeveloper:** the manifest JSON must still carry an explicit
  `"country": null` field (or omit it consistently, matching the existing
  omit-when-empty convtion already used for `consumed_at` in
  `ensure_operator_invite`) rather than silently dropping it, so a future
  BP-UAT manifest that *does* need a country-lead fixture has a precedent to
  follow.
- BP-UAT-001's fixtures (`uat-operator`, `uat-member-consented`,
  `uat-member-no-consent`, `uat-event-draft-uz`) are all `country='uz'`
  tenant-scoped (event + members). The reset logic must recreate
  `uat-event-draft-uz` with `country='uz'` and `status='draft'` exactly —
  get this wrong and BP-UAT-001 Step 002 ("event control panel... Status
  badge shows DRAFT") fails on a country-mismatch or status-mismatch, not a
  product bug. This is a real but contained risk: it's a data-fidelity
  requirement on the manifest content, not a cross-module or tenant-leakage
  risk (the reset only ever recreates rows scoped to the one BP-UAT's own
  declared fixtures — AC-3 explicitly requires zero row-count delta on
  unrelated collections/other BP-UATs' rows).
- **No tenant-leakage risk between BP-UAT-001 and BP-UAT-013**: BP-UAT-001's
  reset never touches `operator_invites`; BP-UAT-013's reset never touches
  `events`/`member_consents`. Confirmed by re-reading each BP-UAT's own
  "Seed Fixtures Required" table (below) — the two scripts' fixture sets are
  disjoint collections.
- **Conclusion: no cross-module risk beyond ordinary data-fidelity care in
  the manifest content**, which is squarely CodeDeveloper's job to get right
  and TestDesigner's job to assert (row-level payload match against the doc
  table, not just row existence).

---

## Fixture Inventory — exact `id` column scope (per task instruction #2)

### BP-UAT-001.md — current "Seed Fixtures Required" table (2-column, no `id`)

| Fixture | Description |
|---|---|
| `uat-operator` | Operator account (`uat-operator@aiqadam.test`), country=`uz` |
| `uat-member-consented` | Member account (`uat-member-c@aiqadam.test`), country=`uz`, `member_consents.purpose='events'` active |
| `uat-member-no-consent` | Member account (`uat-member-nc@aiqadam.test`), country=`uz`, no `member_consents` row for `events` |
| `uat-event-draft-uz` | Event in `uz` tenant, `status='draft'`, capacity=20, 0 registrations |

All 4 rows need a stable `id` in the new column. Two are Authentik identity
fixtures (`uat-operator`, already seeded by the unconditional Step 3 of
`uat-seed.sh` — the manifest for BP-UAT-001 should reference these by id for
the "reset = restore group/consent state, never delete" semantics per
functional-scope item 3, not delete-then-recreate them). The other two
(`uat-member-consented`, `uat-member-no-consent`) are **new fixtures not
currently seeded by `uat-seed.sh` at all** — today's script only creates
`uat-member`/`uat-operator` (lines 492-500), not the two BP-UAT-001-specific
member variants named in the doc. `uat-event-draft-uz` is also not currently
created by the script (STEP 4 today only inserts `operator_invites` rows,
nothing into `events`). **This means BP-UAT-001's reset manifest is not
purely "reset existing fixtures" — for 3 of its 4 rows, `--reset
BP-UAT-001` is the first time `uat-seed.sh` creates them at all.**
Flagging this clearly for CodeDeveloper: the manifest's "initial payload"
for these 3 rows must be authored from scratch by reading the BP-UAT-001.md
step text (e.g., `uat-event-draft-uz` capacity=20, `status='draft'`,
`country='uz'`), not lifted from existing script code, since no existing
code creates them today.

### BP-UAT-013.md — current "Seed Fixtures Required" table (4-column: Fixture/Email/display_name/Description, no `id`)

| Fixture | Email | `display_name` | Description |
|---|---|---|---|
| `uat-onboard-token` | `uat-operator@aiqadam.test` | `UAT Operator (valid)` | valid, unused invite |
| `uat-onboard-used-token` | `uat-operator@aiqadam.test` | `UAT Operator (used)` | already accepted (`used_at` set) |
| `uat-onboard-expired-token` | `uat-operator@aiqadam.test` | `UAT Operator (expired)` | `expires_at` in the past |
| `uat-onboard-no-user-token` | `uat-operator+no-user@aiqadam.test` | `UAT Operator (no-user)` | no matching Authentik user |
| Mail catcher | — | — | infra row, not a fixture — **excluded** from `id` column scope |

All 4 `operator_invites` rows need a stable `id` — **these already map
1:1 to the token constants uat-seed.sh already defines**
(`ONBOARD_TOKEN`, `ONBOARD_USED_TOKEN`, `ONBOARD_EXPIRED_TOKEN`,
`ONBOARD_NO_USER_TOKEN`, lines 527-530) and are already created
unconditionally by the existing `ensure_operator_invite()` calls
(lines 545-559). Unlike BP-UAT-001, **BP-UAT-013's reset manifest is a
faithful "reset existing fixtures" case** — the payload content can be
lifted directly from the current script's own call arguments (email,
status, expires_at, consumed_at, token, display_name, role_groups),
making this the simpler of the two manifests to author. The "Mail catcher"
row is infrastructure documentation, not a Directus/Authentik fixture — it
should NOT get an `id` and NOT appear in the JSON manifest; recommend
CodeDeveloper/doc-writer leave that row's `Fixture`/`Email`/`display_name`
cells as `—` in the `id` column too (template should document this
"non-fixture row" exception explicitly, see template flag below).

### Template scope

`BP-UAT-template.md`'s current fixture table is 2-column (`Fixture`,
`Description`) — matches BP-UAT-001's shape, not BP-UAT-013's 4-column
shape. The template edit should add the `id` column to its canonical
2-column example and add a sentence noting that BP-UAT files with richer
fixture tables (like BP-UAT-013's email/display_name columns) still gain
the same `id` column, positioned first, and that infra rows with no
Directus/Authentik-backed fixture (e.g., "mail catcher is running") are
exempt from needing an `id`.

---

## Test Scope

### Existing test structure (per task instruction #3)

`scripts/tests/uat-seed.bats` today:
- **Framework:** bats-core, loaded via `load 'test_helper'`
  (`scripts/tests/test_helper.bash`), run via `bash scripts/run-bats.sh
  scripts/tests/uat-seed.bats` or `pnpm test:bash`.
- **Mock-mode pattern:** every test sets `UAT_SEED_DIRECTUS_MOCK=1
  DIRECTUS_TOKEN=mock-token` and invokes
  `bash "$REPO_ROOT/scripts/uat-seed.sh"` via `run bash -c '...'`, then
  asserts on `$status` and greps `$output` for mock-mode log lines (e.g.
  `operator_invite <token_prefix> (mock, email=..., role_groups=...,
  authentik_user_id=...)`). No live Docker stack, no live Directus/Authentik
  required for these tests.
- **Structural/static-analysis pattern:** a second style of test greps the
  script's own source for required substrings (e.g. `grep -q
  'DIRECTUS_TOKEN missing' "$REPO_ROOT/scripts/uat-seed.sh"`) to pin
  structural invariants (idempotency guard present, env var referenced in a
  sibling script) without executing anything.
- `REPO_ROOT` is resolved once in a bare `setup()` (no per-test repo
  scaffolding needed here, unlike `check-workflow-state.bats`'s
  `setup_test_repo` helper — `uat-seed.bats` runs directly against the real
  repo's `scripts/uat-seed.sh`, it doesn't need an isolated git fixture repo).
- `teardown()` unsets `UAT_SEED_DIRECTUS_MOCK` defensively.

New tests (functional-scope item 7 / FR's own AC-6) should follow the same
two patterns:

| New test | Pattern | Asserts |
|---|---|---|
| Manifest parsing | mock-mode run | `--reset BP-UAT-013` in mock mode reads `scripts/uat-fixtures/BP-UAT-013.json` and logs a per-fixture mock line (parallel to today's `ensure_operator_invite` mock line convention) |
| Delete-then-create ordering | mock-mode run, ordered grep | mock-mode output shows a "delete" line before the corresponding "create" line per fixture id, matching functional-scope item 1's semantics |
| Localhost guard | mock-mode + non-localhost env override | `DIRECTUS_URL=https://prod.aiqadam.org ... --reset BP-UAT-001` exits 4; grep confirms zero POST/PATCH/DELETE mock-call lines were emitted (AC-4's "no writes" requirement, not just the exit code) |
| Unknown BP-UAT id | mock-mode run | `--reset BP-UAT-999` (no manifest file) exits non-zero with an actionable FATAL message (`fail()` helper, same idiom as existing `fail "Missing required tools..."`) |
| `--reset all` iteration | mock-mode run | `--reset all` iterates every manifest file present under `scripts/uat-fixtures/*.json` (currently 2: BP-UAT-001, BP-UAT-013) and logs both |
| Regression: byte-identical no-flag output | mock-mode run, diff | invoking the script with no `--reset` flag at all produces output identical to pre-change behavior (AC-6's explicit regression guard) — recommend a fixture-captured "golden" mock-mode transcript, or a diff against `git show HEAD:scripts/uat-seed.sh`'s mock output if that's simpler in bats |

No integration tests (Testcontainers) and no E2E Playwright flows are in
scope for this FR — the FR's own AC-6 scopes verification to `bash -n`
syntax check + bats suite under mock mode + a byte-identical regression
check. This matches the existing `uat-seed.bats` suite's own scope (it has
never required a live stack). Live-stack verification of the reset path
happens naturally the next time the `uat-verification` workflow runs
Step 2 with the new `--reset` invocation (functional-scope item 6) — that
is out of this FR's own test-authoring scope per AC-7 (doc-only).

### Unit / Integration / E2E summary (required subsections)

- **Unit:** N/A in the NestJS/Jest sense — no TypeScript unit under test.
  The bats tests above are this FR's equivalent of unit tests for the shell
  script's new logic branches.
- **Integration (Testcontainers):** N/A — not touched, no Drizzle/Postgres
  schema involved.
- **E2E (Playwright):** N/A for this FR's own test-authoring scope. Existing
  BP-UAT-001/BP-UAT-013 Playwright specs (`apps/e2e/tests/uat/*.spec.ts`)
  are unaffected by this FR — they still exercise the same seeded fixtures,
  just via a script that can now also reset them between runs. No spec file
  edit is implied or required by this FR.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-003's full change scope is confirmed: scripts/uat-seed.sh (new --reset branch, manifest-read helper, localhost guard — all additive, no restructuring), two new manifest JSON files, edits to BP-UAT-001.md/BP-UAT-013.md/BP-UAT-template.md fixture tables, business-analyst.md's 8th checklist row, uat-verification.md Step 2, and uat-seed.bats. Confirmed via full read of uat-seed.sh (576 lines) that there is no hidden NestJS/DB touch point — admin-invites.service.ts only reads operator_invites via Directus REST and needs no reset-supporting endpoint. No API, DB, shared-types, frontend, bot, or worker layer is touched — explicitly confirmed N/A for each. No cross-module or tenant-leakage risk found; one data-fidelity risk flagged (BP-UAT-001's manifest must author 3 of 4 fixture rows from scratch since uat-seed.sh doesn't create them today, unlike BP-UAT-013 whose 4 rows already exist in the script verbatim)."
  findings:
    - "No hidden NestJS/DB touch point: admin-invites.service.ts (the only apps/api file referencing operator_invites) only reads/creates invite rows for the product's own onboarding flow; it has no delete/reset capability and none is needed — the --reset mode's Directus REST calls are peer calls into the same collection, not calls through apps/api."
    - "BP-UAT-001's fixture manifest is NOT a pure reset case: 3 of its 4 declared fixtures (uat-member-consented, uat-member-no-consent, uat-event-draft-uz) are not created by uat-seed.sh today at all (only uat-operator/uat-member and 4 operator_invites rows are). CodeDeveloper must author these 3 fixtures' initial-state payload from the BP-UAT-001.md step text, not lift it from existing script code. BP-UAT-013's manifest, by contrast, maps 1:1 onto the script's existing ensure_operator_invite() calls and constants — the simpler of the two to author."
    - "BP-UAT-template.md's current fixture table is 2-column; BP-UAT-013.md's is 4-column (adds Email/display_name). The template edit should show the id column placed first and note that non-Directus/non-Authentik infra rows (e.g. BP-UAT-013's 'Mail catcher' row) are exempt from needing an id."
    - "AC-4 ('no writes performed' on the localhost guard) is the load-bearing assertion, not just the exit-4 code — recommend TestDesigner write the localhost-guard bats test to grep for zero delete/create mock-call lines, matching the FR's own AC-4 wording literally."
    - "No architecture-rule risk and no security-review escalation warranted: no new credential, endpoint, or trust boundary is introduced; the guard reuses existing DIRECTUS_TOKEN/AK_TOKEN bearer patterns verbatim. Standard code-review coverage (already part of the workflow) is sufficient."
    - "Test scope is bats-only (mock-mode + static-analysis patterns matching the existing scripts/tests/uat-seed.bats structure) — no Testcontainers integration tests, no new/changed Playwright E2E specs are implied by this FR."
```
