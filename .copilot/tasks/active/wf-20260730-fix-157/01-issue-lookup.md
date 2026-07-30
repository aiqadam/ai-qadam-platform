# Step 1 — Issue Lookup

**Workflow:** wf-20260730-fix-157
**Target issue:** ISS-UAT-SEED-003 (`.copilot/issues/ISS-UAT-SEED-003.md`)
**GitHub issue:** [#152](https://github.com/aiqadam/ai-qadam-platform/issues/152) — already linked, already registered in `registry.md` (row confirmed present, `open`, `wf-20260730-uat-156` discovery-only).

This issue already exists locally with a full AC-driven Resolution stub (filed by
BusinessAnalyst during `wf-20260730-uat-156`). No new file needed — this workflow
picks it up as-is. `Business-Process` is already set to `BP-UAT-010` in the header
table; mirrored into `handoff.yaml.business_process`.

## Scope confirmation (pre-implementation research)

Before writing any code, ran a source-verification pass (registrations
controller/service, Directus bootstrap schema, Directus Flows, web-next
fetch/consume path) to confirm exactly what field values / behavior the
fixture manifest needs to match. Findings, all independently confirmed
against source (file:line citations in the research transcript, summarized
here):

- `POST /v1/events/:eventId/register` is the real endpoint
  (`apps/api/src/modules/registrations/registrations.controller.ts:63`).
- Real registration status values are `registered` / `waitlisted` (Directus
  schema default + enum, `infrastructure/directus/bootstrap.sh:484`) — NOT
  `confirmed` / `waitlist` as BP-UAT-010.md's own AC-1/AC-6 wording claims.
- Capacity enforcement is a Directus Flow (`reg-capacity-decision`,
  `infrastructure/directus/flows-bootstrap.sh:168-405`) that live-counts
  `registrations` rows with `status='registered'` against `events.capacity`
  — there is no stored `confirmed_count` field.
- Points are NOT awarded at registration time anywhere in the codebase.
  They are awarded only at check-in (`reg-checkin-points` Flow,
  `flows-bootstrap.sh:625-702`, **+10** points, not +5) — BP-UAT-010.md's
  AC-7 ("+5 points... on confirmed registration") does not match any real
  code path.
- `apps/web-next/src/lib/cms.ts`'s `fetchEvent()` always passes
  `registeredCount=0` to the page (never queries live registrations), so a
  fixture seeding "2 pre-existing confirmed registrations" on
  `uat-event-full-uz` will NOT make the UI render a waitlist state on a
  fresh page load — a real, separate rendering bug.
- `events.status` (draft/published/cancelled) is the correct "is this event
  live" field, confirmed against both `cms.ts:348` and
  `registrations-directus.service.ts:656`. `visibility_scope` is a
  different, orthogonal field (public/members_only/invite_only) — default
  `public` is correct for these fixtures.

## Scope decision (recorded per AGENTS.md §13 — user consulted, not silently assumed)

ISS-UAT-SEED-003's own ACs (AC-1..AC-4, see the issue file) only ask for:
manifest authored, `uat-seed.sh` extended idempotently, the
`uat-member@aiqadam.test` vs `uat-member@example.com` email mismatch
reconciled, and a live `--reset` run completing end-to-end so all 7
BP-UAT-010 ACs get a real MATCH/MISMATCH verdict. They do **not** ask this
workflow to rewrite BP-UAT-010.md's own wrong status/points wording or fix
the `registeredCount=0` rendering gap in `cms.ts` — both real findings from
the research pass above, but out of this issue's stated AC scope and each
independently large enough to be their own fix (the `cms.ts` gap is
app-code affecting a rendered page, not seed tooling).

Presented this fork to the user directly (research surfaces problems beyond
the ticket's stated scope — this is exactly the case AGENTS.md §13 calls
for surfacing rather than silently picking a scope). **User selected:**
resolve ISS-UAT-SEED-003 exactly as scoped, using the CORRECT real field
values (`registered`/`waitlisted`, check-in-based points) in the new
fixture manifest and seed script rather than the wrong values BP-UAT-010.md
currently states — and file separate follow-up issues for (a) BP-UAT-010.md's
wrong AC wording and (b) the `registeredCount=0` gap. This keeps the PR
small (AGENTS.md §4) and matches the issue's own AC boundary.

This means: AC-4 ("all 7 ACs get a real MATCH/MISMATCH verdict") will
produce **MISMATCH** verdicts for AC-1/AC-6/AC-7 as literally worded in
BP-UAT-010.md today, against the fixture this workflow builds — because
the doc's wording is itself wrong, not because the fixture or the product
is broken. This is not a new regression; it is exactly the finding that
motivates the two follow-up issues. The live verification (Step 13 /
post-merge UAT) will record this explicitly rather than silently reporting
a clean pass or silently rewriting BP-UAT-010.md's ACs out of scope.

## Gate Result

gate_result:
  status: passed
  summary: "ISS-UAT-SEED-003 confirmed open, GitHub-linked (#152), Business-Process=BP-UAT-010; scope narrowed to the issue's own 4 ACs per user decision, with 2 follow-up issues to be filed for out-of-scope findings."
  findings:
    - "Issue already exists locally with full AC/Resolution scaffolding from wf-20260730-uat-156 — no new file created."
    - "Registry.md row confirmed present and accurate (open, wf-20260730-uat-156, 2026-07-30)."
    - "Real field values (registered/waitlisted, check-in-based points) will be used in the new fixture, diverging intentionally from BP-UAT-010.md's own current (wrong) wording — tracked as a named follow-up, not silently fixed or silently ignored."
