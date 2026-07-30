# Step 2 — Impact Analysis

**Workflow:** wf-20260730-fix-157
**Issue:** ISS-UAT-SEED-003

## Scope (per Step 1's recorded user decision)

In scope — the issue's own 4 ACs, no more:

1. AC-1: author `scripts/uat-fixtures/BP-UAT-010.json` declaring
   `uat-event-open-uz`, `uat-event-full-uz`, and a points-baseline
   mechanism for `uat-member`.
2. AC-2: extend `scripts/uat-seed.sh` so `--reset BP-UAT-010` (and
   `--reset all`) create these fixtures idempotently, following the
   existing `reset_domain_fixture()` / `reset_identity_fixture()` machinery
   — no new bespoke code path needed, this is the same generic manifest
   interpreter every other BP-UAT already uses.
3. AC-3: reconcile the `uat-member@aiqadam.test` vs `uat-member@example.com`
   mismatch.
4. AC-4: a live `--reset BP-UAT-010` run against the local stack completes
   end-to-end (Directus writes succeed) — this workflow verifies the seed
   mechanics run cleanly; it does NOT rewrite BP-UAT-010.md's own AC
   wording or `apps/e2e/tests/uat/BP-UAT-010.spec.ts`'s assertions (those
   are a different, larger, out-of-scope fix — see "Deferred" below).

Out of scope (deferred to 2 new follow-up issues, filed in Step 4):

- BP-UAT-010.md's AC-1/AC-6/AC-7 wording uses wrong field values
  (`confirmed`/`waitlist`, "+5 points on registration") that don't match
  any real code path (real values: `registered`/`waitlisted`, no
  registration-time points at all — only +10 on check-in). Rewriting the
  doc's ACs and Steps section is a content decision belonging to whoever
  owns BP-UAT-010, not a seed-fixture-authoring task.
- `apps/web-next/src/lib/cms.ts`'s `fetchEvent()` hardcodes
  `registeredCount=0` on every page load (never queries live
  `registrations`), so a "2 pre-existing registrations" fixture on
  `uat-event-full-uz` will not visually render as full/waitlisted on a
  fresh page load. This is an app-code bug in the event-detail page, not
  a seed-fixture problem — fixing it means editing `cms.ts` and its
  callers, unrelated to `scripts/uat-seed.sh`.
- `apps/e2e/tests/uat/BP-UAT-010.spec.ts` targets `apps/web` (V1) via
  fictional endpoints (`/v1/registrations`, `/v1/points/me` — neither
  exists; the real route is `POST /v1/events/:id/register`, no points
  endpoint exists at all) and V1-only copy ("You're registered ✓").
  FR-EVT-004 rebuilt the registration surface in `apps/web-next` (V2)
  using `RegistrationCTA.tsx` + `useRegisterForEvent()/useMyRegistrationStatus()`
  hooks. This spec is stale/orphaned relative to the actual V2
  implementation and needs its own rewrite — well beyond fixing a seed
  manifest. Recorded as a finding for the same follow-up issue that covers
  BP-UAT-010.md's wrong ACs (both are "the doc/spec layer never caught up
  to the real V2 implementation").

## Affected files (this workflow)

| File | Change | Risk |
|---|---|---|
| `scripts/uat-fixtures/BP-UAT-010.json` (new) | New manifest: 1 identity fixture (`uat-member`, reused/renamed from the existing unconditional `uat-member@example.com` seed user — no new Authentik user needed), 2 domain fixtures (`events` rows `uat-event-open-uz`/`uat-event-full-uz`), 2 domain fixtures (`registrations` rows filling `uat-event-full-uz` to capacity so the manifest's own declared precondition — "2 pre-existing confirmed registrations" — is real data, even though the live UI won't currently show it per the cms.ts gap above), 1 domain fixture (`point_awards`, so a `--reset` gives a **reproducible **baseline row, sidestepping the "AC-7 assumes register grants points" doc bug by not depending on it — the baseline is just a fixed row, not a delta-from-zero assumption). | Low — purely additive manifest, no existing collection/schema touched. |
| `scripts/uat-seed.sh` | Two additions: (a) `reset_domain_fixture()` must support the `registrations` collection needing to resolve an FK-by-email hint for its `user` field, the same way it already does for `member_consents.member` via `member_email` (see existing `resolve_member_email`-adjacent logic in `reset_domain_fixture()`, lines ~756-810) — **reuse, not new logic**, since `registrations.user` is a uuid FK to `directus_users.id` exactly like `member_consents.member`; (b) no changes needed to the unconditional STEP 1-4 flow — BP-UAT-010's fixtures are `--reset`-only, following the exact precedent BP-UAT-001/013/020 already established (this repo's convention is that not every BP-UAT's fixtures need to exist in the unconditional path). | Low-medium — extending an existing generic helper (`reset_domain_fixture`) to resolve one more FK-by-email case is the same pattern already proven for `member_consents.member`; must not regress BP-UAT-001/013/020's own `--reset` behavior (regression test required, Step 6/7). |
| `scripts/uat-seed.sh` (email) | `MEMBER_EMAIL` default is already `uat-member@example.com` (line 992) and every other manifest already uses `@example.com`. The mismatch is entirely in docs/tests, not in the seed script itself. | None to the script; see doc/test row below. |
| `docs/02-business-processes/uat/BP-UAT-010.md` | AC-3 (email reconciliation): update the "Seed Fixtures Required" table + Steps 002/006's example emails from `uat-member@aiqadam.test` to `uat-member@example.com`, matching the repo-wide `@example.com` convention (`ISS-UAT-BRIDGE-002`'s prior migration) and the real seeded identity. **Narrow, mechanical string fix only** — the wrong-status/wrong-points wording elsewhere in the same file is explicitly NOT touched this workflow (see Deferred above); a future doc-writer needs a design decision, not a find-and-replace. | Low — same file already needs an edit for AC-3; scoping the edit narrowly avoids scope creep into the deferred item. |
| `apps/e2e/tests/uat/BP-UAT-010.spec.ts` | Same email-domain constant (`UAT_MEMBER_EMAIL` default, line 66) updated for consistency with the doc fix — mechanical only, the spec's deeper issues (V1 targeting, fictional endpoints) are explicitly deferred. | Low — one-line default-value change; the spec is already gated behind `UAT_MEMBER_PASSWORD` being set and is not part of this workflow's regression-test gate. |
| `.copilot/issues/ISS-UAT-SEED-003.md`, `.copilot/issues/registry.md` | Step 9 atomic status flip. | None — bookkeeping. |
| 2 new issue files (BP-UAT-010.md wrong ACs; cms.ts registeredCount=0 gap) | New, filed per §14/AGENTS.md precedent (BusinessAnalyst/Orchestrator may register issues found live). | None — additive. |

## No DB migration needed

This entire change is Directus REST-layer (schema already exists —
`events`, `registrations`, `point_awards` collections and their fields are
already provisioned by `infrastructure/directus/bootstrap.sh`). No new
column, no new collection. Step 3 (DB migrations) is skipped.

## No NestJS/apps/api code touched

Confirmed via the research pass in Step 1 — the real `POST
/v1/events/:eventId/register` endpoint, the Directus Flows enforcing
capacity/waitlist/points, and `events`/`registrations`/`point_awards`
schemas are all already correct and unaffected by this change. This
workflow only adds test-fixture data through the existing Directus REST
API, the same way every prior BP-UAT manifest does.

## Gate Result

gate_result:
  status: passed
  summary: "Scoped to 5 small file changes (1 new manifest, uat-seed.sh's existing reset_domain_fixture generalized for one more FK-by-email case, 2 narrow email-domain string fixes, issue registry). No DB migration, no apps/api code change. 2 out-of-scope findings deferred to new follow-up issues."
  findings:
    - "registrations.user FK-by-email resolution reuses the exact pattern already proven for member_consents.member — low risk, no new helper needed."
    - "BP-UAT-010.md's wrong status/points ACs and BP-UAT-010.spec.ts's V1/fictional-endpoint targeting are both real, but deferred per the user's Step-1 scope decision — not silently dropped, tracked as 2 new issues in Step 4."
    - "5 files touched, well under the 400-line/5-file PR guideline for the in-scope work; the two deferred findings are not counted against this PR's line budget."
