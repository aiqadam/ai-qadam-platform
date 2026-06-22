# Operator playbook: Post-event checklist

**Audience:** country lead, immediately after each event.
**When to use:** in the 7 days following each event.
**Frequency:** per event.

## Outcome

The post-event flow completes within 7 days: CSAT collected (anonymity floor honored), thank-you sent to speakers + sponsors + venue, recap published, sponsor report drafted (if applicable), `event_outcomes` row populated.

## Inputs

- Event ended; `events.status = published` (not cancelled)
- Photos uploaded into Directus `marketing_assets` (per ADR-0025 Tier 2) tagged with attendees per ADR-0030 consent state
- Quote-card candidates from the operator's notes during the event (per `event-production-day-of.md` step 11)
- Speaker contacts (from `speakers` collection)
- Sponsor contacts (from `companies WHERE is_sponsor=true` + `partner_audiences` for what they're entitled to see)

## Steps

### Day +0 (event day, late)

1. **Touch the F-S3.4 event control panel** at `/workspace/events/[id]` (once shipped). Until then, Directus admin: mark every `registrations.status` accurately (`attended` for those who came, leave `registered` for no-shows).
2. **Trigger the CSAT dispatch** — F-S1.2 once shipped will do this from the cabinet; until then, the F-S1.1c post-event cron handles it automatically. Verify in `interaction_deliveries` that emails went out.

### Day +1 to +3

3. **Thank-you to speakers.** Personalized, brief — voice rules apply. Include the quote-card draft for their review + an ETA for the recap publish.
4. **Thank-you to venue contact.** Brief warm note; confirm whether photo permissions extended to the recap publish.
5. **Sponsor thank-you (if any).** Neutral mention of attendance + format; the cohort-aggregated metrics come later in the quarterly digest per F-S3.8.
6. **Draft recap.** Per [marketing playbook §14](../marketing-and-pr-playbook.md): event-card image (per F-S5.4 social cards), 2–3 quote cards per speaker, 1 audience-reaction wide shot, 1 venue shot, brief written summary. Voice rules from UX §1.

### Day +4 to +7

7. **Publish recap.** As an event-recap page (when that ships) OR as a Telegram-channel post (per ADR-0026 per-country channel) + LinkedIn share (COO solo today, country lead once their channel is set up).
8. **CSAT chase.** Read responses from `interaction_responses` (response_intent = csat_score). If response rate < 30% by day +5, send one polite reminder via the dispatcher (cohort = attended but-not-responded). Honor the anonymity floor: `event_outcomes.csat_avg` stays null if N < 3 responses.
9. **Populate `event_outcomes`.** Once F-S3.4 cabinet ships, the cabinet writes this on operator-driven "mark followups complete"; until then, the F-S1.1c post-event cron writes the count fields + the operator manually flips `follow_up_completed = true`.
10. **Sponsor report (if applicable).** Per ADR-0033, sponsors NEVER see raw member rows. The report = cohort-aggregated counts + the recap link + the quote cards + their entitled-cohort match metrics. Quarterly digest (F-S3.8) is the auto-generated version; per-event ad-hoc reports follow the same constraint.

### Day +7 closing

11. **Update `event_followups`** for each of: retrospective (your notes for next time), thank_you_sent, recap_posted, sponsor_report_delivered. Set `completed_at`.
12. **Note any retrospective items** in your country's running notes file (TBD format; for now a personal doc that bubbles up to the next country-lead sync).

## Templates

**Speaker thank-you (English):**

```
Subject: Thanks for {date} talk — quote cards attached

{first name},

Thanks for the talk on {topic} at {event title}. The {audience reaction}
landed well, and a few attendees specifically called out {specific
moment / takeaway} in the CSAT responses we've seen so far.

Recap going up by {date+7}. Three quote cards are at {link} — would
you like any edited or pulled?

Hope to see you at a future event,

{operator name}
```

**Sponsor thank-you (English):**

```
Subject: {event title} — recap + cohort snapshot

{sponsor contact name},

Thanks for being part of {event title}. {neutral attendance + format
summary}. The recap goes up by {date+7}; I'll share the link.

A cohort-aggregated snapshot for your audience (per the partner_
audiences entitlement we set up) is available on your partner cabinet
at {url to /workspace/partners/[id]} — once the cabinet is live.

Quarterly digest with deeper cohort metrics + content artifacts goes
out at the end of {quarter} per the agreement.

{operator name}
```

## Anti-patterns

- ❌ **Sending raw attendee list / contact info to sponsors.** Hard violation of ADR-0033 sponsor PII boundary. Sponsors get aggregated cohort metrics only.
- ❌ **Publishing photos with unconsented attendees.** Per ADR-0030 + the wristband + member-tagging flow. If you're unsure for any photo, crop or skip it.
- ❌ **Skipping the CSAT chase.** Response rate < 30% drops the next event's behavioral metrics; one polite reminder typically lifts response rate +10-15 points.
- ❌ **Delaying recap > 7 days.** Engagement decay is steep; a 14-day recap performs ~half of a 5-day recap.
- ❌ **Letting `event_outcomes.follow_up_completed = false` linger.** Once it's true, the F-S3.8 quarterly digest can include this event. Keeping it stuck false makes the digest incomplete.

## Country variants

| Country | Notes |
|---|---|
| UZ | Russian recap default; English version optional for international audience. |
| KZ | Russian recap default; English mirror for Astana / international. |
| TJ | Tajik headline + Russian body acceptable; English niche only. |

## Done criteria

- [ ] CSAT dispatched (verify in `interaction_deliveries`)
- [ ] Thank-yous sent (speakers + venue + sponsors)
- [ ] Recap published with appropriate consent-respecting photos
- [ ] `event_outcomes` populated; `follow_up_completed = true`
- [ ] All four `event_followups` rows for this event have `completed_at` set
- [ ] No sponsor-PII boundary violations during the report-share flow

## Related

- F-S1.1c post-event cron — fires CSAT + speaker thank-you + next-event teaser automatically
- F-S3.4 event control panel — the cabinet where operator drives followup completion
- F-S3.8 quarterly sponsor digest — consumes `event_outcomes`
- [ADR-0030](../../adr/0030-photo-consent.md) — photo consent at publish time
- [ADR-0033](../../adr/0033-community-member-graph.md) — sponsor PII boundary at report-share time
- [`csat-collection.md`](csat-collection.md) — for the response-rate side of CSAT
