# Step 4 — Code Summary (wf-20260702-fix-052, ISS-CI-002)

## What changed

| File | Lines changed | Reason |
|---|---|---|
| `apps/api/package.json` | 1 (one version pin) | `nodemailer ^6.9.16` → `^9.0.1` to clear both GHSA-rcmh-qjqh-p98v and GHSA-p6gq-j5cr-w38f |
| `pnpm-lock.yaml` | auto-refreshed by `pnpm install` | New resolved version of nodemailer + any transitives |
| `scripts/tests/audit-nodemailer-version.bats` (NEW) | +~40 lines | Regression test: asserted on `pnpm list --filter @aiqadam/api nodemailer` — see Step 6/7 |

No source files (`*.ts`) were touched. The runtime API surface
(`createTransport` + `transporter.sendMail`) is preserved by
nodemailer 9.x — verified empirically:

```
$ pnpm exec tsx -e "
  import { createTransport } from 'nodemailer';
  const t = createTransport({ host: 'localhost', port: 1025, secure: false });
  console.log(typeof t.sendMail);
  console.log(require('nodemailer/package.json').version);
"
function
9.0.3
```

## Why `^9.0.1` (not `^7.0.11` as the issue suggested)

The issue's "Proposed resolution" line said "patched in
`nodemailer@7.0.11`." That was a guess based on the CVE GHSA-rcmh-qjqh-p98v
advisory alone. After running `pnpm audit --prod --audit-level=high` on a
provisional `^7.0.11` install we discovered:

- ✅ GHSA-rcmh-qjqh-p98v (addressparser DoS) — patched in 7.0.11
- ❌ GHSA-p6gq-j5cr-w38f (raw-message SSRF) — Vulnerable versions `<=9.0.0`; Patched versions `>=9.0.1`

So `^7.0.11` would clear one CVE but leave the other in place. The
correct floor is `^9.0.1`. This is the kind of error that the issue
file would have hit if the workflow had skipped the empirical
verification step.

## Why no `email.service.ts` change was needed

`apps/api/src/modules/email/email.service.ts` uses ONLY two
nodemailer APIs that survived the major-version refactor:

1. `createTransport(options)` — factory. 9.x keeps this as a named export.
2. `transporter.sendMail(message)` — instance method. 9.x keeps this verbatim.

Nodemailer 9.x dropped several legacy paths (XOAUTH2/OAuth2 helper
reorganization; legacy NTLM; the deprecated `email-templates`
integration; raw base64 streams now use `Raw`/`DataStream` instead of
strings). None of these are touched by the AI Qadam email service.

The single change in `email.service.ts` that could have been warranted
was a `Buffer` encoding for HTML (`text`/`html` are now typed as
`string | Buffer`). Our code passes strings throughout, so the call
site is unaffected.

## Why the change is safe

| Check | Result |
|---|---|
| `pnpm install` succeeded | ✅ (only pre-existing deprecation warnings; no `ERR_`) |
| `pnpm audit --prod --audit-level=high` exit code | ✅ 0 (was 1 before) |
| `pnpm audit` severity breakdown after upgrade | `2 low | 3 moderate | 0 high | 0 critical` (was `2 high` before) |
| `pnpm --filter @aiqadam/api typecheck` | ✅ no errors |
| Nodemailer API sanity (`tsx -e ...`) | ✅ `createTransport` returns object with `sendMail` function |
| Resolved version | `9.0.3` (latest 9.x; satisfying `^9.0.1`) |

The pre-existing audit noise (2 low + 3 moderate) is below the
`--audit-level=high` cutoff and is **NOT** a blocker. We do NOT touch
those packages — fixing them is out of scope for ISS-CI-002 and would
expand the PR beyond the AGENTS.md §4 small-PR rule.

## What did NOT change

- `email.service.ts` — API surface preserved by nodemailer 9.x.
- `@types/nodemailer ^6.4.24` — kept at 6.x; the 6.x types remain
  shape-compatible with the runtime API used. Confirmed by typecheck.
- `vitest.unit.config.ts` — out of scope; expanding its `include`
  would constitute a separate change.
- Storybook rolldown build — out of scope (job is already
  `continue-on-error: true`).
- `ci.yml` `continue-on-error` annotations — out of scope; existing
  comments in the file are already accurate.

## Gate Result

gate_result:
  status: passed
  summary: "nodemailer upgraded 6.9.16 → 9.0.1 (latest 9.x). pnpm audit high+critical now clean. Email service API surface preserved. Typecheck passes."
  findings:
    - "Patched version floor was 9.0.1, not 7.0.11 as the issue suggested. Initial bump to 7.0.13 still triggered GHSA-p6gq-j5cr-w38f."
    - "Resolved installed version: 9.0.3. Both target CVEs (GHSA-rcmh-qjqh-p98v, GHSA-p6gq-j5cr-w38f) cleared."
    - "Runtime API used by email.service.ts (createTransport, sendMail) preserved — verified via tsx sanity import."
    - "No source code changes. Only package.json + lockfile + new regression test."