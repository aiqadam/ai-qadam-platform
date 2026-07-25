# ISS-USR-REG-003 — SignUpForm native submission drops all real fields, only the honeypot survives

| Field | Value |
|---|---|
| ID | ISS-USR-REG-003 |
| Severity | blocker |
| Module | web-next/auth (registration form) |
| Status | resolved |
| Reported | 2026-07-25 |
| Resolved | 2026-07-25 |
| Workflow | wf-20260725-fix-132 |
| Reporter | tvolodi (GitHub issue) |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/58 |

## Symptom

After filling in and submitting the registration form on `qa.aiqadam.org`,
the user was routed to a raw JSON response instead of the expected
Authentik one-time-login redirect:

```
Location: https://qa.aiqadam.org/api/v1/auth/register
{"formErrors":[],"fieldErrors":{"email":["Required"],"password":["Required"],"country":["Required"],"displayName":["Required"]}}
```

## Initial hypothesis (revised)

This looked identical to the symptom already investigated and closed under
[ISS-USR-REG-002](ISS-USR-REG-002.md) (a 500 that was, at the time,
diagnosed as stale/pre-CSRF-fix noise). Given [ISS-INFRA-001](ISS-INFRA-001.md)
/[ISS-INFRA-002](ISS-INFRA-002.md) had — the day before this issue was
filed — live-verified that `deploy-qa` succeeds and
`POST /v1/auth/register` returns `400` (not `500`) for a genuinely empty
body, the first hypothesis was that this GitHub issue was a stale
duplicate filed before that fix reached QA.

**This hypothesis was live-tested and disproven.** A Playwright session
against `https://qa.aiqadam.org/auth/sign-up`, filling every field
correctly and clicking Submit with a real trusted click, reproduced the
exact reported symptom. This is a live, current, distinct bug — not a
duplicate of ISS-USR-REG-002.

## Investigation

1. **Instrumented the real network request.** Captured `request.postData()`
   for the actual outgoing `POST /api/v1/auth/register`. Immediately before
   submit, `new FormData(form)` (read via a plain `capture:true` `submit`
   listener added alongside React's own handler) showed all four real
   fields correctly populated. The **actual bytes sent over the network**
   were `company=` only — every real field was missing.
2. **Ruled out network/proxy/deploy causes.** Reproduced identically
   against the local dev server (`http://localhost:4322`, no nginx, no
   Traefik, no remote deploy involved) — same symptom, same instrumentation
   result. This eliminated every QA-infrastructure hypothesis
   (nginx buffering, `deploy-qa`, Astro version skew) in one step.
3. **Isolated the trigger by submission method.** Same filled form, four
   ways to submit:
   - Real mouse click on the submit button → **broken** (`company=` only)
   - `Enter` keypress in a text field → **broken**
   - `form.requestSubmit()` via `page.evaluate()` → **works** (full body)
   - Manual `new FormData(form)` + `fetch()` → **works** (control, always
     expected to work)

   Only submissions that go through a genuine trusted DOM `submit` event
   dispatched from a **real user gesture** (click/Enter) are affected;
   programmatic `requestSubmit()` is not. This pointed at React's own
   `onSubmit` handler interfering with the native submission specifically
   on the trusted-event path.
4. **Traced `input.value`/`disabled` across the click, logged via
   `console.log` (survives the post-submit navigation).** At the moment
   the `submit` event fires, `value` is correct and `disabled=false`. The
   `disabled=true` mutation is observed to land in the DOM shortly *after*
   the request has already gone out — but that ordering, while true for
   the event-listener callback itself, does not describe when the browser
   actually finalizes the native form's entry list relative to React's
   commit.
5. **Confirmed by direct experiment**: temporarily hard-coding
   `disabled={false}` on every field (removing the `phase === 'submitting'`
   binding entirely) made the bug disappear immediately and repeatably.
   Restoring the binding reproduced it again.

## Root cause

`SignUpForm.tsx`'s `onSubmit` called `setPhase('submitting')`
**synchronously**, inside the same handler React invokes for the native
`submit` event. `Fields`' `disabled={phase === 'submitting'}` (and the
submit button's own `disabled`) means this state update flips every field
to `disabled` via a React re-render.

Per the WHATWG HTML form-submission algorithm, disabled controls are
excluded from "constructing the entry list." [ISS-USR-REG-002](ISS-USR-REG-002.md)'s
investigation trail had already considered and *refuted* a version of
this hypothesis, reasoning that the entry list is constructed before any
`submit`-event listener (including React's) ever runs — which is correct
for the event-dispatch step itself. What that reasoning didn't account
for: the browser's construction of the **network request body** for a
same-document form submission is a later, separate step in the
navigate/submit continuation, not something guaranteed to be fully
snapshotted at the instant the `submit` event fires. React's synchronous
commit for the `setPhase('submitting')` state update — flipping `disabled`
on every field — can complete before that later step runs, at which point
the disabled fields are excluded from the body: exactly the "only the
honeypot `company` field survives" signature observed both live on QA and
locally. This only manifests on a genuine trusted user gesture (click,
Enter) because React's synthetic event handling for a real DOM event
takes a different scheduling path than an entirely programmatic
`form.requestSubmit()` call, which is why the latter never reproduced it.

## Fix

`apps/web-next/src/blocks/customer/SignUpForm.tsx` — defer the
`setPhase('submitting')` state update (and the `disabled` mutation it
drives) to a macrotask via `setTimeout(fn, 0)`:

```tsx
setTimeout(() => {
  setPhase('submitting');
  setErrorMsg('');
}, 0);
```

This lets the current `submit` event/task finish completely — including
whatever later step the browser uses to finalize the native submission's
body — before React disables the fields. The disabling is purely cosmetic
at that point (prevents a double-submit click); it can no longer race the
submission it's meant to follow rather than precede.

## Regression test

`apps/e2e/tests/uat/signup-form-submission.spec.ts` — intercepts the real
`POST /api/v1/auth/register` request (no live backend call; deterministic,
no rate-limit dependency), submits the form via a genuine `page.click()`
on the submit button (not `requestSubmit()`, since that path doesn't
reproduce the bug), and asserts the captured request body contains every
real field. Verified to fail against the pre-fix code (3/3 runs,
`received: "company="`) and pass against the fix (5+ runs, local dev
server; also verified live against `qa.aiqadam.org` before the permanent
fix, and again after deploy).

## Verification

- **Local, pre-fix**: reproduced 100% (multiple runs) via real click, Enter
  key, and real character-by-character typing — all broken.
- **Local, post-fix**: 5/5 clean passes via real click submission.
- **Live QA, pre-fix**: reproduced live via Playwright against
  `https://qa.aiqadam.org/auth/sign-up` — identical `fieldErrors` JSON to
  the originally reported symptom.
- **`tsc`/`astro check`**: no new errors introduced (pre-existing `.astro`
  module-resolution noise under plain `tsc` is unrelated — this repo uses
  `astro check` for real type-checking).
- **`biome check`**: clean on the changed file.
- **`pnpm test` (apps/web-next)**: 923/923 passing, no regressions.
- **Deferred**: live QA re-verification of the *deployed* fix (as opposed
  to the local dev-server verification above) — same AC-4-style deferral
  pattern as ISS-USR-REG-002, since this workflow does not push to QA
  itself. Follow-up: re-run
  `apps/e2e/tests/uat/signup-form-submission.spec.ts` against
  `https://qa.aiqadam.org` once this PR's merge reaches QA via the normal
  `deploy-qa` pipeline (confirmed working per ISS-INFRA-001/002).

### Honesty disclosures (AGENTS.md §6.1)

- Live QA verification of the *merged and deployed* fix is deferred (not
  yet possible from this workflow — no push to QA happens as part of a PR
  merge to `main` without deploy running); the fix is proven against a
  live QA reproduction of the bug (pre-fix) and a local reproduction/fix
  cycle (both pre- and post-fix), which is strong but not identical
  evidence to a live post-deploy re-run.
- This is the third `ISS-USR-REG-*` issue on the same registration
  surface (`ISS-USR-REG-001` shipped the feature, `ISS-USR-REG-002` fixed
  a 500 from unguarded Authentik calls, this one fixes a client-side
  React/native-form race). No further known issues on this surface as of
  this writing.
