# 02b — Authentik live spike findings (Orchestrator, pre-Step-4)

Both open technical questions Step 1/Step 2 flagged as "genuinely
undetermined from static reading" were resolved empirically against the
real local Authentik instance (`http://localhost:9000`, confirmed healthy
via `docker ps` + pre-flight curl 200) before dispatching CodeDeveloper —
per AGENTS.md §6.1's "make the test possible, then run it" principle
applied one step earlier than usual (a design spike, not yet a test, but
the same "verify against the real system, don't guess" discipline).

## Question 1 — Link-minting mechanism: RESOLVED

`GET /api/v3/schema/?format=json` (the live OpenAPI schema) shows a
**third** endpoint neither Step 1 nor Step 2's two candidate hypotheses
named:

```
POST /api/v3/core/users/{id}/recovery_email/?email_stage=<email-stage-uuid>
```

- Confirmed via `paths` listing and full operation schema (see below).
- Takes an **arbitrary Email stage UUID** as a required query param —
  NOT hardcoded to `Brand.flow_recovery` the way `createRecoveryLink()`'s
  existing `/recovery/` endpoint effectively is used today (bound to
  whatever flow the Email stage's own `flow_set` resolves to, which is
  exactly the mechanism that lets one Authentik instance run BOTH the
  existing password-recovery Email stage and a new, separate
  `magic-link-login` Email stage side by side, with this endpoint routing
  to whichever stage UUID is passed).
- Returns **204 No Content** — Authentik sends the email itself, natively,
  server-side. **No link/token ever appears in our API's response body**
  — this satisfies Impact Analysis Risk Flag #4 (no secret/PII leakage via
  response body) by construction, not by discipline.
- Full operation schema:
  ```json
  {
    "operationId": "core_users_recovery_email_create",
    "description": "Create a temporary link that a user can use to recover their accounts",
    "parameters": [
      { "in": "query", "name": "email_stage", "schema": {"type": "string"}, "required": true },
      { "in": "path", "name": "id", "schema": {"type": "integer"}, "required": true }
    ],
    "responses": { "204": "Successfully sent recover email", "400": "ValidationError", "403": "GenericError" }
  }
  ```

**Recommendation for CodeDeveloper:** add `AuthentikClient.sendFlowEmail(userPk: number, emailStageUuid: string): Promise<void>` calling this endpoint — NOT a `createFlowLink`-style method that returns a URL. The magic-link email stage's UUID should be resolved once (analogous to `resolve_existing_stage_uuid()` in the recovery-flow script) and passed in. This is a cleaner shape than either of Step 1/2's speculative candidates (a) flow-executor impersonation or (b) an unidentified generic token endpoint — both turned out unnecessary.

## Question 2 — Session issuance on flow completion: RESOLVED

`GET /api/v3/schema/?format=json` confirms `/api/v3/stages/user_login/` is
a real, first-class Authentik stage type (`UserLoginStage`) — NOT
something that happens automatically just because a flow's `designation`
is `authentication`. Live-queried the instance's existing stage rows:

```
GET /api/v3/stages/user_login/?page_size=200
→ default-authentication-login   (pk e4445e89-c0ed-40ae-8f9a-13203d6d6997)
→ default-source-authentication-login
→ default-source-enrollment-login
```

`default-authentication-login` is a **built-in stage that already ships
with this Authentik instance** — exactly the same pattern
`provision-authentik-recovery-flow.sh`'s `resolve_existing_stage_uuid()`
already uses for `default-password-change-prompt`/
`default-password-change-write` (resolve the EXISTING built-in stage by
name, do not create a duplicate).

**Recommendation for CodeDeveloper:** the `magic-link-login` flow's stage
order should be:

| Order | Stage | Source |
|---|---|---|
| 10 | Identification stage (email lookup) | NEW instance, own name (e.g. `aiqadam-magic-link-identification`), same shape as `aiqadam-recovery-identification` |
| 20 | Email stage (send link) | NEW instance, own name (e.g. `aiqadam-magic-link-email`), own branded subject, own `token_expiry` (confirm this is the actual TTL knob — the existing recovery Email stage row shows `"token_expiry":30` minutes; FR-AUTH-004 AC-3 requires 15 minutes, so the new stage's `token_expiry` must be set to `15`, not copied from the recovery stage's `30`) |
| 30 | **UserLoginStage** | Resolve the EXISTING built-in `default-authentication-login` by name via `resolve_existing_stage_uuid("stages/user_login", "default-authentication-login")` — same `ak_get(...?name=...)` + exact-name-match pattern the recovery script already proves, do NOT create a new one |

No password-set stages (orders 30/40 in the recovery flow) — this is the
one structural place magic-link's flow topology is genuinely simpler than
recovery's, confirmed correct by this spike, not just assumed.

## Flow `designation`

Recommend `designation: "authentication"` (not `"recovery"`) for the
`magic-link-login` flow instance, since its terminal state is a login,
matching `default-authentication-flow`'s own designation — CodeDeveloper
should confirm this doesn't collide with anything in the existing
`aiqadam-platform-local-provider`'s flow bindings (it shouldn't; a
non-default authentication-designated flow is not auto-bound anywhere
just by existing — only `Brand.flow_authentication` and explicit
per-provider bindings matter, and this flow is never bound as either;
it's reached only by direct slug-URL / the `recovery_email` send).

## What CodeDeveloper does NOT need to spike further

Both of Step 1/2's flagged "resolve empirically" items are now fully
answered from live API introspection. CodeDeveloper's job is
implementation (write the provisioning script following
`provision-authentik-recovery-flow.sh`'s exact idempotent-resolve-or-create
pattern, add the two new `AuthentikClient`/service methods, wire the
endpoint + UI) — not further discovery. The one thing CodeDeveloper should
still confirm live during implementation (not a design question, a
straightforward verification step): that a freshly provisioned
`magic-link-login` flow, once an Email stage token is clicked, actually
lands the browser with an Authentik session cookie set (i.e., that
`UserLoginStage` at order 30 does what its name implies) — this is
Step 8/13's live E2E verification, not a redesign risk.
