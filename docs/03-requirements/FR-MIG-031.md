---
code: FR-MIG-031
name: Production cutover — cookie parity, SEO re-enable, FQDN flip (M4 steps 1–2, 5–7)
status: Implemented
module: Migration (MIG)
phase: Rebuild M4
---

## Description
The final production cutover sequence. Gated on FR-MIG-030 (parity verified). The FQDN flip itself is a **human step** (Coolify web UI only — API write wipes Traefik labels, per the 2026-05-24 incident).

## Users
Engineer executing cutover + PM approving the gate.

## Functional scope
The following steps are executed in order; each is a separate PR or ops action:

**Step 1 — Auth/cookie parity**
- API updated to issue `aiqadam-refresh` as the canonical cookie from v2.
- API accepts `aiqadam-next-refresh` for 24h overlap window, then drops it.
- 30s server-side rotation grace period; `users.min_access_iat` for active-token revocation.
- Coolify env var `COOKIE_NAME` in `web-next` app flipped from `aiqadam-next-refresh` to `aiqadam-refresh`.

**Step 2 — Re-enable for prod**
- Remove `<meta robots noindex>` + `robots.txt Disallow: /` from `web-next`.
- Re-add: `<link rel="canonical">`, full OG/Twitter card block, Plausible analytics script, Google Fonts preconnect, `captureLandingAttribution` script.

**Step 3 — Authentik OAuth client repoint**
- Run `pnpm cutover:repoint --dry-run` to preview, then `pnpm cutover:repoint` to apply.
- Removes all `next.aiqadam.org` redirect URIs from the Authentik OAuth2 provider; adds the apex + all active tenant production URIs.
- Requires `AUTHENTIK_ADMIN_TOKEN` and `AUTHENTIK_OIDC_PROVIDER_NAME` in `apps/api/.env`.

**Step 4 — Pre-flip snapshot**
- Backrest snapshot taken within 1 hour of FQDN flip.

**Step 5 — FQDN flip (human step)**
- In Coolify web UI: swap FQDNs (point apex/tenant domains to `web-next`, move `next.aiqadam.org` to `web`).
- ⚠️ API write forbidden — use Coolify UI → Save → Deploy only.
- Freeze all other Coolify writes during the window.

**Step 6 — Smoke test (30 min)**
- Manual: sign-in, register for event, recovery flow, `/workspace` load.
- Watch Plausible + error logs for anomalies.

**Step 7 — PM sign-off**
- Decision-batch entry confirming cutover complete.

**Step 8 — Standby period + teardown**
- v1 stays on standby 2 weeks (re-flip = instant rollback).
- After 2 weeks: `git rm -rf apps/web/`, rename `apps/web-next/` → `apps/web/`.

## Acceptance criteria
- [ ] FR-MIG-030 gate: parity E2E green for 2 consecutive 24h cron runs + Lighthouse ≥ 90.
- [ ] Step 1: `aiqadam-next-refresh` cookie no longer issued by v2 after flip; existing tokens still valid for 24h.
- [ ] Step 2: `next.aiqadam.org` no longer returns `noindex`.
- [ ] Step 5: Coolify flip performed via web UI only, not API.
- [ ] Step 6: 30-min smoke passes with no P1 errors in logs.
- [ ] Step 7: PM sign-off recorded in a decision-batch entry.
- [ ] Step 8 (2 weeks later): `apps/web/` deleted, `apps/web-next/` renamed.

## Notes
- **COOLIFY FQDN FLIP MUST BE WEB-UI ONLY.** API re-run wipes `custom_labels` and Traefik routing (caused 40-min prod outage 2026-05-24). This is a human-executed step, not automatable.
- Related: `docs/04-development/frontend/migration-status.md` § Cutover sequence.
- PR for Step 1 is the last automated code change before cutover; Steps 5–8 are ops actions.

## Implementation

**Implemented:** 2026-06-25 — wf-20260625-feat-025 — branch `feature/MIG-031-production-cutover`

Steps 1 and 2 (automatable steps) are implemented:

- **Step 1 (cookie name parity):** `apps/web-next/src/middleware.ts` — `REFRESH_COOKIE_NEXT` value swapped to `'aiqadam-refresh'` (canonical post-cutover name); `REFRESH_COOKIE_LEGACY` set to `'aiqadam-next-refresh'` (24h overlap). Cascade fix: `signed-out.astro` cookie clear order updated to match.
- **Step 2 (SEO re-enablement):** `apps/web-next/src/layouts/Layout.astro` — `<meta name="robots" content="noindex,nofollow">` removed; default title updated to `'AI Qadam'`; default description updated to production copy. `apps/web-next/src/blocks/common/PageHead.astro` — OG/Twitter card block, `<link rel="canonical">`, Plausible analytics, Google Fonts preconnect, and `captureLandingAttribution` script added. `apps/web-next/public/robots.txt` — `Disallow: /` replaced with permissive `Allow: /` ruleset with sitemap directive. `apps/web-next/src/pages/index.astro` — title updated to `'AI Qadam'`.

**Step 3** is now scripted: `pnpm cutover:repoint` calls the Authentik admin API via `scripts/cutover-authentik-repoint.ts`.

**Steps 4–8 remain as human/ops actions:** Backrest snapshot (Step 4), Coolify FQDN flip via web UI only (Step 5 — API writes are permanently forbidden due to 2026-05-24 incident), smoke test (Step 6), PM sign-off (Step 7), and post-standby teardown (Step 8).
