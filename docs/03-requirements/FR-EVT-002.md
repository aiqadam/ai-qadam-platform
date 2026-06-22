---
code: FR-EVT-002
name: Event content internationalization (i18n read + write)
status: Shipped
module: Events (EVT)
phase: Phase 1 / V1 (issues #352–#363)
---

## Description

Event content (title, description, location details, agenda items) can be authored in multiple languages via Directus's native translations. The API and web serve the appropriate language version based on the user's locale. Bot and email notifications use the event's primary language (Russian) or the user's preferred language when available.

## Users

Organizers (write), Members / Public (read).

## Functional scope

1. **Directus translations** — `events` collection has a `translations` related collection with fields: `language_code`, `title`, `description_md`, `venue_name`, `agenda` (translated JSON). Languages: `ru` (primary), `en` (secondary).
2. **API read path** — When the API or CMS layer fetches an event, it requests translations and returns the appropriate one based on `Accept-Language` header or user's `locale` preference. Falls back to `ru` if the requested language is unavailable.
3. **Web rendering** — The event detail page and event list cards display the translated content. Language switching on the page (via the global locale switcher) updates displayed content without reload.
4. **Directus write UI** — Organizers create translations per language via Directus admin's translation fields. The editor shows tabs for each language.
5. **Bot / notification language** — Telegram notifications use `ru` by default; if the user's `locale` preference is `en`, `en` translation is used when available.
6. **Search** — Full-text search on events indexes all available translations.

## Acceptance criteria

- [ ] An event authored in Directus with Russian and English translations returns the Russian content when the locale is `ru` and English content when locale is `en`.
- [ ] If only a Russian translation exists, an English-locale request falls back to Russian without error.
- [ ] The event list page updates titles/descriptions when the locale switcher is changed.
- [ ] Telegram notification for a `ru`-locale user uses the Russian event title.
- [ ] A search query in Russian returns Russian-titled events; an English query returns English-titled events.

## Notes

- This requirement is fully shipped (git confirms PRs #352–#363 merged).
- Directus native translations are used; no custom translation layer is needed.
- Tolgee is used for UI string management, not for event content.
