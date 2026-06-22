---
type: operator-runbook
---

# Runbook: Member referral codes (`/me/referrals`)

**Audience:** members + operators (operators read attribution; members issue codes).
**Pre-reading:** [marketing playbook §16.3](../marketing-and-pr-playbook.md#163-attribution-model), [ADR-0033](../../adr/0033-community-member-graph.md).
**Ships:** F-S3.9.

## How it works end-to-end

```
1. Member visits /me/referrals → clicks "Mint my code"
   → POST /api/v1/referrals/issue → 6-char code in `referral_codes`
2. Member shares  https://aiqadam.org/?ref=<code>
3. Visitor lands at the share URL
   → Layout.astro inline script calls captureLandingAttribution()
   → POST /api/v1/referrals/resolve { code } → { ownerUserId }
   → cookie `aiqadam-ref-owner` set to ownerUserId (90-day TTL)
   → UTM params (if any) merged into `aiqadam-attribution` cookie
     (first_touch never overwritten; last_touch updated each visit)
4. Visitor signs in via Authentik + registers for any event
   → RegistrationSidebar reads readAttribution() → adds
     {referredBy, acquisitionSource} to POST /api/v1/events/:id/register body
   → server stamps registrations.referred_by + .acquisition_source
5. Operator views attribution via /workspace/members (cohort filter on
   referred_by) or future Sprint 2.6 dashboard (K-factor + top-referrer)
```

## Behavior contracts

| Rule | Why |
|---|---|
| Self-referral discarded | A user can't refer themselves. Server-side check `input.referredBy !== directusUserId`. |
| Issue is idempotent per active code | Re-clicking "Mint my code" returns the same code, never accumulates duplicates. Expired codes are skipped and a fresh one mints. |
| Resolve is public (no auth) | The visitor isn't signed in yet. Returns `{ ownerUserId: null }` for bogus/expired codes (caller treats null as "no referral"). |
| First-touch never overwritten | If a visitor arrives via channel A then later channel B, attribution credits A (discovery) and B (close). |
| Cookie TTL 90 days | Matches industry convention + the existing F-S1.6 UTM capture pattern. |
| Empty/oversize codes rejected client-side | Defensive: `normalizeCode` returns null for empty / > 24 chars. |

## Failure modes + recovery

### "I minted a code but it doesn't appear at `/me/referrals`"
Reload — the list reads `GET /v1/referrals/mine` on mount. If the issue POST succeeded (look at network tab → 200), the next page-load list will include it.

### "I shared the link but the friend's registration shows referred_by=null"
Possible causes:
1. **Friend used different browser / device / incognito** — cookie didn't persist. Attribution requires same-device continuity from landing → register.
2. **`captureLandingAttribution()` failed to fire** — check Layout's `<script>` actually loaded. Plausible script and this one share the same `<body>` tail; if Plausible loaded, this should too.
3. **`/api/v1/referrals/resolve` returned `{ ownerUserId: null }`** — the code was expired or typo'd. Re-share a fresh URL.
4. **Friend skipped the share-URL and went directly to `/events`** — no `?ref=` in URL = no resolution. Educate friend to use the link.

### "Codes seem to be colliding"
Almost impossible at current scale (alphabet 31 × length 6 = ~887M codes; `insertWithRetry` retries 5× on uniqueness 4xx). If it actually happens we'll see warnings in the api logs (`referral code insert attempt N failed`). Bump `CODE_LENGTH` to 8 if collision rate becomes non-trivial.

### "Someone is gaming attribution (alt accounts, bots)"
Out of scope for v1. Detection signals to consider when the analytics surface lands (Sprint 2.6):
- Multiple registrations with the same `referred_by` and the same source IP / browser fingerprint
- Codes minted then immediately consumed by a freshly-signed-up account
- K-factor > 5 from a single referrer (likely abuse)

## Wiring a new attribution surface

If a future flow (Sprint 5.5 bot link, sponsor page, etc.) also needs to submit attribution:

```ts
import { readAttribution } from '../lib/attribution';
const { referredBy, acquisitionSource } = readAttribution();
// include in POST body
```

The flow's API handler should accept the same `attributionSchema` (see `registrations.controller.ts` `parseAttribution()`) and pass to the relevant service.

## Related

- `apps/api/src/modules/referrals/` — service + controller + module
- `apps/web/src/lib/attribution.ts` — client cookie helper (read + landing capture)
- `apps/web/src/components/RegistrationSidebar.tsx` — first wired consumer
- `apps/web/src/pages/me/referrals.astro` + `MyReferrals.tsx` — member UI
- `apps/api/test/referrals-service.spec.ts` — 12 unit tests
- `infrastructure/directus/bootstrap.sh` §F-S3.9 — schema (`referral_codes` + `registrations.referred_by` + `.acquisition_source`)
- Marketing playbook §16.3 — attribution model spec
- Sprint 2.6 — K-factor + top-referrer dashboard reads this data


## System requirements

| FR | Capability | Status |
|---|---|---|
| [FR-USR-005](../../03-requirements/FR-USR-005.md) | Referral programme | Shipped |
| [FR-CMS-006](../../03-requirements/FR-CMS-006.md) | UTM URL builder | Shipped |
