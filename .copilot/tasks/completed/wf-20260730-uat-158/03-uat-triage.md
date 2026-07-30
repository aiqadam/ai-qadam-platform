# Step 4 — UAT Triage Report

**Workflow:** wf-20260730-uat-158 (post-merge UAT re-verification, Step 13 of `wf-20260730-fix-157` / ISS-UAT-SEED-003)
**Business process:** BP-UAT-010 (Event registration flow)
**Target:** `local`, `apps/web` (the app BP-UAT-010.md's own `environment` field names)
**Session evidence:** `apps/e2e/uat-results/BP-UAT-010/wf-20260730-uat-158/` (session-log.md, 7 screenshots, teardown.md)

## AC-by-AC verdicts

| AC | Verdict | Evidence |
|---|---|---|
| AC-5 (anon sees "Sign in to register") | **MATCH** | step-001: CTA renders "Sign in to register", no live Register button. |
| AC-1 (member registers, row created) | **MATCH** (real registration created), field-value **MISMATCH** vs BP-UAT-010.md's literal wording (see ISS-UAT-010-1 — real value is `status=registered`, doc says `confirmed`) | step-003: "✓ You're registered" renders after clicking Register; Directus confirms a `registrations` row with `status=registered` was created. |
| AC-2 (sidebar updates, QR visible) | **PARTIAL** | Sidebar state updates correctly (MATCH). No QR code element found in `RegistrationSidebar.tsx` or on-page (confirmed via screenshot) — the QR code that DOES exist is on `/me`, not the event sidebar. BP-UAT-010.md's own Notes section already flags this as an open question ("UATRunner records whether the element is present") — recorded as-is, not silently passed. |
| AC-3 (confirmation email/notification) | **DEFERRED** | No mail-catcher (Mailpit UI) check performed this session — BP-UAT-010.md's own Notes explicitly permit deferring this without a mail-catcher; Directus Flow config (`flows-bootstrap.sh`) does show a `registration-confirmed` notification firing server-side on `registered`, but end-to-end delivery was not independently verified this session. |
| AC-4 (idempotent re-registration) | **MATCH** | step-005: revisiting the event page still shows "✓ You're registered", no duplicate action taken, `RegistrationSidebar`'s `fetchMyStatusFor()` correctly resolves the existing status server-side. |
| AC-6 (full event → waitlist) | **MISMATCH — real bug, not doc-wording** | step-006a shows "Register" button + "0 / 2 spots" (ISS-EVT-004-1's `registeredCount=0` bug, confirmed live here too, on `apps/web` not just `apps/web-next`). Clicking it DID create a real `registrations` row with `status=waitlisted` (confirmed via direct Directus query) — capacity enforcement itself works correctly server-side — but the UI (step-006b) renders "✓ You're registered", not the waitlist state, even though the created row is genuinely `waitlisted`. This is a **new, previously-unknown UI bug**, filed as ISS-UAT-010-2 below. |
| AC-7 (+5 points on registration) | **MISMATCH — doc-wording, not a bug** (per ISS-UAT-010-1, already disclosed) | `/me` dashboard (step-004) has no points display at all; confirmed via source read that no points are awarded at registration time anywhere in `apps/api` — only at check-in. Not re-litigated here. |
| Negative 002 (unauthenticated POST → 401) | **MATCH** | Direct API probe from a fresh, unauthenticated browser context returned `401`. |

## AC-9 requirement — visual-vs-DOM divergence statement

**A visual finding this run caught that a DOM-only assertion would have missed or reported incorrectly:** step-006b's screenshot shows "✓ You're registered" — a DOM-text-only assertion checking for `/you're registered|on waitlist/i` (the kind of loose regex `BP-UAT-010.spec.ts`'s own Negative-003 assertion uses) would have PASSED here, because "you're registered" IS present in the DOM. Only by independently corroborating against the actual Directus row (`status=waitlisted`) did this session catch that the rendered *state* is factually wrong for what the server actually decided — a real UI defect, not a phrasing nuance. This is exactly the class of miss AC-9 exists to catch.

## New findings (this session)

### Finding 1 — `platform.users.directus_user_id` bridge cache is stale, causing real registrations to attach to a superseded Directus user (HIGH severity, wide blast radius)

Confirmed live: signing in as `uat-member@example.com` and registering creates `registrations` rows FK'd to Directus user `a1524645-...` — a STALE row still carrying the OLD, retired `uat-member@aiqadam.test` email — not the correct, currently-linked `bb110099-...` row the seed fixture manifest (this issue's own `ISS-UAT-SEED-003` fix) correctly resolves via a fresh email lookup. Root cause (confirmed via source read):
`DirectusUsersBridgeService.resolveDirectusId()`/`ensureLinked()` treat `platform.users.directus_user_id` as a write-once cache — set on first OIDC sign-in, never re-validated or refreshed against the user's current email, even when that Authentik user's email is later PATCHed (as the historical `ISS-UAT-BRIDGE-002` migration did). **Blast radius is not limited to this UAT fixture** — any real user whose email ever changes, or whose Directus mirror is ever recreated, silently keeps writing all future registrations/points/badges/consents/audit-actor-attribution to the wrong, stale Directus identity forever, with no code path that ever detects or repairs it.

This is filed as **ISS-BRIDGE-STALE-001** (new, this session) — independent of ISS-UAT-SEED-003's own fix, and NOT caused by anything in that PR (it's a pre-existing bridge design gap, exposed because this was the first live end-to-end BP-UAT-010 registration this repo has ever actually executed against a fresh, correctly-migrated fixture).

### Finding 2 — `RegistrationSidebar.tsx` renders "You're registered" for a registration Directus actually recorded as `waitlisted`

Confirmed live: clicking Register on an at-capacity event created a real `status=waitlisted` row (server-side capacity enforcement is correct), but the client rendered the "registered" success state, not the waitlist state. Root-caused partially: `registrations-directus.service.ts`'s `register()` does re-read the row after insert specifically to pick up the capacity Flow's async status patch (comment at line ~144), so the intent is correct — but either a timing race (the Flow patch not yet committed at re-read time) or an unrelated bug in the client's response handling produces the wrong rendered state. Did not fully bottom out the exact mechanism this session (would need Directus Flow execution-order/timing instrumentation) — filed as **ISS-UAT-010-2** (new, this session) with the evidence captured here as its starting point, rather than guessing the fix.

## Business-Process outcome

**BP-UAT-010 is NOT a clean pass.** Two real, previously-undiscovered product bugs were found live (Finding 1, Finding 2) — both pre-existing, neither introduced by `wf-20260730-fix-157`'s actual change (a seed-fixture manifest + bash script extension). The seed-fixture fix itself worked exactly as designed: it made this live run possible at all (the whole reason this session could even attempt a real registration and catch these two bugs is that BP-UAT-010 now has working fixtures for the first time). AC-1/AC-4/AC-5/Negative-002 are clean matches. AC-2 is a partial (documented, pre-existing gap). AC-3 is a legitimate, doc-sanctioned deferral. AC-6/AC-7's mismatches are the previously-disclosed doc-wording gap (ISS-UAT-010-1) PLUS the newly-found Finding 2 UI bug.

## Gate Result

gate_result:
  status: passed
  summary: "Triage complete. 2 new product issues filed (ISS-BRIDGE-STALE-001, ISS-UAT-010-2), both pre-existing and unrelated to ISS-UAT-SEED-003's own change. AC-9 visual-vs-DOM divergence documented explicitly."
  findings:
    - "ISS-BRIDGE-STALE-001 (high severity, wide blast radius — affects any real user's email change or Directus mirror recreation, not just this fixture)"
    - "ISS-UAT-010-2 (waitlisted registration renders as registered in apps/web's RegistrationSidebar)"
