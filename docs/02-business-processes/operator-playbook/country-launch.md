# Operator playbook: Country launch

**Audience:** Viktor (COO) + Binali (Founder) + the new country lead.
**When to use:** when activating a new country tenant (KZ, TJ, KG, …).
**Frequency:** rare — once per country.

## Outcome

The new country is **live on the platform**: tenant row in `countries`, country subdomain provisioned + DNS-pointing, first event scheduled, brand voice adapted, AUP signed by the country lead, trust-transfer ceremony done with any existing in-country community.

## Inputs

- Country code chosen (ISO 3166-1 alpha-2 lowercase: `kz`, `tj`, `kg`, ...) + display names (English + Russian) + timezone (IANA).
- Country lead identified + interviewed + accepted (by Binali + Viktor; the Volunteering Board signs off on appointment per the governance model in project-essentials).
- AUP (Acceptable Use Policy for member data) drafted — operator-playbook v0 ships the AUP scaffold in a future PR; for now Viktor writes country-specific AUP per launch.
- ADR-0022 status: **gates this playbook.** Per G-1 (business-process gap list), compensation is deferred until trigger conditions fire. Country leads onboarded under G-1 conditions are VOLUNTEER; this must be made explicit + ACCEPTED in writing by the candidate before activation.
- Sprint 4 features status: F-S4.1 country provisioning service + F-S4.2 wizard + F-S4.3 onboarding runbook. Pre-Sprint-4 the engineer (Viktor) provisions manually per the steps below.

## Steps

### Pre-launch (T-4 weeks)

1. **Trust-transfer ceremony** with any existing in-country community: a public announcement (Telegram + LinkedIn) introducing the country lead, signed jointly by Binali + Viktor + the lead. Done with the country lead present (literally — in-person if possible).
2. **AUP signed.** The lead reads + signs the AUP for member data. Stored in the team password manager / SharePoint / equivalent for compliance audit trail.
3. **Compensation context.** Per G-1: explicitly tell the lead "this is a volunteer role today; compensation is on the gap list and revisits when trigger fires". Lead acknowledges in writing.

### Activation (T-2 weeks)

4. **Provision the tenant.** Add the country row in Directus: `countries.code = <xx>`, `name`, `name_ru`, `tz`, `is_active = true`. Until F-S4.1 ships, also manually:
   - Authentik: register the new subdomain's OIDC redirect URI on the `aiqadam-platform-provider` (provider pk=1)
   - Directus: create the country-scoped permission policy (mirror the existing UZ pattern)
   - Plausible: create the new site at `<xx>.aiqadam.org`
   - Coolify: register the new FQDN on `aiqadam-web` (already routes by `country` from URL prefix)
5. **DNS.** Cloudflare → add the new `<xx>.aiqadam.org` CNAME → point at Coolify; cert auto-issues.
6. **Brand voice adaptation.** Per [marketing playbook §13](../marketing-and-pr-playbook.md) + ADR-0029: the lead drafts country-specific voice notes (what register works for their audience). Reviewed by Viktor.
7. **Walk-through (engineer-side).** Per [`docs/02-business-processes/operations/country-lead-activation.md`](../operations/country-lead-activation.md): RBAC binding, cabinet walk-through, permission verification.

### Launch (T-0)

8. **First event scheduled.** Per `venue-selection.md` + `speaker-outreach.md`. Date set 4-6 weeks out from launch.
9. **Public announcement.** Telegram per-country channel (per ADR-0026) launch announcement + LinkedIn (Viktor solo today).
10. **Volunteering Board check-in.** Brief async note to the board introducing the new country + lead + first-event date.

### Post-launch (T+4 weeks)

11. **First-event retrospective with the lead.** What worked, what didn't, what needs unblocking. Capture into the country's notes (TBD location).
12. **Quarterly check-in cadence set up.** Recurring meeting between Viktor + the country lead.

## Templates

**Compensation acknowledgement (signed by the lead before activation):**

```
I, {lead name}, accept the AI Qadam country-lead role for {country}
on a VOLUNTEER basis as of {date}. I understand:

  - Compensation is on the AI Qadam business-process gap list (G-1)
    per ADR-0022 deferred 2026-05-21.
  - Compensation will be revisited when triggers fire (sustained
    sponsor revenue ≥ USD 15k/yr OR a candidate cannot reasonably
    volunteer); revisit may result in retroactive compensation OR
    forward-only compensation OR no compensation, at the PM's
    discretion in dialogue with the Volunteering Board.
  - My role today is recognised via brand association + leadership
    exposure + network access; no monetary or equity compensation
    is implied or promised.

  Signed: {lead signature}, {date}
```

**Trust-transfer announcement (Telegram + LinkedIn; bilingual RU/EN):**

```
We're excited to introduce {lead name} as AI Qadam's {country} lead.
{1 sentence on lead's background relevant to AI engineering}.

What this means for the {country} community:
  • {Lead name} runs meetups + events for AI engineers in {country}
  • Our first {country} event is on {date} at {venue} — register
    at {url}
  • The community stays community-first; the platform is the medium

For anyone running tech meetups in {city}: get in touch with
{lead name} at {Telegram handle / email}. Cross-promotion welcome.

— Binali Rustamov, Founder
— Viktor Drukker, COO
```

## Anti-patterns

- ❌ **Skipping the trust-transfer ceremony.** If there's an existing AI / ML community in the country (especially a senior person who's been running meetups), DO this. Trying to "soft-take-over" a community is the fastest way to fail.
- ❌ **Activating without G-1 acknowledgement signed.** The lead becomes resentful 6 months in when they realize comp is absent + not coming. Make it explicit + accepted up front.
- ❌ **Letting the country lead skip the AUP signing.** The platform's member-data trust depends on country-lead discipline. AUP is the contract.
- ❌ **Forgetting to add the country to the Volunteering Board's quarterly digest.** Board needs to see all active countries + their leads.
- ❌ **Promising future country-lead compensation in writing.** Per G-1, the path is uncertain. Don't make commitments PM can't deliver.

## Country variants

This playbook IS the country-launch sequence; each country instance is itself a variant. Capture per-country notes in this file's table as countries launch.

| Country | Launch date | Lead | Notes |
|---|---|---|---|
| UZ | (current; pre-platform launch) | Binali | Founder's home; not a "launch" in the post-launch sense |
| KZ | TBD — gated on G-1 | TBD | Candidate identification in progress per [`docs/01-business/community-platform-roadmap.md` §11](../../01-business/community-platform-roadmap.md) |
| TJ | TBD — gated on G-1 | TBD | Smaller market; consider after KZ proves the activation playbook |

## Done criteria

- [ ] `countries` row created + `is_active = true`
- [ ] Country subdomain (`<xx>.aiqadam.org`) resolves + serves the country home page
- [ ] Lead has Authentik account + RBAC binding (per F-S2.2 once shipped; manual until then)
- [ ] AUP signed + archived
- [ ] Compensation acknowledgement signed + archived
- [ ] Trust-transfer ceremony done publicly
- [ ] First event scheduled on the country's `events` list
- [ ] Volunteering Board notified async
- [ ] T+4 week retrospective scheduled

## Related

- [ADR-0022](../../adr/0022-country-lead-compensation.md) (Deferred) — the gap this playbook acknowledges
- [`docs/02-business-processes/business-process-gaps.md`](../business-process-gaps.md) G-1 — the trigger conditions for revisit
- [`docs/02-business-processes/operations/country-lead-activation.md`](../operations/country-lead-activation.md) — the engineer-side counterpart
- F-S4.1 country provisioning service — automates steps 4-5 once shipped
- F-S4.3 country-lead onboarding wizard — automates the cabinet walk-through
- [marketing playbook §13](../marketing-and-pr-playbook.md) — founder voices (extended per country)
