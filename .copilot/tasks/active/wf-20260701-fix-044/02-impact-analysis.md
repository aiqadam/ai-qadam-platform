# 02-impact-analysis — wf-20260701-fix-044 (ISS-LEAD-DISC-001)

**Recorded:** 2026-07-01T20:18:00Z (UTC)
**Author:** ImpactAnalyzer

## Validated Requirement

ISS-LEAD-DISC-001 — make `<LeadCaptureForm />` discoverable on `apps/web` homepage `/`. Form already renders at byte offset 103,217 / 109,416 (~94 % down the body) on a 1440×900 viewport. End-to-end POST works (202 / idempotent / honeypot silent). **Gap is purely visual placement**, not the form, not the API, not the DB. This analysis maps the smallest change set that satisfies AC-1..AC-5 of the issue.

---

## 1. Smallest change set to move the form above the 1440×900 fold

Two-part change in `apps/web/src/pages/index.astro`:

- Move the `<LeadCaptureForm />` section upward — relocate it from after `recordings` / before the Telegram+partner CTA to **directly after `UpcomingEventsGrid` and before the stats strip**. At 1440×900 with the current mission band + hero + 3-up grid (~620–660 px), placing the form next gives the email input ~80–120 px of headroom inside the fold.
- Add a stable in-page anchor — `id="newsletter"` — to the form's wrapping `<section>` so a nav link can scroll there. Plus `scroll-margin-top: 72px` so the sticky `<header>` doesn't occlude the anchored element.

Minimum set. Optionally (see §8) add a nav link — but that is separable and not required for AC-1.

## 2. DB / schema changes required?

**No.** Reaffirmed by `handoff.yaml`: `db_migration_author.status = not-applicable`. The `leads` table, DTO, controller, idempotency, and honeypot are all untouched.

## 3. Files touched

| File | Status | Reason |
|---|---|---|
| `apps/web/src/pages/index.astro` | **Required** | Reorder sections; add `id="newsletter"` + scroll-margin. Covers AC-1 + AC-2. |
| `apps/web/src/components/Nav.astro` | Conditional | Only if AC-3 nav link is added. |
| `apps/web/src/locales/en.json` | Conditional | One new key `nav.get_updates`. |
| `apps/web/src/locales/ru.json` | Conditional | Russian translation. |

`LeadCaptureForm.tsx`, `Layout.astro`, `apps/api/`, `apps/web-next/`, `apps/bot/`, `apps/workers/`, `packages/` — **not touched**.

## 4. Nav vs Layout

- `Layout.astro`: **no change**. It owns `<head>` meta + `<Nav />` mount + auth-blob injection + attribution script.
- `Nav.astro`: **change only if** AC-3 nav link implemented.

## 5. Tests that could regress

| Test | Risk | Why |
|---|---|---|
| `smoke-leads.spec.ts` form-embed specs | Lower — becomes no-op | `scrollIntoViewIfNeeded()` becomes a no-op after the fix. Passes; behaviour improves. |
| `BP-UAT-013 Steps 001-004` | Lower — same no-op | Same `scrollIntoView` idiom. AC-5 of the issue is preserved. |
| `lead-form-within-fold.spec.ts` (new, by TestDesigner) | n/a | For AC-1 — asserts email input's bounding box is inside the 1440×900 viewport. |

No API unit tests can regress because controller / DTO / schema are byte-identical.

## 6. Non-functional properties to preserve

- **a11y:** form already has `aria-pressed` on chips, honeypot `aria-hidden` + `tabIndex=-1`. Do not touch the component. Use `<a href="/#newsletter">` (real anchor, not `<button onClick={scroll}>`). `scroll-margin-top: 72px` so the anchored element doesn't sit under sticky `<header>` when focused via `#newsletter`.
- **Dark mode:** all styles use `var(--*)` tokens; `<html data-theme="dark">` is set in `Layout.astro`. No raw hex (design-system non-negotiable #1).
- **RTL:** `apps/web` does not declare `dir="rtl"`; layout is LTR-only. Verify the 56-px-tall nav row doesn't overflow at 1024 px width when Russian "Новости" is added (short word — fits; full form "Получать обновления" would push the cluster width).
- **Responsive:** at <1024 px, single-column layout means the form will be the only section visible above the fold. AC-2 satisfied even more strongly on mobile.
- **Sticky nav occlusion:** `scroll-margin-top: 72px` (56 nav + 16 breathing) on `#newsletter`.

## 7. Backward-incompatible paths

| Path | Risk | Mitigation |
|---|---|---|
| `/#newsletter` anchor | New URL — none exists today | No collision with current or planned routes |
| `POST /api/v1/leads` | No change | n/a |
| Astro scroll restoration | No change — auto-handles `hashchange` | n/a |
| `web-next` parity | Out of scope — different surface | n/a |
| Honeypot / idempotency | No change — component byte-identical | n/a |

## 8. Should the change add a nav link?

**Yes.** AC-3 in the issue explicitly requires it. Even with repositioning, on 1440×900 the email input is just in-viewport; a nav link is the only reliable way to return to it from anywhere on the page.

Add in `Nav.astro` between `Leaderboard` and `Sign in`:

- `en`: **"Get updates"** (matches form heading verb phrase)
- `ru`: **"Новости"** (short, fits nav row)

Anchor: `href="/#newsletter"`. Same anchor satisfies AC-1 (position) and AC-3 (deep-link).

## Affected layers

| Layer | Status |
|---|---|
| API (NestJS) | None |
| DB | No |
| `packages/shared-types/` | No |
| `apps/web/` | **Yes — minimal** |
| `apps/web-next/` | No (out of scope) |
| `apps/bot/`, `apps/workers/` | No |

## API surface

No change. `POST /api/v1/leads`, `GET /api/v1/leads/verify`, `/leads/*` Astro pages all unchanged.

## Risk flags

| Flag | Set? | Reason |
|---|---|---|
| Security Review Required | **No** | Form byte-identical; honeypot / idempotency / rate limit / CSRF untouched. Only external change: section reorder + one new `id` attribute. |
| Architecture rule risk | **No** | Intra-`apps/web/src/pages` + `components` + `locales`. No new shared type, no new tenant scoping, no new auth. Non-negotiables preserved (no raw hex, no gradients, Lucide-only icons — none used here, three-font-family via existing `var(--font-*)`). |
| DB migration risk | None | No schema change |
| Dependency risk | None | No `package.json` change |

## Test scope

- **Unit:** none needed.
- **Integration:** none needed — no API change.
- **E2E (Playwright):** add **one new spec** `apps/e2e/tests/lead-form-within-fold.spec.ts` (TestDesigner) — assert email input bounding box inside 1440×900 viewport; assert nav link visible + focused email input within fold after click; viewports 1440×900, 1280×720, 1024×768.
- **Manual visual check:** one screenshot per viewport, dark + light.

## Concrete change-set checklist for CodeDeveloper

- [ ] In `apps/web/src/pages/index.astro`: move the `<LeadCaptureForm client:load />` section to directly after `<UpcomingEventsGrid>` and before the 3-stat strip section.
- [ ] On the form's wrapping `<section>`, add `id="newsletter"` and `style="scroll-margin-top: 72px;"`.
- [ ] In `apps/web/src/components/Nav.astro`: add `<a href="/#newsletter" class="app-nav-link">{t('nav.get_updates')}</a>` between `Leaderboard` and `Sign in`.
- [ ] In `apps/web/src/locales/en.json`: add `"get_updates": "Get updates"` under `nav`.
- [ ] In `apps/web/src/locales/ru.json`: add `"get_updates": "Новости"` under `nav`.
- [ ] **Do not** edit `apps/web/src/components/LeadCaptureForm.tsx`.
- [ ] **Do not** edit `apps/web/src/layouts/Layout.astro`.
- [ ] **Do not** edit any file under `apps/api/`, `apps/bot/`, `apps/workers/`, `packages/`, `apps/web-next/`.

## Out of scope (explicit non-decisions)

- RESEND_API_KEY missing in `apps/api/.env` (ISS-UAT-013-7) — Mailpit-bound Steps 002/003 still fail at mail boundary.
- `apps/web-next` parity — different surface.
- Form copy rewrite — not required by any AC; keep byte-identical.
- New `/newsletter` route — anchor-only is simpler, no second source of truth.

## Honesty disclosures

- No telemetry to validate "above the fold" empirically. Conclusion based on reading current sections' stacked padding (28 + 48 + ~250 hero + ~300 grid + ~120 stat ≈ 746 px at 1024–1440 px wide).
- **I have not verified live behaviour on a real 1440×900 monitor.** TestDesigner + TestRunner must confirm with `page.viewport` + bounding-box assertions. If AC-1 fails on the actual viewport, the fix may need to additionally move the form above the stats strip — separate escalation.
- Nav-link copy ("Get updates" / "Новости") is best-guess; user can override in review.

## Gate result

```yaml
gate_result:
  status: passed
  gate_name: impact_analysis
  decided_at: 2026-07-01T20:18:00Z
  decided_by: impact_analyzer
  retry_count: 0
  notes: >-
    Impact fully analyzed. Smallest change set is a single Astro file
    (index.astro) plus an optional nav link (Nav.astro + 2 locale files).
    No DB / API / shared-types / web-next / bot / worker surfaces affected.
    Form component byte-identical. 5 existing E2E specs preserved by
    scrollIntoViewIfNeeded no-op behaviour. 1 new Playwright spec to add
    for AC-1. Security review not required.
```
