# Step 5: Security Review — wf-20260727-fix-137

## Scope

`.copilot/bootstrap-oidc.sh` diff only (provisioning script, not app
code; see `02-impact-analysis.md` for why app code is unaffected).

## Invariants checked

- **Secrets handling** — unchanged. The script still reads the API token
  from `.copilot/oidc-setup-token` (gitignored) and writes credentials
  only to `.copilot/oidc-bootstrap.env` (gitignored) and `apps/api/.env`
  (gitignored, patched in place). No new secret-bearing output path
  introduced. The new `scope_mappings_json` variable holds only
  Authentik's built-in mapping metadata (names/PKs of *system* objects,
  not user data or credentials) — safe to have appeared in shell history
  or logs if the script's `-x` trace were ever enabled (it isn't).
- **Injection** — the new `jq -r --arg m "${managed}" ...` calls pass the
  `managed` identifier as a `--arg` (jq's parameterized-argument
  mechanism), not string-interpolated into the jq filter itself — same
  safe pattern already used elsewhere in this script
  (`jq -n --arg name ... --argjson provider ...` at the Application-
  creation step). The `MAPPING_PKS_JSON` array is built from `jq -r`
  output (already-validated UUIDs from Authentik's own API), then
  interpolated into a JSON string via `IFS=,` join — each element is
  individually double-quoted, and PKs are Authentik-generated UUIDs
  (`[0-9a-f-]+` shape), not attacker-controllable input, so no escaping
  gap.
- **Least privilege / scope creep** — the fix *narrows* an unintended gap
  rather than widening one: before, the provider had zero property
  mappings (accidentally under-scoped, breaking the app); after, it has
  exactly the three mappings the app already declared it wants via
  `FLOW_SCOPES = 'openid email profile groups'` in `auth.service.ts`. No
  new scope is requested or granted beyond what the client already asks
  for. (`groups` has its own dedicated provider-level configuration,
  unrelated to `property_mappings` on the scope type — out of scope for
  this fix, unaffected.)
- **Idempotency / self-heal safety** — the new PATCH-on-reuse path only
  ever *sets* `property_mappings` to the fixed three-element list; it
  cannot be tricked into removing or adding attacker-chosen mappings
  since the list is derived entirely from Authentik's own
  `managed`-filtered API response, not from any external input.
- **No enumeration oracle introduced** — this script requires a valid
  bearer token to run at all (same pre-existing requirement); no new
  unauthenticated code path.

## Verdict

Pass. No blocking findings. The fix is a narrow, correctly-scoped
provisioning correction with no new attack surface.

## gate_result

```yaml
status: passed
step: 5
timestamp: "2026-07-27T00:00:00Z"
summary: >-
  No blocking findings. Fix narrows an accidental under-scoping gap to
  match exactly what the app already requests; no secrets/injection/
  privilege issues introduced.
```
