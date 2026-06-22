# #326 — Event content translations (i18n)

**Status:** Proposed (planning artifact for next stretch).
**Tracking issue:** [#326](https://github.com/viktordrukker/aiqadam/issues/326).
**Unblocks:** [#289 preferences](https://github.com/viktordrukker/aiqadam/issues/289) language UX (which is shipped but invisible without translated content).

## Goal

Make the bot's already-shipped language selector actually do something. When a member with `preferred_language=ru` reads `/events`, they get Russian titles + summaries + descriptions. Today every event row is monolingual (whatever locale the operator typed in).

## Scope split (3 sequential PRs)

### PR-a · Directus schema + write-side (no read-path change)

Adds columns + a Directus "Translations" tab in the event editor. Existing endpoints unchanged; operators can start populating translations immediately while PR-b lands the read path.

**Schema additions** (via `infrastructure/directus/bootstrap.sh`):

- `events.translations` — JSON column shaped as:
  ```json
  {
    "ru": { "title": "...", "summary": "...", "description": "..." },
    "uz": { "title": "...", "summary": "...", "description": "..." },
    "kk": { "title": "...", "summary": "...", "description": "..." }
  }
  ```
  Keys per locale are optional — operator can translate just the title and let the rest fall back.

- Optional follow-up: `speakers.translations` (bio + headline), `event_announcements.translations` (text), etc. Defer to PR-c.

**Directus side panel** — Tags-style interface acts as a translations editor. Operator picks language → fills fields.

**Tests:** schema-only PR; minimal tests (Directus bootstrap idempotency).

**Effort:** ~2h. Single-file Directus migration.

---

### PR-b · Read path: Accept-Language + substitution + locale field

Wire all event-reading endpoints to honor `Accept-Language` and substitute the requested locale into the top-level fields.

**Endpoints touched:**
- `GET /v1/telegram/events` (list)
- `GET /v1/telegram/events/:slug` (detail)
- `GET /v1/workspace/events` (operator cabinet)
- `apps/web/src/lib/cms.ts:fetchEvent` etc. (web SSR)

**Algorithm:**
1. Parse `Accept-Language` header. Pick the first locale that's in the supported list (`SUPPORTED_LANGUAGES` from preferences module).
2. If `requested` exists in `event.translations[requested]`, substitute matched fields at the top level.
3. Always include a `locale: '<locale-served>'` field in the response so the client knows what it got (matches the tenant default when no translation found).
4. OMIT the `translations` map from the response (saves bytes; client doesn't need it).

**Fallback chain** (per the issue body):
- requested locale → tenant default locale → en

**Tests:**
- Russian header on Russian-translated event → top-level fields are Russian + `locale: "ru"`
- Russian header on untranslated event → top-level fields are tenant default + `locale: "<tenant-default>"`
- Whitelist enforcement: bad locale → falls back, no errors
- Empty `translations` map → tenant default, no errors
- Partial translation (title only) → translated title, original summary/description

**Effort:** ~4h.

---

### PR-c · Speaker bios + event_announcements + topic labels

Extend the same pattern to:
- `speakers.translations` (bio + headline)
- `event_announcements.translations` (text body)
- Topic labels in `TelegramEventTopicsService.list()` (returns localized labels — finally consumes the `KNOWN_EVENT_TOPICS.labels[lang]` shape sketched in #323's comment)

**Effort:** ~2h.

---

## Open decisions

1. **Tenant default locale source.** Currently no `tenant.default_locale` column. Either add one OR hardcode `en`. The issue body assumes per-tenant default — best to add the column in PR-a.
2. **Translation provenance.** Auto-translated (Google Translate / DeepL) vs human-only? Recommend: human-only for v1 (avoids low-quality output sneaking into prod). Add a `translations._provenance` JSON sidecar in v2.
3. **What's machine-readable vs human-only?** `event.starts_at` is ISO time — no translation. Bot already formats dates per `Accept-Language` if its formatters honor it. Verify.

## Why split into 3 PRs

- PR-a unblocks operators: they can START populating translations the moment it merges, even before the read path lands.
- PR-b is the user-visible piece; gating on PR-a lets reviewers see schema first.
- PR-c is a wider sweep across collections; isolating it keeps PR-b's review focused.

## Triggers to revisit

- Operator finds the `translations` JSON editor clumsy (more likely if collections > 3 fields). Switch to a normalized `event_translations` table with one row per (event, locale).
- We add 4+ languages. The JSON column gets unwieldy; normalize.

## Related

- [Three-tier architecture](../../adr/0037-three-tier-architecture.md) — i18n is the customer-facing layer; operator UI changes (Directus tab) are operational.
- `feedback_directus_single_source_of_truth.md` (memory) — the JSON column lives in Directus, not a shadow Postgres table on the API.
