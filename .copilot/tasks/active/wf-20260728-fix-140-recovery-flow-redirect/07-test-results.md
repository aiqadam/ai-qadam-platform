# Step 8: Test Results

**Workflow:** wf-20260728-fix-140-recovery-flow-redirect · **Issue:** [ISS-USR-REDIRECT-002](../../../issues/ISS-USR-REDIRECT-002.md)

## Regression test — fail-before / pass-after

`apps/api/test/authentik-client.spec.ts` — `createRecoveryLink` describe
block, run via `pnpm exec vitest run test/authentik-client.spec.ts -t
"createRecoveryLink"`.

**Source reverted (`git stash` on `authentik.client.ts` only), test
already fixed:**
```
FAIL  test/authentik-client.spec.ts > AuthentikClient.createRecoveryLink
  > POSTs to the recovery endpoint and returns the link string
AssertionError: expected undefined to be 'https://auth.aiqadam.org/recover/...'
```

**Both fixed (`git stash pop`):**
```
Test Files  1 passed (1)
     Tests  2 passed | 15 skipped (17)
```

## Live confirmation of the actual bug (pre-fix)

Direct `curl`/Node `fetch` against `aiqadam-authentik-server`:
```
POST http://localhost:9000/api/v3/core/users/6/recovery/
→ {"link":"http://localhost:9000/if/flow/default-recovery-flow/?flow_token=..."}
```
Confirms Authentik's real field is `link`; the old code's
`res.recovery_link` read would have been `undefined` against this exact
live response.

## Full-suite regression check

| Suite | Result |
|---|---|
| `test/authentik-client.spec.ts` + `test/registration-service.spec.ts` + `test/telegram-auth-service.spec.ts` | 47/47 passing |
| Full `apps/api` unit suite (`pnpm exec vitest run`) | 1289/1290 passing. 1 pre-existing failure: `test/users.spec.ts:65` (`lastLoginAt` timestamp race) — confirmed unrelated (file not touched by this diff), already tracked by the pre-existing, already-queued `wf-20260704-fix-096-pre-existing-api-test-flakes`. |

## Live verification attempt of the FULL recovery-link flow (led to the ISS-USR-REDIRECT-003 discovery)

Drove a freshly-minted recovery link through a real Chromium browser via
Playwright (scratch test, not committed — see `02-impact-analysis.md`
and `ISS-USR-REDIRECT-002.md`'s "Scope note"). Result: the link lands on
Authentik's identification stage, which still prompts for email
re-entry — it does not silently authenticate. This is the finding that
narrowed this workflow's scope to the field-name fix only and produced
[ISS-USR-REDIRECT-003](../../../issues/ISS-USR-REDIRECT-003.md) as a
separate, unscheduled design issue.

A redirect-stage bootstrap script was written and applied live against
`aiqadam-authentik-server` (`.copilot/bootstrap-recovery-redirect.sh`,
not committed — see git history of this session) to test whether
binding a redirect stage after the existing identification+email stages
would help; live verification showed it would only add a redirect AFTER
the manual email re-entry, not deliver the promised one-click UX. The
stage and its binding were deleted (`DELETE
/api/v3/flows/bindings/<pk>/` → 204, `DELETE
/api/v3/stages/redirect/<pk>/` → 204) to leave
`aiqadam-authentik-server`'s live state unchanged from before this
workflow. Confirmed via `GET
/api/v3/flows/instances/default-recovery-flow/` showing the original
2-stage list restored.

## Gate result

```yaml
gate_result:
  status: passed
  summary: "Fail-before/pass-after verified live. 1289/1290 full-suite pass (1 pre-existing, unrelated, already-tracked flake). Live Authentik state confirmed restored to pre-workflow baseline after the redirect-stage experiment was reverted."
```
