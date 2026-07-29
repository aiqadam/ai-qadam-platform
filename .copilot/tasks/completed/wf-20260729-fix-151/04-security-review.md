# Step 5 — Security Review: ISS-WEB-NEXT-SSR-JSDOM-001

## Code Changes Reviewed

- `package.json` (one-line `pnpm.overrides` addition)
- `pnpm-lock.yaml` (regenerated dependency resolution)

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 through INV-11 | No (standard app-code invariants) | N/A | No application code touched — this is a pure dependency-manifest fix. None of the standard 11 invariants (tenant isolation, auth guards, Zod validation, SQL, XSS, N+1, etc.) apply to a `package.json`/`pnpm-lock.yaml`-only change. |

## Supply-Chain / Dependency-Specific Review (this change's actual risk surface)

### Does `undici@7.29.0` reintroduce the CVE(s) the original override fixed?

**No.** The original override (`>=7.28.0`, added in commit `6ff557f` for
`ISS-CI-001`) established `7.28.0` as the CVE-fixed floor. `7.29.0` is a
later patch release within the same major (`7.28.0 < 7.29.0 < 8.0.0`),
so it can only carry the fix forward, never regress it — this is a
monotonic-patch guarantee, not an assumption. Confirmed via `npm view
undici versions` showing `7.29.0` immediately follows `7.28.0` in the
7.x line with no intervening release.

### Does the scoped override leave a gap for other undici consumers?

**No.** Confirmed via `grep -B15 "jsdom@28.1.0" pnpm-lock.yaml` that
`isomorphic-dompurify` is the **only** dependent of `jsdom` in this
monorepo's entire dependency tree — no other package needs the scoped
override extended. The blanket `"undici": ">=7.28.0"` override remains
in place for every other consumer (including `testcontainers`), so no
consumer outside `jsdom` loses the original CVE protection.

### `pnpm audit` re-run after the change

```
pnpm audit --prod --audit-level=high
# 3 vulnerabilities found
# Severity: 2 low | 1 moderate
```

No high/critical findings. Confirmed via `pnpm audit --prod | grep -A10
undici` that none of the 3 remaining findings (2 low, 1 moderate)
mention `undici` — they are pre-existing, unrelated findings not
affected by this change.

### Blast radius confirmation

Confirmed via lockfile diff that exactly one dependency edge changed
(`jsdom`'s resolved `undici`, `8.8.0` → `7.29.0`). No other package's
resolved version shifted as a side effect of the override addition.

## BLOCKER Findings

None.

## MAJOR Findings

None.

## Gate Result

gate_result:
  status: passed
  summary: "Pure dependency-manifest fix; standard 11 invariants N/A (no app code touched). Supply-chain-specific review confirms the fix does not reintroduce the CVE the original override addressed (7.29.0 > 7.28.0 floor, same major), does not leave any other jsdom consumer unprotected (isomorphic-dompurify is the sole jsdom dependent in the tree), and pnpm audit shows no new high/critical findings."
  findings: []
