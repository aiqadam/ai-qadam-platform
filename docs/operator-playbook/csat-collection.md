# Operator playbook: CSAT collection

**Audience:** country lead reading post-event CSAT.
**When to use:** every event; the operator-side surface of the F-S1.2 CSAT capture feature.
**Frequency:** per event + cumulative reading in the F-S2.4 country dashboard once that ships.

## Outcome

CSAT responses for the event are: dispatched within 24h of event end, collected via tokenized links with anonymity preserved, aggregated into `event_outcomes.csat_avg` (null if N<3), readable by operator without exposing per-attendee identity.

## Inputs

- Event with `events.status = published` + at least one `registrations.status = attended` row
- F-S1.2 CSAT feature shipped (until then, the F-S1.1c post-event cron emits CSAT via the dispatcher)
- Member-graph consents (`member_consents.purpose = events` must be `granted` for a member to receive the CSAT email; the dispatcher enforces this automatically)

## Steps

1. **Verify dispatch.** Day +1 after the event, query `interaction_deliveries` for the event's CSAT interaction. Expected: one delivery row per attended member with `state = sent` or `delivered`. Failures (skipped_consent / skipped_policy / failed) are expected when a member revoked events-consent; investigate counts > 5% of attended.
2. **Read responses.** Query `interaction_responses` where `response_intent = csat_score` joined back to the event. Responses are tokenized — the operator sees `payload.rating` (0–5) + optional `payload.comment`, NEVER linked back to a specific attendee identity.
3. **Compute the per-event metric** — the F-S1.1c post-event cron writes `event_outcomes.csat_avg` automatically once the response window closes. If N < 3, the field stays null (anonymity floor).
4. **Chase the response rate.** If after 5 days the response rate is < 30% AND N ≥ 3, dispatch ONE polite reminder via the F-S3.3 announce composer (cohort filter: attended this event AND NOT responded). Do NOT chase twice; second-reminder fatigue lowers the rate.
5. **Read the comments narratively.** Comments are anonymous but reveal patterns — venue issues, talk-fit problems, AV regressions. Capture themes in the event retrospective (per `post-event-checklist.md` step 12).
6. **Roll into the next event's planning.** A drop in CSAT across two consecutive events triggers a country-lead-sync discussion at the next weekly check-in.

## Templates

**CSAT chase (English; sent via dispatcher, NOT manually):**

```
Subject: One question about {event title}

Hi {first name},

Quick favor — we'd love to hear what worked + what didn't at
{event title}. Same one-question survey: {tokenized link}

Takes 30 seconds. The link is yours alone; responses are anonymous
in our aggregated reports.

{operator first name}
```

**Reading per-event metrics in the F-S2.4 country dashboard** (once shipped):

- Attendance rate = `attended / registered` — target ≥ 70%
- CSAT avg = `event_outcomes.csat_avg` — target ≥ 4.0 (out of 5)
- NPS = `event_outcomes.nps` — target ≥ 30; flag below 0
- Content artifact count = `event_outcomes.content_artifacts_count` — should be ≥ 1 (the recap) within 7 days

## Anti-patterns

- ❌ **Trying to identify a specific responder from `interaction_responses`.** The delivery token de-links the response from the member identity at the response-write step; there's no audit path back to the member, by design. If you find yourself wanting to do this, you're violating the anonymity floor.
- ❌ **Skipping the CSAT chase when response rate < 30%.** Drops the next event's measurable confidence.
- ❌ **Multiple chase reminders.** One reminder is enough; two is harassment.
- ❌ **Reading raw comments to sponsors.** Sponsor reports include the AGGREGATED csat_avg + nps only, never raw comment text. Per ADR-0033 sponsor PII boundary.
- ❌ **Acting on a single bad comment.** Patterns matter; one critical comment is noise. Two on the same theme = signal. Three = act on it.
- ❌ **Hiding bad CSAT from the Volunteering Board.** The quarterly board digest sees aggregated metrics including misses; honesty here builds long-term trust.

## Country variants

| Country | Notes |
|---|---|
| All | The CSAT email itself is Russian + English bilingual (single email; member's preferred locale per `directus_users.locale`). One question; 0–5 scale; optional comment. |

## Done criteria

- [ ] CSAT dispatched to all attended members with consent granted
- [ ] Failure rate (`skipped_*` + `failed`) < 5% (investigate if higher)
- [ ] Response rate ≥ 30% by day +7 (one chase reminder if needed)
- [ ] `event_outcomes.csat_avg` populated (or null if N < 3, anonymity floor)
- [ ] Themes captured in event retrospective
- [ ] No sponsor-PII boundary violations during the report-roll-up

## Related

- F-S1.2 CSAT capture — the feature that owns dispatch + scoring
- F-S1.3 operator surface for CSAT reading — the page this playbook references
- F-S2.4 country dashboard — where the aggregated read happens
- F-S3.5 partner cabinet — where sponsor-visible aggregated CSAT renders (per ADR-0033)
- [`post-event-checklist.md`](./post-event-checklist.md) — broader post-event flow
