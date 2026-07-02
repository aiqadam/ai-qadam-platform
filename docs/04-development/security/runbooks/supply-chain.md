# Runbook: Supply-chain CI gates + CVE triage

**Audience:** anyone responding to a red `supply-chain` workflow run, triaging a Dependabot PR, or considering whether to add a new dependency.
**Pre-reading:** [`.github/workflows/supply-chain.yml`](../../../../.github/workflows/supply-chain.yml), [`.github/dependabot.yml`](../../../../.github/dependabot.yml), [CLAUDE.md §9 Dependencies policy](../../../../.claude/CLAUDE.md).
**Ships:** Sprint 0.3 from the community-platform roadmap.

## What this enforces

| Surface | Check | Cadence | Failure mode |
|---|---|---|---|
| Every PR + push to `main` | `pnpm audit --audit-level=high` | per event | merge blocked until lockfile clean of HIGH + CRITICAL advisories |
| Every prod container image we deploy | Trivy `image-ref` scan (HIGH + CRITICAL, fixed only) | weekly Mondays 06:00 UTC | workflow goes red; on-call investigates within 24h |
| npm + docker + github-actions ecosystems | Dependabot PRs grouped by patch/minor | weekly Mondays 06:00 UTC | none — output is PRs to review |

Only **fixed** vulnerabilities are blocked (`ignore-unfixed: true`). Unfixed advisories surface in informational reports but do not block merge — they require a human decision (back out the dep, mitigate at app level, accept residual risk in writing).

## Known existing high-severity advisories (snapshot 2026-07-02)

The first PR that activates this gate exposes 3 high-severity advisories that already exist on `main`. They are not regressions from this PR; they are pre-existing debt. Dependabot's first run will open bump PRs for each — merge those before relying on a green `supply-chain` check.

| Advisory | Package | Path | Fix |
|---|---|---|---|
| [GHSA-cxjh-pqwp-8mfp](https://github.com/advisories/GHSA-cxjh-pqwp-8mfp) | undici < 6.21.2 | apps/api → @testcontainers/postgresql → testcontainers → undici | upgrade testcontainers, or pnpm override `undici@^6.21.2` |
| [GHSA-v9p9-hfj2-hcw8](https://github.com/advisories/GHSA-v9p9-hfj2-hcw8) | undici < 6.24.0 | same path | same as above |
| [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9) | drizzle-orm < 0.45.2 | apps/api → drizzle-orm@0.36.4 | upgrade drizzle-orm direct dep |

Owning agent: Agent-API (per [`docs/05-other/agent-prompts.md`](../../../05-other/agent-prompts.md) §1 row 4 — `apps/api/*` scope). Triage path documented below.

### Resolved advisories since the 2026-05-20 snapshot

| Advisory | Package | Path | Resolved by | Workflow |
|---|---|---|---|---|
| [GHSA-rcmh-qjqh-p98v](https://github.com/advisories/GHSA-rcmh-qjqh-p98v) | nodemailer < 7.0.11 (addressparser DoS) | apps/api → nodemailer@6.10.1 | bumped to nodemailer@9.0.3 | wf-20260702-fix-052 (ISS-CI-002) |
| [GHSA-p6gq-j5cr-w38f](https://github.com/advisories/GHSA-p6gq-j5cr-w38f) | nodemailer < 9.0.1 (raw-message SSRF) | apps/api → nodemailer@6.10.1 | bumped to nodemailer@9.0.3 | wf-20260702-fix-052 (ISS-CI-002) |

**Lesson recorded in `wf-20260702-fix-052/01-issue-lookup.md`:** the issue file's initial guess that `nodemailer@7.0.11` patched both CVEs was wrong — only the addressparser DoS is patched in 7.x; the raw-message SSRF requires `>=9.0.1`. When triaging a `pnpm audit` finding, **always read the `Patched versions` row from the GitHub Security Advisory itself** rather than relying on secondary sources (including the issue file that filed the audit red). The regression test `scripts/tests/audit-nodemailer-version.bats` (added in the same PR as the fix) guards against a future re-bump below `9.0.1`.

## Responding to a red `pnpm audit` job on a PR

1. **Read the table.** The job logs every advisory: severity, package, vulnerable range, patched range, the dependency path.
2. **Decide: is the vulnerable package a direct dep or transitive?**
   - **Direct** (listed in some `apps/*/package.json`): bump the version in that `package.json`, run `pnpm install`, commit lockfile.
   - **Transitive** (came in via someone else's dep tree): two options. (a) bump the *parent* dep — `pnpm why <pkg>` shows who pulled it in; often the parent has a newer release that updates the transitive. (b) pin the transitive via [`pnpm.overrides`](https://pnpm.io/package_json#pnpmoverrides) in the root `package.json` if no parent bump exists yet.
3. **Verify locally.** `pnpm install && pnpm audit --audit-level=high` exits 0.
4. **Open a PR** scoped to the dep bump. CI re-runs the audit; if green, merge.
5. **If no patched version exists** (rare): document in the PR body, set the dep to `unfixed`, and either remove the feature using the dep or accept residual risk with an ADR (`docs/adr/`).

## Responding to a red weekly Trivy job

The `trivy-images` matrix runs every Monday. If a row is red:

1. **Pull the image locally** and re-scan to confirm:

   ```bash
   docker pull <image>:<tag>
   docker run --rm aquasec/trivy:0.58.1 image --severity HIGH,CRITICAL --ignore-unfixed <image>:<tag>
   ```

2. **Check upstream** for a patched tag (`<image>:<newer>`). For services we pin (Authentik 2024.12.3, Twenty v0.50.0, Plausible v3.0.1, Directus 11) the upstream changelog tells you whether a security release exists.
3. **Open a PR** bumping the tag in the relevant `infrastructure/<stack>/docker-compose.yml`. Coolify will redeploy on merge after a human applies the compose change in the Coolify UI.

   > **HUMAN action required after merge:** in Coolify → AI Qadam → the affected stack → click *Redeploy* (or use the Coolify CLI if/when wired up). Compose file edits in git do not auto-roll to prod.

4. **If the patched tag does not exist yet**: file an issue with the upstream project, link it from the runbook, and decide whether to (a) wait, (b) self-build a patched image, or (c) accept residual risk with an ADR until upstream lands the fix.

## Triaging a Dependabot PR

Default to **merging promptly** — that is the point of weekly automation. Spend extra time only when:

- the changelog flags breaking changes (read it),
- the diff touches a peer-dep range or postinstall script,
- the bump is a major version,
- the bump is in a security-critical lane (auth, crypto, DB driver).

For grouped patch+minor PRs from the `minor-and-patch` group: scan the changed packages, run the full local test suite (`pnpm test`), merge.

For ungrouped major bumps: separate PR, follow the upstream migration guide, run smoke scenarios locally + Playwright suite under `apps/e2e/tests/` (once shipped in Sprint 0.10).

## Adding a new dependency

Before `pnpm add <pkg>`, walk through [CLAUDE.md §9](../../../../.claude/CLAUDE.md):

1. Search existing deps — does something already solve this?
2. `pnpm view <pkg>` — weekly downloads >10k, last update <6 months, license MIT/Apache/BSD/ISC.
3. `pnpm audit --audit-level=high` after install — must stay clean.
4. PR description: name the package, the problem, alternatives considered, license.
5. Commercial / GPL / AGPL deps are forbidden without explicit owner approval.

## When to revisit this runbook

- A new ecosystem joins the repo (apps/bot adds `requirements.txt` → add `pip` to dependabot.yml).
- A new production image is added (extend the Trivy matrix in `supply-chain.yml`).
- Coolify gains a deploy-on-merge hook (drop the "HUMAN action required" step above).
- The `pnpm audit` blast radius grows beyond one workspace — split the job per workspace if signal-to-noise drops.
