# Test Strategist — wf-20260801-fix-187 — ISS-SEC-PUBLIC-UNMANAGED-001

## Strategy Decision

**Live curl verification IS the test.** No TestDesigner / TestRunner unit/integration suite is appropriate here — the change is a single Directus permission re-scoping, and the only meaningful verification is "does the public read surface match the intended shape after bootstrap.sh runs against a real Directus."

Per AGENTS.md §6.1 production-readiness obligation: "test infrastructure MUST be prepared, not assumed" — local Directus (`aiqadam-directus Up 2 days (healthy)`) is the test infra. §6.1 also: "Workflows end with proof, not promises" — Step 7 (TestRunner) executed the curl-based verification, captured the response, and is reflected in Step 7's output file.

## Test Layers

| Layer | Decision | Rationale |
|---|---|---|
| Unit | **Skip** | No new functions in TS/Python. `revoke_public_read` and `ensure_perm_for_policy` already covered indirectly by their existing call sites + live verification of the new grant rows. |
| Integration | **Skip** | No new endpoint. Directus permission rows ARE the integration surface; live verification covers it. |
| E2E (Playwright) | **Skip** | No UI change. The downstream page render is unchanged — apps/web already gracefully handles missing fields. |
| Live API curl | **Required** | One curl per collection against the unauthenticated `/items/{collection}` endpoint to confirm: (a) no 403, (b) no `permissions: null` exposure, (c) country=xx demo rows absent, (d) field allowlist applied. |

## Test Strategy Details

### TS-1: Live unauth `/items/events` shape
- **Goal:** Confirm the events read after bootstrap.sh runs exposes only `status=published` rows for non-xx countries, with fields limited to the 33-item allowlist.
- **How:** `curl.exe -sS "http://localhost:8200/items/events?limit=3"` after bootstrap.sh exits 0.
- **Pass criteria:** Returns rows where every returned field is in the allowlist; no row with `country == xx`.

### TS-2: Live unauth `/items/speakers` shape
- **Goal:** Confirm speakers read scopes by `status=active` and `country!=xx`, fields limited to 7-item allowlist (no bio).
- **How:** `curl.exe -sS "http://localhost:8200/items/speakers?limit=3"`.
- **Pass criteria:** Returns rows where every returned field is in `[id,user,country,status,headline,photo,slug]`; no `bio` field present; no `country=xx` row.

### TS-3: Live unauth `/items/event_speakers` shape
- **Goal:** Confirm event_speakers read scopes by `status=confirmed` and `event.status=published, event.country!=xx`, fields limited to 7-item allowlist.
- **How:** `curl.exe -sS "http://localhost:8200/items/event_speakers?limit=3"`.
- **Pass criteria:** Returns rows where every returned field is in `[id,event,speaker,talk_title,talk_topic,order_index,confirmed_at]`; nested event.country != xx.

### TS-4: Idempotency (second run)
- **Goal:** Confirm a second bootstrap.sh run reaches the same end state without error.
- **How:** Re-run bootstrap.sh; grep log for "ISS-SEC-PUBLIC-UNMANAGED-001" section; confirm revokes find matching rows (delete them) and re-grants create replacement rows.
- **Pass criteria:** exit 0; final permission table identical to first run.

### TS-5: Bash syntax
- **Goal:** Confirm the file parses.
- **How:** `bash -n infrastructure/directus/bootstrap.sh`.
- **Pass criteria:** exit 0.

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "Live curl verification is the right test surface for this change; tests TS-1..TS-5 executed by TestRunner; all five passed. No unit/integration/E2E layers added because the change is Directus configuration, not application code."
```