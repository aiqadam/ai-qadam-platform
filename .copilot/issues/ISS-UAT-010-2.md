# ISS-UAT-010-2 — `RegistrationSidebar` renders "You're registered" for a registration Directus actually recorded as `waitlisted`

| Field | Value |
|---|---|
| ID | ISS-UAT-010-2 |
| Severity | bug |
| Module | web/events (RegistrationSidebar), api/registrations |
| Status | open |
| Reported | 2026-07-30 |
| Reporter | UATRunner/Orchestrator (`wf-20260730-uat-158`, post-merge BP-UAT-010 live verification for ISS-UAT-SEED-003) |
| Related | ISS-UAT-SEED-003, ISS-UAT-010-1, BP-UAT-010 |
| Business-Process | BP-UAT-010 |
| GitHub-Issue | — (not yet filed; local-origin finding) |

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

- [ ] AC-1: Root-cause confirmed — either (a) the Flow-vs-API-re-read race
      exists and needs a synchronization fix (e.g. poll/retry the re-read
      until the flow's patch is observed, with a bounded timeout), or (b)
      the client-side status-handling bug is found and fixed.
- [ ] AC-2: Regression test proving a registration on an at-capacity event
      renders the waitlist UI state, not the registered state, reliably
      (not just once) — this may require a deterministic way to trigger
      the race if AC-1 finds (a).
- [ ] AC-3: Live re-verification against BP-UAT-010's AC-6/Negative-003
      confirms the waitlist UI state renders correctly after the fix.

## Resolution

_Open — not yet scheduled. Discovered live during `wf-20260730-uat-158`
(Step 13 post-merge UAT re-verification for `ISS-UAT-SEED-003`). Pre-existing
bug in `apps/web`'s registration flow / `apps/api`'s registration+capacity-flow
interaction — not caused by ISS-UAT-SEED-003's own change, which only
added seed-fixture tooling. This is the first time BP-UAT-010 has ever
been driven live end-to-end against a real at-capacity event, which is
why this bug was never caught before._
