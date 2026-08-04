# ISS-CI-SUPPLYCHAIN-FASTURI-001 — `supply-chain` `pnpm audit (high+critical block)` red on `main` via transitive `fast-uri` advisory

| Field | Value |
|---|---|
| ID | ISS-CI-SUPPLYCHAIN-FASTURI-001 |
| Severity | minor |
| Module | root (`package.json` pnpm overrides) |
| Status | resolved |
| Reported | 2026-08-04 |
| Resolved | 2026-08-04 |
| Workflow | wf-20260804-fix-209-fast-uri-supply-chain |
| Reporter | GitHub issue #265 |
| Business-Process | — |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/265 |

## Symptom

The `supply-chain` workflow's `pnpm audit (high+critical block)` job
(`pnpm audit --prod --audit-level=high`) has been failing on `main` for
at least the last two merged commits, and identically on unrelated PR
#263:

```
high — fast-uri vulnerable to host confusion via backslash authority introducer
Package: fast-uri
Vulnerable versions: >=4.0.0 <4.1.2
Patched versions: >=4.1.2
More info: https://github.com/advisories/GHSA-7p8r-x3mc-p8w7
```

Dependency path (both `apps/storybook` and `apps/web`, via `@astrojs/check`'s
dev-only YAML language server, never shipped to a runtime bundle):

```
@astrojs/check@0.9.9 > @astrojs/language-server@2.16.8 >
  volar-service-yaml@0.0.70 > yaml-language-server@1.20.0 > ajv@8.20.0 >
  fast-uri@4.1.1
```

## Root cause

The root `package.json` already carried a `pnpm.overrides` entry for
`fast-uri`, but pinned only a **floor of `>=3.1.4`** — a leftover from
an earlier, different advisory. `4.1.1` (the version pnpm's resolver
picked for the `@astrojs/check` subtree) satisfies `>=3.1.4`, so the
override never forced a bump past the vulnerable range `>=4.0.0
<4.1.2`.

## Resolution

- **Workflow:** wf-20260804-fix-209-fast-uri-supply-chain
- **PR:** <pending — back-filled at Step 12.5>
- **Fix:** bumped the existing `pnpm.overrides["fast-uri"]` floor from
  `>=3.1.4` to `>=4.1.2` in the root `package.json`, then regenerated
  `pnpm-lock.yaml` via `pnpm install`. `fast-uri` now resolves to
  `4.1.2` everywhere in the lockfile (confirmed via `grep -n
  "fast-uri@" pnpm-lock.yaml`).
- **Verification:** `pnpm audit --prod --audit-level=high` (the exact
  command the `supply-chain` job runs, confirmed against
  `.github/workflows/supply-chain.yml`) now exits `0` with `2 low | 2
  moderate` and **zero high/critical** findings, down from `2 low | 2
  moderate | 1 high`.
- **Scope:** dependency-only change (`package.json` + `pnpm-lock.yaml`).
  No application code touched; `fast-uri` is several levels deep inside
  a dev-only type-checking tool, not part of any production bundle.
  `Business-Process: —` — infra/CI/dependency fix, no user-facing
  process to link or re-verify.
- **Merged:** <pending — Step 12.5 back-fills the squash SHA.>
