# ISS-CI-002 — Pre-existing CI failures regressed (re-blocking all PRs to main)

| Field | Value |
|---|---|
| ID | ISS-CI-002 |
| Severity | blocker |
| Module | ci / infrastructure |
| Status | **resolved** |
| Reported | 2026-07-02 |
| Resolved | 2026-07-02 |
| Reporter | PR #81 (ISS-UAT-SEED-001) CI runs on 2026-07-02 reported the failures. |
| Predecessor | ISS-CI-001 (resolved 2026-06-24 via PRs #37-#41) |

## Symptom

The CI failures that ISS-CI-001 resolved on 2026-06-24 have regressed
and once again block every PR that targets `main`. Verified counts via
PR #81 CI (commit `99979ad`, 2026-07-02T13:23Z) and via identical
fingerprints on `main` (commit `7b04c4c`, run 28590058*, 2026-07-02T12:30Z):

| Check | Failure | Pre-existing? | Source |
|---|---|---|---|
| `pnpm audit (high+critical block)` | 2 high-severity CVEs in `apps/api > nodemailer@6.10.1` (GHSA-rcmh-qjqh-p98v DoS; GHSA-p6gq-j5cr-w38f SSRF; patched in `nodemailer@7.0.11` / `@9.0.1`) | Yes — identical on `main` run 28590058393 | Same fingerprint, 11:30 ago |
| `storybook` (`Build failed in 3.25s`) | `rolldown@1.1.3` aggregate binding error during `storybook build -o storybook-static` | Yes — main `deploy-web-next` consistently fails | Since at least 2026-06-29 |
| `ci` (general) | workflow-shared step (depends on storybook + audit) | Yes — derived from the two above | |

PR #81 does NOT touch `apps/api/package.json`, the lockfile, or any
Storybook source. It modifies `scripts/uat-seed.sh`,
`scripts/uat-env-setup.sh`, two `*.bats` test files, one runbook
section, and registry files. Every check in its domain
(`architecture-check`, `gitleaks secret scan`, `voice-lint`, `utm-lint`)
**PASSED**.

## Why this is a blocker

GitHub branch protection on `main` requires the 3 failing jobs to
report SUCCESS before merge is permitted. Every workflow targeting
`main` will hit the same wall.

## Reproduction (verbatim commands)

```bash
# Confirm main is failing now
gh run list --branch main --limit 3 \
  --json databaseId,name,conclusion \
  | jq '.[] | select(.conclusion == "failure") | "\(.name) \(.databaseId)"'

# Confirm the exact same fingerprint on PR #81
gh pr view 81 --json statusCheckRollup \
  | jq '.statusCheckRollup[] | select(.conclusion == "FAILURE") | .name'

# Confirm nodemailer CVE detail
gh run view 28590058393 --job <audit-job-id> --log \
  | grep -E "GHSA|nodemailer|severity"
```

## Proposed resolution (not in scope of `wf-20260702-fix-051`)

| PR | Change | Resolves |
|---|---|---|
| (future) | Upgrade `apps/api` `nodemailer` 6.10.1 → 7.0.11+ (or 9.0.1+) | `pnpm audit` high-sev |
| (future) | Investigate `rolldown` binding error in Storybook build (likely `@storybook/astro-vite` peer-mismatch with rolldown 1.1.3) | `storybook` build |
| (future) | Re-verify `architecture-check`, `gitleaks`, `voice-lint`, `utm-lint` are still green | confidence |

## Honesty disclosures

- This issue was filed **by the orchestrator** of `wf-20260702-fix-051`
  as a side effect of investigating PR #81's CI failures.
- The PR-81 code (bats tests + bash scripts + docs) **passed every
  check it could possibly pass** (all hermetic tests; all lint + arch
  + secret-scans relevant to its domain). It is the systemic
  pre-existing CI breakage that prevents merge, not any defect in
  the PR.
- The orchestrator **declined to silently bypass required status
  checks** (`gh pr merge --admin` would work but violates project
  policy in `.claude/CLAUDE.md` MANDATORY WORKFLOW RULES). The
  situation is surfaced to the user for triage.

## Resolution

- **Workflow:** wf-20260702-fix-052
- **PR:** https://github.com/tvolodi/aiqadam/pull/82
- **Root cause:** `apps/api/package.json` pinned `nodemailer ^6.9.16`,
  which resolved to `6.10.1`. That version carries two unpatched
  high-severity CVEs (GHSA-rcmh-qjqh-p98v addressparser DoS,
  GHSA-p6gq-j5cr-w38f raw-message SSRF). The `pnpm audit` job in
  `.github/workflows/supply-chain.yml` runs without `continue-on-error`
  on every PR + push to main, so the audit exit 1 hard-blocks merges.
- **Fix:** Upgraded `apps/api > nodemailer` from `^6.9.16` to `^9.0.1`.
  GHSA-p6gq-j5cr-w38f's patched range is `>=9.0.1` (the issue file's
  "patched in 7.0.11" guess was incorrect — only GHSA-rcmh-qjqh-p98v
  is patched in 7.x; the SSRF CVE requires 9.x). After the upgrade,
  `pnpm list --filter @aiqadam/api nodemailer` reports `9.0.3` and
  `pnpm audit --prod --audit-level=high` exits 0 with severity
  `2 low | 3 moderate | 0 high | 0 critical`.
- **Regression test:** `scripts/tests/audit-nodemailer-version.bats`
  — 5 bats tests asserting (AC-1) installed version ≥ 9.0.1,
  (AC-2) audit exits 0, (AC-3) neither CVE ID appears in audit output,
  (AC-4) `package.json` declares `^9.x`, (AC-5) `pnpm typecheck` passes.
  Verified pre-fix state: 4/5 fail with diagnostic messages naming the
  failing version and the CVE IDs.
- **Merged:** squash commit `21485c0` on `main` (PR #82, 2026-07-02).
- **Out of scope (deferred):** Storybook rolldown build error.
  Re-classified during Step 1 as advisory (job already carries
  `continue-on-error: true` in `.github/workflows/ci.yml`); NOT a
  merge blocker for ISS-CI-002. Documented in `01-issue-lookup.md`
  and `03-code-summary.md`.
