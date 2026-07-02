# Step 1 — Issue Lookup (wf-20260702-fix-052, ISS-CI-002)

## Issue summary

| Field | Value |
|---|---|
| ID | ISS-CI-002 |
| Severity | blocker |
| Module | ci / infrastructure |
| Reported | 2026-07-02 |
| Predecessor | ISS-CI-001 (resolved 2026-06-24 via PRs #37–#41) |
| Source | `.copilot/issues/ISS-CI-002.md` |

## Predecessor comparison

ISS-CI-001 (resolved 2026-06-24) and ISS-CI-002 (open 2026-07-02) are NOT
duplicate issues. They are **regression siblings** — the same class of
CI breakage re-appeared on `main` after 8 days.

| Aspect | ISS-CI-001 (2026-06-24) | ISS-CI-002 (2026-07-02) |
|---|---|---|
| Primary failure | `arch-check` 25 violations, `biome` 20,432 errors, `pnpm audit` 2 high CVEs | `pnpm audit` 2 high CVEs (same fingerprint); `storybook` advisory rolldown error |
| `pnpm audit` CVEs | Different packages (see ISS-CI-001) | `nodemailer@6.10.1` → GHSA-rcmh-qjqh-p98v (DoS), GHSA-p6gq-j5cr-w38f (SSRF) |
| Resolution PRs | #37–#41 (5 PRs covering arch-check, biome, audit) | (this workflow's PR) |
| Closed-by workflow | wf-20260624-fix-* (5 workflows) | wf-20260702-fix-052 (this) |

**Decision: This is the same class of issue (CI blockage blocking PRs to
main) but with different fingerprints. We treat ISS-CI-002 as the new
independent issue — its resolution is a `nodemailer` upgrade plus a
documentation back-fill for the `continue-on-error: true` policy.**

## Re-validation of the reported symptoms

### Symptom 1: `pnpm audit` (high+critical block) — **CONFIRMED BLOCKER**

`apps/api/package.json` pins `nodemailer: ^6.9.16`. Current resolved
version (per lockfile): `6.10.1`.

Reproduced locally on 2026-07-02:

```
$ pnpm audit --prod --audit-level=high
…
│ high                │ Nodemailer's addressparser is vulnerable to DoS …
│ Package             │ nodemailer
│ Paths               │ apps\api > nodemailer@6.10.1
│ More info           │ https://github.com/advisories/GHSA-rcmh-qjqh-p98v
│ high                │ Nodemailer: Message-level raw option bypasses …
│ Package             │ nodemailer
│ Paths               │ apps\api > nodemailer@6.10.1
│ More info           │ https://github.com/advisories/GHSA-p6gq-j5cr-w38f

Severity: 3 low | 8 moderate | 2 high

Command exited with code 1
```

**CI impact:** `.github/workflows/supply-chain.yml` runs
`pnpm audit --prod --audit-level=high` on every PR + push to main with
NO `continue-on-error`. This job's SUCCESS is required to merge (via
branch protection rules on `main`).

### Symptom 2: `storybook` rolldown error — **NOT A BLOCKER (re-classified)**

`.github/workflows/ci.yml` line 47:

```yaml
  storybook:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    continue-on-error: true   # ← advisory, does NOT block merge
```

The same `continue-on-error: true` flag is also on the main `ci` job and
on `architecture-check`. Only `pnpm audit` and `gitleaks` are NOT
advisory. The issue's claim that "GitHub branch protection requires the
3 failing jobs to report SUCCESS before merge is permitted" is **only
true for the supply-chain `pnpm audit` job**. The storybook build has
been advisory since 2026-06-29 per the workflow comment.

### Honesty disclosure (from issue file)

> The PR-81 code (bats tests + bash scripts + docs) **passed every
> check it could possibly pass** (all hermetic tests; all lint + arch
> + secret-scans relevant to its domain). It is the systemic
> pre-existing CI breakage that prevents merge, not any defect in
> the PR.

We accept this framing. Our resolution must address the systemic
`pnpm audit` failure; the storybook job is already correctly marked
advisory.

## Scope of this workflow

This workflow resolves **only** the `pnpm audit` blocker:

| Item | In scope? | Why |
|---|---|---|
| Upgrade `apps/api` `nodemailer` ^6.9.16 → ^7.0.11 (patches both CVEs) | ✅ | Direct blocker |
| Refresh lockfile + run `pnpm install --frozen-lockfile` locally | ✅ | Required to verify |
| Re-run `pnpm audit --prod --audit-level=high` to confirm 0 high findings | ✅ | Required AC |
| `gitleaks` re-verification | ✅ | Already passing, re-verify |
| `architecture-check`, `biome`, `typecheck`, `test` re-verification | ✅ | Required ACs (PR must not regress) |
| Storybook rolldown root-cause fix | ❌ | Out of scope — job is already advisory; no merge blocker |
| `ci.yml` `continue-on-error: true` documentation back-fill | ❌ | Defer to a separate workflow (see below) |

The storybook root-cause and `continue-on-error` documentation are
acknowledged as future work — they are NOT a merge blocker and do
NOT block the resolution of ISS-CI-002's pnpm-audit blocker.

## Issue-lookup summary

ISS-CI-002 is real, has a confirmed and reproducible root cause (a
specific transitive `nodemailer` CVE), and its resolution is narrowly
scoped to a dependency upgrade + lockfile refresh + audit re-run. It
is NOT a duplicate of ISS-CI-001.

## Gate Result

gate_result:
  status: passed
  summary: "ISS-CI-002 validated; primary blocker is `pnpm audit` failing on nodemailer@6.10.1 CVEs; storybook is already advisory (continue-on-error: true)."
  findings:
    - "ISS-CI-002 is the regression-sibling of ISS-CI-001, not a duplicate."
    - "pnpm audit --prod --audit-level=high confirmed failing with 2 high-sev CVEs (GHSA-rcmh-qjqh-p98v, GHSA-p6gq-j5cr-w38f) in apps/api > nodemailer@6.10.1."
    - "ci.yml storybook job has continue-on-error: true; only the supply-chain pnpm audit job is a true merge blocker."
    - "Storybook rolldown root-cause is deferred (job is advisory and does not block ISS-CI-002's resolution)."