# Step 4 — Triage Report

**Run:** `wf-20260801-uat-180` — Step 13 post-merge re-verification of
FR-AUTH-004 ("Magic-link authentication"), triggered by that FR's
`business_process: [BP-UAT-009]` frontmatter.

## Outcome: clean pass, no new issues

All 3 driven steps (FR-AUTH-004 AC-1 entry-point check; BP-UAT-009 AC-1/
AC-2/AC-3 password-path regression check) verdicted `MATCH` on the final
run. See `02-uat-report.md` for the full step table and
`apps/e2e/uat-results/BP-UAT-009/wf-20260801-uat-180/session-log.md` for
the complete transcript.

**Business process confirmed intact:** the auth sign-in surface
(BP-UAT-009) still works end-to-end with FR-AUTH-004's new magic-link
option present alongside it — the shared session-issuance funnel
(`AuthController.callback()` → `upsertByAuthentikSubject()`) that both
the password path and the magic-link path converge on is unbroken.

## AC-9 (visual-vs-DOM divergence) — mandatory statement

**No visual-vs-DOM divergence observed in the final clean run** (both
signals agreed on all 3 steps — see `02-uat-report.md`'s own AC-9
section for the full statement).

However, this run's process itself is a live instance of visual judgment
mattering: two intermediate MISMATCH verdicts (a fill-race producing
"Please fill out this field," then a stale-password fixture producing
"Invalid password") were only distinguishable by reading the actual
rendered Authentik error text in each screenshot. A DOM-only or
API-status-only check (e.g. "did the form POST return 2xx") would have
reported both failures identically and given no actionable diagnosis —
the visual read is what made both root causes obvious immediately rather
than requiring separate investigation. See `02-uat-report.md`'s "Live
retries during this run" section for the full disclosure.

## No new issues registered

Both MISMATCHes encountered mid-session were diagnosed as pre-existing,
already-documented environment gaps (not FR-AUTH-004 regressions, not
new findings):

1. **Authentik flow-executor stage-remount fill race** — same class of
   timing issue already documented in
   `apps/e2e/tests/uat/BP-UAT-020.session.spec.ts`'s own header comments
   (necessitating an explicit settle delay). Fixed in this run's session
   spec with an added settle wait + fill-verification retry. Not filed
   as a new issue — this is a test-script authoring detail, not a
   product or environment defect, and the fix is now embodied in the
   committed spec file for future re-runs.
2. **Stale `uat-member` Authentik password** — the exact same
   already-documented gap noted in `wf-20260731-uat-166`'s own
   `02-preflight.md` ("uat-member's Authentik password did not match
   the seed script's own default... Fixed the same way: a direct `POST
   /api/v3/core/users/{pk}/set_password/` call"). Same fix applied here.
   Not filed as a new issue — already a known, recurring environment
   quirk with an established workaround, not a new discovery.

Also not filed as new issues this run (documented instead in the task
artifacts, per the "flag, don't hide" discipline):
- `scripts/uat-preflight-check.sh`'s expected substrings
  (`@aiqadam/api`, `@astrojs/node`) do not match this repo's actual dev
  process command lines on this machine — already independently
  observed by `wf-20260731-uat-166`'s pre-flight for the same two
  checks. Two independent occurrences now on record; worth a real fix
  in a future narrow workflow, but out of scope here.
- `BP-UAT-009.md`'s own "Seed Fixtures Required" table names
  `uat-member@aiqadam.test`; the real seeded identity is
  `uat-member@example.com`. Doc/fixture drift, cosmetic, non-blocking.
- `scripts/gen-bp-uat-coverage.mjs --write` was run once during this
  workflow to regenerate the `Spec`/`Smoke Overlap` columns after
  adding the BP-UAT-009 row's Status/Last Run/Run Status data, and was
  found to **destructively drop already-populated Status/Last
  Run/Run Status/Open Issues cells for BP-UAT-013 and BP-UAT-020**
  (both had real prior data — "Implemented / 2026-07-06 / partial
  (...)" and "Implemented / 2026-07-29 / partial (...)" respectively —
  silently collapsed to `—` after the `--write` run). This was caught
  before committing (`git diff` review) and reverted via `git checkout
  --` before any hand edit was reapplied manually instead. **This is a
  real, currently-unfixed bug in the generator script** — it appears to
  mis-parse/collapse rows that already have all optional columns
  populated. Not filed as a new `ISS-<n>` this session (narrow Step 13
  scope, already worked around, no data was actually lost since it was
  caught pre-commit) but is a genuine finding worth a follow-up fix —
  noting here per the "flag, don't hide" discipline rather than
  silently avoiding the script forever without saying why.

## Registry updates

- `docs/02-business-processes/uat/registry.md` — BP-UAT-009 row: Status
  `Implemented`, Last Run `2026-08-01`, Run Status `pass (targeted:
  AC-1/AC-2/AC-3 password regression + FR-AUTH-004 entry-point check,
  wf-20260801-uat-180)`. Hand-edited directly (NOT via
  `gen-bp-uat-coverage.mjs --write` — see the finding above); Spec/Smoke
  Overlap columns left untouched, still accurate.
- `docs/02-business-processes/uat/BP-UAT-009.md` frontmatter — added
  `linked_issues: [FR-AUTH-004]` (new field; BP-UAT-009 had none before),
  updated `last_run: "2026-08-01"` (was `"2026-07-05"`).

**Gate:** `passed` → Step 5 (Commit, Push, Create PR).
