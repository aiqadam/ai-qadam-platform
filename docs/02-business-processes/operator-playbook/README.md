# Operator playbook

> **What this is.** Step-by-step procedures for running AI Qadam events + the work around them: how to recruit a speaker, how to onboard a sponsor, what to do at the door on event day, how to chase CSAT, when to launch a country, what brand assets to produce.
>
> **Audience.** Country leads, the founder (Binali), the COO (Viktor), and any future operators who join. NOT engineers — engineers read [`docs/runbooks/`](../../04-development/infrastructure/runbooks/) instead. The two are deliberately separate: runbooks answer "what do I do when this breaks"; the playbook answers "how do I run this".
>
> **Status.** This directory holds **v0 scaffolds** (F-S0.7, shipped 2026-05-21). Each file follows the canonical scaffold template — Outcome / Inputs / Steps / Templates / Anti-patterns / Country variants / Done criteria / Related. **Each scaffold needs a single fill-pass from Binali + Viktor** before it's truly load-bearing for a country lead at activation time; the scaffolds give us the skeleton so the fill-pass is hours, not weeks.

## When this gets updated

Whenever an operator hits a workflow step that didn't work as documented OR finds a recurring shortcut worth codifying, they edit the relevant playbook file. Same "live document" model as the runbooks. PR approval comes from Binali (Founder) for community-voice content + Viktor (COO) for process content.

## What lives here

### Event lifecycle (the bulk of operator work)

- [`venue-selection.md`](venue-selection.md) — picking + booking a venue per country
- [`speaker-outreach.md`](speaker-outreach.md) — pipeline + invitation + briefing
- [`event-production-day-of.md`](event-production-day-of.md) — run-of-show, check-in, photographer brief
- [`post-event-checklist.md`](post-event-checklist.md) — recap, CSAT chase, thank-you, sponsor report
- [`csat-collection.md`](csat-collection.md) — tokenized links, anonymity floor, dashboard reading

### Community + governance

- [`sponsor-onboarding.md`](sponsor-onboarding.md) — onboarding via the F-S3.5 partner cabinet (per ADR-0033; replaces the original Twenty-pipeline plan)
- [`country-launch.md`](country-launch.md) — trust-transfer ceremony, AUP, first-event setup (pairs with [`country-lead-activation.md`](../operations/country-lead-activation.md) on the engineer side)
- [`community-conduct.md`](community-conduct.md) — code-of-conduct enforcement basics (precursor to the ζ.7 crisis-comms framework)

### Brand + content

- [`brand-asset-production.md`](brand-asset-production.md) — Claude Design + ChatGPT pipeline + approval flow per [ADR-0025](../../adr/0025-brand-asset-tooling.md)

## Canonical scaffold template

Every operator-playbook file follows this skeleton. Deviate only when the workflow genuinely doesn't fit. Existing files are the structural reference.

```markdown
# Operator playbook: <one-line title>

**Audience:** which operator role; which country variant applies
**When to use:** the trigger condition
**Frequency:** how often this runs

## Outcome

What "done" looks like — concrete + measurable.

## Inputs

What you need before starting: tools, contacts, content, dates.

## Steps

Numbered. Each step is a single bounded action with a brief "why".

## Templates

Reusable copy-paste content (email outreach templates, social-card
captions). For substantial assets, link into Directus marketing_assets
rather than embedding here.

## Anti-patterns

What to NOT do. Catches the operator-mistake patterns we've seen.

## Country variants

Where UZ / KZ / TJ differ. Empty if unified.

## Done criteria

Concrete checklist: how the operator confirms the workflow completed
successfully.

## Related

Links to: ADRs that constrain this, runbooks for when it breaks,
cabinets it touches.
```

**No section is optional.** If a section genuinely doesn't apply, write "Not applicable — `<reason>`" rather than deleting the heading.

## Related

- [`docs/runbooks/`](../../04-development/infrastructure/runbooks/) — engineer-facing operational procedures (what to do when something breaks)
- [`docs/02-business-processes/marketing-and-pr-playbook.md`](../marketing-and-pr-playbook.md) — the strategy layer; operators read this to understand WHY each workflow exists
- [`docs/04-development/design-system/ux-and-content-guidelines.md`](../../04-development/design-system/ux-and-content-guidelines.md) §1 — voice + tone for every operator-authored string
- [ADR-0025](../../adr/0025-brand-asset-tooling.md) — where brand assets live (Directus `marketing_assets`)
- [ADR-0033](../../adr/0033-community-member-graph.md) — sponsor PII boundary that constrains the operator's sponsor-facing work
