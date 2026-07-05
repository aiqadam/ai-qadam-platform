# Security Review — wf-20260703-feat-063

**Agent:** SecurityReviewer
**Step:** 5 (requirement-development workflow)
**Requirement ref:** `FR-WORKFLOW-003`

---

## Code Changes Reviewed

| File | Change type |
|---|---|
| `scripts/uat-seed.sh` | Edit — new `--reset <BP-UAT-NNN>` / `--reset all` CLI branch: `reset_localhost_guard()`, `manifest_path_for()`/`require_manifest()`/`list_known_manifests()`, `reset_identity_fixture()`, `reset_domain_fixture()`, `resolve_payload_offsets()`, `run_reset_for_bp()`/`run_reset_all()`, plus the new `directus_user_pk_by_email()` helper and the `member_email` → `member_consents.member` FK resolution wired into `reset_domain_fixture()` |
| `scripts/uat-fixtures/BP-UAT-001.json` | New file — 5-fixture manifest (2 identity, 1 identity-no-consent, 2 domain) |
| `scripts/uat-fixtures/BP-UAT-013.json` | New file — 4-fixture manifest (`operator_invites`, all `kind: domain`) |
| `docs/02-business-processes/uat/BP-UAT-001.md`, `BP-UAT-013.md`, `BP-UAT-template.md` | Edit — doc-only, `id` column added to fixture tables |
| `.copilot/agents/business-analyst.md` | Edit — doc-only, new checklist row |
| `.copilot/workflows/uat-verification.md` | Edit — doc-only, Step 2 pre-flight command updated |
| `scripts/tests/uat-seed.bats` | Not yet authored (TestDesigner's step, next) — no test file reviewed here |

No `apps/api`, `apps/web`, `apps/bot`, `apps/workers`, Drizzle schema, or `packages/shared-types` file is touched, confirmed by re-reading the impact analysis and independently by grepping the full diff surface above.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | N/A | — | No NestJS query/ORM code touched. `country`/`country_code` values that do appear (`uz` in `BP-UAT-001.json`, `null` in `BP-UAT-013.json`) are plain fixture-payload fields passed straight through to Directus's own REST API, not an ORM filter this repo owns. Confirmed the manifest carries `"country": null` explicitly for the global-role `operator_invites` rows and `"country": "uz"` explicitly for the tenant-scoped event/consent rows — no silent drop, matching the impact analysis's flag. |
| INV-2 Secrets by reference | Yes | **PASS** | Grepped the full diff and both new manifest JSON files for `password`/`secret`/`apiKey`/`token`/`Bearer` literals. Matches found are all non-secret: field names (`token_hash`, `token_prefix`, `token_plain`) holding static **test-fixture** strings (e.g. `"uat-onboard-token"`, `"uat-onboard-used-token"`) that are already committed/used by the pre-existing script (STEP 4's `ONBOARD_TOKEN` constants) — these are intentionally-public UAT fixture identifiers, not credentials. `directus_user_pk_by_email()` (new) sources its bearer value from the `$token` parameter, which callers pass from the pre-existing `DIRECTUS_TOKEN` global (env-sourced) — no new literal token anywhere. Confirmed no new `echo`/log line prints `$DIRECTUS_TOKEN`, `$AK_TOKEN`, or `$RESET_AK_TOKEN` — every new `ok`/`info`/`fail` call in the reset path interpolates only ids, collection names, URLs, or HTTP status codes (see Error message hygiene below for the full trace). |
| INV-3 Auth at controller level | N/A | — | No controller added or modified; no NestJS endpoint surface exists in this diff. |
| INV-4 Validation at boundaries | N/A | — | No HTTP controller/webhook/queue-consumer boundary is added. The manifest JSON is a bash/jq consumption format read by the script itself, not a request payload validated at a system boundary; `jq -r`/`jq -c` extraction with `// empty` defaults is the applicable analog here and is used consistently (e.g. lines 599, 636 `member_email=... // empty`). |
| INV-5 No cross-schema queries | Yes | **PASS** | Traced every new/changed function: `directus_user_pk_by_email()` (line 208) issues a single `curl` GET against `${directus_url}/users?filter[email][_eq]=...` — Directus's own REST API, same idiom as the pre-existing `user_pk_by_email()` (Authentik REST) and `ensure_operator_invite()` (Directus REST). `reset_domain_fixture()` issues a filtered GET, a DELETE, and a POST — all three against `${DIRECTUS_URL}/items/${collection}`, i.e. Directus's own collection REST surface, parameterized by the manifest's declared `collection` field (`operator_invites`, `events`, `member_consents` — all Directus-owned per `architecture.md`'s Data Ownership table). No raw SQL, no `psql`/`docker exec ... psql` call, no join across `platform`/`directus`/`authentik`/`twenty`/`listmonk` schemas anywhere in the diff. `reset_identity_fixture()` calls only `ensure_test_user()`, which is 100% Authentik REST (unchanged). |
| INV-6 Rate limiting | N/A | — | No public endpoint added; this is a local dev-only CLI script, not a served API surface. |
| INV-7 CSRF | N/A | — | No browser-initiated request path exists; all calls are `curl` from a bash script using bearer-token auth (naturally CSRF-exempt per security.md's own CSRF section: "Bearer token in Authorization header ... naturally CSRF-resistant"). |
| INV-8 `dangerouslySetInnerHTML` | N/A | — | No React/JSX file touched. Zero occurrences in the diff (confirmed by the file list above — no `.tsx`/`.jsx` file present). |
| INV-9 N+1 queries | N/A | — | No ORM/Drizzle code touched. The closest analog — `run_reset_for_bp()`'s two `for` loops over fixtures calling `reset_identity_fixture`/`reset_domain_fixture` per row — is bounded by a manifest with 4-5 entries (not a data-driven N from a user request), matches the pre-existing STEP 4 pattern of four sequential `ensure_operator_invite` calls, and is not a query-in-a-loop performance concern in the sense INV-9 targets. |
| INV-10 Drizzle parameterization | N/A | — | No Drizzle `sql\`...\`` tag or `db.execute()` call exists in this diff; not a TypeScript/ORM change. |
| INV-11 HttpOnly tokens (web) | N/A | — | No browser session/cookie code touched; not a web-app change. |

---

### BLOCKER Findings

None.

### MAJOR Findings

None.

---

## Focused Review — Destructive-Operation Safety (this change's real risk)

This is the item the impact analysis flagged as the actual risk surface, and it was traced independently rather than taking the analysis's or code summary's claims at face value.

**Guard function itself (`reset_localhost_guard()`, lines 487–505):**
- Checks `directus_url` against `*localhost*|*127.0.0.1*` (lines 490–493).
- Only if that check passes does it go on to check `ak_url` against the same pattern (lines 494–498) — confirmed both URLs are checked, and checked independently (a `localhost` Directus URL paired with a non-local `AK_URL` still trips `is_local=0` and fails the guard — the second `if` block is unconditional once inside the outer `if`, not short-circuited into a no-op).
- Any non-match on either variable sets `is_local=0` and the function `exit 4`s with a FATAL message before returning (lines 500–503) — this is a hard process exit, not a returned status code a caller could ignore.
- The exit-4 message interpolates `$directus_url`/`$ak_url` only (diagnostic values), never a token — confirmed by reading the exact string (line 501).

**Call-site placement (lines 777–799, the `--reset` dispatch block):**
- `reset_localhost_guard "$DIRECTUS_URL" "$AK_URL"` (line 782) is the **first statement** inside `if [[ -n "$RESET_TARGET" ]]`, executed before `get_ak_admin_token` (line 786), before `require_manifest`/manifest read (inside `run_reset_for_bp`, called at line 791/793), and before any fixture processing. No manifest file is opened, no Authentik admin token is minted, and no HTTP call of any kind happens before this line in the reset branch.
- This satisfies AC-4's "no writes performed" literally — not just "no DELETE/POST" but "nothing happens at all" before the guard passes.

**Exhaustive call-site trace for DELETE/POST/PATCH reachable from the reset path:**
- `curl -X DELETE` — exactly one call site in the entire file (line 655), inside `reset_domain_fixture()`.
- `reset_domain_fixture()` has exactly one caller in the entire file: `run_reset_for_bp()` line 729 (inside a `for` loop filtered to `kind == "domain"`).
- `run_reset_for_bp()` has exactly two callers: `run_reset_all()` line 744, and the direct dispatch at line 793.
- `run_reset_all()` has exactly one caller: line 791.
- Both line 791 and line 793 are inside the same `if [[ -n "$RESET_TARGET" ]]` block that starts with the guard call at line 782 — i.e., every path to the DELETE call passes through the guard first, with no alternate entry point.
- `reset_identity_fixture()` (which triggers POST/PATCH via `ensure_test_user`, lines 258–294) has exactly one caller: `run_reset_for_bp()` line 721 — same block, same guard precondition.
- Grepped for any bypass mechanism (`SKIP`/`BYPASS`/`ALLOW_PROD`/`OVERRIDE`/`NOCHECK`, case-insensitive) — zero matches other than doc comments about `UAT_SEED_DIRECTUS_MOCK` (which **disables** all external calls including the guard's own consequences, i.e. mock mode makes the guard's pass/fail moot because no real HTTP call would fire either way — mock mode is not a way to skip the guard and still reach a live DELETE; confirmed no code path exists where `UAT_SEED_DIRECTUS_MOCK=1` is combined with an actual `curl` call in the reset branch — `reset_domain_fixture()`'s mock branch returns before reaching the `curl` lines, at line 616/620).
- **Conclusion: the guard is airtight.** There is no code path from CLI invocation to a live DELETE/POST/PATCH against Directus or Authentik in the `--reset` mode that does not first pass through `reset_localhost_guard()`, and the guard function has no override flag.

One residual, non-blocking observation: the guard's `*localhost*|*127.0.0.1*` substring match would also accept a URL like `https://localhost.attacker.example` or `https://evil.com/?localhost` as "local" (naive substring match, not a proper host-parse). This is a pre-existing pattern style already used elsewhere for env-var sanity checks in this codebase's dev tooling, the values in question (`DIRECTUS_URL`/`AK_URL`) are operator-controlled local `.env` values (not attacker-influenced input — nothing in this script accepts these from an HTTP request or user-supplied argument), and exploiting it would require the operator's own environment to already be misconfigured with a malicious hostname, which is outside this script's realistic threat model (per security.md's threat model: opportunistic bots and insider mistakes, not local `.env` tampering by an adversary who already has shell access to the dev machine). Not raised as a MAJOR finding — noting it for completeness only.

---

## Focused Review — Manifest Content

Both `scripts/uat-fixtures/BP-UAT-001.json` and `BP-UAT-013.json` reviewed line-by-line:

- All email addresses used: `uat-operator@aiqadam.test`, `uat-member-c@aiqadam.test`, `uat-member-nc@aiqadam.test`, `uat-operator+no-user@aiqadam.test` — all end in `@aiqadam.test`, the repo's established fixture domain (matches the pre-existing script's own `uat-member@aiqadam.test`/`uat-operator@aiqadam.test` constants). No real-looking or production-domain email present.
- No hardcoded token/password/secret literal — `token_plain` values (`uat-onboard-token`, `uat-onboard-used-token`, `uat-onboard-expired-token`, `uat-onboard-no-user-token`) are static test-fixture identifiers identical in kind to what the script already hardcodes today (STEP 4's `ONBOARD_TOKEN` family) — these are not secrets, they're publicly-known UAT test constants by design (documented as such in the script's own header comment, line 868: "Tokens are static test-fixture constants — never used in production").
- No production-looking identifiers: event title `"UAT Event UZ"`, display names `"UAT Operator (valid)"` etc., group names `aiqadam-member`/`aiqadam-super-admin`/`aiqadam-staff` — all match existing RBAC group naming already used unconditionally elsewhere in the script.
- `country` fields are either explicit `"uz"` (tenant-scoped fixtures) or explicit `null` (global-role fixtures) — never omitted, consistent with the impact analysis's flagged convention.

**Conclusion: both manifests contain only test/fixture data.**

---

## Focused Review — Error Message Hygiene

Every `fail()` call site added or reachable from the new `--reset` code (lines 520, 612, 636, 657, 671, 748, plus the guard's own `exit 4` message at line 501) was inspected. None interpolates `$DIRECTUS_TOKEN`, `$AK_TOKEN`, `$RESET_AK_TOKEN`, or any bearer value. They interpolate: fixture ids, collection names, manifest file paths, `list_known_manifests()` output (BP-UAT id strings), HTTP status codes, and — for the two Directus-call failures (lines 657, 671) — the raw HTTP response body (`${resp}`/`${create_resp}`), which is Directus's own error JSON, not an echo of the request's Authorization header. This matches the pre-existing idiom at line 477 (`ensure_operator_invite`'s own failure message), so no new leakage pattern is introduced. Diagnostic values like `DIRECTUS_URL=https://prod.aiqadam.org` (guard trip message) are intentionally included per the task's own stated exception and are fine.

**Conclusion: no bearer token value is leaked in any new or existing error path touched by this change.**

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "All applicable invariants pass. INV-2 (secrets by reference), INV-5 (no cross-schema queries), manifest content, and error-message hygiene were independently verified against the actual code (not the impact analysis's claims) and hold. The destructive-operation guard (reset_localhost_guard) was traced exhaustively: every DELETE/POST/PATCH call reachable from the --reset path passes through the guard first, the guard checks both DIRECTUS_URL and AK_URL independently, runs before any manifest read or token mint, has no override/bypass flag, and never leaks a bearer token in its own error message. INV-1/3/4/6/7/8/9/10/11 are N/A — confirmed individually, no NestJS/Drizzle/React/web surface exists in this diff. No BLOCKER or MAJOR finding."
  findings:
    - "INV-2 PASS: grepped full diff + both new manifest JSON files for password/secret/apiKey/token/Bearer literals — only matches are static test-fixture token strings (uat-onboard-token, etc.) already used unconditionally elsewhere in the script, not real credentials. No new log/echo line prints DIRECTUS_TOKEN/AK_TOKEN/RESET_AK_TOKEN."
    - "INV-5 PASS: directus_user_pk_by_email() and reset_domain_fixture() only issue curl calls against ${DIRECTUS_URL}/... (Directus's own REST API), same idiom as every pre-existing call in the file. No raw SQL, no cross-schema join, confirmed by direct code inspection, not just the impact analysis's claim."
    - "Guard traced exhaustively: the single curl -X DELETE call site (line 655) has exactly one call chain to the CLI entrypoint (reset_domain_fixture -> run_reset_for_bp -> run_reset_all/direct dispatch), and every entry into that chain sits inside the same `if [[ -n \"$RESET_TARGET\" ]]` block that calls reset_localhost_guard as its first statement (line 782). No bypass env var or alternate code path exists (grepped SKIP/BYPASS/ALLOW_PROD/OVERRIDE/NOCHECK — zero matches). UAT_SEED_DIRECTUS_MOCK=1 disables the curl calls entirely rather than skipping only the guard, so it cannot be used to reach a live DELETE unguarded."
    - "Guard checks both DIRECTUS_URL (lines 490-493) and AK_URL (lines 494-498) independently before exiting 4 (line 502) with zero prior writes — confirmed the AK_URL check is not short-circuited or skipped when DIRECTUS_URL alone passes."
    - "Manifest content confirmed test-only: all emails end in @aiqadam.test, no production-looking identifiers, tokens are documented static fixture constants (script header line 868 states this explicitly), country fields explicit (uz or null), never silently omitted."
    - "Error message hygiene confirmed: all new fail() call sites (lines 520, 612, 636, 657, 671, 748) and the guard's own exit-4 message (line 501) interpolate only ids/collection names/paths/HTTP codes/response bodies/diagnostic URLs — never a bearer token value."
    - "Non-blocking observation (not a finding): reset_localhost_guard's *localhost*/*127.0.0.1* check is a substring match, not a proper host parse, so a crafted hostname like https://localhost.attacker.example would pass. Not raised as MAJOR because DIRECTUS_URL/AK_URL are operator-controlled local .env values, not attacker-influenced input, in this script's threat model — flagging for awareness only."
    - "INV-1/3/4/6/7/8/9/10/11 all N/A, confirmed individually rather than blanket-skipped: no NestJS controller/service/Drizzle/React/cookie/rate-limit/CSRF surface exists anywhere in this diff."
```
