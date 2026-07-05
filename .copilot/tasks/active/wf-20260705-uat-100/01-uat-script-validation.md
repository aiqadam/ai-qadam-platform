## UAT Script Validation — BP-UAT-013

**Script file:** docs/02-business-processes/uat/BP-UAT-013.md
**Process ref:** docs/03-requirements/FR-USR-001.md
**Spec file:** apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts
**Manifest file:** scripts/uat-fixtures/BP-UAT-013.json

### Validation Checklist

| Check | Result | Notes |
|---|---|---|
| `process_ref` file exists | PASS | `docs/03-requirements/FR-USR-001.md` exists; status `Shipped`, module `Users (USR)`, phase `Phase 1 (V1)`. Covers both lead-capture (`POST /v1/leads`) and operator-onboarding (`/onboard?token=…`, `GET /v1/onboard/preview`, `POST /v1/onboard/accept`, 410 semantics) — the exact surface this script exercises. |
| `environment` URL present | PASS | `http://localhost:4321` — concrete base URL (legacy Astro dev server, matches `apps/web` per the spec file header). |
| `seed_required` declared | PASS | `seed_required: true`. |
| `seed_fixture` non-empty (if required) | PASS | Doc has a 5-row fixture table (4 `operator_invites` rows + 1 Mail catcher infrastructure row). Manifest has 4 fixture rows matching the 4 `operator_invites` rows; the Mail catcher row is explicitly documented as `—` (infrastructure, intentionally absent from the JSON manifest — see manifest top-level `description` and the doc's "The Mail catcher row is infrastructure, not a Directus/Authentik-backed fixture" note). |
| All steps have `action` + `expected_ui_state` + `screenshot_label` | PASS | Steps 001–006 each have all three fields. Screenshot labels follow the `step-NNN-<slug>` / `neg-NNN-<slug>` convention. |
| Negative scenarios present | PASS | 5 negative scenarios (Neg 001–005) — exceeds the minimum-one requirement. Covers honeypot (AC-4), used token (AC-6), expired token (AC-7), plus-addressing (AC-1 contract), and no-Authentik-user 409 (AC-5 contract). |
| ACs mapped to steps | PASS | AC-1 → Steps 001, 002 (+ Neg 004); AC-2 → Step 003; AC-3 → Step 004; AC-4 → Neg 001; AC-5 → Steps 005, 006 (+ Neg 005); AC-6 → Neg 002; AC-7 → Neg 003. All 7 ACs (AC-1..AC-7) are mapped. No unmapped AC. |
| Manifest matches doc fixture table | PASS | Column-by-column diff (4 `operator_invites` rows only — Mail catcher row is documented-absent on both sides): `id`, `email`, `display_name`, and `token_plain` (= doc's "Fixture" column) match exactly across all four rows. No diff. Manifest's top-level `description` and per-row `note` correctly explain the `lookup_value: "uat-onbo"` ambiguity (shared prefix; real key is `token_hash` recomputed from `token_plain` at recreate time), so `--reset BP-UAT-013` is unambiguous. |

### Spec cross-read (apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts)

The spec was read end-to-end alongside the doc. Notable alignment:

- All six happy-path `test(...)` blocks correspond 1:1 to Steps 001–006 (Step 002 has an additional `Step 002-screenshot` test that opens the Mailpit web UI for visual evidence — additive, not a gap).
- All five `Neg 001`–`Neg 005` tests in the negative `describe` correspond 1:1 to the doc's negative scenarios.
- The spec implements the doc's "Notes" caveats correctly:
  - `BASE_URL` / `MAILPIT_URL` / `API_URL` env vars with documented defaults.
  - All four `UAT_ONBOARD_*_TOKEN` env vars read with the same plaintext tokens the manifest seeds.
  - Mailpit `DELETE /api/v1/messages` runs in `beforeAll`.
  - Neg 002 / Neg 003 retain the API-level `expect(apiRes.status()).toBe(410)` assertion — exactly the non-vacuous guard the doc requires.
  - Neg 005 exercises both the 409 API contract and the `auth_error` UI phase with the inline `<code>invite_missing_authentik_user</code>` indicator — matches the doc's "Expected rejection" wording verbatim.

### Minor observations (non-blocking)

- **Env caveat documented in spec** — `[email skipped: RESEND_API_KEY not set]` means Mailpit will not receive verify emails in this UAT environment if `RESEND_API_KEY` is unset. Spec carries this honesty disclosure in its header comment; doc's `Notes` already says "Steps 002 and 003 should be marked `deferred` with a note" if no mail catcher is configured. UATRunner should treat Steps 002/003/004 as deferred if `RESEND_API_KEY` is unset and no Mailpit pre-flight check passes.

### Summary

BP-UAT-013 is complete and executable as written. The script declares a concrete environment (`http://localhost:4321`), requires seeding (4 `operator_invites` rows whose manifests match the doc table exactly), defines 6 happy-path steps each with `action`, `expected_ui_state`, and `screenshot_label`, and 5 negative scenarios covering all 7 acceptance criteria. The Playwright spec at `apps/e2e/tests/uat/BP-UAT-013-signup.spec.ts` mirrors the doc 1:1, includes the non-vacuous API+UI assertions required by the test-design rule (Neg 002/003/005), and carries honesty disclosures for env-boundary failures. **No gaps; ready for UATRunner.**

---

## Gate Result

gate_result:
  status: passed
  summary: "BP-UAT-013 script is complete, executable, and its manifest matches the doc fixture table column-for-column; all 7 ACs are mapped to steps or negative scenarios."
  findings:
    - "No gaps found. Script is ready for UATRunner to execute against the live stack."