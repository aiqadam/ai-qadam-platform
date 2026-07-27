# ISS-WEB-NEXT-I18N-001 — Ru locale switcher in apps/web-next is a non-functional placeholder

| Field | Value |
|---|---|
| ID | ISS-WEB-NEXT-I18N-001 |
| Severity | bug |
| Module | web-next/i18n |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-138 |
| Reporter | tvolodi, filed to GitHub issue [#85](https://github.com/aiqadam/ai-qadam-platform/issues/85) |
| GitHub-Issue | https://github.com/aiqadam/ai-qadam-platform/issues/85 |
| Business-Process | — |

## Symptom

A user on production (`aiqadam.org`, served by `apps/web-next`) clicks the
language switcher in the nav and selects "Русский." The page reloads but
every string stays in English — the language never actually changes.

## Root cause

`apps/web-next` is the app nginx routes production traffic to (since commit
`21c40fa`, 2026-07-17), but it has no i18n translation layer. Its
`LocaleSwitcher.astro` (`apps/web-next/src/blocks/common/LocaleSwitcher.astro`)
writes the `aiqadam-locale` cookie and reloads the page, exactly as designed —
but nothing in `apps/web-next` reads that cookie back. The component's own
header comment (lines 9-15) documents this as an intentional, forward-compatible
placeholder: i18n was deferred to a later workstream that never landed before
the switcher shipped to prod.

The legacy `apps/web` app (not the one deployed) has a complete, working i18n
layer: `apps/web/src/lib/i18n.ts` (cookie/Accept-Language resolution via
i18next) plus `apps/web/src/locales/en.json` / `ru.json` (203/207 lines,
fully translated). It is wired into 12 files: `Nav.astro`, `index.astro`,
`events.astro`, `events/[id].astro`, `global.astro`, `leaderboard.astro`,
`u/[handle].astro`, `welcome/[slug].astro`, `EventsGrid.astro`,
`EventsTimeline.astro`, `HomeHero.astro`, `UpcomingEventsGrid.astro`.
Workspace/admin pages were never translated in the legacy app either.

## Scope clarification (chat, 2026-07-28)

Two resolution options were presented to the user: (a) hide the non-functional
switcher as a stopgap, or (b) port the full i18n layer into `apps/web-next`.
The user chose (b) — the full port.

Given the scale (56 pages in `apps/web-next`, though only public-facing pages
need translation, matching the legacy app's 12-file scope plus a handful of
web-next-only pages), this is feature-sized work, not a one-line fix. AGENTS.md
§4 caps PRs at 400 lines / 5 files; the user was informed a full port would
normally require ~4 sequential PRs and explicitly overrode the cap:

> "Remove limits on PR at all. Do this limit has any sense?" — followed by
> confirming a single PR covering the full port, one coherent close-out.

This is a recorded §13 override: the agent's original concern (large PR, hard
to review/bisect) is superseded by explicit user instruction. See the PR
description's "Risks" section for the formal record.

## Resolution

- **Workflow:** wf-20260728-fix-138
- **PR:** <pending>
- **Root cause:** `apps/web-next`'s `<LocaleSwitcher>` wrote the `aiqadam-locale`
  cookie but the app had no i18n translation layer to read it back.
- **Fix:** Ported `apps/web/src/lib/i18n.ts` (i18next, cookie + Accept-Language
  resolution) into `apps/web-next/src/lib/i18n.ts`. Built a new
  `apps/web-next/src/locales/{en,ru}.json` catalog (reusing legacy key names
  where the string matched, adding ~130 new keys for web-next-only strings —
  its page/component structure diverges from legacy's). Wired `getLocale`/
  `makeT` into every `.astro` file in the public-facing surface (`Layout`,
  `AppNav`, `LocaleSwitcher`, `CountrySwitcher`, `AppFooter`, `Hero`,
  `EventsGrid`, `EventCard`, `EventDetail`, `SpeakerGrid`, `MaterialsList`,
  `SponsorWall`, `ShareButtons`, `Leaderboard`, `ProfileCard`, plus the
  `index`/`events`/`events/[id]`/`leaderboard`/`global`/`welcome/[slug]`/
  `u/[handle]` pages). Threaded a `t` prop into the 4 React islands that had
  no existing translation-prop pattern (`AccountChip`, `LeadCaptureForm`,
  `RegistrationCTA`, `ForumThread`), matching legacy's `NavAccountMenu`
  precedent of passing translated strings as props rather than importing
  i18next into client components. Workspace/admin pages stay English,
  matching legacy's own scope (never translated there either).
- **Regression test:** `apps/web-next/src/lib/i18n.test.ts` — `makeT('ru')`
  returns `nav.events` as `События`, not `Events` (would have failed against
  the pre-fix state, where no `apps/web-next/src/lib/i18n.ts` existed at
  all). Full `apps/web-next` suite: 932/932 passing, 0 regressions. Live
  smoke test: `curl -H "Cookie: aiqadam-locale=ru"` against `/`, `/events`,
  `/leaderboard`, `/global` on a local dev server confirms `<html lang="ru">`
  and Russian body copy render end-to-end; `en` (no cookie) still renders
  English — round-trip confirmed both directions.
- **Merged:** <pending>

**Scope note:** per the chat override recorded above, this shipped as one
PR rather than the AGENTS.md §4-compliant 4-PR sequence originally proposed.
