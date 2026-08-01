# Step 3 — UAT Session Report

**Spec:** `apps/e2e/tests/uat/BP-UAT-009.session.spec.ts` (new — BP-UAT-009
had no `.session.spec.ts` yet under the agent-driven model; existing
`BP-UAT-009.spec.ts` is the conventional Playwright regression net,
unaffected).

**Result:** 1 passed (16.9s), on the second content-verified attempt.
Full transcript:
`apps/e2e/uat-results/BP-UAT-009/wf-20260801-uat-180/session-log.md`.

## Steps driven

| Step | AC | Verdict | Note |
|---|---|---|---|
| 001 | FR-AUTH-004 AC-1 (entry point) | MATCH | `/auth/sign-in` shows both "Continue with password" and "Sign in with email link" (href=`/auth/sign-in-magic-link`), design-system tokens, no anomalies. |
| 002 | BP-UAT-009 AC-1 (regression) | MATCH | Password link still lands on Authentik's real login UI, correct branded flow, identifier field present. |
| 003 | BP-UAT-009 AC-2/AC-3 (regression) | MATCH | Signed in, landed on `/me`, `aiqadam-refresh` cookie present and `HttpOnly=true`. |

## Live retries during this run (disclosed, not hidden)

Two attempts hit genuine environment/script issues before the clean pass
above — both diagnosed against real evidence (screenshots + Authentik
API), not assumed:

1. **First attempt:** Step 003 MISMATCHed — screenshot showed Authentik's
   native "Please fill out this field" validation on the password field,
   meaning the fill raced the Lit-web-component stage remount (Authentik's
   flow-executor swaps stages client-side). This is the same class of
   timing issue `BP-UAT-020.session.spec.ts`'s own header comments
   document needing an explicit settle delay for. **This is a
   test-script defect, not a product defect.** Fixed by adding an extra
   settle wait + a fill-verification retry-once before treating an
   empty/short field as a hard failure.
2. **Second attempt (after the script fix):** Step 003 MISMATCHed again,
   but differently — screenshot showed "Invalid password" (the fill
   itself now worked; the credentials were rejected). Root cause: the
   seeded `uat-member` fixture's live Authentik password did not match
   `apps/e2e/.env.uat`'s documented `UatMember1!` — the exact **known,
   already-documented environment staleness** `wf-20260731-uat-166`'s own
   pre-flight report names for this identical fixture (its fix: a direct
   `POST /api/v3/core/users/{pk}/set_password/` call). Applied the same
   fix here (`POST .../users/5/set_password/` → 204), re-ran, clean pass.

Neither retry is a product regression — both are pre-existing environment
gaps this workflow encountered and worked around using precedent already
established in this repo's own history, not something FR-AUTH-004
introduced.

## AC-9 (visual-vs-DOM divergence) — mandatory statement

**No visual-vs-DOM divergence observed in the final clean run.** All
three verdicts were corroborated by both the rendered screenshot and the
DOM-level signal (link counts/hrefs for Step 001; URL + form presence for
Step 002; URL + cookie flags for Step 003) and they agree in each case.

The two MISMATCHes documented above ARE an instance of visual judgment
catching what a DOM-only / API-only check would have missed or
misdiagnosed: a bare `POST /v1/auth/magic-link`-style API smoke check
(the kind of check that was sufficient for the *magic-link* mechanism's
own Step 8 verification in the parent workflow) would never have driven
the real password-stage UI at all, so it could not have caught either
the stage-remount fill race or the stale-password environment gap — both
were only visible by actually looking at the rendered Authentik screen
at each step and reading its exact error text ("Please fill out this
field" vs. "Invalid password" are visually and semantically distinct
failure modes that a same-shaped DOM assertion could conflate).

## Post-session enforcement scripts

```
Navigation check     → OK: all navigations are legal (initial goto + 0 declared hops, no undeclared deep-links). PASS
Visual evidence check → OK: session visual check complete — 3 screenshots, 3 verdict blocks, all proof-of-look fields present, same-step invariant satisfied. PASS
Teardown check        → OK: teardown.md present with 2 state item(s). PASS
```

**Gate:** `passed` → Step 4 (Triage).
