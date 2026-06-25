# Code Summary — FR-MIG-031

**Workflow:** wf-20260625-feat-025
**Agent:** CodeDeveloper
**Date:** 2026-06-25

---

## Requirement Implemented

**FR-MIG-031 — Production cutover automatable steps (Step 1 + Step 2)**

- **Step 1 (cookie name parity):** Swapped `REFRESH_COOKIE_NEXT` / `REFRESH_COOKIE_LEGACY` constant values in `middleware.ts` so the canonical API cookie name `aiqadam-refresh` is now primary and the build-aside name `aiqadam-next-refresh` is the 24h overlap legacy constant. The `hasRefresh` multi-cookie check was already correct and needed no logic change.

- **Step 2 (SEO re-enablement):** Removed `<meta name="robots" content="noindex,nofollow">` from `Layout.astro`; updated default title/description to production copy; populated `PageHead.astro` with OG tags, Twitter card, canonical link, Google Fonts preconnect, and Plausible analytics script; replaced `robots.txt` blocking ruleset with the production permissive ruleset.

- **Cascade fixes:** `signed-out.astro` cookie clear order swapped so `aiqadam-refresh` (canonical) clears first; `index.astro` hardcoded title updated from `"AI Qadam (next)"` to `"AI Qadam"`.

---

## Files Changed

| File | Change Type | Description | LOC delta |
|---|---|---|---|
| `apps/web-next/src/middleware.ts` | Modify | Swapped `REFRESH_COOKIE_NEXT` value to `'aiqadam-refresh'` (canonical) and `REFRESH_COOKIE_LEGACY` to `'aiqadam-next-refresh'` (overlap). Updated comment block to reflect post-cutover semantics. | ~20 lines (comment replacement) |
| `apps/web-next/src/layouts/Layout.astro` | Modify | Removed `<meta name="robots" content="noindex,nofollow">`. Changed default title from `'AI Qadam (next)'` to `'AI Qadam'`. Changed default description to `'AI community platform for engineers across Central Asia'`. Updated comment block to reflect production state. | -5 / +5 |
| `apps/web-next/src/blocks/common/PageHead.astro` | Modify | Added `ogImage?: string | undefined` prop. Added canonical `<link>`, OG meta block (title, description, url, type, image), Twitter card block (card, title, description), Google Fonts preconnect links, Plausible analytics script with `is:inline`. | +25 lines |
| `apps/web-next/public/robots.txt` | Replace | Replaced `Disallow: /` blocking ruleset with `Allow: /` + sitemap directive. | -1 / +3 |
| `apps/web-next/src/pages/auth/signed-out.astro` | Modify | Swapped cookie clear order: `aiqadam-refresh` cleared first (primary post-cutover), `aiqadam-next-refresh` cleared second (24h overlap). Updated frontmatter comment to reflect canonical cookie name. | 2 lines reordered |
| `apps/web-next/src/pages/index.astro` | Modify | Updated hardcoded `title="AI Qadam (next)"` to `title="AI Qadam"` in both `<Layout>` and `<PageHead>` invocations. | 2 lines |

**Total files changed:** 6 (5 TypeScript/Astro code files + 1 plain-text data file)
**Total LOC delta:** approximately +57 / -10 (net +47 lines)

---

## Key Design Decisions

### Cookie constant naming preserved

`REFRESH_COOKIE_NEXT` and `REFRESH_COOKIE_LEGACY` constant names were kept as-is (only their string values were swapped). Renaming the constants themselves would have required touching the `hasRefresh` references and risked introducing confusion during review. The names are internal to this file only and the comment block explains the current semantics clearly.

### `is:inline` on Plausible script

Astro treats any `<script>` with non-Astro attributes (`defer`, `data-domain`, external `src`) as implicitly inline. Adding `is:inline` explicitly suppresses the Astro checker hint (astro(4000)) without changing behavior — external scripts are always emitted as-is regardless.

### `ogImage` prop defaults to brand mark, not hardcoded per-page

Rather than requiring every existing page to pass `ogImage`, the prop is optional with a fallback to `/brand/aiqadam-mark.png`. Pages that need a per-event or per-profile social image can pass their own URL. This keeps PageHead backward-compatible with all ~40 existing consumers.

### `Astro.url.href` for canonical

Used `Astro.url.href` (available in all SSR Astro components) rather than constructing the URL manually from `request.url` or env vars. This gives the correct full URL including protocol, host, and path without needing an env variable.

### Other `· AI Qadam (next)` pages not touched

The task explicit scope was 6 files. The ~8 other pages (events, leaderboard, me/*, u/[handle]) that also hardcode the `· AI Qadam (next)` suffix are out of scope for this PR per the ≤ 5 code files constraint. They should be addressed in a follow-up cleanup PR.

---

## Architecture Rule Compliance

- **Module boundaries:** All changes confined to `apps/web-next/`. No cross-app imports introduced.
- **Tenant scoping:** No DB queries touched. N/A.
- **Zod at boundaries:** No new API or DTO boundaries introduced. N/A.
- **No cross-schema queries:** N/A (no DB).
- **No `any`:** `PageHead.astro` Props interface is strict — `title: string`, `description?: string | undefined`, `ogImage?: string | undefined`. No `any` anywhere.
- **Auth at controller level:** No new endpoints. N/A.
- **No raw hex / no new tokens:** Only HTML/text changes; no styled components modified.
- **Icon policy:** No new icons added.
- **No new npm packages:** Plausible is loaded via external CDN script; no package dependency added.

---

## Formatter Check

Biome lint result on `apps/web-next`:
- **0 errors**
- **1 pre-existing warning** (`RegistrationCTA.tsx` cognitive complexity) — unrelated to this PR, pre-existed on main

`astro check` result:
- **0 errors**
- **0 warnings**
- **36 hints** — all pre-existing React `FormEvent` deprecation hints in other files; no new hints from this PR (the Plausible script hint was resolved by adding `is:inline`)

---

## Known Limitations

1. **Other pages with `· AI Qadam (next)` suffix:** `events.astro`, `leaderboard.astro`, `u/[handle].astro`, `me/access-log.astro`, `me/index.astro`, `me/preferences.astro`, `me/referrals.astro`, `me/profile.astro` still hardcode the build-aside suffix. These are functionally correct (the suffix is just cosmetic) but should be updated in a follow-up cleanup PR before or shortly after the FQDN flip.

2. **`signed-out.astro` still has `<meta name="robots" content="noindex,nofollow">`:** The signed-out page is intentionally not indexed (it is a bare logout landing with no navigation). This is a deliberate retention, not an oversight.

3. **Overlap window cleanup:** `REFRESH_COOKIE_LEGACY = 'aiqadam-next-refresh'` in `middleware.ts` should be removed ~24h after the FQDN flip once all overlap sessions have rotated. This is a manual ops step noted in the code comment.

---

## Gate Result

```yaml
gate_result:
  agent: code-developer
  workflow_instance_id: wf-20260625-feat-025
  status: passed
  summary: >
    All 6 files changed per the exact spec in the task brief. Type check passes
    with 0 errors, 0 warnings. Biome lint passes with 0 errors (1 pre-existing
    unrelated warning). Cookie constant swap is correct: REFRESH_COOKIE_NEXT is
    now 'aiqadam-refresh' (canonical), REFRESH_COOKIE_LEGACY is
    'aiqadam-next-refresh' (overlap). noindex meta removed from Layout.astro.
    PageHead.astro emits OG/Twitter/canonical/analytics/preconnect. robots.txt
    is permissive with sitemap directive. signed-out.astro clears canonical
    cookie first. index.astro title updated to 'AI Qadam'. All changes inert
    until human FQDN flip (Step 5, Coolify).
  findings: []
  deferred_to_feature: ""
  deferred_reason: ""
```
