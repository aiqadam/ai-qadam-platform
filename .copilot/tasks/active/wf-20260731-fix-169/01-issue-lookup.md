# Step 1 — Issue Lookup

**Issue:** ISS-UAT-010-1 (already existed locally, filed `wf-20260730-fix-157`).
**GitHub:** #162 (`aiqadam-sync-ref: ISS-UAT-010-1` comment already present in
the issue body — confirms the existing local file is the correct match, no
new file created).

Actions taken:
- Posted back-reference comment on #162.
- Synced GitHub Project status to `in-progress` (`sync-github-project.sh`).
- `Business-Process: BP-UAT-010` already set in `ISS-UAT-010-1.md`'s header
  — unchanged, still correct (this fix rewrites BP-UAT-010's own doc + spec).

Re-verified against current `main` HEAD that every claim in the issue still
holds (nothing had drifted since 2026-07-30):

- `apps/api/src/modules/registrations/registrations-directus.service.ts:21`
  — `Status = 'registered' | 'waitlisted' | 'cancelled' | 'attended'`. No
  `confirmed`/`waitlist` anywhere.
- `apps/api/src/modules/registrations/registrations.controller.ts:63-64` —
  `POST v1/events/:eventId/register`, `@HttpCode(HttpStatus.OK)` (200).
- No `/v1/registrations` (plain), no `/v1/points/me`, no `/v1/notifications`
  endpoint exists anywhere in `apps/api/src`. Confirmed via grep across all
  controllers.
- `GET /v1/leaderboard` exists (`apps/api/src/modules/points/points.controller.ts`)
  — the only points-related read endpoint. No per-user points-query route.
- `infrastructure/directus/flows-bootstrap.sh:673-677` (`checkin_award` op,
  `reg-checkin-points` flow) — `"points": 10`, triggered only on
  `registrations.items.update` with `status: attended`. No registration-time
  award path exists anywhere in `apps/api` or the Directus flows.
- `apps/web-next/src/blocks/customer/RegistrationCTA.tsx` +
  `apps/web-next/src/lib/use-registrations.ts` — the real V2 registration UI
  surface (`useRegisterForEvent`/`useMyRegistrationStatus`), confirmed to
  have **no QR code element at all** (matches the already-documented AC-2
  `PARTIAL` finding from `wf-20260730-uat-158`).
- `scripts/uat-fixtures/BP-UAT-010.json` (from ISS-UAT-SEED-003) already
  seeds the CORRECT real values (`status: registered`/`waitlisted`, a fixed
  check-in-sourced `point_awards` baseline row, `points: 10`) — confirming
  the fixture side needs no changes, only the doc/spec.

No new findings. Proceeding straight to the fix — this issue's own AC list
is already a complete, unambiguous spec for the change.

## Gate Result

gate_result:
  status: passed
  summary: "Issue re-confirmed current on main HEAD; no drift since filing. Proceeding to fix."
  findings: []
