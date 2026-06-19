# Operator playbook: Brand asset production

**Audience:** Viktor (COO) as the human-in-loop reviewer; country leads as Tier-2 uploaders.
**When to use:** producing event-specific brand assets (social cards, event photos, speaker spotlights, recap visuals).
**Frequency:** per event + on-demand for marketing surfaces.

## Outcome

The asset exists in Directus `marketing_assets` with `status = approved` (Viktor's flip), correctly tagged + linked to its event / sponsor / speaker if applicable, and renderable on the public surfaces that need it (`/press`, event recap page, social-card OG image, etc.).

## Inputs

- Per [ADR-0025 Tier 2](../../adr/0025-brand-asset-tooling.md): produced assets live in Directus `marketing_assets`. Schema includes `status` enum (`draft | pending_review | approved | archived`), uploader, approver, category, country scope.
- The brand color tokens + voice guide (`apps/web/src/styles/`; per [marketing playbook §15](../marketing-and-pr-playbook.md))
- The originating context: which event / speaker / sponsor / recap this is for
- AI design pipeline tools: Claude Design (Viktor's prompted) + ChatGPT Image Generator. **Both are Viktor-operated** today; country leads contribute photos + captions, not generated images.

## Steps

### Producing the asset

1. **Decide asset category** per [ADR-0025 Tier 2](../../adr/0025-brand-asset-tooling.md) scope list: social-card template / event-card render / speaker-spotlight / quote-card / recap-card / event-photo / video / press-kit element / quarterly-digest PDF.
2. **Source material:**
   - For AI-generated: write the prompt in line with the AI design pipeline (per [marketing playbook §15](../marketing-and-pr-playbook.md)). Iterate until the result matches brand voice + color tokens. Save the prompt + the final result.
   - For photos: pull from the event's photo library (per `event-production-day-of.md` photographer brief). Filter to those with `pictured_members.photo_consent = true` for ALL pictured members (per ADR-0030).
3. **Upload to Directus** `marketing_assets`:
   - `category` = the asset class from step 1
   - `event_id` (if event-bound) / `sponsor_id` (if sponsor-bound) / `speaker_id` (if speaker-bound) — populated where applicable per the linkage fields in ADR-0025
   - `country` scope (per-country if it's a per-country surface; global if cross-country)
   - `status = pending_review`
   - `uploader = <directus_users.id>` (auto-populated from the session)

### Approval flow (Viktor only)

4. **Viktor's "Pending Review" filter view** in Directus admin lists every `status = pending_review` row. Review each:
   - Brand voice + color match
   - Photo consent honored (cross-check `pictured_members.photo_consent` if applicable)
   - Sponsor PII boundary honored (no raw member info in the image; per ADR-0033)
   - Voice rules from UX §1 (no Slack-speak, no hype, no excessive emoji)
5. **Approve** → flip `status: pending_review → approved`. The `/press` page + the event recap page auto-pick this up per [ADR-0025 approval workflow](../../adr/0025-brand-asset-tooling.md).
6. **Or send back to draft** with a comment field explaining what to change. The uploader iterates.

### Variant: load-bearing brand assets (Tier 1)

Logos / favicons / brand mark stay in git per [ADR-0025 Tier 1](../../adr/0025-brand-asset-tooling.md). These do NOT go through this playbook — they're engineer-PR'd via the normal git flow. If a country lead identifies a need for a new Tier-1 asset, file an issue tagged `brand` and Viktor cuts the engineering PR.

## Templates

**Asset metadata convention** (consistent across uploads):

```
title:         "{event slug} — social card v{N}"
description:   "{event title} on {date}, {city}. {asset purpose: feed / OG / recap}"
category:      "social-card-event" (or "event-photo", "speaker-spotlight", etc.)
event_id:      <FK> if event-bound
country:       "uz" / "kz" / "tj" (or null for global)
status:        "pending_review"
ai_prompt:     "<the prompt used if AI-generated, otherwise null>"
```

**AI prompt voice notes** (in line with [marketing playbook §15](../marketing-and-pr-playbook.md)):

- Visual register: confident, warm, professional. NOT corporate-stock-photo.
- People in images: where AI-generated faces appear, Viktor reviews for the uncanny-valley / brand-fit issues. Default: prefer event photos (real people, real consent) over AI-generated people for member-facing surfaces.
- Sponsor logo placements: explicit, neutral. Don't AI-generate sponsor logos; use the sponsor-provided source.
- Type + iconography: use existing brand tokens; don't hallucinate fonts that aren't ours.

## Anti-patterns

- ❌ **Uploading images with non-consented attendees.** Hard violation of ADR-0030. Cross-check `pictured_members.photo_consent` for every picture-of-people asset before upload.
- ❌ **Auto-publishing without Viktor's approval.** Tier 2 assets MUST go through `pending_review → approved`. Skipping this drifts brand quality.
- ❌ **AI-generating sponsor logos.** Always use the sponsor's official asset. The same applies to any partner / venue / institutional logo.
- ❌ **AI prompt that hides the source.** Per [marketing playbook §15.4 transparency](../marketing-and-pr-playbook.md): we don't claim AI-generated images as photographs. The `ai_prompt` metadata field is the audit trail.
- ❌ **Treating brand assets like ephemeral content.** Each approved asset goes into the archive intentionally; the recap page + the press kit + the quarterly digest all read from this same archive.
- ❌ **Mixing Tier 1 + Tier 2 in the same PR / upload.** Logos go to git; produced assets go to Directus. Confusing the two leads to broken builds OR un-versioned brand drift.

## Country variants

| Country | Notes |
|---|---|
| UZ | Tashkent skyline elements common in social cards; check that imagery feels current (not Soviet-era stock). |
| KZ | Almaty / Astana imagery; Russian + Kazakh-Latin script considerations on type. |
| TJ | Dushanbe imagery; Tajik script optional for community-facing surfaces. |

## Done criteria

- [ ] Asset uploaded to Directus `marketing_assets` with all metadata populated
- [ ] Photo-consent cross-check completed (or N/A if no people pictured)
- [ ] Sponsor PII boundary respected (no raw member info in the image)
- [ ] Viktor approved (`status = approved`) — or sent back with a clear next-step comment
- [ ] Asset renders correctly on its target surface (`/press`, event recap, social-card OG, etc.)
- [ ] `ai_prompt` field populated if the asset was AI-generated (for the transparency audit trail)

## Related

- [ADR-0025](../../adr/0025-brand-asset-tooling.md) — the storage + approval model
- [ADR-0030](../../adr/0030-photo-consent.md) — photo consent at publish time
- [ADR-0033](../../adr/0033-community-member-graph.md) — sponsor PII boundary
- [marketing playbook §15](../marketing-and-pr-playbook.md) — brand assets + AI design pipeline
- F-S0.9b real brand-asset library — the engineer-side wiring of `/press` to Directus
- F-S5.4 social cards (Satori) — consumes approved social-card assets for OG/Twitter image
