# ISS-USR-REG-002 — POST /v1/auth/register returns 500 Internal Server Error on QA

| Field | Value |
|---|---|
| ID | ISS-USR-REG-002 |
| Severity | blocker |
| Module | api/auth (registration) |
| Status | resolved |
| Reported | 2026-07-23 |
| Resolved | 2026-07-23 |
| Workflow | wf-20260723-fix-127 |
| Reporter | tvolodi (chat), filed to GitHub issue [#50](https://github.com/aiqadam/ai-qadam-platform/issues/50) |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/50 |

## Symptom

User reported that after filling in and submitting the registration form on
`qa.aiqadam.org`, they landed on a raw JSON response instead of a profile
page — a Zod `.flatten()` validation error showing all four fields
(`email`, `password`, `country`, `displayName`) as `"Required"`, despite
confirming all fields were populated on the form.

## Investigation trail (superseded diagnoses, kept for record)

1. **Client-submission hypotheses (field-name mismatch, wrong content-type,
   plain-navigation-to-JSON-on-400)** — investigated via static code
   analysis of `SignUpForm.tsx`, `auth.controller.ts`. Field names and
   content-type (`application/x-www-form-urlencoded`) match exactly.
   Confirmed the app has a pre-existing, documented "known limitation"
   (see `SignUpForm.tsx` lines 23-28): a 400 from the server is not
   intercepted, and the browser navigates to the raw JSON body. This
   explains *how* a validation failure would be visible as raw JSON, but
   not *why* validation was failing with all-fields-empty.
2. **Astro CSRF body-draining hypothesis** — investigated by reading the
   actual installed `astro@7.0.2` / `@astrojs/node` source
   (`node_modules/astro/dist/core/app/middlewares.js`,
   `validate-headers.js`, `node.js`, `base-pipeline.js`). Conclusively
   ruled out: `checkOrigin`/`applyForwardedHeaders` only ever read
   headers, never touch `request.body`. No double-read/drain anywhere in
   the request-construction chain.
3. **React controlled-input / synchronous `disabled` race on submit**
   — hypothesized that `setPhase('submitting')` inside `onSubmit`
   (`SignUpForm.tsx:189`) synchronously disables all fields before the
   browser reads them for native form submission, excluding all four
   from the entry list (HTML spec: disabled controls are excluded from
   "constructing the form data set"). **Refuted**: per the WHATWG HTML
   form-submission algorithm, the entry list is constructed *before* the
   `submit` event (and therefore before any JS handler, including
   React's) ever fires — so a `disabled` mutation inside `onSubmit`
   cannot retroactively exclude fields from an already-built entry list.
4. **Live empirical repro (Playwright against `https://qa.aiqadam.org`,
   captured request/response directly)** — this is what actually
   resolved the question. The real outgoing POST body is:
   ```
   content-type: application/x-www-form-urlencoded
   displayName=UAT+Repro+User&email=uat-repro-<ts>%40example.com&password=Reproduce-This-Bug-123&country=kz&company=
   ```
   Fully populated, correctly encoded, matches the Zod schema exactly.
   The response is now:
   ```
   500 { "statusCode": 500, "message": "Internal server error" }
   ```
   **This means the original 400/"all-fields-Required" symptom the user
   saw is stale** — most likely from before today's CSRF fix
   (`d0536ac`/PR #42, `af30beb`/PR #44) deployed to QA, since a request
   that never got past the old CSRF 403 would never have reached this
   far. The 400 is not reproducible anymore; a 500 is, and is the live,
   current bug.

## Also discovered (adjacent, tracked separately — do not conflate)

The `ci-cd` GitHub Actions workflow's `deploy-qa` job has been failing on
every push to `main` since the run immediately after PR #44
(`af30beb`, succeeded) — starting with PR #45 (`chore(ci): remove
Coolify, fix SSH deploy secrets`) onward, every deploy attempt fails with:
```
error: unable to unlink old 'package.json': Permission denied
error: unable to unlink old 'pnpm-lock.yaml': Permission denied
```
on the QA deploy host (`deploy@95.46.211.230`). This means **QA is
currently running code as of PR #44** (`af30beb`), not current `main` tip
(`845eb9c` at investigation time). This is a filesystem-permissions issue
on the remote deploy host, unrelated to application code, and is a
separate blocking issue from the 500 itself — filed as AC-4 of GitHub
issue #50; must be resolved (or explicitly re-scoped to its own tracked
issue) before this issue can be verified as fixed on a live QA deploy.

## Resolution

- **Workflow:** wf-20260723-fix-127
- **PR:** `<pending>` — back-filled after `gh pr create` in Step 12.
- **Root cause:** `RegistrationService.register()`
  (`apps/api/src/modules/auth/registration.service.ts`) had three external
  Authentik-API call sites with zero try/catch (`getUserByEmail` at Step
  2, `resolveGroupNames`+`setUserGroups` at Step 5, `createRecoveryLink`
  at Step 8), plus a fourth (`createUser`, Step 3) that only converted
  4xx `AuthentikError`s and rethrew everything else (5xx, network
  errors) unhandled. `AuthentikError` extends plain `Error`, not
  `HttpException`, so any of these four uncaught throws fell through to
  NestJS's default exception filter and rendered as a bare, undiagnosable
  `500 Internal Server Error` — exactly the symptom reproduced live on
  QA. A local repro with valid Authentik/Directus credentials against the
  identical request body succeeded end-to-end with zero errors, which is
  strong evidence the underlying trigger is a QA-environment/config gap
  (most likely `AUTHENTIK_ADMIN_TOKEN` unset, empty, or stale on the QA
  host's untracked `deploy/.env` — this repo cannot directly confirm or
  fix that value, since it lives only on the remote deploy host) rather
  than a universally-reproducing logic defect. Full reasoning and ranked
  hypotheses: `.copilot/tasks/active/wf-20260723-fix-127/02-impact-analysis.md`.
- **Fix:** Wrapped all four previously-unguarded/partially-guarded call
  sites (Steps 2, 3, 5, 8) in try/catch, converting any failure to the
  same generic `BadRequestException('registration_failed')` already used
  by the method's pre-existing Step 4 (`setPassword`) handling, with
  structured server-side logging (`this.logger.log`/`.warn`) matching the
  file's established convention — no internal Authentik/Directus error
  detail is ever surfaced to the HTTP response. Step 5 additionally
  applies the same orphan-mitigation pattern Step 4 already uses
  (best-effort `authentik.disableUser()` + structured log) since the
  Authentik user+password already exist by that point. Step 8 is the one
  intentional exception: because registration has already fully
  succeeded by then, a recovery-link mint failure logs loudly but does
  **not** throw — the endpoint still returns success, and only the
  automatic welcome-email dispatch is skipped (an operator can mint a
  recovery link manually via Authentik). This closes the code-level
  robustness gap regardless of which infra hypothesis is eventually
  confirmed; it does not (and cannot, from this repo) directly remediate
  a QA-side credential/config issue if that turns out to be the trigger.
  A security review (`.copilot/tasks/active/wf-20260723-fix-127/04-security-review.md`)
  confirmed the fix does not reopen the email-enumeration oracle already
  fixed once on this exact method (ISS-USR-REG-001's MAJOR-1) — all new
  failure paths converge on one indistinguishable `400 registration_failed`
  response, conditioned on upstream availability rather than per-email
  existence.
- **Regression test:** `apps/api/test/registration-service.spec.ts` — 6
  new tests across 4 new `describe` blocks (Steps 2, 3 ×2, 5 ×2, 8),
  bringing the file to 14/14 passing. The Step 2 and Step 3 cases are the
  clearest "would have failed before the fix" examples: before this
  change, a `getUserByEmail` rejection (Step 2) or a non-4xx `createUser`
  rejection (Step 3) would reject with the raw, uncaught
  `AuthentikError`/`TypeError` rather than a `BadRequestException` — the
  new tests specifically assert `instanceof BadRequestException` (and,
  for Step 3, `not.toBeInstanceOf(AuthentikError)`), which fails against
  the pre-fix code and passes after.
- **Merged:** `<pending>` — Step 12.5 back-fills the actual merge SHA.
- **Deferred / follow-up:** Live verification on QA itself is blocked by
  a separate, already-tracked issue — `deploy-qa` CI has failed on every
  push to `main` since PR #45 (permission-denied unlinking
  `package.json`/`pnpm-lock.yaml` on the QA deploy host), so QA is
  currently pinned to PR #44's code and cannot receive this fix until
  that is resolved. This is AC-4 of GitHub issue
  [#50](https://github.com/aiqadam/ai-qadam-platform/issues/50).

### Honesty disclosures (AGENTS.md §6.1)

- **AC-4 (live QA verification) is deferred, not verified**, with a
  named, queued follow-up:
  [wf-20260723-fix-128-deploy-qa-permission-fix](../tasks/queued/wf-20260723-fix-128-deploy-qa-permission-fix/handoff.yaml)
  (queue position 1). Concrete verification steps once picked up: (1)
  diagnose/fix the permission-denied unlink on
  `deploy@95.46.211.230`; (2) confirm `deploy-qa` CI succeeds on a
  fresh push; (3) re-run the live Playwright repro from this issue
  against `https://qa.aiqadam.org/auth/sign-up` and confirm
  `POST /v1/auth/register` returns `302` instead of `500`; (4) if the
  suspected `AUTHENTIK_ADMIN_TOKEN` config gap turns out to be a
  *separate* remaining blocker even after the deploy fix, register a
  second follow-up issue at that point rather than assuming this one
  workflow closes both.
- This deferral was preceded by an infrastructure pre-flight: local
  Docker stack (postgres, directus, authentik-server, authentik-worker,
  redis, mailpit) was confirmed healthy via `docker ps`, and the code fix
  was verified end-to-end against that local stack (see Root cause
  section — local repro succeeded with a valid token). QA itself is a
  remote host with no local/Docker pre-flight applicable; the blocker is
  the remote deploy pipeline, not local infrastructure, so the
  Infrastructure Pre-Flight Invariant (AGENTS.md §6.1) does not apply in
  its usual "bring up missing services" form here — there is nothing
  this workflow could `docker compose up -d` to fix a remote host's file
  permissions.
