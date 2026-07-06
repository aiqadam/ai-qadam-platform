# Teardown — BP-UAT-013

**Policy:** clean-up

## State

- **lead row (uat-lead-new@example.com):** created by Step 001 (form submitted successfully). Must be deleted via Directus items API: `DELETE /items/leads?filter[email][_eq]=uat-lead-new@example.com` or equivalent.
- **operator_invites (uat-onboard-token):** consumed by Step 006 (accept succeeded). Must be restored via `pnpm uat:seed --reset BP-UAT-013` before next run, followed by patching `authentik_user_id=6` on the three happy-path rows (see ISS-UAT-SEED-003).
- **operator_invites (uat-onboard-used-token, uat-onboard-expired-token, uat-onboard-no-user-token):** not consumed; still in seeded state.
- **Mailpit inbox:** cleared by `mailpitDeleteAll()` at session start; no emails accumulated during this run (RESEND_API_KEY not set).
- **screenshots:** 12 files retained in `apps/e2e/uat-results/BP-UAT-013/wf-20260706-uat-114-bp-uat-013/` as evidence artifacts.

## Notes

Steps 002 and 003 failed due to missing RESEND_API_KEY in apps/api/.env (documented env limitation in BP-UAT-013-signup.spec.ts header). The lead row was created but no verification email was dispatched. The lead row cleanup above is required regardless.

The `authentik_user_id` gap in the seed is tracked as a new issue (ISS-UAT-SEED-003 or equivalent): `reset_domain_fixture()` for `operator_invites` does not look up and set `authentik_user_id` from the Authentik API, leaving it NULL. The Directus rows must be manually patched after each `--reset`.
