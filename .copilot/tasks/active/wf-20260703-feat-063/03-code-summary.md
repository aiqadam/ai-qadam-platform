# Code Summary — wf-20260703-feat-063

**Agent:** CodeDeveloper
**Step:** 4 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003`

---

## Requirement Implemented

FR-WORKFLOW-003 — UAT fixture state reset — order-independent, re-entrant
UAT runs. `scripts/uat-seed.sh` gains a `--reset <BP-UAT-NNN>` / `--reset
all` mode that deletes and recreates every mutable domain fixture declared
in a per-script JSON manifest (`scripts/uat-fixtures/<BP-UAT-NNN>.json`)
back to its documented initial state, guarded so it can never run against
anything but a localhost target. Identity fixtures (Authentik users) are
reset (group membership restored via the existing `FORCE_REGEN`-style
path) rather than deleted and recreated. v1 scope is exactly
`BP-UAT-001` and `BP-UAT-013`, per the amended FR and impact analysis — no
other BP-UAT file or manifest is touched. This is a DevEx/tooling + docs
change only: no NestJS module, Drizzle schema, shared-types package, or
frontend/bot/worker code is touched, confirmed by re-checking the impact
analysis's N/A layers before starting.

Bats test authoring is explicitly out of scope for this step (TestDesigner's
job next) — the implementation is structured so each new branch is a
separate, independently testable function (see Known Limitations for what
TestDesigner will need).

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `scripts/uat-seed.sh` | Edit | New `--reset <BP-UAT-NNN>` / `--reset all` CLI parsing; `reset_localhost_guard()`; manifest-read helpers (`manifest_path_for`, `require_manifest`, `list_known_manifests`); `reset_identity_fixture()` (reuses `ensure_test_user`'s `FORCE_REGEN=1` path verbatim); `reset_domain_fixture()` (generic delete-then-recreate against any Directus collection via the manifest's `lookup_field`/`lookup_value`); `resolve_payload_offsets()` (resolves `*_offset` manifest keys to ISO timestamps via the existing `date_offset()` helper); `run_reset_for_bp()` / `run_reset_all()` orchestration. The `--reset` branch runs and exits before STEP 1-4's unconditional flow — the no-flag path is untouched code, confirmed byte-identical (see Self-Validation). |
| `scripts/uat-fixtures/BP-UAT-013.json` | New file | Manifest for 4 `operator_invites` rows. Payloads lifted verbatim from `uat-seed.sh`'s existing `ensure_operator_invite()` calls (STEP 4, `ONBOARD_TOKEN`/`ONBOARD_USED_TOKEN`/`ONBOARD_EXPIRED_TOKEN`/`ONBOARD_NO_USER_TOKEN`) — a faithful "reset existing fixtures" case per the impact analysis. |
| `scripts/uat-fixtures/BP-UAT-001.json` | New file | Manifest for 5 fixtures: `uat-operator` (identity, reference-only — already seeded by STEP 3), `uat-member-consented` + `uat-member-no-consent` (new identity fixtures, not created by `uat-seed.sh` today), `uat-member-consented-consent` (domain: `member_consents` row, purpose=`events`), `uat-event-draft-uz` (domain: `events` row, `status=draft`, `country=uz`, `capacity=20`). The 3 non-identity payloads were authored from `BP-UAT-001.md`'s step text (Step 002 "Status badge shows DRAFT", Seed Fixtures Required table), not lifted from existing script code, since no existing code creates them today. |
| `docs/02-business-processes/uat/BP-UAT-001.md` | Edit | Added `id` column (first) to "Seed Fixtures Required" table, values matching the new manifest's fixture ids. Added a lead-in sentence explaining reset-vs-recreate semantics per row. |
| `docs/02-business-processes/uat/BP-UAT-013.md` | Edit | Added `id` column (first) to the 4-column "Seed Fixtures Required" table. The "Mail catcher" infra row's `id` cell is `—` (not a Directus/Authentik fixture, intentionally absent from the JSON manifest). |
| `docs/02-business-processes/uat/BP-UAT-template.md` | Edit | Added `id` column (first) to the template's canonical 2-column fixture table example, plus a note that infra rows with no Directus/Authentik-backed fixture are exempt and richer fixture tables (e.g. BP-UAT-013's shape) still gain the same `id` column, positioned first. |
| `.copilot/agents/business-analyst.md` | Edit | Added the manifest/doc-drift row to **both** tables that needed it: the Step 1 process checklist (`Check \| Pass condition`, 2-col) and the `01-uat-script-validation.md` output-file-format table (`Check \| Result \| Notes`, 3-col) — the FR's AC-5 is checked via the latter at actual validation-run time, so both needed the row for internal consistency. |
| `.copilot/workflows/uat-verification.md` | Edit | Step 2 pre-flight: documents `pnpm uat:seed --reset <BP-UAT-NNN>` for BP-UATs with a manifest (currently BP-UAT-001, BP-UAT-013 only) and keeps plain `pnpm uat:seed` as the documented fallback for the other 16 BP-UATs (no manifest yet). Gate section states a non-zero exit from `--reset` is `failed-escalate`, matching the step's pre-existing gate semantics. |

No file outside this list was modified for feature purposes. (`.copilot/meta/next-workflow-id`, `docs/03-requirements/requirements-registry.md`, and `docs/04-development/testing/visual-testing.md` show as modified in `git status` but were touched by earlier Orchestrator/RequirementAnalyst steps of this same workflow, not by this CodeDeveloper pass.)

---

## Follow-up fix (this pass): `member_email` → `member_consents.member` FK resolution

Closes Known Limitation #1 from the previous pass (see "Known Limitations" below —
kept in place but marked resolved, per AGENTS.md §6.1: a small, well-scoped
production-readiness gap must be closed now, not shipped with a "known broken
live path").

**Root cause confirmed before fixing:** grepped `member_consents` across
`apps/api/src` and `infrastructure/directus/bootstrap.sh`. `member_consents.member`
is declared `"type":"uuid"` with an explicit relation
`member_consents.member -> directus_users.id` (bootstrap.sh) — i.e. a **Directus**
user id, not an Authentik pk. `apps/api/src/modules/directus/directus-users-bridge.service.ts`
confirms the same id space and lookup shape (`GET /users?filter[email][_eq]=`
against Directus itself, not Authentik's `/api/v3/core/users/`). This is a
different id space from `operator_invites.authentik_user_id` (Authentik's numeric
pk, resolved via the pre-existing `user_pk_by_email()` against `AK_URL`) — the two
must not be conflated.

**Changes to `scripts/uat-seed.sh`:**

- New `directus_user_pk_by_email()` helper (added next to `user_pk_by_email()`):
  queries `${DIRECTUS_URL}/users?filter[email][_eq]=<email>&fields=id&limit=1`
  with the Directus bearer token, returns the Directus user uuid or empty.
- `reset_domain_fixture()` now reads `.payload.member_email` from the fixture
  (before `resolve_payload_offsets()` strips it) and, if present:
  - **Live mode:** resolves it via `directus_user_pk_by_email()` using the
    already-in-scope `DIRECTUS_URL`/`DIRECTUS_TOKEN` globals, sets the resolved
    uuid onto `resolved_payload.member`, and `fail()`s loudly (existing
    `fail()` idiom, exit 1, actionable message) if the email doesn't resolve to
    any Directus user — treated as a fixture-authoring bug, not a runtime
    condition to swallow, per functional-scope item 4.
  - **Mock mode:** there is no real Directus to query, so the function resolves
    `member_email` against sibling **identity** fixtures' declared `email`
    values in the same manifest (the real-world invariant this mirrors: the
    referenced member's identity fixture must exist). `reset_domain_fixture()`
    gained a second parameter, `sibling_fixtures_json` (the full manifest
    fixtures array, already held by `run_reset_for_bp()`), used only by this
    mock-mode path — live mode ignores it. An unresolvable email in mock mode
    also `fail()`s loudly, so the "fails loudly, not silently" behavior is
    exercised and verifiable without a live Directus/CI stack.
  - `resolve_payload_offsets()` is unchanged — it still strips `member_email`
    from the outgoing payload (`del(.member_email)`) after offsets are
    resolved; the new resolution step runs in `reset_domain_fixture()` right
    after `resolve_payload_offsets()` returns, and layers `.member` onto the
    already-stripped payload via a separate `jq --arg m ... '.member = $m'`.
- No manifest files changed — `BP-UAT-001.json`'s existing `member_email` hint
  on `uat-member-consented-consent` now resolves correctly (mock trace below
  shows `member_email=uat-member-c@aiqadam.test resolved to
  member=uat-member-consented`, matching the sibling identity fixture's `id`
  in mock mode — a real Directus would resolve to that member's actual uuid
  instead). `BP-UAT-013.json` has no `member_email` key in any fixture, so its
  behavior is provably unaffected (see mock trace below — output is
  byte-for-byte the same shape as before this fix).

---

## Key Design Decisions

1. **`--reset` is a separate, early-exit branch, not a modifier woven into STEP 1-4.** Args are parsed at the very top of the script; if `RESET_TARGET` is set, the script runs the guard + reset logic and `exit 0`s before reaching STEP 1's reachability check. This was the simplest way to guarantee AC-6's byte-identical no-flag regression requirement — the pre-existing STEP 1-4 code is completely untouched, not conditionally branched inside.

2. **Localhost guard checks both `DIRECTUS_URL` and `AK_URL` independently, before any manifest read.** The guard call is the very first statement inside the `--reset` branch — before `get_ak_admin_token`, before `require_manifest`. This satisfies AC-4's "no writes performed" literally: not even a manifest file read happens if the guard trips (verified in Self-Validation below).

3. **Generic `reset_domain_fixture()` instead of one function per collection.** Rather than writing a bespoke delete/recreate function for `operator_invites`, another for `events`, another for `member_consents`, one generic function takes `collection` + `lookup_field` + `lookup_value` + `payload` from the manifest and does a filtered-GET → DELETE (if found) → POST. This keeps the script additive (no restructuring of `ensure_operator_invite`, which remains fully intact and used unconditionally by STEP 4) and means a future BP-UAT manifest for a new collection needs zero script changes — only a new JSON file.

4. **`resolve_payload_offsets()` reuses the existing `date_offset()` helper rather than duplicating date math in the manifest.** Manifest payloads declare relative offsets (`{"spec":"+7","unit":"days"}`) instead of baked-in absolute timestamps, so a reset always produces fresh, valid (non-expired, in-the-future) dates — mirroring exactly how STEP 4's `_now_plus_7d`/`_now_minus_2h`/`_now_minus_1d` variables already work.

5. **`member_email` in `BP-UAT-001.json`'s `member_consents` fixture is a manifest-only hint, not a real payload field.** `member_consents.member` is a Directus FK (uuid) to `directus_users.id`, not an email string. The manifest documents the intended member by email for human readability (matching the doc table's own convention) and `resolve_payload_offsets()` strips it (`del(.member_email)`) before the payload reaches Directus. **Known limitation:** resolving `member_email` → the member's actual Directus/Authentik user id is not yet wired into `reset_domain_fixture()` — see Known Limitations.

6. **Identity fixtures are processed before domain fixtures in `run_reset_for_bp()` (two explicit passes).** This matches functional-scope item 1's ordering intent (identities must be known-good before domain rows that reference them, e.g. `member_consents.member`) and gives TestDesigner an unambiguous ordering invariant to assert (`--reset` output shows all identity lines before any domain delete/create line for a given BP-UAT).

7. **Unknown `--reset <BP-UAT-NNN>` uses the script's existing `fail()` idiom, not a bespoke error path.** `require_manifest()` calls `fail(...)` with the expected manifest path and the list of known manifests (currently `BP-UAT-001, BP-UAT-013`) — exits 1, matches the existing FATAL-message convention used elsewhere in the script (e.g. `DIRECTUS_TOKEN missing`).

8. **`event_types.format` value in the `BP-UAT-001.json` manifest is `"meetup"`, not a guessed value.** Checked `infrastructure/directus/bootstrap.sh`'s `event_types` seed data (`meetup`, `workshop`, `hackathon`, `conference`, `online`) before authoring the payload — BP-UAT-001.md's doc table doesn't specify a format, so `meetup` (the first/default seeded type) was chosen as a reasonable, verifiably-valid default rather than inventing an unlisted value like `in_person`.

---

## Architecture Rule Compliance

This FR is entirely outside `apps/api/src/modules/*` (the layer the module-boundary rules govern), confirmed fresh by re-reading `architecture.md` and the impact analysis before starting:

- **Module boundaries / cross-module calls:** N/A — no NestJS module is touched or added. `scripts/uat-seed.sh`'s new REST calls (Directus `DELETE`/`POST` on `operator_invites`, `events`, `member_consents`) are peer calls into Directus's own already-used REST surface, not calls through `apps/api`.
- **Tenant scoping:** `events` and `member_consents` rows the reset path creates carry `country='uz'` explicitly in the manifest payload (per architecture.md's "all tenant-scoped tables have `country_code` column" rule, mirrored here as Directus's own `country` field) — not silently dropped. `operator_invites` rows carry an explicit `"country": null` per the impact analysis's flag (matching the omit/null convention `ensure_operator_invite` already uses for `consumed_at`).
- **Zod at boundaries:** N/A — no TypeScript/Zod surface exists in this change; the manifest is a bash/jq consumption format, matching the FR's own explicit non-scope ("no Drizzle/TypeScript surface to write to").
- **No cross-schema queries:** All new REST calls stay inside Directus's own REST API (`${DIRECTUS_URL}/items/<collection>`), same idiom as every pre-existing call in the file. No raw SQL, no cross-schema join.
- **No `any`:** N/A (bash, not TypeScript).
- **Auth at controller level:** N/A — no controller/endpoint is added. The reset mode reuses the existing `DIRECTUS_TOKEN`/Authentik-admin-token bearer patterns verbatim; no new credential or trust boundary introduced (matches the impact analysis's explicit "no dedicated SecurityReviewer escalation warranted" conclusion).

---

## Formatter Check

Biome and `tsc` are not applicable — this change touches only bash and Markdown, no TypeScript. In place of the standard TypeScript formatter/lint gate:

- `bash -n scripts/uat-seed.sh` → **exits 0** (syntax check, re-verified after every edit pass).
- `shellcheck` is **not** currently wired as a CI gate for this repo. Per FEAT-WORKFLOW-002's history, AC-7 (shellcheck) was dropped from that follow-up without GPLv3 license approval — no shellcheck run is claimed here. Manual review was the check applied: consistent quoting (`"$var"` throughout), `set -euo pipefail` preserved, no new unguarded globs, all new functions follow the file's existing local-variable-declaration and `jq -nc`/`--arg`/`--argjson` idioms.
- Markdown edits (5 files) were reviewed by hand for table-column consistency (each edited table's column count and header row were re-checked after editing — one mistake was caught and corrected during self-review: `business-analyst.md`'s Step 1 checklist table is 2-column, not 3-column as the FR's literal AC-5 wording implied at first glance; fixed to fit the existing schema, and the row was additionally added to the 3-column `01-uat-script-validation.md` output-format table where the FR's exact `PASS/FAIL/N/A | diff named on FAIL` wording actually belongs).

---

## Known Limitations

1. **RESOLVED (this pass).** ~~`member_consents.member` FK resolution is not implemented in `reset_domain_fixture()`.~~ Fixed: `reset_domain_fixture()` now resolves the manifest's `member_email` hint to a real Directus user id (via new `directus_user_pk_by_email()` helper in live mode, or sibling-identity-fixture lookup in mock mode) and sets it onto `payload.member` before POST, failing loudly via the existing `fail()` idiom if resolution fails. See "Follow-up fix" section above for full detail.
2. **No bats tests were authored** (explicitly out of scope for this step — TestDesigner's job next). The impact analysis's Test Scope section names exactly what's needed (manifest parsing, delete-then-create ordering, localhost guard + zero-writes, unknown BP-UAT id, `--reset all` iteration, byte-identical no-flag regression); all of these were manually traced during self-validation below and behave as expected, giving TestDesigner a proven baseline to encode.
3. **`--reset <BP-UAT-NNN>` does not imply anything about `FORCE_REGEN` env var interaction beyond calling `ensure_test_user` with `FORCE_REGEN=1` locally scoped to that call** (via `FORCE_REGEN=1 ensure_test_user ...`, a local env override, not a global mutation of the outer `FORCE_REGEN` variable). This matches RequirementAnalyst's recommended default (`--reset` implies `FORCE_REGEN`-equivalent behavior for fixtures in that BP-UAT's own manifest only) without touching the global flag's existing semantics for the unconditional STEP 3 flow.
4. **Live-stack (non-mock) execution of `--reset` has not been run** — only `UAT_SEED_DIRECTUS_MOCK=1` paths were exercised, per this FR's own AC-6 scope (`bash -n` + bats-under-mock + byte-identical regression). Real Directus/Authentik REST behavior (HTTP status codes, actual FK constraints) will be exercised naturally the next time `uat-verification` runs Step 2 with the new invocation, consistent with the impact analysis's stated test scope.

---

## Self-Validation Performed

- `bash -n scripts/uat-seed.sh` → exit 0.
- `jq empty scripts/uat-fixtures/BP-UAT-001.json` and `.../BP-UAT-013.json` → both valid JSON.
- Mock-mode trace, `--reset BP-UAT-013`: exit 0; 4 fixtures, each logging a `(mock, delete collection=... lookup=...)` line immediately followed by a `(mock, create collection=...)` line — delete-before-create ordering confirmed.
- Mock-mode trace, `--reset BP-UAT-001`: exit 0; 3 identity-reset lines logged first, then 2 domain delete/create pairs — two-pass ordering confirmed (identities before domain rows).
- Mock-mode trace, `--reset all`: exit 0; both manifests processed in filename order (BP-UAT-001 then BP-UAT-013).
- Mock-mode trace, `--reset BP-UAT-999` (no manifest): exit 1, `fail()`-idiom FATAL message naming the expected path and the two known manifests.
- Localhost-guard trace, non-localhost `DIRECTUS_URL` (`https://prod.aiqadam.org`): exit 4, single FATAL line, **zero** fixture/mock lines emitted — guard fires before the manifest is even read.
- Localhost-guard trace, non-localhost `AK_URL` (checked independently from `DIRECTUS_URL`): exit 4, same zero-writes behavior — confirms both URLs are checked, not just the first.
- Regression check: captured `git show HEAD:scripts/uat-seed.sh` output under `UAT_SEED_DIRECTUS_MOCK=1` with no flag, diffed byte-for-byte against the modified script's no-flag output — **identical**, both before and after all doc/manifest edits were finalized.
- Ran the full existing bats suite (`uat-seed.bats`, `uat-seed-iss-001.bats`, `uat-seed-retries.bats`, `bp-uat-template-rule.bats`) — all 29 non-skipped assertions pass; 3 pre-existing skips are Python-availability related, unrelated to this change.

### Re-validation after the `member_email` resolution fix (this pass)

- `bash -n scripts/uat-seed.sh` → exit 0 (re-confirmed after the edit).
- `jq empty` on both manifests → both still valid JSON (unchanged files).
- Mock-mode trace, `--reset BP-UAT-001`: exit 0; new resolution line confirmed
  present: `fixture uat-member-consented-consent (mock, create
  collection=member_consents, member_email=uat-member-c@aiqadam.test resolved
  to member=uat-member-consented)` — the identity-then-domain two-pass
  ordering and all 5 fixtures are otherwise unchanged from the prior pass's
  trace.
- Mock-mode trace, `--reset BP-UAT-013`: exit 0; output byte-shape unchanged
  (no `member_email` in this manifest — confirms functional-scope item 5,
  BP-UAT-013 behavior is untouched).
- Mock-mode trace, `--reset all`: exit 0; both manifests processed in
  filename order, same as before.
- Mock-mode trace, `--reset BP-UAT-999` (unknown id): exit 1, same `fail()`
  FATAL message as before — unaffected by this change.
- Localhost-guard trace, non-localhost `DIRECTUS_URL`: exit 4, zero
  fixture/mock lines — unaffected by this change (guard still runs before
  any manifest read or resolution attempt).
- **New: mock-mode trace with a deliberately unresolvable `member_email`.**
  Temporarily edited a scratch copy of `BP-UAT-001.json`'s
  `uat-member-consented-consent` fixture to set
  `payload.member_email = "nonexistent@aiqadam.test"` (no such identity
  fixture in the manifest), ran `--reset BP-UAT-001` under
  `UAT_SEED_DIRECTUS_MOCK=1`: **exit 1**, FATAL message `fixture
  uat-member-consented-consent: member_email 'nonexistent@aiqadam.test' did
  not resolve to any identity fixture in this manifest (mock mode) —
  fixture-authoring bug, refusing to POST a broken member_consents row.` —
  fails loudly as required (functional-scope item 4), not silently. The two
  identity fixtures preceding it in the manifest (`uat-operator`,
  `uat-member-consented`, `uat-member-no-consent`) still logged successfully
  before the failure, confirming the two-pass ordering means the failure is
  isolated to the one bad domain fixture, not a global short-circuit before
  any work happens. Reverted the scratch edit immediately after; `diff`
  against a pre-edit backup confirmed the manifest file was restored
  byte-identical.
- Regression check re-run: `git show HEAD:scripts/uat-seed.sh` no-flag mock
  output vs. the now-twice-modified script's no-flag mock output — **still
  byte-identical**. The `--reset` branch changes are fully isolated from the
  unconditional STEP 1-4 flow.
- Re-ran the full existing bats suite (`uat-seed.bats`, `uat-seed-iss-001.bats`,
  `uat-seed-retries.bats`, `bp-uat-template-rule.bats`) — **29/29 non-skipped
  assertions still pass**, same 3 pre-existing Python-availability skips,
  no regressions introduced by this fix.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-WORKFLOW-003 implemented exactly per the impact analysis's file list: scripts/uat-seed.sh gains an additive --reset <BP-UAT-NNN>/--reset all branch (localhost guard, generic manifest-driven delete-then-recreate for domain fixtures, FORCE_REGEN-reuse reset for identity fixtures, fail()-idiom unknown-id handling) that runs and exits before the pre-existing STEP 1-4 flow, verified byte-identical in mock-mode no-flag output both before and after the change. Two new manifests (BP-UAT-001.json, BP-UAT-013.json) authored — BP-UAT-013's lifted verbatim from existing script constants, BP-UAT-001's 3 non-identity fixtures authored fresh from the doc's step text per the impact analysis's explicit flag. Five doc/agent-definition files updated (BP-UAT-001.md, BP-UAT-013.md, BP-UAT-template.md, business-analyst.md, uat-verification.md) with the id column and AC-5/AC-7 process changes. Follow-up fix (this pass, per AGENTS.md §6.1): reset_domain_fixture() now resolves BP-UAT-001.json's member_email hint to a real Directus user id (new directus_user_pk_by_email() helper in live mode; sibling-identity-fixture lookup in mock mode) and sets it onto member_consents.member before POST, failing loudly via the existing fail() idiom on an unresolvable email — closes the only known functional gap from the prior pass. bash -n clean; full existing bats suite green (29/29 non-skipped, re-run after this fix with no regressions); all self-validation traces (reset paths, guard trip, unknown id, regression diff, plus a new deliberately-unresolvable-email trace) behave as specified."
  findings:
    - "business-analyst.md required editing two tables, not one, to fully satisfy AC-5: the Step 1 process checklist (2-column, Check | Pass condition) and the 01-uat-script-validation.md output-file-format table (3-column, Check | Result | Notes) where PASS/FAIL/N/A values are actually recorded per validation run. Both now carry the manifest-drift row."
    - "event_types.format value for the uat-event-draft-uz fixture was not specified in BP-UAT-001.md's doc table; chose 'meetup' (the first seeded event_type in bootstrap.sh) as a verifiably-valid default rather than inventing an unlisted value."
    - "No bats tests authored in this step, per task scope — TestDesigner owns that next. All manual self-validation traces this summary documents (including the new member_email resolution paths — success and deliberate-failure) are handed off as a proven baseline for encoding into scripts/tests/uat-seed.bats."
    - "member_consents.member and operator_invites.authentik_user_id are confirmed-distinct id spaces (Directus user uuid vs. Authentik numeric pk) by direct inspection of infrastructure/directus/bootstrap.sh's relation declarations and apps/api/src/modules/directus/directus-users-bridge.service.ts — flagging this for TestDesigner/reviewers since the two email-resolution helpers (user_pk_by_email vs. the new directus_user_pk_by_email) look similar but must not be interchanged."
```
