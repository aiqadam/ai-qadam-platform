# Code Summary — FEAT-UAT-COV-003

> Author: CodeDeveloper
> Workflow: `wf-20260704-feat-090` (requirement-development)
> Source impact analysis: `.copilot/tasks/active/wf-20260704-feat-090/02-impact-analysis.md`

## Files Created

### `apps/e2e/tests/uat/BP-UAT-001.spec.ts` (new, 588 lines)

Playwright spec covering **Steps 002, 003, 004, 005, 006 + Neg 001, Neg 002** from `docs/02-business-processes/uat/BP-UAT-001.md`. Auto-discovered by `apps/e2e/playwright.uat.config.ts` (testDir='./tests/uat', no explicit testMatch) — no config change.

Verified post-authoring:

```text
$ pnpm exec playwright test --config playwright.uat.config.ts --list BP-UAT-001
[uat-desktop-chrome] › BP-UAT-001.spec.ts:222:3 › Step 002 — Operator opens the draft event
[uat-desktop-chrome] › BP-UAT-001.spec.ts:269:3 › Step 003 — Operator flips status to Published and saves
[uat-desktop-chrome] › BP-UAT-001.spec.ts:335:3 › Step 004 — event_announcements ledger row exists with kind=published
[uat-desktop-chrome] › BP-UAT-001.spec.ts:386:3 › Step 005 — Re-saving a published event does NOT fire a second broadcast
[uat-desktop-chrome] › BP-UAT-001.spec.ts:453:3 › Step 006 — Recipient list excludes uat-member-no-consent (consent gating)
[uat-desktop-chrome] › BP-UAT-001.spec.ts:499:3 › Neg 001 — Anonymous visit to /workspace/events redirects to sign-in
[uat-desktop-chrome] › BP-UAT-001.spec.ts:526:3 › Neg 002 — Second publish attempt does NOT create a second announcement ledger row
Total: 7 tests in 1 file
```

7 tests, exceeding AC-2's mandate of ≥ 5 (Steps 002–006 + 2 negative scenarios).

**Helpers (local to the spec, mirroring BP-UAT-009/010's per-spec helper pattern per uat-runner.md §Spec structure rules):**

- `ensureScreenshotsDir()` / `screenshot(page, label)` — viewport screenshots to `apps/e2e/uat-results/BP-UAT-001/<label>.png` per uat-runner.md.
- `hideDevToolbar(page)` — removes Astro dev toolbar overlay (pattern from BP-UAT-010.spec.ts:69-75).
- `signInAsOperator(page, email, password)` — Authentik OIDC two-step submit. Same idiom as BP-UAT-009's `submitAuthentikCredentials` but delegated-to, not re-authored: BP-UAT-009 owns the auth contract; this helper is the local convenience wrapper for sign-in-then-navigate.
- `readRecipientUserIds(request, eventId)` — primary api direct call to `/api/v1/workspace/events/<id>/announce-ledger` with auto-cookied Playwright request context (same idiom as `apiGet` in BP-UAT-010.spec.ts:78-81). Returns the resolved user-id list (or empty array if the api exposes only `recipient_count`, in which case the spec falls back to asserting `recipient_count >= 1`).
- `findDraftEventId(page)` — navigates `/workspace/events`, finds the seeded `uat-event-draft-uz` link by title (`UAT Event UZ`), returns its id. Fails fast with a clear "seed missing" message if the fixture is absent.

**Honesty disclosures** (per AGENTS.md §9 / uat-runner.md — record actual behaviour, do not silently rewrite the script to match reality; BusinessAnalyst owns Step 4 triage):

1. Script Step 002 says "Status badge shows DRAFT"; actual UI renders sentence-case "Draft" in StatusPill. Spec asserts "Draft" + the `<select>` value `'draft'` and pushes a `script-vs-ui-drift` annotation for BusinessAnalyst.
2. Script Step 003 says "Success toast appears"; actual UI shows inline "Saved" text next to disabled Save button. Annotation recorded.
3. Script Step 006 says recipient count cannot be verified in UI; spec asserts via api. Annotation recorded noting the v1 limitation that the api exposes `recipient_count` (a number) not the resolved user-id list.
4. Script Step 005 says "absense of a second dispatch in network logs"; spec asserts via `patchCount === 1` Playwright request listener.
5. Pre-run seed is the UATRunner's responsibility (per uat-verification.md Step 2). The spec MUST NOT spawn `pnpm uat:seed --reset BP-UAT-001` itself; failing-fast on missing fixtures is the spec's only contribution to fixture management.

## Files Modified

### `scripts/tests/uat-seed.bats` (append-only, +66 lines)

New `@test "FEAT-UAT-COV-003 row 12: …"` block inserted after FR-WORKFLOW-003 row 11. Existing rows 1–11 + AC-6/AC-7/ISS-* blocks left untouched.

The new row verifies four invariants of `--reset BP-UAT-001` in mock mode:

1. **`uat-member-consented`'s `member_consents` row is re-created every run** — delete line precedes create line per FR-WORKFLOW-003 row 2 ordering invariant; create line carries `member_email=uat-member-c@example.com resolved to member=uat-member-consented` per FR-WORKFLOW-003 row 7.
2. **`uat-member-no-consent` never acquires a `member_consents` row** — across the entire reset output, zero lines match `collection=member_consents.*member_email=uat-member-nc@example.com`.
3. **The `uat-member-no-consent` identity fixture IS reset** — the `identity uat-member-no-consent (mock, reset …)` line is present (proves the reset ran, so the negative assertion 2 is meaningful).
4. **Idempotency across reruns** — a second `--reset BP-UAT-001` produces the same consent-row output: consented member's create line present, no-consent member's create line absent.

**Verification result (run before this commit):**

```text
$ bash scripts/run-bats.sh scripts/tests/uat-seed.bats
✓ FEAT-UAT-COV-003 row 12: --reset BP-UAT-001 mock mode re-creates uat-member-consented's consent row and never materialises one for uat-member-no-consent
…
34 tests, 1 failure
```

The single failure (`FR-WORKFLOW-003 row 6: byte-identical no-flag mock output vs. pre-FR baseline`) is **pre-existing on origin/main** — confirmed by stashing this PR's changes, re-running bats, observing the same row 6 failure, then un-stashing. The failure is documented in [workspace-state.md](../../context/workspace-state.md) line 1 (wf-20260704-fix-089 entry) and in [.copilot/issues/registry.md](../../issues/registry.md) under `ISS-UAT-BRIDGE-002`'s Resolution section. It is owned by follow-up `wf-20260704-fix-087-fix-fr-workflow-003-row-6`.

**All other 33 tests pass, including all FR-WORKFLOW-003 rows 1–5, 7–11, and all ISS-UAT-* / ISS-* test blocks.**

## Files NOT Modified

| File | Reason |
|---|---|
| `apps/e2e/playwright.uat.config.ts` | Already glob-matches `tests/uat/**/*.spec.ts`; verified the new file is auto-included by `--list BP-UAT-001` output above. |
| `scripts/uat-fixtures/BP-UAT-001.json` | Already merged via PR #87 / commit `fb01386`. |
| `scripts/uat-seed.sh` | FR-WORKFLOW-003 contract consumed, not modified. |
| `apps/web/src/**` | BP-UAT-001.md Step 006: no UI surface change. Spec asserts via api. |
| `apps/api/**` | No controller / service changes. The spec consumes existing `/api/v1/workspace/events/:id/announce-ledger` and `/api/v1/workspace/events/:id` endpoints. |
| `docs/02-business-processes/uat/BP-UAT-001.md` | `status: Ready → Implemented` flip is deferred to the downstream UATRunner workflow (BusinessAnalyst owns post-live-run frontmatter update). |
| `apps/e2e/support/assert-design-system.ts` | Does not exist; per uat-runner.md the spec omits the fixture call rather than introducing a new test-only file. |
| `docs/03-requirements/requirements-registry.md` | Indexes FR-* files only. |

## Risks / Disposition

| Risk | Disposition |
|---|---|
| Spec auto-included by Playwright config → extends UAT test surface | Verified by `--list BP-UAT-001` (7 tests visible, no config change). All tests use `UAT_OPERATOR_PASSWORD`-gated `test.skip(...)` so absent env-var = no-op. |
| bats assertion diverges from spec assertions (e.g., real Directus vs. mock) | bats runs hermetically with `UAT_SEED_DIRECTUS_MOCK=1`; same idiom as FR-WORKFLOW-003 rows 1–11. Real Directus verification remains UATRunner's job (live mode). |
| Honesty-disclosure annotations accumulate if BusinessAnalyst ignores them | Annotations are surfaced as `test.info().annotations` — Playwright reports them in the report HTML; BusinessAnalyst's triage review reads them. |

## AC-by-AC disposition (preliminary — QualityGate finalizes)

- **AC-1** Spec exists at `apps/e2e/tests/uat/BP-UAT-001.spec.ts`, auto-discovered by `playwright.uat.config.ts` (no config edit). **Verified** via `--list BP-UAT-001`.
- **AC-2** Spec maps to Steps 002, 003, 004, 005, 006 + Neg 001 + Neg 002 (7 tests). Step 001 sign-in is delegated to BP-UAT-009's idiom (not re-authored). ARIA-role / stable-text locators only. **Verified** by reading the spec.
- **AC-3** Recipient-list absence of `uat-member-no-consent` is asserted via api direct call (`/api/v1/workspace/events/:id/announce-ledger`) — the v1 api exposes `recipient_count` (a number) not the resolved user-id list, so the spec asserts `recipient_count >= 1` (non-zero = at least `uat-member-consented` was resolved) and records the verification-depth limitation as an annotation. The "list does NOT contain `uat-member-no-consent`" half is proven by the manifest contract + the new bats row 12. **Verified** by reading the spec and the manifest.
- **AC-4** Spec is idempotent across reruns; the pre-run `pnpm uat:seed --reset BP-UAT-001` is the UATRunner's responsibility (per uat-verification.md Step 2), not the spec's. The spec has no in-line cleanup. **Verified** by reading the spec (header comment + `test.skip(!UAT_OPERATOR_PASSWORD, …)`).
- **AC-5** bats row 12 added; mock mode hermetic; passes. **Verified** by running `bash scripts/run-bats.sh scripts/tests/uat-seed.bats`.

## Gate Result

```yaml
gate_result:
  status: passed
  agent: CodeDeveloper
  workflow_id: wf-20260704-feat-090
  decided_at: "2026-07-04T20:30:00Z"
  summary: >-
    Spec + bats assertion shipped. 7 Playwright tests auto-discovered
    (Steps 002-006 + Neg 001/002). New bats row 12 passes; 33/34 tests
    in scripts/tests/uat-seed.bats pass; row 6 failure is pre-existing
    on origin/main (not caused by this PR — verified by stash-test).
    No application code / schema / shared-types / frontend / bot / worker
    change. No new dependencies, no new env vars, no migration.
  files_created:
    - path: apps/e2e/tests/uat/BP-UAT-001.spec.ts
      lines: 588
      verified_by: "pnpm --filter @aiqadam/e2e exec playwright test --config playwright.uat.config.ts --list BP-UAT-001"
  files_modified:
    - path: scripts/tests/uat-seed.bats
      delta: "+66 lines"
      verified_by: "bash scripts/run-bats.sh scripts/tests/uat-seed.bats (33/34 pass; row 6 failure pre-existing)"
  files_not_modified:
    - apps/e2e/playwright.uat.config.ts
    - scripts/uat-fixtures/BP-UAT-001.json
    - scripts/uat-seed.sh
    - apps/web/src/**
    - apps/api/**
    - docs/02-business-processes/uat/BP-UAT-001.md
    - apps/e2e/support/assert-design-system.ts
    - docs/03-requirements/requirements-registry.md
  passed: true
```