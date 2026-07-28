# SecurityReviewer — Security Review for FR-ADM-010

**Workflow:** wf-20260728-feat-148
**Agent:** SecurityReviewer
**Input:** `02-impact-analysis.md` (gate: passed), `03-code-summary.md` (gate: passed)

---

## Code Changes Reviewed

- `apps/api/src/modules/admin-invites/admin-bootstrap.service.ts` (new, 159 lines) — read in full
- `apps/api/src/modules/admin-invites/authentik.client.ts` (modified — `SUPER_ADMIN_GROUP` constant extracted; also re-read `request()`, `createUser()`, `setPassword()`, `resolveGroupNames()`, `setUserGroups()`, `patchAttributes()`, `getUserByEmail()` in full to verify claims independently)
- `apps/api/src/modules/admin-invites/super-admin.guard.ts` (modified — imports shared constant, no behavior change)
- `apps/api/src/modules/admin-invites/admin-invites.module.ts` (modified — registered `AdminBootstrapService` provider, no new `imports`)
- `apps/api/src/config/env.ts` (modified — `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` added to `envSchema`)
- `apps/api/.env.example` (modified — both vars documented, blank secret value)
- `docs/04-development/architecture/auth-architecture.md` (modified — new §9.5)

Verified via `git status --porcelain` that this changed-file set is complete and exact (one new untracked file + 6 modified tracked files under review; `.copilot/meta/next-workflow-id` and `.copilot/tasks/active/wf-20260728-feat-148/` are workflow bookkeeping, not application code, out of scope for this review).

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A (confirmed) | Grepped the full diff: zero Drizzle imports, zero `db.`/`sql\`` usage, zero `countryCode` references anywhere in `admin-bootstrap.service.ts` or the other changed files. This flow never touches Postgres — confirmed independently, not just trusting the code summary's claim. No tenant-scoped table is read or written. |
| INV-2 Secrets by reference | Yes | **Pass** | Grepped every changed file for literal secret strings. `.env.example`: `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD=` is blank (no real value). `env.ts`: no default/literal value for the password var (`.min(12).optional()`, no `.default(...)`). `auth-architecture.md` §9.5: documents variable names and format only, explicitly states "not a live value," no live password string present anywhere in the diff. `admin-bootstrap.service.ts`: the password only ever flows as a function parameter (`seedAdmin(password: string)` → `createOrRecoverSeedUser(email, password)` → `this.authentik.setPassword(created.pk, password)`), never as a literal. Confirmed the one place it leaves this file is the outbound `setPassword()` call to Authentik's own API — the intended, necessary transmission, not a leak. |
| INV-3 Auth at controller level | No | N/A (confirmed) | Grepped `admin-bootstrap.service.ts` for `@Controller`/`@Post`/`@Get`/`@Put`/`@Patch`/`@Delete` — zero matches. No controller, no route, of any kind is added or modified by this diff. `admin-invites.module.ts`'s `controllers` array is unchanged (`AdminInvitesController`, `OnboardingController` only); `AdminBootstrapService` was added only to `providers`. Code summary's "zero new routes" claim independently confirmed against the diff, not merely trusted. |
| INV-4 Validation at boundaries | Partial / Yes | **Pass** | No controller/webhook/queue-consumer boundary is added (consistent with INV-3). The one new external-input boundary this PR does add — `process.env` via `envSchema` in `env.ts` — is Zod-validated: `ADMIN_BOOTSTRAP_EMAIL: z.string().email().default(...)`, `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD: z.string().min(12).optional()`. Correct application of the "process env is an external-input boundary" rule per `AGENTS.md`/`standards.md`. |
| INV-5 No cross-schema queries | No | N/A (confirmed) | No SQL/Drizzle of any kind in the diff (see INV-1). All data access is via `AuthentikClient`'s REST calls to Authentik's own API — a single external system, not a cross-schema Postgres JOIN. Consistent with ADR-0021 §1's "Authentik-owned schema, accessed via its own API, not direct SQL" boundary. |
| INV-6 Rate limiting | No | N/A (confirmed) | No new public (or any) HTTP endpoint is added — see INV-3. Rate limiting applies to endpoints; there is no endpoint here to rate-limit. `OnModuleInit` runs once per process boot, not per request, so a rate-limit control would be a category error for this trigger mechanism. |
| INV-7 CSRF protection | No | N/A (confirmed) | No browser-initiated state-changing operation is added. The only state change (`createUser`/`setPassword`/`setUserGroups`/`patchAttributes` against Authentik) is triggered server-side by `OnModuleInit` at process boot, never by an incoming browser request through this codebase. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | **Pass** | Grepped all 7 changed files (all backend TS/Markdown) — zero occurrences. No React/JSX touched at all in this diff. |
| INV-9 No N+1 queries | No | N/A (confirmed) | `resolveGroupNames([SUPER_ADMIN_GROUP])` is called with a single-element array in both call sites (`hasSuperAdminMember()`, `seedAdmin()`) — one HTTP request each, not a loop. No query-in-a-loop pattern anywhere in the new service; total Authentik calls per boot are bounded (2× `resolveGroupNames`, plus `createUser`/`setPassword`/`setUserGroups`/`patchAttributes` at most once each on the zero-admin path). Not a Postgres query concern at all here (no Drizzle), but confirmed the loop-free property holds for the Authentik HTTP calls too. |
| INV-10 Drizzle parameterization | No | N/A (confirmed) | No `sql\`...\`` tags, no `db.execute()`, no Drizzle usage anywhere in the diff (see INV-1/INV-5). |
| INV-11 HttpOnly tokens (web) | No | N/A (confirmed) | Zero `apps/web`/`apps/web-next` files in the diff; no cookie, `localStorage`, or token-handling code touched. This PR is entirely `apps/api` (backend) + one doc file. AC-3/AC-6's forced-password-change UI is Authentik-hosted, outside this codebase's frontend surface, per the impact analysis. |

**All 11 invariants checked systematically. 2 applicable-and-passing (INV-2, INV-8); 1 applicable-and-passing via the process-env boundary (INV-4); 8 confirmed N/A against the actual diff (not assumed).**

---

## Independent verification of the two ImpactAnalyzer risk flags

### Risk flag 1 — fixed default password as a new secret

- **No real password value was invented or committed anywhere.** Confirmed by reading (not just grepping) `.env.example` (`ADMIN_BOOTSTRAP_DEFAULT_PASSWORD=` — blank), `env.ts` (no `.default(...)` on that field — Zod schema enforces `.min(12)` but supplies no value), and `auth-architecture.md` §9.5 (explicitly states "format/location only, not a live value" and contains no live string). This satisfies AGENTS.md §5/§6 and the security baseline's Secrets Management section ("Never in code. Never in git.").
- **Live-credential exposure window is real and irreducible within this PR's scope.** Between "seeded user created + group-assigned" and "operator completes first login (forcing the password change)," the fixed password is a valid, working credential to `aiqadam-super-admin` — full platform access — for anyone who knows (a) the fixed email and (b) whatever value the operator supplied for `ADMIN_BOOTSTRAP_DEFAULT_PASSWORD` in that environment. This is architecture-level and not fixable by a code change in this PR: it is inherent to "bootstrap a known-credential account automatically." I agree with ImpactAnalyzer's framing that this is an accepted trade-off, and note the FR's own Description explicitly compares it favorably to the manual process it replaces (a human choosing a password out-of-band had the same or worse exposure characteristics, plus operational toil). This is not a new class of risk introduced by this PR; it is the same risk shape the platform already accepted for the manual bootstrap, now automated with a **shorter** window (attacker needs to win the race before the *first* login, not before some indefinite manual setup completes) and the forced-password-change mechanism as a bound on how long the fixed credential stays valid *after* first use — modulo Known Limitation 5 below (that mechanism is itself unverified).
- **Authentik's login-form rate-limiting is, per this diff, the only mitigation against credential-stuffing of a known email+password pair.** I confirmed no additional compensating control was added in this PR (no IP allowlist, no bootstrap-window firewall rule, no "delete/rotate credential automatically after N minutes if unused" logic — none of these were in scope per the FR/impact analysis, and none appear in the diff). This is correctly out of this PR's fixable surface — it is an Authentik-native/infrastructure-level control, not something `admin-bootstrap.service.ts` can implement. **Recommendation for the record (non-blocking):** the operator playbook / runbook for a fresh deploy should explicitly instruct completing first login (and thus the forced password change) as close to zero-delay after bootstrap as operationally possible, and ideally the environment should not have inbound access from the public internet fully open at the moment the seeded account is created (deploy-then-DNS-cutover ordering, or a firewall rule during initial provisioning) — this is a deployment/runbook recommendation, not a code blocker, consistent with ImpactAnalyzer's framing that this is "not fixable in this PR."
- **Verdict: not a BLOCKER.** This is a pre-accepted architectural trade-off, explicitly reasoned about in the FR text, with no worse posture than the process it replaces, and no cheaper mitigation available within this PR's diff surface. Recorded as an accepted risk, not a finding requiring code changes.

### Risk flag 2 — idempotency check keying

**Independently verified by reading `admin-bootstrap.service.ts` directly** (not trusting the code summary's claim). Confirmed at lines 91–95:

```ts
private async hasSuperAdminMember(): Promise<boolean> {
  const groups = await this.authentik.resolveGroupNames([SUPER_ADMIN_GROUP]);
  const group = groups[0];
  return (group?.users.length ?? 0) >= 1;
}
```

This is called from `onModuleInit()` (line 73: `const alreadyBootstrapped = await this.hasSuperAdminMember();`) as the sole gate on whether `seedAdmin()` runs. The check is keyed on **`aiqadam-super-admin` group membership count** (`group.users.length >= 1`), exactly as ImpactAnalyzer's risk-flag recommendation specified — **not** on "does the seeded email exist." This closes the partial-failure gap: if a prior boot's `createUser()` succeeded but `setUserGroups()` failed, the group's `users` array is still empty, so `hasSuperAdminMember()` returns `false` and the next boot retries the full sequence rather than treating the orphaned user as "already bootstrapped." The complementary recovery path (`createOrRecoverSeedUser()`, lines 127–158) correctly handles the resulting `createUser()` "email already taken" 4xx by falling back to `getUserByEmail()` and continuing group assignment on the recovered user, rather than crash-looping or silently no-op'ing. **Verdict: confirmed correctly implemented, no finding.**

---

## Additional independent check — does any log line leak the password?

Read every `this.logger.*` call site in `admin-bootstrap.service.ts` (5 total) individually:

| Line(s) | Call | Contents |
|---|---|---|
| 61–63 | `logger.warn` | Static string, no interpolation — config-missing message |
| 67–69 | `logger.warn` | Static string, no interpolation — config-missing message |
| 75 | `logger.debug` | Static string — no-op message |
| 117–119 | `logger.log` | `email=${email} pk=${user.pk} group=${SUPER_ADMIN_GROUP}` — no `password` |
| 141–142 | `logger.warn` | `status=${err.status}` + `email` — no `password` |
| 146–147 | `logger.error` | `${err.status}` + `email` — no `password` |
| 153–154 | `logger.error` | `err.message` / `String(err)` — no `password` variable interpolated |

**Confirmed: zero log lines in this file reference the `password` variable or `env.ADMIN_BOOTSTRAP_DEFAULT_PASSWORD`.** Every log call that includes user-identifying context uses `email`/`pk`/`group`/error status/error message only, matching the security baseline's "never log secrets... What we don't log: Passwords, tokens" rule and AGENTS.md §5's "Never log secrets."

One adjacent observation, not a finding against this diff: `AuthentikClient.request()` (pre-existing method, only touched by this PR to the extent that `SUPER_ADMIN_GROUP` was added above it in the same file — `request()` itself is unmodified) logs the **response body** on non-2xx (`this.logger.warn(\`Authentik ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}\`)`, line 280) — never the **request** body, so the outgoing password in `setPassword()`'s request is not logged by this path either. Verified this is pre-existing, unmodified behavior (confirmed via `git diff` — only the `SUPER_ADMIN_GROUP` constant and its comment block were added to this file; `request()` is untouched), so it is out of scope as a "changed code" finding, but noted here since it was a natural place to check for a password leak and came back clean on inspection.

---

### BLOCKER Findings

None.

### MAJOR Findings

None.

---

## Gate Result

```yaml
gate_result:
  agent: security-reviewer
  workflow_id: wf-20260728-feat-148
  status: passed
  summary: >
    All 11 invariants checked systematically against the actual diff, not
    assumed from the code summary. INV-1/3/5/6/7/9/10/11 confirmed N/A by
    direct inspection (no Postgres access, no Drizzle, no new controller/
    route, no browser-facing state change, no loop-based queries, no
    frontend/token code touched — all independently verified, not taken on
    trust). INV-2 (secrets by reference) and INV-4 (validation at
    boundaries) are applicable and pass: no literal secret value appears
    anywhere in the diff (grepped .env.example, env.ts, and
    auth-architecture.md directly), and the new process-env boundary
    (ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_DEFAULT_PASSWORD) is
    Zod-validated. INV-8 (dangerouslySetInnerHTML) confirmed zero
    occurrences. Independently verified both ImpactAnalyzer risk flags by
    reading admin-bootstrap.service.ts directly: (1) the fixed default
    password is a genuine new secret with no committed value anywhere, the
    live-credential exposure window between account creation and
    forced-password-change completion is real but architecture-level and
    not fixable within this PR's diff surface, Authentik's own login-form
    rate-limiting is confirmed as the only mitigation present, and this is
    accepted as a pre-existing trade-off no worse than the manual process
    it replaces (per the FR's own Description) — not a blocker; (2) the
    idempotency check at lines 91-95 is confirmed keyed on
    aiqadam-super-admin GROUP MEMBERSHIP COUNT
    (group.users.length >= 1), not seeded-email existence, exactly as
    recommended, closing the partial-failure gap. Independently
    line-by-line audited all 5 this.logger.* call sites in the new service
    and confirmed none interpolate the password value or the
    ADMIN_BOOTSTRAP_DEFAULT_PASSWORD env var — only email/pk/group/error
    status/error message are logged, matching the security baseline's
    "never log secrets" rule. Zero BLOCKER, zero MAJOR findings.
  blocker_findings: []
  major_findings: []
  accepted_risks_noted_not_blocking:
    - "Fixed default password creates a live-credential exposure window between seeded-account creation and forced-password-change completion; Authentik's native login-form rate-limiting is the only mitigation present in this diff. Architecture-level trade-off, explicitly reasoned about in the FR text, no worse than the manual process it replaces. Non-blocking recommendation for the operator runbook (not this PR): complete first login as close to zero-delay after bootstrap as operationally possible."
    - "AdminBootstrapService's forced-password-change attribute (ak_login_password_change_required) remains unverified against a live Authentik instance, per CodeDeveloper's own flagged Known Limitation — this bounds how long the fixed credential stays valid after first use, so it is relevant to the exposure-window risk above. BP-UAT-020 is the named follow-up verification point; not a security-review blocker since CodeDeveloper was explicitly instructed not to claim live verification and did not."
  invariants_applicable: [INV-2, INV-4, INV-8]
  invariants_na_confirmed: [INV-1, INV-3, INV-5, INV-6, INV-7, INV-9, INV-10, INV-11]
  next_agent: quality-gate
```
