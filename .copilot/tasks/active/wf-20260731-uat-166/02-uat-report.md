# Step 3 — UAT Session Report

**Spec:** `apps/e2e/tests/uat/BP-UAT-010.session.spec.ts` (rewritten this
run — see the file's own header comment for why the prior version's
Step 006 was insufficient to actually re-verify this fix).

**Result:** 1 passed (22.1s). Full transcript:
`apps/e2e/uat-results/BP-UAT-010/wf-20260731-uat-166/session-log.md`.

## Steps driven

| Step | AC | Verdict | Note |
|---|---|---|---|
| 001 | sign-in precondition | MATCH | Authentik flow-executor, same pattern as prior session specs. |
| 002 | AC-1 (regression guard) | MATCH | Open event: DOM "You're registered" + Directus `status=registered` agree. |
| 003 | AC-6 (core fix check) | MATCH | Full event: DOM "On waitlist" (not "You're registered") + Directus `status=waitlisted` agree — the exact defect ISS-UAT-010-2 reported is gone. |

## AC-9 (visual-vs-DOM divergence) — mandatory statement

**No visual-vs-DOM divergence observed this run.** Step 003's screenshot
(`step-003-full-event-after-click.png`) was independently reviewed:
renders "On waitlist — we'll email if a seat opens" with a "Leave
waitlist" button, matching both the DOM text assertion and the Directus
row. Unlike the original `wf-20260730-uat-158` discovery run (where the
DOM said "You're registered" while Directus said `waitlisted` — a
genuine divergence a DOM-only check would have missed), this run's DOM
and Directus **agree**, which is the whole point: the fix eliminated the
divergence rather than just fixing one side of it.

One pre-existing, already-tracked, unrelated visual artifact reproduced
(not a new finding): the full event's capacity counter reads "0 / 2
spots" instead of "2 / 2" — this is `ISS-EVT-004-1`
(`registeredCount` hardcoded to 0 in `apps/web`'s event-detail fetch),
already open and unrelated to this fix's surface.

## Post-session enforcement scripts

```
Navigation check   → OK: all navigations are legal (initial goto + 0 declared hops, no undeclared deep-links). PASS
Visual evidence check → OK: session visual check complete — 3 screenshots, 3 verdict blocks, all proof-of-look fields present, same-step invariant satisfied. PASS
Teardown check → OK: teardown.md present with 1 state item(s). PASS
```

**Gate:** `passed` → Step 4 (Triage).
