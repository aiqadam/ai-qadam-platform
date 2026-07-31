# Step 2 — Impact Analysis

## Root cause (AC-1 — now confirmed, resolving the issue's own open question)

`RegistrationsDirectusService.register()`
(`apps/api/src/modules/registrations/registrations-directus.service.ts:130-147`)
does exactly ONE re-read of the newly created row, immediately after the
`POST`, with no wait/retry:

```ts
const created = await this.directus.post<{ data: RegistrationRow }>(
  '/items/registrations', insertBody,
);
...
// Re-read so the capacity flow's status patch is reflected.
const settled = await this.directus.get<{ data: RegistrationRow }>(
  `/items/registrations/${created.data.id}`,
);
```

The capacity decision is applied by a Directus **action hook**
(`reg-capacity-decision` in `infrastructure/directus/flows-bootstrap.sh`),
triggered on `registrations.items.create`. The flow's own header comment
documents the race explicitly:

> "Action hook trades a microsecond window where the row briefly sits at
> default 'registered' for a reliable, well-supported path."

Action hooks in Directus run as a **separate async chain** after the
triggering request's own response cycle — not synchronously inside the
insert transaction. The chain itself is 4 operations deep (event lookup →
count registered → decide status → conditionally patch), each a further
async op. The API's single immediate re-read has no ordering guarantee
relative to that chain completing. This is hypothesis (1) from
`ISS-UAT-010-2.md` — **confirmed, not (2)**: the client (`RegistrationSidebar.tsx`)
is a faithful pass-through of whatever `status` the POST response carries
(`postRegister()` → `readyAfterRegister()`), so there is no client-side bug
to fix.

## Fix approach

Add a bounded poll/retry to the re-read: after the initial `GET`, if
`status === 'registered'` AND the event is plausibly at/over capacity,
retry the `GET` a few times with a short delay, accepting the first
`waitlisted` result or falling through to the last-read value after the
bound is exhausted (never blocks registration — same fail-safe posture as
`DirectusUsersBridgeService`'s existing error-handling style, though this
isn't an error case).

Two designs considered:
1. **Blind poll every re-read** (fixed N retries × fixed delay,
   unconditionally). Simple, but adds latency to the overwhelmingly common
   non-full-event path for no reason.
2. **Conditional poll**: only retry if the event's capacity could plausibly
   be exceeded (i.e., we already know capacity + a rough registered count
   from `assertEventInTenant`'s existing event fetch, or just poll only
   when the fresh read still says `registered` AND a cheap follow-up count
   confirms capacity is at/over). This avoids adding latency to the
   overwhelmingly common uncapped/under-capacity path.

**Decision: a short, small, unconditional bounded poll on the re-read
only** (not a capacity pre-check) — simpler, no new Directus round-trip
shape, and the added latency (worst case ~3 short retries) only matters
for the narrow window where the flow hasn't yet landed, which is already
a tail case. A capacity pre-check would duplicate the Flow's own counting
logic in two places (real drift risk) for a marginal latency win on an
already-rare path. This keeps the fix contained to
`registrations-directus.service.ts`, no new dependency, no DB migration.

## Files to modify

- `apps/api/src/modules/registrations/registrations-directus.service.ts` —
  add a small `pollForSettledStatus()` (or inline bounded loop) around the
  existing re-read in `register()`. Named constants for max attempts /
  delay (Ten Non-Negotiables §3, no magic numbers).
- New spec file `apps/api/src/modules/registrations/registrations-directus.service.spec.ts`
  (does not exist yet) — regression test reproducing the race
  deterministically (mock `DirectusClient` returning `registered` on the
  first N re-reads, `waitlisted` after).

## Blast radius

- Contained to `RegistrationsDirectusService.register()`. No other method
  touches this re-read.
- No DB migration (Directus-only, no Drizzle schema involved).
- No API response shape change — same `RegistrationView`.
- Slightly increases worst-case latency of `POST /events/:id/register`
  only when the flow hasn't landed by the first read (bounded, small).
- No security-relevant surface change (no new input, no new auth path) —
  Security Review step is still run per protocol but expected to be
  low-risk.

## Gate

`passed` → Step 4 (no DB migration, so Step 3 is skipped).
