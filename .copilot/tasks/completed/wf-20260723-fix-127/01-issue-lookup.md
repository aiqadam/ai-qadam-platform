# Step 1 — Issue Lookup

**Workflow:** wf-20260723-fix-127
**Issue:** ISS-USR-REG-002

## Source

Reported by tvolodi in chat (screenshot of a raw JSON 400 response after
submitting the registration form on `qa.aiqadam.org`). Filed to GitHub as
[issue #50](https://github.com/aiqadam/ai-qadam-platform/issues/50) per
this repo's issue-intake convention. Back-reference comment posted.

## Registry search

Searched `.copilot/issues/registry.md` for prior art on `api/auth` /
registration:

- **ISS-USR-REG-001** (resolved, `wf-20260718-fix-122`) — the original
  feature that shipped `POST /v1/auth/register`. Directly relevant as the
  implementation this bug lives in, but that issue is closed/resolved —
  this is a new, distinct regression/defect, not a reopen (no shared
  symptom; that issue's own regression test passed at merge time).
- **wf-20260723-fix-126** (GH-41, merged today as PR #42 + follow-up PR
  #44) — fixed a *different* symptom (403 "Cross-site POST form
  submissions are forbidden", an Astro CSRF `checkOrigin` scheme
  mismatch). Confirmed via live repro that CSRF now passes cleanly; this
  issue is a distinct, newly-surfaced problem exposed by requests now
  reaching further into the pipeline. Not a duplicate.

No other open issue covers this symptom. Created `ISS-USR-REG-002.md` from
scratch (not a continuation of ISS-USR-REG-001, since that issue is
resolved and its own regression test still passes — this is new
territory, most likely a latent bug in `RegistrationService.register()`
or one of its external dependencies that was simply unreachable before
today's CSRF fix let real traffic through).

## Live repro performed (see ISS-USR-REG-002.md for full detail)

A temporary diagnostic Playwright script (deleted after use, never
committed) was run against `https://qa.aiqadam.org/auth/sign-up` to
settle the client-vs-server question empirically, since two rounds of
static source analysis (Astro CSRF internals, React form-submission
timing per the WHATWG HTML spec) had ruled out every client-side
hypothesis without a definitive answer.

**Result:** the browser sends a fully-populated, correctly-encoded
`application/x-www-form-urlencoded` body. The server now returns:
```
500 { "statusCode": 500, "message": "Internal server error" }
```
This supersedes the originally-reported 400/"all fields Required"
symptom, which is not reproducible anymore and was almost certainly
observed before today's CSRF fix deployed.

## Adjacent finding (tracked as ISS-USR-REG-002 AC-4, not a separate issue)

`ci-cd`'s `deploy-qa` job has failed on every push to `main` since the
run following PR #44 (`af30beb`) — root cause `unable to unlink old
'package.json': Permission denied` on the QA deploy host
(`deploy@95.46.211.230`). **QA is currently running `main` as of PR #44,
not current tip.** This means whatever fix Step 4 produces cannot be
verified live on QA until this separate deploy blocker is also cleared.
Flagged as a hard dependency for Step 8 (test execution / live
verification), not folded into the same code fix.

## `handoff.yaml` updates

- `issue_ref: ISS-USR-REG-002`
- `github_issue_url` set
- `current_step: 1` → advancing to Step 2

## Gate Result

gate_result:
  status: passed
  summary: "Issue registered as ISS-USR-REG-002, distinct from resolved ISS-USR-REG-001 and today's already-fixed GH-41 CSRF bug; live repro confirms a currently-active 500, superseding the originally-reported 400."
  findings:
    - "Live Playwright repro against qa.aiqadam.org shows a fully-populated request body and a 500 response — client-side causes (field names, content-type, CSRF, React submit timing) are conclusively ruled out."
    - "deploy-qa CI has been broken since PR #45 (permission-denied on QA host unlink) — QA is running stale code (PR #44), a hard dependency for live verification of any fix."
