---
code: FR-MIG-030
name: Parity verification — E2E suite + Lighthouse (M4 steps 3–4)
status: Implemented
module: Migration (MIG)
phase: Rebuild M4
---

## Description
The technical gate before the production FQDN flip. All parity assertions in `parity-matrix.md` must be ✅, backed by a Playwright E2E suite running on a 24h cron against both v1 (`aiqadam.org`) and v2 (`next.aiqadam.org`).

## Users
Engineers running the cutover gate process.

## Functional scope
1. Playwright E2E suite in `e2e/parity/` covering every row in `parity-matrix.md`:
   - Customer flows: homepage anon/auth, events list/detail, registration, leaderboard, /me pages, auth sign-in/out.
   - Operator flows: dashboard, events control panel, members list, announce, approvals.
   - Cross-cutting: nav identity consistency, sign-out kills session, raw-fetch count = 0, inline-style count = 0.
2. Playwright runs against both `BASE_URL=https://aiqadam.org` and `BASE_URL=https://next.aiqadam.org`; produces a diff report on any assertion mismatch.
3. GitHub Actions workflow `parity-check.yml` running on a 24h cron + on-demand dispatch.
4. Lighthouse CI config targeting `/`, `/events`, `/leaderboard` on v2 with perf budget ≥ 90.
5. Pass condition: 24h cron green for 2 consecutive runs; Lighthouse ≥ 90 on all three pages.

## Acceptance criteria
- [ ] `pnpm e2e:parity` runs both v1 and v2 sweeps and exits 0 when all assertions match.
- [ ] Lighthouse CI reports ≥ 90 perf on `/`, `/events`, `/leaderboard` on `next.aiqadam.org`.
- [ ] `parity-matrix.md` — all rows ✅ (updated by E2E run).
- [ ] GitHub Actions `parity-check.yml` shows two consecutive green 24h cron runs.

## Notes
- Precondition for FR-MIG-031 (cutover).
- Must be set up and green before declaring M3 complete — run E2E early, not just at M4.
- `architecture-check` (`pnpm arch:check`): raw `fetch()` count = 0 and inline `style=` count = 0 asserted in CI.
- Lighthouse budget file: `lighthouserc.js` with `assert.minScore.performance = 0.9`.
