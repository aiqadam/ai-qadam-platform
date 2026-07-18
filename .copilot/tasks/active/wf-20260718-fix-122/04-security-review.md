# Step 4 — Security Review: ISS-USR-REG-001 (RE-REVIEW, retry pass)

> Output for: `.copilot/tasks/active/wf-20260718-fix-122/04-security-review.md`
> Agent: SecurityReviewer
> Workflow: wf-20260718-fix-122

---

## Context: what changed since the prior pass

The prior review (preserved in git history / superseded by this file) found
3 MAJOR findings, gate `failed-retry`:

1. `Location` header content was a deterministic email-enumeration oracle
   (genuine registration redirected to a real Authentik URL; duplicate/
   honeypot redirected to `/v1/auth/login`).
2. Honeypot field named literally `honeypot` — trivially bot-detectable.
3. Length-only `min(12)` password policy on a public endpoint, unverified
   against any Authentik-side backstop.

CodeDeveloper's retry pass (documented in `03-code-summary.md`'s "Security
fixes (retry pass)" section) claims to have fixed all three. This is an
independent re-verification, not an acceptance of that claim — every file
below was re-read in full against the actual current working tree.

---

## Code Changes Reviewed (this pass — full re-read, not re-pasted from prior pass)

- `apps/api/src/modules/auth/registration.service.ts` (327 lines — grew
  significantly: new `dispatchWelcomeEmail` private method, new
  `InteractionsService` constructor dependency, `fakeSuccessResult()` now
  used by all three outcomes, extensive new module-doc-comment explaining
  the Location-header fix)
- `apps/api/src/modules/auth/auth.controller.ts` (full file, 518 lines —
  `registerSchema` lines 47-68, `register()` handler lines 435-465, doc
  comments lines 414-434)
- `apps/api/src/modules/auth/auth.module.ts` (34 lines — new
  `InteractionsModule` import)
- `apps/api/src/modules/telegram/telegram.module.ts` (117 lines — comment
  update describing the now-more-direct `AuthModule → InteractionsModule`
  edge; `forwardRef` usage itself unchanged)
- `apps/api/src/lib/password-schema.ts` (new, 104 lines — full read)
- `apps/web-next/src/blocks/customer/SignUpForm.tsx` (226 lines — full
  read, honeypot rename + weak-password client mirror)

Also read for precedent/cross-check verification (not part of the diff):

- `apps/api/src/modules/leads/leads.service.ts` (`dispatchVerifyEmail`,
  lines 158-182, and `convertLeadToMember`'s dispatch call, lines 136-152)
  — the precedent the retry pass claims to mirror.
- `apps/api/src/modules/interactions/interactions.service.ts` (full
  `dispatch()`, `resolveRecipients()`, doc comments) — to verify the new
  `InteractionsService.dispatch()` call shape is valid and to check for any
  new leak surface in recipient resolution.
- `apps/api/src/modules/interactions/consent.service.ts` (`check()`,
  lines 76-90) — to verify `operational_contract` behavior and confirm the
  doc comment's own worked example ("registration confirmation") applies
  directly to this use.
- `apps/api/src/modules/interactions/interactions.types.ts` (`intent`
  field definition, line 55) — confirm `'registration_welcome'` is a valid
  value (free-form string, `min(1).max(60)`, no enum).
- `apps/api/src/modules/interactions/interactions.module.ts`,
  `apps/api/src/modules/leads/leads.module.ts` — to independently verify
  the claimed pre-existing circular-module-dependency graph.
- `apps/api/src/modules/admin-invites/admin-invites.service.ts` (line 353)
  — confirm the length-only password check there is genuinely untouched
  (scoping claim for MAJOR-3's fix).
- `apps/api/src/lib/email-schema.ts` (full) — confirm `password-schema.ts`
  genuinely mirrors this file's convention, as claimed.
- `apps/web-next/src/blocks/customer/LeadCaptureForm.tsx` (honeypot field,
  lines 186-194) and `apps/web-next/src/blocks/customer/LeadCaptureForm.test.ts`
  — confirm the `name="company"` / internal-state-`honeypot` split this
  file uses, to sanity-check the code summary's claim that `SignUpForm.tsx`
  (native form) cannot use the same split and had to rename both sides.
- `apps/api/src/modules/leads/leads.controller.ts` (`createSchema`, line
  34; honeypot check, line 53) — same purpose.
- Grepped the entire `apps/` tree, case-insensitive, for `honeypot` — to
  find any leftover functional reference in the changed files (found only
  comments/docs and unrelated e2e test files for the pre-existing
  `LeadCaptureForm`/`leads` flow; zero functional hits in `SignUpForm.tsx`
  or `auth.controller.ts`'s register path).

---

## Invariant Check Results (re-verified against the current diff)

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | Unchanged from prior pass — `country` is a Directus field write, not a `platform.*` tenant-scoped query. The new `InteractionsService.dispatch()` call resolves recipients via Directus `userIds` filter (`interactions.service.ts:226`), also not a `platform.*` tenant query. |
| INV-2 Secrets by reference | Yes | PASS | Grepped `registration.service.ts` for `password` (case-insensitive): zero occurrences in any `logger.log`/`logger.warn` call — only in variable names, parameter types, and comments. The new email body (`dispatchWelcomeEmail`) contains the `recoveryUrl` (a one-time login token) but never the password. This is the fix's whole point — the recovery URL now travels by email instead of by HTTP response — and is consistent with `dispatchVerifyEmail`'s precedent of emailing a sensitive one-time token. No new secret-logging pattern introduced by `password-schema.ts` (it only compares/rejects, never logs, the submitted password). |
| INV-3 Auth at controller level | Yes (inverted) | PASS | Unchanged — intentionally no `AuthGuard` on `register()`, still protected by `ThrottlerGuard`. Confirmed still present at lines 437 of `auth.controller.ts`, unmodified by this retry pass. |
| INV-4 Validation at boundaries | Yes | PASS | `registerSchema.safeParse(body)` still runs before any service call (`auth.controller.ts:443-446`). `password-schema.ts`'s `passwordField()` is a genuine `z.ZodEffects` wrapper — confirmed it is actually assigned to `registerSchema.password` (line 55 of `auth.controller.ts`: `password: passwordField(12)`), not just defined-but-unused. `company` (renamed honeypot) validated as `z.string().optional()`, same as before. |
| INV-5 No cross-schema queries | Yes | PASS | All new interaction dispatch traffic goes through `InteractionsService`/`DirectusClient`, no direct cross-schema JOIN introduced. |
| INV-6 Rate limiting | Yes | PASS | `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { limit: 5, ttl: 900_000 } })` confirmed still present and unmodified on `register()` (`auth.controller.ts:437-438`). The extra network call (email dispatch) added inside the success path does not add a second endpoint or bypass this guard — it's still one throttled request in, one response out. |
| INV-7 CSRF protection | Yes (reasoned, not reflexive) | PASS / N/A-in-practice | Unchanged reasoning from prior pass — no victim session exists to forge; not re-litigated here since nothing about this property changed in the retry pass. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | PASS | Zero occurrences in `SignUpForm.tsx`, confirmed by direct grep against the current file content (not just the prior pass's memory of it). |
| INV-9 No N+1 queries | Yes | PASS | `dispatchWelcomeEmail()` adds exactly one new call (`interactions.dispatch()`, which itself does one Directus recipient-fetch + one interaction-row create + one delivery-row create + one adapter send + one patch, all for a single, non-looped recipient — `resolveRecipients` batches its `userIds` filter query, confirmed at `interactions.service.ts:226-229`, not a per-ID loop). Not inside any loop over user-controlled data. |
| INV-10 Drizzle parameterization | No | N/A | Grepped `password-schema.ts` for `` sql` `` / `db.execute` — zero matches. No direct Drizzle usage introduced anywhere in this retry pass's diff. |
| INV-11 HttpOnly tokens (web) | Yes (indirect) | PASS | Unchanged — this pass touches no client-side token storage. |

---

## Verification of the 3 claimed fixes

### Fix 1 — Location header content as an email-enumeration oracle

**Traced the full response-construction path for all three outcomes,
current code:**

- **Honeypot branch** (`auth.controller.ts:452-456`): short-circuits in
  the controller before `RegistrationService` is ever called, sets
  `Cache-Control: no-store`, redirects `302` to the literal string
  `'/v1/auth/login'`. Unchanged from the prior pass (this path was already
  correct; only the field name feeding it changed — see Fix 2).
- **Duplicate-email branch** (`registration.service.ts:131-138`):
  `getUserByEmail()` found a match → logs `registration.duplicate_email`
  → `return this.fakeSuccessResult()`. `fakeSuccessResult()`
  (`registration.service.ts:303-305`) returns the literal
  `{ recoveryUrl: '/v1/auth/login' }`.
- **Genuine-success branch** (`registration.service.ts:223-241`): after
  the full provisioning sequence (create → setPassword → group-assign →
  Directus link → country write), the service now does: `const
  recoveryUrl = await this.authentik.createRecoveryLink(akUser.pk)` (the
  REAL Authentik URL) → `await this.dispatchWelcomeEmail({ ...,
  recoveryUrl })` → `return this.fakeSuccessResult()`. **The real
  `recoveryUrl` variable is passed only into `dispatchWelcomeEmail()` and
  is never returned from `register()`.** Traced this exhaustively: there
  is no `return { recoveryUrl }` or equivalent anywhere in the current
  file — the only `return` statements in `register()` are the early
  `fakeSuccessResult()` return (duplicate branch) and the final
  `fakeSuccessResult()` return (success branch, line 241). Grepped for
  every `return` in the file — confirmed `fakeSuccessResult()` is the
  terminal value on both live code paths that reach a `return` inside
  `register()` (the third "outcome," honeypot, never even enters this
  method — it's fully handled in the controller before `registration.register()`
  is invoked).
- **Controller** (`auth.controller.ts:457-464`): `const { recoveryUrl } =
  await this.registration.register(...)` then unconditionally
  `res.redirect(HttpStatus.FOUND, recoveryUrl)`. Since `register()` now
  always resolves to the same literal string on every path that reaches
  this line, this redirect is byte-identical to the honeypot branch's
  redirect above it.

**Conclusion: (a) the real Authentik recovery URL is never present in any
HTTP response from `/v1/auth/register`, confirmed by full trace, not
assumption. (b) all three outcomes produce byte-identical status, headers
(`Cache-Control: no-store`), and `Location` (`/v1/auth/login`) — confirmed,
not just claimed.**

**New email-dispatch code checked for new issues:**

- `InteractionsService.dispatch()`'s call shape
  (`{ initiatorActor: 'system', audience: { userIds: [directusUserId] },
  intent: 'registration_welcome', payload: { subject, text }, consentBasis:
  'operational_contract', allowedChannels: ['email'] }`) matches
  `dispatchVerifyEmail`'s precedent field-for-field. `intent` is a
  free-form `z.string().min(1).max(60)` (`interactions.types.ts:55`), not
  an enum, so `'registration_welcome'` (20 chars) is valid — no schema
  rejection risk.
- `consentBasis: 'operational_contract'` — read `consent.service.ts`'s own
  doc comment (lines 15-17): `operational_contract → always pass
  (transactional reply for an action the user just took: **registration
  confirmation**, password reset, ...)`. This is not merely an analogous
  precedent — **registration confirmation is the literal, named example**
  in the codebase's own consent-basis documentation. This is the correct
  consent basis, confirmed against the authoritative source, not just
  against another call site.
- Email content: the plaintext body includes the real `recoveryUrl` — this
  is intentional and correct (this is now the *only* place the sensitive
  token is transmitted, by design, matching `dispatchVerifyEmail`'s
  identical pattern of emailing a one-time verify token). No email address
  or other PII beyond what the registrant themselves just submitted is
  included.
- Failure handling: `dispatchWelcomeEmail()` guards on `!directusUserId`
  (logs a `warn` and returns early — the case where the best-effort
  Directus link in step 6/7 didn't produce a row) and separately wraps the
  `interactions.dispatch(...)` call itself in `.catch()` (logs `warn` on
  any dispatch failure, e.g. `resolveRecipients` throwing on zero
  recipients if the Directus row was deleted between step 6 and step 8 —
  an edge case, but caught). Neither failure path throws, so a mail-
  provider or Directus blip cannot fail a registration that has already
  fully succeeded in Authentik — same "never fail a succeeded registration
  over a best-effort side-effect" philosophy already established for the
  country-write step. Confirmed by direct read, not assumed.
- Net effect on the previously-acknowledged timing side-channel: the
  success path now does *one more* sequential network call than before
  (the email dispatch), which if anything slightly widens, not narrows,
  the already-accepted (MAJOR-adjacent-but-not-blocking, rate-limit-
  bounded) timing gap between success and duplicate/honeypot branches.
  This was not one of the 3 MAJOR findings and was already judged
  acceptable in the prior pass; noting it is unchanged in that judgment,
  not re-opening it.

**`AuthModule → InteractionsModule` / `telegram.module.ts` comment — sanity
checked, independently, not accepted from the code summary:**

Read all three modules' actual `imports` arrays:
- `interactions.module.ts:22`: `imports: [DirectusModule, EmailModule,
  TelegramModule]`
- `telegram.module.ts:73`: `imports: [forwardRef(() => AuthModule),
  AuthentikModule, DirectusModule, EmailModule]`
- `leads.module.ts:25`: `imports: [DirectusModule, InteractionsModule]`
- `auth.module.ts:19` (now): `imports: [UsersModule, DirectusModule,
  LeadsModule, AuthentikModule, InteractionsModule]`

This independently confirms the claimed graph: `AuthModule` already
reached `InteractionsModule` transitively via `AuthModule → LeadsModule →
InteractionsModule → TelegramModule → AuthModule` **before** this PR (since
`AuthModule` already imported `LeadsModule`, which already imported
`InteractionsModule`). Adding a direct `AuthModule → InteractionsModule`
edge does not introduce a new module into the existing cycle — it shortens
an existing path by one hop. The `forwardRef` is (and was) needed only on
`TelegramModule`'s side (the edge that would otherwise be unresolved at
import time), which is untouched by this diff. The updated comment in
`telegram.module.ts` accurately describes this. This reasoning is also
corroborated by the code summary's cited empirical evidence (clean `nest
build`, 1267 passing API tests, no `UndefinedModuleException`) — consistent
with, not contradicted by, the static graph analysis above.

**Fix 1 verdict: CONFIRMED CLOSED. No gap found.**

### Fix 2 — Honeypot field renamed from `honeypot` to `company`

Traced the full request path:

1. **JSX field** (`SignUpForm.tsx:156-165`): `<input type="text"
   name="company" value={form.company} onChange={...} tabIndex={-1}
   autoComplete="off" aria-hidden="true" className="sr-only" />` — the
   wire `name=` attribute is `company`.
2. **Client state** (`SignUpForm.tsx:41-55`): `FormState.company: string`,
   `EMPTY.company: ''`. No leftover `honeypot` key in the interface or
   default object — confirmed by full-file read.
3. **What arrives server-side**: this is a **native** `<form method="POST"
   action="/api/v1/auth/register">` (confirmed no `apiClient`/`fetch`
   import anywhere in `SignUpForm.tsx`) — the browser serializes form
   fields using their literal `name=` attributes with no JS-side
   remapping layer possible. So the POST body's key is `company`,
   matching the JSX.
4. **Server schema** (`auth.controller.ts:67`): `company:
   z.string().optional()` — the Zod key is also `company`.
5. **Controller check** (`auth.controller.ts:452`): `if (parsed.data.company
   && parsed.data.company.length > 0)` — reads the same key the schema
   validated.

**All five links agree on `company`.** This is the correct behavior —
critically, this differs from `LeadCaptureForm.tsx`/`leads.controller.ts`,
where the JSX field is `name="company"` but the client-side `FormState`
and the wire body key are `honeypot` (confirmed by reading
`LeadCaptureForm.tsx:186-190` and `buildLeadBody`'s mapping, and
`leads.controller.ts:34,53`'s `createSchema.honeypot` /
`parsed.data.honeypot`) — that split works there ONLY because
`LeadCaptureForm.tsx` is a `fetch()`-based JSON POST that explicitly
remaps `company` → `honeypot` client-side before sending. `SignUpForm.tsx`
has no such remapping step (native form POST, required for the 302-
redirect-follow behavior), so its JSX name, its `FormState` key, and the
server Zod key all had to become `company` in lock-step. The code
summary's explanation of *why* the two forms differ is accurate, verified
against both files' actual code, not just the summary's prose.

Grepped the entire `apps/` tree case-insensitively for `honeypot`: the only
hits inside `SignUpForm.tsx` and `auth.controller.ts`'s register-related
code are explanatory **comments** (documenting the rename and cross-
referencing the two files), not functional code. No `.spec.ts`/`.test.ts`
file references the old field name for either file (none exist yet for
this feature — unchanged known limitation, TestDesigner's job).

**Fix 2 verdict: CONFIRMED CLOSED. No mismatch, no gap. The anti-spam
mechanism is intact and now uses an innocuous name consistent with the
sibling `LeadCaptureForm.tsx` convention.**

### Fix 3 — Password policy hardening

Read `apps/api/src/lib/password-schema.ts` in full (104 lines):

- `isAllOneCharacter()` — rejects passwords where `new Set(password).size
  === 1` (e.g. `aaaaaaaaaaaa`). Correct, list-free, catches an entire
  trivial class.
- `COMMON_PASSWORDS` — a 38-entry `ReadonlySet<string>` of lowercase
  common/weak 12+-char patterns, compared case-insensitively via
  `isCommonPassword()`.
- `isWeakPassword()` — `isAllOneCharacter(password) ||
  isCommonPassword(password)`.
- `passwordField(minLength = 12)` — returns `z.string().min(minLength)
  .refine((password) => !isWeakPassword(password), { message:
  WEAK_PASSWORD_MESSAGE })`. This is a genuine `z.ZodEffects<z.ZodString,
  string, string>` — a real, functioning Zod schema, not a stub.

**Is it actually wired up?** Confirmed yes, not just present-but-unused:
`auth.controller.ts:21` imports `passwordField` from `'../../lib/password-schema'`,
and `registerSchema` (line 55) sets `password: passwordField(12)` —
replacing what was previously `z.string().min(12)`. Grepped
`auth.controller.ts` for `z.string().min(12)` and confirmed zero
remaining occurrences of the old bare check for the password field. This
genuinely gates the endpoint — a request with a weak password (e.g.
`aaaaaaaaaaaa` or `password123`) will fail `registerSchema.safeParse(body)`
and get a `400 BadRequestException` before `RegistrationService` is ever
invoked, per the existing INV-4 validation-at-boundary pattern.

**Client-side mirror check** (`SignUpForm.tsx:71-82`, `validate()`):
confirmed the client only mirrors the all-one-character check
(`form.password.length > 0 && new Set(form.password).size === 1`) — the
`COMMON_PASSWORDS` blocklist is **not** duplicated client-side, matching
the code summary's claim exactly. This is a reasonable design choice: the
blocklist stays server-side-only (one authoritative copy, no drift risk,
and — as the finding's original framing anticipated — not shipping a
common-password list to the client also avoids trivially revealing exactly
which 38 passwords are blocked, though this is a very minor point since
the server enforces it regardless of what the client discloses). A
password that slips past the lighter client check but hits the server's
blocklist surfaces via the already-accepted "raw JSON navigation on rare
server-side 400s" known limitation — an existing, previously-accepted
UX gap, not a new one introduced by this fix.

**Scoping check**: confirmed `admin-invites.service.ts:353`'s
`if (input.password.length < 12)` is untouched — still the bare length
check, `passwordField()` was not retrofitted there. This matches the code
summary's claim and its stated rationale (operator-invited flow, smaller
exposure surface, separate blast radius, out of scope for this retry).
`password-schema.ts`'s own header comment documents this scoping decision
explicitly, so it reads as a deliberate choice, not an oversight, to a
future reader.

**Structural convention check**: confirmed `password-schema.ts` mirrors
`email-schema.ts`'s exact shape (drop-in Zod-field factory function +
exported pure predicate for reuse/testability) by reading both files side
by side — the claim is accurate.

**Residual, correctly-disclosed limitation**: whether Authentik's own
server-side Password Policy stage is bound to this flow remains
unverified from code (unchanged from the original review — this was never
claimed to be resolved by this fix, only that a code-level floor now
exists independent of it). This is honestly disclosed in both
`password-schema.ts`'s header comment and the code summary's "Known
Limitations," not silently dropped.

**Fix 3 verdict: CONFIRMED CLOSED. Genuinely wired up, not a dangling
unused file. No new issue from the client-side partial mirror (a lighter
client check backed by a fuller, non-bypassable server check is a
reasonable and common pattern, not a security gap — the server is the
actual boundary per INV-4 and this codebase's own stated convention that
"client validation is not a security boundary").**

---

## BLOCKER Findings

None.

## MAJOR Findings

None. All 3 MAJOR findings from the prior pass are confirmed genuinely
resolved by direct code trace (not accepted from the code summary's
self-report):

1. **Location header oracle — CLOSED.** All three outcomes
   (`auth.controller.ts:452-464`, `registration.service.ts:131-138,223-241,303-305`)
   trace to the byte-identical `{ recoveryUrl: '/v1/auth/login' }` /
   `302 Location: /v1/auth/login` response. The real Authentik recovery
   URL is confirmed, by exhaustive trace of every `return` in
   `register()`, to never leave the service except via the new
   `dispatchWelcomeEmail()` → `InteractionsService.dispatch()` email path,
   which correctly uses the `operational_contract` consent basis (the
   literal documented example for "registration confirmation" in
   `consent.service.ts`'s own comment) and fails safe (best-effort,
   `.catch()`-wrapped, never blocks a completed registration). The new
   `AuthModule → InteractionsModule` import does not introduce a new
   circular-dependency class — independently confirmed via static
   module-graph analysis of `interactions.module.ts`, `leads.module.ts`,
   `telegram.module.ts`, and `auth.module.ts`, not just accepted from the
   updated comment.
2. **Honeypot naming — CLOSED.** `name="company"` (JSX) and `company`
   (Zod schema key, controller check) agree at every hop of the actual
   request path, confirmed by full trace of `SignUpForm.tsx` and
   `auth.controller.ts`. No leftover functional `honeypot` reference
   anywhere in either file (grepped the whole `apps/` tree to confirm).
3. **Password policy — CLOSED (with the same honestly-disclosed residual
   noted in both passes).** `passwordField(12)` is genuinely wired into
   `registerSchema.password` (not a dangling unused file), rejects
   all-one-character and a 38-entry common-password set, mirrors
   `email-schema.ts`'s convention, and is deliberately scoped only to the
   public endpoint (confirmed `admin-invites.service.ts` untouched). The
   live-Authentik-side-policy question remains unverified from code, as
   both this pass and the prior pass have consistently and honestly
   disclosed — this was never presented as fully resolved, only as having
   a new code-level floor, which is accurate.

No new issues were introduced by any of the three fixes.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Re-review of CodeDeveloper's retry pass against all 3 prior MAJOR findings on ISS-USR-REG-001's public self-registration endpoint. All three independently re-verified as genuinely closed by direct trace of the current code (not accepted from the code summary's self-report): (1) Location-header email-enumeration oracle — all three outcomes (genuine success, duplicate-email, honeypot) now trace to the byte-identical '/v1/auth/login' redirect; the real Authentik recovery URL is confirmed, by exhaustive trace of every return statement in RegistrationService.register(), to leave the service only via a new best-effort email dispatch (InteractionsService.dispatch(), correct operational_contract consent basis per consent.service.ts's own documented example of 'registration confirmation') and never via the HTTP response. The new AuthModule->InteractionsModule import was independently confirmed, via static module-graph read of all four involved modules, not to introduce a new circular-dependency class beyond the one already present (and already broken via forwardRef) before this change. (2) Honeypot field renamed to `company` — traced JSX name= attribute, client FormState key, wire POST body key, and server Zod schema key: all five hops agree, no mismatch, no leftover functional 'honeypot' reference anywhere (full-tree grep). Correctly identified why this differs from LeadCaptureForm.tsx's split naming (fetch-based JSON remapping vs. native-form no-remapping). (3) Password policy — apps/api/src/lib/password-schema.ts's passwordField() is genuinely imported and wired into registerSchema.password (confirmed old bare z.string().min(12) no longer present), rejecting all-one-character and a 38-entry common-password set; deliberately and correctly scoped to only the public endpoint (admin-invites.service.ts confirmed untouched); client-side mirror confirmed to include only the cheap all-one-character check, not the full blocklist, as claimed. Full INV-1..11 checklist re-run against the current (larger) diff including the new password-schema.ts file and InteractionsService dependency — all still pass or correctly N/A, no new violation. No BLOCKER, no MAJOR findings. Gate: passed."
  findings:
    - "MAJOR-1 (Location header oracle) CONFIRMED CLOSED: exhaustive trace of every return in registration.service.ts's register() shows the real Authentik recoveryUrl is passed only to the new dispatchWelcomeEmail() (best-effort, .catch()-wrapped, correct operational_contract consent basis matching consent.service.ts's own literal 'registration confirmation' example) and never returned to the controller; all three outcomes resolve to the identical fakeSuccessResult() / '/v1/auth/login' redirect."
    - "MAJOR-1 sub-check CONFIRMED: the new AuthModule -> InteractionsModule direct import does not introduce a new circular-dependency class — independently verified via static read of interactions.module.ts, leads.module.ts, telegram.module.ts, auth.module.ts; the cycle already existed via AuthModule -> LeadsModule -> InteractionsModule -> TelegramModule -> AuthModule and is already broken via forwardRef on TelegramModule's side, untouched by this diff."
    - "MAJOR-2 (honeypot naming) CONFIRMED CLOSED: name=\"company\" (JSX), FormState.company (client state), company (wire POST key, native form so no JS remapping possible), company (Zod schema key + controller check) all agree at every hop; zero leftover functional 'honeypot' references in either changed file (full apps/ tree grep, case-insensitive)."
    - "MAJOR-3 (password policy) CONFIRMED CLOSED: passwordField(12) genuinely imported and assigned to registerSchema.password (old bare min(12) check confirmed gone); rejects all-one-character passwords and a 38-entry common-password set; correctly scoped to only the public endpoint (admin-invites.service.ts:353's bare length check confirmed untouched); client-side validate() confirmed to mirror only the all-one-character check, not the blocklist, as claimed — not a security issue since the server is the actual boundary (INV-4)."
    - "Re-ran full INV-1..11 checklist against the grown diff (password-schema.ts, InteractionsService dependency, auth.module.ts, telegram.module.ts) — all still PASS or correctly N/A. No new secret-logging, no new N+1, no new dangerouslySetInnerHTML, no raw SQL, rate limiting (5/15min ThrottlerGuard) confirmed still intact and unmodified."
    - "Noted, not a new finding: the success path's timing profile is now slightly worse (one extra network call for email dispatch) than before this retry pass, which very slightly widens rather than narrows the timing side-channel the original review judged acceptable-but-real and bounded by rate limiting. Not one of the 3 MAJOR findings in scope; not re-opened here, consistent with both passes' framing."
  major_findings_for_retry: []
```
