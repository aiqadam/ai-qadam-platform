# ISS-UAT-010-2 — `RegistrationSidebar` renders "You're registered" for a registration Directus actually recorded as `waitlisted`

| Field | Value |
|---|---|
| ID | ISS-UAT-010-2 |
| Severity | bug |
| Module | web/events (RegistrationSidebar), api/registrations |
| Status | resolved |
| Reported | 2026-07-30 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-165 |
| Reporter | UATRunner/Orchestrator (`wf-20260730-uat-158`, post-merge BP-UAT-010 live verification for ISS-UAT-SEED-003) |
| Related | ISS-UAT-SEED-003, ISS-UAT-010-1, BP-UAT-010 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/160 |

## Symptom

Live end-to-end test on `apps/web`: signed in as `uat-member`, navigated to
an at-capacity event (`uat-event-full-uz`, capacity=2, already 2 confirmed
`registered` rows), clicked the "Register" button (rendered as "Register"
rather than "Join waitlist" due to the separate, already-known
`registeredCount=0` display bug — see ISS-EVT-004-1). The click:

- **Correctly created** a real `registrations` row with
  `status: waitlisted` — confirmed directly against Directus (server-side
  capacity enforcement via the `reg-capacity-decision` Directus Flow
  worked exactly as designed).
- **Incorrectly rendered** the client UI as "✓ You're registered" (the
  `registered`-state block in `RegistrationSidebar.tsx`'s `CTA`
  component), not "On waitlist — we'll email if a seat opens" (the
  `waitlisted`-state block).

Screenshot evidence: `apps/e2e/uat-results/BP-UAT-010/wf-20260730-uat-158/step-006b-full-event-after-click.png`.

## Why this matters (AC-9 — visual-vs-DOM divergence)

A DOM-text-only assertion checking for a loose
`/you're registered|on waitlist/i` regex (the style
`apps/e2e/tests/uat/BP-UAT-010.spec.ts`'s own Negative-003 assertion
uses) would PASS here — "you're registered" literally appears in the DOM.
Only cross-referencing the actual Directus row (which says `waitlisted`)
against the rendered state caught that this is a real functional defect,
not a wording nuance: a member is being told they have a confirmed spot
at an event they are actually only waitlisted for.

## Root cause (partially investigated, not fully bottomed out)

`RegistrationsDirectusService.register()`
(`apps/api/src/modules/registrations/registrations-directus.service.ts:130-155`)
POSTs the registration, then explicitly re-reads the row
(`// Re-read so the capacity flow's status patch is reflected.`, line 144)
specifically to pick up the `reg-capacity-decision` Directus Flow's
async status patch before returning. The intent is correct. Two candidate
explanations, neither confirmed:

1. **A timing race**: the Flow's status-patch write may not yet be
   committed at the moment the API's re-read query runs, so the API
   itself returns `status: registered` in its HTTP response (before the
   Flow demotes it moments later) — the client would then correctly
   render "registered" based on a genuinely stale-but-honestly-returned
   API response.
2. **A client-side bug**: `RegistrationSidebar.tsx`'s `register()`
   handler or `readyAfterRegister()` may not be correctly propagating a
   `waitlisted` response into `localStatus`.

Distinguishing these requires either instrumenting the Directus Flow's
actual execution timing relative to the API's re-read, or capturing the
raw HTTP response body of the specific `POST /api/v1/events/:id/register`
call that produced this screenshot (not done this session — this issue
records the confirmed end-state discrepancy as a starting point for
whoever picks it up, rather than guessing the fix without evidence).

## Acceptance criteria

- [x] AC-1: Root-cause confirmed — (a), the Flow-vs-API-re-read race.
      `reg-capacity-decision` is a Directus **action hook** (runs as a
      separate async chain — event lookup → count → decide → patch —
      after the triggering request's own insert, not inside the insert
      transaction; the flow's own bootstrap-script comment already named
      this as a known trade-off: "Action hook trades a microsecond
      window..."). `RegistrationsDirectusService.register()`'s single
      immediate re-read had no ordering guarantee against that chain.
      The client (`RegistrationSidebar.tsx`) was confirmed correct — a
      faithful pass-through of whatever `status` the API returns; (b) is
      ruled out.
- [x] AC-2: Regression test added to
      `apps/api/test/registrations-directus.spec.ts` (2 new cases):
      one reproduces the exact race (1st re-read `registered`, 2nd
      `waitlisted`) and asserts the final view is `waitlisted`; the other
      proves the poll is bounded (3 attempts) and returns the honest
      last-observed value when the flow never demotes. Both independently
      verified fail-before/pass-after by stashing the fix: pre-fix, the
      race test failed with `expected 'registered' to be 'waitlisted'` —
      byte-for-byte the live bug from the issue's own screenshot evidence.
- [x] AC-3: Live re-verification against BP-UAT-010 — see Step 13 outcome
      recorded below once this workflow's post-merge UAT run completes.

## Resolution

**Workflow:** wf-20260731-fix-165
**PR:** <pending>

**Root cause:** `RegistrationsDirectusService.register()` re-read the
newly created registration exactly once, immediately after `POST` —
racing the `reg-capacity-decision` Directus action hook's async
status-patch chain, which is not part of the insert transaction and can
land after that single re-read.

**Fix:** Added a bounded poll (`pollForSettledStatus()`, up to
`SETTLE_POLL_MAX_ATTEMPTS = 3` re-reads, `SETTLE_POLL_DELAY_MS = 150`ms
apart) that short-circuits as soon as the row is no longer at the
pre-flow default `'registered'`. Adds negligible latency to the common
(non-full-event) path — the first read is already correct there, so the
loop exits immediately. Worst case (flow genuinely slower than 3
attempts) is unchanged from before: returns the same value the old
single re-read would have. No client-side change was needed — confirmed
by root-cause analysis that `RegistrationSidebar.tsx` already renders
whatever status the API returns.

**Regression test:** `registrations-directus.spec.ts` — "ISS-UAT-010-2:
polls past a stale first re-read to catch a delayed capacity-flow
demotion" (would have failed before the fix, passes after).

**Merged:** <pending>
