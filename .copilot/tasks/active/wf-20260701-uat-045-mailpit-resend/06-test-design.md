# 06 — Test Design (wf-20260701-uat-045-mailpit-resend)

**Step:** 7 — Regression Tests (TestDesigner)
**Date:** 2026-07-01
**Branch:** `fix/ISS-UAT-013-7-mailpit-resend-key` (off `main@b3dbba0`)
**Parent workflow:** `wf-20260701-fix-044` (paused at `test_run`)
**Issue:** ISS-UAT-013-7

---

## Verdict

**No new test files needed.** All 19 cases declared by the TestStrategist
exist on disk in the locations and shapes described. The bash pre-flight
script is structurally sound. The Step-5 wiring in `uat-env-setup.sh` is
exactly one inserted line, in the documented location, and re-invokes
the pre-flight correctly.

`sub-cases-authored: 0`.

---

## Per-file confirmation

### `apps/api/test/health-email.spec.ts` — 6 cases (rewritten by CodeDeveloper)

| # | Case description | What I verified | File:line |
|---|---|---|---|
| 1 | SMTP + dev → `{ configured: true, provider: "smtp", mode: "uat" }` | `it()` at [health-email.spec.ts:43](apps/api/test/health-email.spec.ts#L43), asserts full shape via `toEqual` | [health-email.spec.ts:42-49](apps/api/test/health-email.spec.ts#L42-L49) |
| 2 | Resend + production → `{ configured: true, provider: "resend", mode: "production" }` | `it()` at L52, `toEqual` full shape | [health-email.spec.ts:51-58](apps/api/test/health-email.spec.ts#L51-L58) |
| 3 | No transport → `{ configured: false, provider: "none", mode: "disabled" }` | `it()` at L61, asserts `configured: false` (pre-flight regression-target) | [health-email.spec.ts:60-67](apps/api/test/health-email.spec.ts#L60-L67) |
| 4 | SMTP transport + `mode: "disabled"` (provider/mode decoupling) | `it()` at L70, asserts provider `'smtp'` + mode `'disabled'` coexist | [health-email.spec.ts:69-78](apps/api/test/health-email.spec.ts#L69-L78) |
| 5 | SMTP + dev → `response.mode === 'uat'` | `it()` at L81, lighter-shape assertion focusing on the `mode` field | [health-email.spec.ts:80-84](apps/api/test/health-email.spec.ts#L80-L84) |
| 6 | Resend + production → `response.mode === 'production'` | `it()` at L86, focus on `mode` field | [health-email.spec.ts:85-89](apps/api/test/health-email.spec.ts#L85-L89) |

The same six tests use literal-union constants (`PROVIDER_SMTP`, `MODE_UAT`,
…) declared once at the top — satisfies AGENTS.md §1.3 (no magic strings).
Mock pattern: `vi.fn<[], Provider>().mockReturnValue(...)` cast to
`unknown as EmailService` — clean, no `any`, no other casts. **All 6 cases
match the strategy.**

### `apps/api/test/email-service-mode.spec.ts` — 6 cases (NEW, by CodeDeveloper)

| # | Case description | What I verified | File:line |
|---|---|---|---|
| 1 | `SEND_EMAILS=false` + `NODE_ENV=development` → `'disabled'` | `it()` at [email-service-mode.spec.ts:71](apps/api/test/email-service-mode.spec.ts#L71) | [email-service-mode.spec.ts:70-75](apps/api/test/email-service-mode.spec.ts#L70-L75) |
| 2 | `SEND_EMAILS=false` + `NODE_ENV=production` → `'disabled'` (disabled-first) | [email-service-mode.spec.ts:77-83](apps/api/test/email-service-mode.spec.ts#L77-L83) |
| 3 | `SEND_EMAILS=true` + `NODE_ENV=production` → `'production'` | [email-service-mode.spec.ts:85-90](apps/api/test/email-service-mode.spec.ts#L85-L90) |
| 4 | `SEND_EMAILS=true` + `NODE_ENV=development` → `'uat'` | [email-service-mode.spec.ts:92-97](apps/api/test/email-service-mode.spec.ts#L92-L97) |
| 5 | `SEND_EMAILS=true` + `NODE_ENV=test` → `'uat'` (test treated as non-production) | [email-service-mode.spec.ts:99-104](apps/api/test/email-service-mode.spec.ts#L99-L104) |
| 6 | Idempotence + provider independence (two transports → same mode) | [email-service-mode.spec.ts:106-122](apps/api/test/email-service-mode.spec.ts#L106-L122) — explicitly swaps `SMTP_HOST` ↔ `RESEND_API_KEY` and asserts `getMode()` unchanged |

Mock pattern mirrors `email-service-smtp.spec.ts` exactly: `vi.hoisted(() => …)`
environment ref + `vi.mock('../src/config/env', () => ({ env: mockEnv }))`.
Nodemailer + Resend are mocked too, so the import order doesn't matter.
**All 6 cases match the strategy.**

### `apps/api/test/email-service-smtp.spec.ts` — 7 cases (UNCHANGED regression guard)

| # | Case description | What I verified | File:line |
|---|---|---|---|
| 1 | `getProvider()` returns `'smtp'` when `SMTP_HOST` set | [email-service-smtp.spec.ts:65-71](apps/api/test/email-service-smtp.spec.ts#L65-L71) |
| 2 | `getProvider()` returns `'resend'` when only `RESEND_API_KEY` set | [email-service-smtp.spec.ts:73-79](apps/api/test/email-service-smtp.spec.ts#L73-L79) |
| 3 | `getProvider()` returns `'none'` when neither | [email-service-smtp.spec.ts:81-87](apps/api/test/email-service-smtp.spec.ts#L81-L87) |
| 4 | SMTP path: `transporter.sendMail` called with correct args | [email-service-smtp.spec.ts:106-119](apps/api/test/email-service-smtp.spec.ts#L106-L119) |
| 5 | SMTP path: does NOT call Resend | [email-service-smtp.spec.ts:121-126](apps/api/test/email-service-smtp.spec.ts#L121-L126) |
| 6 | Resend path: calls Resend SDK when only `RESEND_API_KEY` set | [email-service-smtp.spec.ts:140-149](apps/api/test/email-service-smtp.spec.ts#L140-L149) |
| 7 | No transport + `SEND_EMAILS=false` → no send called | [email-service-smtp.spec.ts:166-180](apps/api/test/email-service-smtp.spec.ts#L166-L180) |

Total `it()` count in this file: **7** — matches the strategy's count of 7.
File is **unchanged** by this PR (CodeDeveloper's diff is purely additive);
its existence as-is on disk proves `getProvider()` and `send()` were not
regressed by adding `getMode()`.

**Total unit cases on disk: 19.** Matches the strategy exactly.

---

## Bash pre-flight script audit

**File:** [`scripts/uat-preflight-email.sh`](scripts/uat-preflight-email.sh)

| Check | Result |
|---|---|
| `#!/usr/bin/env bash` shebang | ✅ line 1 |
| `set -euo pipefail` | ✅ line 43 |
| `readonly` for every constant | ✅ lines 45-58 (8 constants) |
| Scheme validation `^https?://` (MAJOR-1 fix) | ✅ line 107 |
| Curl uses `--write-out '\n%{http_code}'`, no `--data`/`-K`/`-F` | ✅ lines 122-123 |
| `jq` uses `--arg` only, no string interpolation | ✅ lines 137-148 |
| All variables quoted (`"${API_BASE_URL}"`, `"$body"`, `"$field"`) | ✅ verified by inspection |
| No `source` or `.` (dot-include) of external files | ✅ grep confirms zero |
| No `wget`, no other outbound calls | ✅ only `curl ${API_BASE_URL}/health/email` |
| `--max-time $CURL_MAX_TIME_SECONDS` guard (no runaway hang) | ✅ line 122 |
| Exit codes documented (`0`/`1`/`2`) in header comment | ✅ lines 30-32 |
| Actionable error names actual `provider` + `mode` values | ✅ lines 153-160 |
| `--help` flag handled before `main()` | ✅ lines 88-91 |
| `bash -n` syntax-clean | ✅ confirmed by CodeDeveloper (`03-code-summary.md`) |

**No new test file needed for the bash script.** Bash is outside vitest's
scope; the script's behaviour is verified by Gate 1 of the live verification
plan (running it against the live API). Security-reviewer already verified
the no-injection-surface claim; the scheme validation is the correct closing
of MAJOR-1.

### `scripts/uat-env-setup.sh` Step 5 wiring audit

The single inserted line is at:
[`scripts/uat-env-setup.sh:256`](scripts/uat-env-setup.sh#L256)

```bash
API_BASE_URL="http://localhost:3001" bash "$REPO_ROOT/scripts/uat-preflight-email.sh"
```

- ✅ Sits **after** the Mailpit `wait_for_url` (line 254) and **before** the
  `"All services healthy"` `ok` line.
- ✅ Uses `"$REPO_ROOT/scripts/uat-preflight-email.sh"` — absolute-path
  resolution so it works regardless of `$PWD` when `uat-env-setup.sh` is
  sourced.
- ✅ Provides `API_BASE_URL` as an env var (no inline shell-source quoting).
- ✅ Does not modify Mailpit `wait_for_url` arguments or the comment
  block — diff blast radius is one line.
- ✅ Comment block at lines 251-254 explains why this was added (cites
  ISS-UAT-013-7, names the 60 s Mailpit timeout, points at the pre-flight
  script's failure-mode semantics).

Step 5 properly invokes the pre-flight script. No gaps.

---

## Run order for the TestRunner

The TestRunner step should execute in this exact order (matters because
the pre-flight script depends on the API container up, and BP-UAT-013 depends
on Mailpit + API + Astro dev all up):

### Phase A — static + structural

1. `pnpm --filter @aiqadam/api typecheck` (already PASS in CodeDeveloper; re-run for freshness)
2. `pnpm --filter @aiqadam/api exec biome check apps/api/src/health apps/api/src/modules/email apps/api/test/health-email.spec.ts apps/api/test/email-service-mode.spec.ts` (PASS already)
3. `bash -n scripts/uat-preflight-email.sh` (syntax-only)
4. `bash scripts/uat-preflight-email.sh --help` (must exit 0 with usage banner)

### Phase B — local vitest (HONEST DISCLOSURE: blocked by ISS-UAT-013-9)

```bash
pnpm --filter @aiqadam/api exec vitest run \
  apps/api/test/email-service-mode.spec.ts \
  apps/api/test/health-email.spec.ts \
  apps/api/test/email-service-smtp.spec.ts
```

Expected to **fail locally** with `ReferenceError: __vite_ssr_exportName__ is
not defined` (Node 24 + vite-node 2.1.9 SSR bug, repo-wide, out of scope for
this PR per AGENTS.md §4 small-PR rule). The TestRunner must:
- Record this failure honestly in `07-test-results.md` under "Local vitest"
- **Not** mark this as a test-suite failure — it is an environment failure
- Fall back to the CI-on-Node-22 evidence as the canonical proof

### Phase C — CI vitest (canonical unit verification)

The GitHub Actions runner uses Node 22 where vitest 2.1.9 SSR works correctly.
The TestRunner must surface the CI workflow run URL in `07-test-results.md`.
On CI, all 19 cases must pass.

### Phase D — pre-flight script integration

```bash
docker ps --filter "name=aiqadam-mailpit" --format "{{.Status}}"  # healthy
docker ps --filter "name=aiqadam-api"     --format "{{.Status}}"  # Up + healthy (started >30 s ago)
curl -fsS http://localhost:3001/health                              # 200, status:"ok"
curl -fsS http://localhost:3001/health/email | jq 'keys | sort'     # ["configured","mode","provider"]
API_BASE_URL=http://localhost:3001 bash scripts/uat-preflight-email.sh
# Expected: exit 0, prints JSON, "✓ Email transport ready at http://localhost:3001/health/email"
```

### Phase E — BP-UAT-013 live regression (the canonical AC gates)

```bash
cd apps/e2e
pnpm exec playwright test \
  --config apps/e2e/playwright.uat.config.ts \
  apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts \
  --grep "Step 002|Step 003"
```

Both Step 002 (mailpitSearch finds message) and Step 003 (verify-link →
/leads/verified) must pass.

### Phase F — log audit (AC-2)

```bash
grep -c '\[email skipped' apps/api/api-dev.log
# Expected: 0 (or unchanged from pre-test baseline)
```

---

## Sub-cases added by this TestDesigner step

**None.** `sub-cases-authored: 0`.

I inspected each of the 19 cases the strategy declares; every one is on
disk with the asserted expectations matching the strategy's prose. No gap
was found, no missing assertion was identified, no new public function
needed an additional case. Adding cases here would be redundant and would
inflate the PR beyond AGENTS.md §4's small-PR rule.

---

## Known test-environment limitations (carried forward)

| Limitation | Source | Owner | Impact on this step |
|---|---|---|---|
| Local vitest blocked by Node 24 + vite-node 2.1.9 SSR bug | ISS-UAT-013-9 (repo-wide, pre-existing) | Orchestrator / future workflow | None for TestDesigner — strategy already documented; CI is canonical |
| `shellcheck` not available locally | env-only | Orchestrator | None — `bash -n` passes; pattern is in sibling script style; CI lint is recommended but non-blocking |
| Live Mailpit round-trip must wait for Orchestrator's stack-up | AGENTS.md §6.1 | Orchestrator before TestRunner runs | Gate 1 / Gate 2 require stack-up first |

---

## Gate Result

```markdown
## Gate Result

gate_result:
  status: passed
  summary: >-
    All 19 unit cases declared by the TestStrategist exist on disk (6 in
    health-email.spec.ts, 6 in email-service-mode.spec.ts, 7 unchanged in
    email-service-smtp.spec.ts) with the asserted shapes matching the
    strategy's prose. No new test files needed. scripts/uat-preflight-email.sh
    is structurally sound (bash -n clean, scheme-validated, quoted, no
    external resources, 8 readonly constants, no injection surface).
    scripts/uat-env-setup.sh Step 5 wiring is exactly one line at L256,
    uses $REPO_ROOT absolute path, fires after Mailpit wait_for_url and
    before the "All services healthy" summary. Run order for TestRunner
    is documented in 6 phases with honest disclosure re local vitest being
    blocked by ISS-UAT-013-9.
  findings:
    - "Per-file confirmation: all 19 cases on disk; assertions match strategy (mode-disabled ordering, provider-vs-mode decoupling, idempotence, regression-guard non-mutation) — citations provided."
    - "No 'magic string' violations: every literal mode/provider value is declared as a `const … = '…' as const` at the top of each spec file (AGENTS.md §1.3 satisfied)."
    - "Mock pattern matches the sibling email-service-smtp.spec.ts exactly (vi.hoisted + vi.mock factory); no constructor mock leakage."
    - "Bash pre-flight: set -euo pipefail, scheme validation, readonly constants, --max-time guard, --write-out for body+status split, jq -e gate with --arg (no string interpolation), exit codes 0/1/2 documented."
    - "Bash script has zero source/. dot-includes, zero wget, exactly one curl call (to ${API_BASE_URL}/health/email) — confirms no dangerous external resources."
    - "uat-env-setup.sh Step 5 wiring at L256 is a single new line; provides API_BASE_URL via env var; uses absolute path via $REPO_ROOT; explanatory comment at L251-254 cites ISS-UAT-013-7 and the 60s Mailpit-timeout failure mode."
    - "Run order documented in 6 phases: A static checks → B local vitest (honest disclosure: blocked by ISS-UAT-013-9) → C CI vitest (canonical) → D pre-flight script → E BP-UAT-013 Steps 002/003 → F log audit."
    - "sub-cases-authored: 0 — all 19 cases already on disk; adding more would inflate the PR past AGENTS.md §4 small-PR threshold."
    - "Honest disclosure carried forward to TestRunner: local `pnpm … vitest run` will fail with vite-node SSR bug (ISS-UAT-013-9); TestRunner must cite the CI-on-Node-22 evidence as the canonical proof in 07-test-results.md, not local pass."
  retry_target: null
  deferred_to_feature: null
  deferred_reason: null
```
