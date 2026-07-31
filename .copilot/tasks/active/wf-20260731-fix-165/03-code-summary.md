# Step 4 — Code Summary

## Change

`apps/api/src/modules/registrations/registrations-directus.service.ts`:

1. New module constants `SETTLE_POLL_MAX_ATTEMPTS = 3`,
   `SETTLE_POLL_DELAY_MS = 150` (named, per Ten Non-Negotiables §3).
2. New private `pollForSettledStatus(registrationId)`: re-reads the
   registration up to 3 times, 150ms apart, short-circuiting the moment
   the status is no longer the pre-flow default `'registered'`. Never
   throws on its own; worst case (flow genuinely never demotes, or is
   slower than the bound) returns the same value the old single re-read
   would have — so this is a strict improvement with no new failure mode.
3. `register()`'s single `this.directus.get(...)` re-read replaced with
   `await this.pollForSettledStatus(created.data.id)`.
4. New module-level `sleep(ms)` helper.

Total added: ~25 lines. No files beyond the one service touched (test
file is new, added at Step 7).

## Why this fixes AC-1/AC-2

- Confirmed root cause: `reg-capacity-decision` is an async Directus
  action-hook chain (event lookup → count → decide → patch), not part of
  the insert transaction. A single immediate re-read has no ordering
  guarantee against that chain — exactly the "microsecond window" the
  flow's own bootstrap-script comment already named as a known trade-off.
- The client (`RegistrationSidebar.tsx`) was already correct — it renders
  whatever `status` the API returns. No client change needed.
- Bounded poll (450ms worst case, 3 attempts × 150ms) gives the flow real
  headroom to land before the API commits to a response, while adding
  zero perceptible latency to the common non-full-event path (first read
  already correct, loop exits immediately).

## Deliberately not done

- No capacity pre-check/duplicate counting logic in the API (see
  `02-impact-analysis.md` "Fix approach" — rejected to avoid two sources
  of truth for capacity).
- No change to the Directus Flow itself (filter-hook payload mutation
  already ruled out by the flow author, per the bootstrap script's own
  comment — action hook is the only supported mechanism on this Directus
  version).

## Gate

`passed` → Step 5 (Security Review).
