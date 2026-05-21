# ADR-0029: Russian-language voice + translation owner

## Status
Accepted (override → Option C), 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../decision-batch-process.md), with **override to Option C (community-led editor pool, zero cash cost) instead of the recommended Option D**. Constraint: no new hiring or recurring spend at this stage. The paid-editor half of Option D is **deferred** to the business-process gap list (revisit when the community pool can't meet quality at scale, or when sponsor revenue stabilizes); the community-pool half is the operating model now. The Russian voice guide (`docs/voice-guide-ru.md`) is still produced — Viktor + a rotating community editor draft it together in the editor's first 2 weeks of activation.

## Context

[`marketing-and-pr-playbook.md` §13](../marketing-and-pr-playbook.md) defines two founder voices (Binali + Viktor) in English. Central Asia operates primarily in Russian for technical / B2B comms (≈ 90% of regional AI engineer-targeted content is Russian-first), with Uzbek-Latin / Kazakh / Tajik as audience-respectful augmentation for member-facing surfaces.

Today: every Russian-language string is either Binali-or-Viktor improvised + manually reviewed, or member-contributed (Telegram chat is Russian-default, organically). No documented voice, no translation process, no owner.

Phase ζ.6 (i18n cabinets per [community-platform-roadmap.md §7](../community-platform-roadmap.md)) ships translation infrastructure (Tolgee vs i18next decision; not the subject of this ADR). What this ADR decides: **who owns the Russian voice + translation review process** so the platform's Russian-language content has the same coherence as its English-language content.

Constraints:
- Volume is growing fast: every UX-guideline surface, every operator playbook page, every notification template, every brand-asset caption needs a Russian rendition.
- Native Russian-speaking engineers are NOT Viktor (Russian is fluent but not native register) or Binali (Russian is functional but not the primary register).
- Per ADR-0033, AI Qadam is community-as-platform — voice must feel "of the community", not localized-from-English.

## Options

### Option A — Status quo: Viktor + Binali edit ad-hoc with native-speaker spot review
No formal owner; native speakers in the community review specific surfaces on request.

- **Pros:** zero recurring cost; flexible.
- **Cons:** inconsistent voice; bottleneck on Viktor + Binali; no documented standards; risk of inconsistent register across surfaces (UX copy too formal, marketing too casual, etc.).

### Option B — Hire a Russian-language editor (part-time contractor)
Engage a part-time contractor (5–10 hrs/week) to review, edit, and translate all Russian-language surfaces; maintain a Russian voice guide document.

- **Pros:** consistent voice; documented standards; relieves Viktor + Binali; faster iteration.
- **Cons:** USD 800-2,000/month recurring; recruiting the right person is hard (must understand AI engineering + Central Asia regional Russian register); accountability if quality drops.

### Option C — Community-led editor pool with rotation
Recruit 3-5 native-Russian-speaking members willing to review on a rotation; provide a Russian voice-guide they maintain; compensate via points + brand-asset credit (per [marketing playbook §15](../marketing-and-pr-playbook.md)).

- **Pros:** zero recurring cash cost; deepens community engagement; spreads accountability; community owns its voice.
- **Cons:** lower SLA on turn-around (community volunteers ≠ contractors); rotation overhead; quality variance.

### Option D — Hybrid: one paid editor + community pool for high-volume / time-sensitive vs strategic surfaces
Paid editor (Option B, lower hours ~3-5/week) reviews strategic surfaces (UX guidelines, marketing playbook, operator playbook, brand mark captions); community pool (Option C) handles event-specific high-volume content (event descriptions, recap posts, social-card copy).

- **Pros:** strategic-quality bar held by paid contractor; volume-quality bar held by community; budget bounded; community ownership stays material.
- **Cons:** moderate recurring cost (USD 400-1,000/month); two-level workflow needs traffic-cop discipline (who routes what).

## Recommendation

**Option D (hybrid: paid editor + community pool)** with these specifics:

### Paid editor scope (strategic surfaces only)

- 3-5 hours/week, USD 25-35/hour, total ~USD 500-700/month.
- Responsibilities: maintain the Russian voice guide (a new file `docs/voice-guide-ru.md`); review all UX-guideline + marketing-playbook + operator-playbook Russian sections; review brand-asset captions before they ship.
- Sourced from: 2-3 candidate interviews drawn from native Russian-speaking engineers active in regional AI communities; preferred a candidate who knows AI engineering register (not a generic translator).
- Engagement: independent contractor, monthly invoice (per ADR-0023 manual flow).
- Reports to: Viktor.

### Community pool scope (event-volume surfaces)

- 3-5 native Russian-speaking members opted-in (member_consents.purpose=content + a separate `is_translation_pool` flag, TBD F-S3.6 schema extension).
- Rotation: assigned per event by the F-S3.4 event cabinet to one pool-member; turn-around 24 hours.
- Compensation: 50 platform points per piece reviewed + Bronze-level brand-asset attribution credit; cumulative threshold (e.g. 20 pieces in a year) earns a "Russian-voice contributor" badge.
- Quality: paid editor spot-checks 1/10 community-reviewed pieces monthly; sustained quality drop = rotate that pool member out.

### Russian voice guide (`docs/voice-guide-ru.md`)

To be created in the editor's first 2 weeks. Mirrors [ux-and-content-guidelines.md](../ux-and-content-guidelines.md) §1 in structure: anti-patterns, register, formality level per surface class (UX = professional-warm; marketing = energetic-respectful; operator playbook = clear-imperative; notifications = brief-direct). PM (Viktor) reviews + signs off.

### Uzbek-Latin / Kazakh / Tajik

Out of scope for this ADR. Russian is the prerequisite layer; member-language augmentation ships in Phase ζ.6 i18n cabinets when each country lead is established. Each country lead may run a per-language pool analogous to the Russian community pool.

## Consequences

- Recurring expense: USD 500-700/month (USD 6,000-8,400/year). Bounded; reviewed annually.
- Russian voice consistency improves measurably within 2 months of editor onboarding.
- Phase ζ.6 i18n cabinets ship with a real Russian-language reference set (voice guide + reviewed surfaces) — easier to translate to other locales when those land.
- The community pool deepens engaged-member retention (members who write platform copy stick around).
- Russian-only Telegram channel cadence (per ADR-0026) is supportable with this owner structure.

## References

- [ADR-0026 — Telegram channel](./0026-telegram-channel.md) (Proposed) — primary Russian-language surface today
- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — `member_consents.purpose=content` is the consent primitive for the community pool
- [`marketing-and-pr-playbook.md` §13](../marketing-and-pr-playbook.md) — founder voices doc (this ADR extends it to Russian)
- [`ux-and-content-guidelines.md`](../ux-and-content-guidelines.md) — English voice rules (the structural reference for the Russian guide)
- [`community-platform-roadmap.md` §7 Phase ζ.6](../community-platform-roadmap.md) — i18n cabinets
