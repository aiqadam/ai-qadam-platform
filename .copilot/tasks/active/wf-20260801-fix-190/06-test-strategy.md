# 06 — Test Strategy (ISS-ADM-010-1)

**Workflow:** wf-20260801-fix-190
**Issue:** GitHub #164 → `ISS-ADM-010-1`
**Step:** 6 of `issue-resolution`
**Date:** 2026-08-01
**Author:** TestStrategist

---

## Strategy

The fix has **two verification layers**, each addressing a distinct
failure mode:

### Layer 1 — Unit test (Vitest) — code-level oracle

**Catches:** "code did not attempt the new mechanism" (regression to
the misleading-attribute-set call).

**Where:** `apps/api/test/admin-bootstrap.service.spec.ts` (11 existing
tests + 2 new tests for AC-3 regression).

**Already produced by CodeDeveloper (Step 4) and live-verified
(15/15 pass).** Strategy note for this layer:

- The unit test asserts `setForcePasswordChangeNextLogin` is called
  with `(userPk, true)` on the `seedAdmin()` path. This proves the
  code path **intended** by the fix was taken.
- The new regression test asserts `patchAttributes` is **never** called
  with the deprecated `ak_login_password_change_required` key on the
  bootstrap path. This proves the **misleading** old mechanism was
  removed. This is the AGENTS.md §9 honesty-in-tests discipline.
- The duplicate-email recovery test (`pk=555` path) also asserts
  `setForcePasswordChangeNextLogin` was called — proves the protection
  is applied to the recovered user too, not just newly-created ones.

### Layer 2 — Live BP-UAT-020 verification (Playwright) — system-level oracle

**Catches:** "Authentik ignored the new mechanism just like it ignored
the old one" (the actual issue's failure mode).

**Where:** `apps/e2e/tests/uat/BP-UAT-020.session.spec.ts` Step 002,
re-run as this workflow's **Step 13** post-merge UAT.

**Strategy rationale:** the issue itself was discovered live, against
the real Authentik instance, by reading the flow-executor response —
not by reading the implementation. The same evidence shape is the only
honest way to verify the fix. Static-pyramid layers (unit tests, mocks,
contract tests) **cannot** prove "Authentik 2024.x honors
`password_change_next_login: true` on a freshly-PATCHed user body" —
that is a behavioral claim about a specific Authentik version that
only the running container can answer.

Step 002 already keys on the right oracle (drive the actual Authentik
login flow, watch for either leaving Authentik or hitting a
password-change stage). After the fix, Step 002 should flip from
`verdict: 'MISMATCH'` to `verdict: 'MATCH'`.

### Fallback path (not in this PR, queue-ready)

If Step 13's live verification finds `password_change_next_login` also
has no observable effect on this specific Authentik build (e.g.,
a future Authentik upgrade deprecates the field, or this particular
2024.x configuration ignores user-body fields), the documented fallback
is `scripts/provision-authentik-pwd-policy.sh` (Password Expiry Policy
+ User Login Stage + flow-binding). That script is not yet written —
the impact analysis (`02-impact-analysis.md` §"Infra / Provisioning")
has the full design and pattern-match (existing
`provision-authentik-magic-link-flow.sh`). A separate
`wf-20260801-fix-NNN-authentik-policy-binding` workflow would author
it if needed.

---

## Test scope (per impact analysis)

| Layer | Test type | Existing | New |
|---|---|---|---|
| Unit | Vitest (`apps/api/test/admin-bootstrap.service.spec.ts`) | 13 | 2 (assertion rewrite + 1 regression) |
| Integration (Testcontainers) | n/a | — | — (no Testcontainers-Authentik double exists in this repo) |
| E2E (Playwright) | `apps/e2e/tests/uat/BP-UAT-020.session.spec.ts` Step 002 | 1 | 0 (run existing, expect verdict flip) |
| Live system | BP-UAT-020 re-run against local Authentik | n/a | 1 (Step 13) |

No new test files created. The fix is small enough that all assertions
fit comfortably in the existing spec file, and the live evidence
belongs to the existing BP-UAT-020 spec.

---

## Gate Result

```yaml
gate_result:
  status: passed
  attempt: 1
  summary: "Two-layer strategy: Vitest unit (code-level, 15/15 pass) + BP-UAT-020 live verification (Authentik-behavioral, scheduled for Step 13 post-merge). Existing Playwright spec needs no edits — Step 002's logic is already the correct oracle for both verdict directions."
  output_file: .copilot/tasks/active/wf-20260801-fix-190/06-test-strategy.md
```
