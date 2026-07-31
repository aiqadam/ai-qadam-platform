# Step 3: UAT Report — BP-UAT-010 (wf-20260731-uat-163)

**Purpose:** Mandatory Step 13 post-merge re-verification for
`wf-20260731-fix-162` (ISS-BRIDGE-STALE-001, PR #174). Scoped to
confirming the fix's live effect and no regression, not a fresh full
BP-UAT-010 pass (all 7 ACs / all negative scenarios).

**Session evidence:** `apps/e2e/uat-results/BP-UAT-010/wf-20260731-uat-163/`
(`session-log.md`, 4 screenshots, `teardown.md`).

## Enforcement script results

- Navigation check: **PASS** — "all navigations are legal (initial goto + 0 declared hops, no undeclared deep-links)"
- Visual evidence check: **PASS** — "4 screenshots, 5 verdict blocks, all proof-of-look fields present, same-step invariant satisfied"
- Teardown check: **PASS** — "teardown.md present with 2 state item(s)"

## Steps driven

| Step | AC | Verdict | Notes |
|---|---|---|---|
| 001 — unauth event detail | AC-5 | MATCH | Sign-in CTA shown, no Register button. Screenshot reviewed directly. |
| 002 — sign in | AC-1 precond. | MATCH | Landed back on event detail page after Authentik sign-in. |
| 003 — register for open event | AC-1, AC-2 (partial), AC-7 (not measured) | PARTIAL | "You're registered" shown, capacity incremented 0→1/10. QR element absent — pre-existing, already-disclosed AC-2 gap (`ISS-UAT-010-1`), not new. |
| 003b — bridge-fix corroboration | ISS-BRIDGE-STALE-001 AC-5 | MATCH | See "Core verification" below. |
| 006 — full event waitlist path | AC-6 | PARTIAL — **new corroborating evidence for an already-filed issue** | See "Additional finding" below. |

Not driven this session (out of scope — narrower re-verification, not a
fresh full pass): Step 004 (points delta), Step 005 (idempotent
re-register), Negative 002 (API 401 without auth).

## Core verification: does ISS-BRIDGE-STALE-001's fix hold live?

**Yes, confirmed two independent ways:**

1. **Direct DB check** (`02-preflight.md`): immediately after this run's
   `pnpm uat:seed --reset BP-UAT-010`, `platform.users.directus_user_id`
   for `uat-member@example.com` is `bb110099-c215-433b-8930-81e7f4dab21a`
   — the CORRECT id — not the stale `a1524645-...` id that existed before
   `wf-20260731-fix-162` merged. The seed's own `ensure_linked` call
   exercises `DirectusUsersBridgeService.ensureLinked()`'s new
   reconciliation path.
2. **Live browser session** (this workflow): signed in as the same
   `uat-member`, registered for `uat-event-open-uz`, and the registration
   succeeded normally (screenshot: capacity incremented, "You're
   registered" state shown, no errors). This proves the fix doesn't just
   correct the cached id in isolation — the full registration flow keeps
   working end-to-end on top of the corrected id, with no regression.

**Conclusion: ISS-BRIDGE-STALE-001's fix is confirmed working live. No
regression in the registration flow.**

## Additional finding (pre-existing, not a regression from this fix)

Step 006's screenshot shows `UAT Event Full UZ` displaying **"0 / 2
spots"** and an active plain **"Register"** button, despite the seed
having created 2 `status: registered` rows against this event
(confirmed directly against Postgres:
`SELECT event, "user", status FROM registrations WHERE event =
'56df5cad-...'` → 2 rows, both `registered`). This reproduces
**`ISS-EVT-004-1`** (`apps/web-next`'s `fetchEvent()` hardcodes
`registeredCount=0`) live again — already filed, already tracked, not
caused by this fix or this workflow. No new issue filed for this;
recorded here as corroborating live evidence for the existing issue.

## Gate Result

**Status:** `passed` → Step 4 (Triage).
