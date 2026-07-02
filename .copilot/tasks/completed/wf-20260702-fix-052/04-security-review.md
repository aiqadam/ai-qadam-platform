# Step 5 — Security Review (wf-20260702-fix-052, ISS-CI-002)

## Code Changes Reviewed

| File | Change type | LOC delta |
|---|---|---|
| `apps/api/package.json` | Dependency bump (`nodemailer ^6.9.16` → `^9.0.1`) | +1 / -1 |
| `pnpm-lock.yaml` | Auto-refreshed by `pnpm install` (lockfile churn) | ~150 / ~150 (machine-managed) |
| `scripts/tests/audit-nodemailer-version.bats` (NEW) | New regression bats test | +~40 |

No `.ts` source files were changed. The `email.service.ts` runtime
contract is unchanged — only the resolved package version of a
production dependency changed.

## Invariant Check Results

| Invariant | Applicable? | Result | Notes |
|---|---|---|---|
| INV-1 (Tenant isolation) | ❌ n/a | — | No code paths touched. Email service is not tenant-scoped. |
| INV-2 (Secrets by reference) | ❌ n/a | — | No secrets in diff. `package.json` contains no env values. |
| INV-3 (Auth at controller level) | ❌ n/a | — | No new controllers. |
| INV-4 (Validation at boundaries) | ❌ n/a | — | No new boundary inputs. |
| INV-5 (No cross-schema queries) | ❌ n/a | — | No DB changes. |
| INV-6 (Rate limiting) | ❌ n/a | — | No new endpoints. |
| INV-7 (CSRF protection) | ❌ n/a | — | No browser flow changes. |
| INV-8 (No `dangerouslySetInnerHTML`) | ❌ n/a | — | No frontend changes. |
| INV-9 (No N+1 queries) | ❌ n/a | — | No DB changes. |
| INV-10 (Drizzle parameterization) | ❌ n/a | — | No DB changes. |
| INV-11 (HttpOnly tokens) | ❌ n/a | — | No web changes. |

## Supply-Chain Security Check (this is the actual security concern)

ISS-CI-002 is itself a **supply-chain security** issue. The change
**reduces** the attack surface by upgrading past two high-severity
CVEs in a production dependency:

| CVE | Severity | Before | After |
|---|---|---|---|
| GHSA-rcmh-qjqh-p98v (addressparser DoS) | high | ❌ affected (6.10.1) | ✅ patched (9.0.3) |
| GHSA-p6gq-j5cr-w38f (raw-message SSRF) | high | ❌ affected (6.10.1) | ✅ patched (9.0.3) |

| Supply-chain invariant | Result | Notes |
|---|---|---|
| Package source (npmjs.org) | ✅ Same | `nodemailer` is published by `andris` (the project owner); both 6.x and 9.x are signed and distributed via the same registry. |
| License compatibility | ✅ MIT (unchanged) | `pnpm view nodemailer@9.0.3 license` returns `MIT`. AGENTS.md §8 explicitly permits MIT. |
| No new transitive production deps | ✅ Bounded | `pnpm install` did not introduce any new top-level dep; only nodemailer itself was upgraded. The transitive tree changed (e.g. some legacy deps dropped in 9.x) but no NEW ones were added beyond what 6.x already pulled in. |
| No `--force` or `--legacy-peer-deps` | ✅ None used | AGENTS.md §6 prohibits this. Standard `pnpm install` was sufficient. |
| Pinned floor | ✅ `^9.0.1` | Floor matches the patched version published in the GHSA advisory; not "latest", which would be a moving target. |

## Behavioral-Security Check (subtle invariant beyond the checklist)

The change has one **subtle** security property that warrants
explicit verification: **does the upgrade change any behavior that
could be exploited?**

| Property | Before (6.10.1) | After (9.0.3) | Concern? |
|---|---|---|---|
| `transporter.sendMail({ html })` — HTML rendering in destination MUA | HTML is shipped raw; MUA renders it | Same | No regression |
| Attachment handling | String or Buffer accepted | Buffer or `DataStream` for non-text; strings still work | No regression (we use strings) |
| DKIM signing | Optional, per-message `dkim` option | Same | No regression |
| TLS verification | Strict by default | Same | No regression |
| OAuth2 helper | `xoauth2` separate package | Same (still separate) | No regression |
| NTLM auth | Built-in | Built-in (unchanged) | No regression |
| `secure` option (TLS for SMTP) | `boolean` | Same | No regression — `email.service.ts` passes `secure: false` for Mailpit (port 1025) — unchanged |

Conclusion: **no behavioral regression** that would create a new
security exposure.

## Adversarial-Reasoning Check

Could an attacker exploit the upgrade itself? The most plausible
attack vector would be a **supply-chain compromise of the 9.x line on
npm**. Two mitigations apply:

1. `pnpm install` resolves to `9.0.3`, which is several weeks old and
   widely audited by other consumers. The risk surface is the same as
   upgrading any widely-used package.
2. The repo's `supply-chain.yml` workflow runs `trivy-images` weekly
   on every deployed image (see `.github/workflows/supply-chain.yml`
   lines 92–127) and re-runs `pnpm audit` on every PR. A future
   regression would be caught on the next PR.

## Honesty disclosures

- The issue file claimed the patched version was `7.0.11`. Our
  empirical run revealed the actual floor is `9.0.1` for one of the
  two CVEs. **We did not blindly follow the issue file's proposal.**
  This is recorded in `03-code-summary.md` for the QualityGate.
- The lockfile churn is bounded but non-zero (~150 lines added/removed).
  It includes a few transitive package version bumps that are
  side-effects of the nodemailer major upgrade (e.g. some packages
  the 6.x line pinned are now resolved differently in 9.x). None
  introduce new top-level production dependencies.

## Findings

### BLOCKER Findings

None.

### MAJOR Findings

None.

## Gate Result

gate_result:
  status: passed
  summary: "Security invariants INV-1..INV-11 not applicable to this diff; the change IS a supply-chain CVE remediation and reduces attack surface; no new top-level deps; license MIT; no behavioral regression in email.service.ts."
  findings:
    - "Issue file's claim that `nodemailer@7.0.11` clears both CVEs is incorrect — only GHSA-rcmh-qjqh-p98v is patched in 7.x. GHSA-p6gq-j5cr-w38f requires `>=9.0.1`. We corrected to `^9.0.1`."
    - "MIT license preserved; npm source unchanged; no --force / --legacy-peer-deps used."
    - "No new top-level production deps; lockfile churn is bounded and only reflects transitive adjustments."
    - "Email service runtime API surface (createTransport + sendMail) is preserved in 9.x — verified via tsx sanity import (see 03-code-summary.md)."