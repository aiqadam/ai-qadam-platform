# ISS-UAT-010-1 — BP-UAT-010's own AC wording (status/points) and its Playwright spec target a different implementation than the real one

| Field | Value |
|---|---|
| ID | ISS-UAT-010-1 |
| Severity | minor (doc/test-design — no product defect) |
| Module | uat/test-design |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-169 |
| Reporter | Orchestrator (`wf-20260730-fix-157`, Step 2 impact analysis for ISS-UAT-SEED-003) |
| Related | ISS-UAT-SEED-003, BP-UAT-010, FR-EVT-004 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/162 |

## Symptom

While authoring `scripts/uat-fixtures/BP-UAT-010.json` for ISS-UAT-SEED-003,
a source-verification pass (registrations controller/service, Directus
bootstrap schema, Directus Flows, web-next fetch/consume path) found that
`docs/02-business-processes/uat/BP-UAT-010.md`'s own AC wording, and
`apps/e2e/tests/uat/BP-UAT-010.spec.ts`, both describe a different
implementation than what actually exists in `apps/api` + `apps/web-next`
today:

1. **AC-1 / AC-6 wrong status values.** The doc says a registration is
   created with `status=confirmed`, and a full event produces a
   `waitlist` registration. The real Directus schema
   (`infrastructure/directus/bootstrap.sh:484`) and
   `RegistrationsDirectusService`
   (`apps/api/src/modules/registrations/registrations-directus.service.ts:21`)
   both use `registered` / `waitlisted` — `confirmed`/`waitlist` do not
   exist as values anywhere in the real system.
2. **AC-7 wrong points mechanism.** The doc says "+5 points are awarded on
   confirmed registration." No code path awards points at registration
   time anywhere in `apps/api`. Points are awarded only at check-in via
   the `reg-checkin-points` Directus Flow
   (`infrastructure/directus/flows-bootstrap.sh:625-702`), and the amount
   is **+10**, not +5 (`flows-bootstrap.sh:673-677`). A separate +25
   referral bonus also exists, also check-in-only
   (`registrations-directus.service.ts:561-620`). There is no
   registration-time points award of any amount.
3. **The spec targets the wrong app + wrong endpoints.**
   `apps/e2e/tests/uat/BP-UAT-010.spec.ts` targets `apps/web` (V1) and
   asserts against `POST /v1/registrations` (waits for HTTP 201) and `GET
   /v1/points/me` — neither endpoint exists anywhere in `apps/api/src`.
   The real endpoint is `POST /v1/events/:eventId/register`, returning
   `200 OK` (`registrations.controller.ts:63-64`, explicit
   `@HttpCode(HttpStatus.OK)`), and there is no points-query endpoint at
   all (only `GET /v1/leaderboard`). FR-EVT-004 (shipped, PR #150)
   rebuilt the registration UI surface in `apps/web-next` (V2) as
   `RegistrationCTA.tsx` + `useRegisterForEvent()`/
   `useMyRegistrationStatus()` hooks
   (`apps/web-next/src/lib/use-registrations.ts`) — the spec never
   updated to target this surface.

## Root cause

`docs/03-requirements/FR-REG-001.md` (the doc BP-UAT-010 cites as its
`process_ref`) is a `Phase 1 (V1)` spec describing legacy behavior
(`qr_token`, Twenty CRM activity logging, `status=confirmed`, `+5 points`)
that the current Directus-backed `apps/api` implementation has since
superseded (see the ADR-0033 CRM-removal note in `flows-bootstrap.sh:46-51`
and the explicit "Directus flows own capacity/waitlist/points" comment in
`registrations.controller.ts:27-29`). BP-UAT-010.md and its Playwright spec
were both authored against the stale V1 spec and never updated when the
real implementation diverged, nor when FR-EVT-004 moved the registration UI
to `apps/web-next`.

## Impact

- Not a product defect — `apps/api`'s real registration/waitlist/points
  behavior is correct and independently tested (FR-EVT-004's own
  1004/1004 unit tests, live E2E, security review).
- Blocks a *clean* live UAT pass of BP-UAT-010 as literally worded: a
  correctly-behaving system will produce `registered`/`waitlisted` rows
  and only award points on check-in, which is a `MISMATCH` against the
  doc's own AC-1/AC-6/AC-7 text — not because anything is broken, but
  because the doc's wording is wrong.
- `scripts/uat-fixtures/BP-UAT-010.json` (authored in `wf-20260730-fix-157`
  / ISS-UAT-SEED-003) intentionally uses the CORRECT real field values
  (`registered`/`waitlisted`, a fixed check-in-sourced points baseline row
  rather than a registration-time delta assumption) — so the seed fixture
  itself is fine, but any UAT run that literally checks the doc's current
  AC-1/AC-6/AC-7 wording against that fixture will report false
  mismatches.

## Acceptance criteria

- [ ] AC-1: `docs/02-business-processes/uat/BP-UAT-010.md`'s AC-1 rewritten
      to state `status=registered` (not `confirmed`).
- [ ] AC-2: AC-6 rewritten to state a `waitlisted` registration (not
      `waitlist`).
- [ ] AC-3: AC-7 rewritten to match the real points mechanism — either (a)
      redefine AC-7 around check-in (+10 points via `reg-checkin-points`)
      instead of registration, or (b) if product intent is genuinely "+5
      on registration should exist," escalate that as a product/requirement
      decision (new FR) rather than silently editing the AC to match
      code — this workflow should not assume which direction is correct
      without a design decision.
- [ ] AC-4: `apps/e2e/tests/uat/BP-UAT-010.spec.ts` rewritten to target
      `apps/web-next`'s real `RegistrationCTA`/`use-registrations.ts`
      surface, `POST /v1/events/:eventId/register` (200, not 201), and
      drop the nonexistent `/v1/points/me` assertion.
- [ ] AC-5: A live `uat-verification` run against BP-UAT-010 (using the
      `scripts/uat-fixtures/BP-UAT-010.json` manifest from
      ISS-UAT-SEED-003) produces a genuine MATCH/MISMATCH verdict for
      every AC, with no doc-wording-caused false mismatches.

## Resolution

**Workflow:** wf-20260731-fix-169
**PR:** https://github.com/aiqadam/ai-qadam-platform/pull/189
**Root cause:** `BP-UAT-010.md` and `BP-UAT-010.spec.ts` were both authored
against `FR-REG-001.md`, a superseded Phase-1/V1 spec, and never updated
when the real Directus-backed `apps/api` implementation diverged (nor when
FR-EVT-004 moved the registration UI to `apps/web-next`).
**Fix:** Rewrote `BP-UAT-010.md`'s AC-1/AC-6/AC-7 wording, Steps
003/004/006, Negative-002/003, and Notes to match the real system
(`status=registered`/`waitlisted`, +10 points on check-in only, no QR code
in the current UI). Rewrote `BP-UAT-010.spec.ts` to target the real
`apps/web-next` surface (`RegistrationCTA`, `POST /v1/events/:eventId/register`
→ 200) and drop the nonexistent `/v1/points/me` assertion. AC-3's product
decision (this issue's own AC-3) resolved by redefining AC-7 around the
real check-in mechanism rather than escalating "+5 on registration" as a
missing feature — no evidence anywhere (FR docs, ADRs, code comments) that
a registration-time points award was ever an intended, unbuilt feature;
the current architecture's own code comment
(`registrations.controller.ts:27-29`) explicitly assigns points ownership
to check-in-time Directus flows. Full reasoning in this workflow's
`02-impact-analysis.md`.
**Regression test:** N/A in the traditional sense — this issue's fix IS the
test file. The OLD spec asserted against nonexistent routes
(`POST /v1/registrations` expecting 201, `GET /v1/points/me`) that could
never pass against the real stack; the NEW spec is live-verified passing
6/6 against the real local stack (see below), with both status-sensitive
ACs (AC-1, AC-6) independently cross-referenced against the actual
Directus row, not just DOM text.
**Merged:** <pending>

**Live verification (2026-07-31, this workflow):**
```
6 passed (31.6s) — BP-UAT-010.spec.ts full suite
Directus cross-reference: status=registered (open event), status=waitlisted (full event)
```
Two pre-existing environment quirks hit and worked around (both already
documented in prior BP-UAT-010 workflow history, not new): `uat-member`'s
Authentik password drifting from the seed script's claimed default despite
`--reset` (fixed via direct `set_password` API call), and this session's
own initial wrong assumption of `API_URL :3001` (corrected to the real
`:3000`, matching every sibling spec and `apps/e2e/.env`).
