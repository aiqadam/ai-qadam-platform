# Steps 6/7: Test Strategy + Design — wf-20260727-fix-137

## Strategy

Integration-level bats tests against a live local Authentik, following
the `provision-authentik-recovery-flow.bats` precedent (reachability-gated,
skip-not-fail when infra/token unavailable). Three tests:

1. **Precondition check** — the three managed scope mappings
   (`scope-openid`/`scope-email`/`scope-profile`) actually exist on this
   Authentik instance/version. Guards against silent false-positives if a
   future Authentik upgrade renames or removes them.
2. **Regression test (would have failed before the fix)** — POSTs a
   provider using the *exact* pre-fix body shape (no `property_mappings`
   key) and asserts the result has 0 mappings attached. This is the
   direct, reproducible proof of the original defect — run against
   today's Authentik, it still reproduces (Authentik's API behavior
   didn't change; only our script's body did).
3. **Fix verification (passes after the fix)** — asserts the actual
   `aiqadam-platform-local-provider` (patched by the fixed script) has
   `>= 3` property mappings attached. Also greps `bootstrap-oidc.sh` for
   `property_mappings` as a structural tripwire against silent reverts.

File: `scripts/tests/bootstrap-oidc.bats`.

## gate_result

```yaml
status: passed
step: 6-7
timestamp: "2026-07-27T00:00:00Z"
summary: >-
  3 bats tests: precondition, bug-reproduction (test 2, the required
  "would have failed before the fix" regression test), fix-verification.
```
