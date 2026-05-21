# Operator playbook: Speaker outreach + briefing

**Audience:** country lead or speaker-pipeline owner.
**When to use:** ~5 weeks before each event (later → quality drops).
**Frequency:** per event; pipeline-maintained continuously.

## Outcome

Each event has 1–3 confirmed speakers whose talks are **on-topic for the audience**, who have **received the brief + logistics + sponsor context**, and whose `speakers` row in Directus is `status = active` and linked to the event via `event_speakers`.

## Inputs

- Event date + venue (from `events`) — venue's mic/AV stack constrains talk format.
- Audience size + composition (`events.capacity_band` + the country's recent registration cohort) — drives talk depth.
- Sponsor confirmation status — a Platinum sponsor may have a "presenting speaker" slot per [marketing playbook §3.5](../marketing-and-pr-playbook.md).
- Brand voice + voice guide (per [`ux-and-content-guidelines.md`](../ux-and-content-guidelines.md) §1).
- Russian voice guide — once `docs/voice-guide-ru.md` lands (per ADR-0029).

## Steps

1. **Brief.** Decide the talk theme (one sentence) + audience-fit goal + 1 anti-goal ("not a sales pitch", "not a basics intro", etc.). Write down before reaching out.
2. **Shortlist** 5–8 candidates from:
   - Past speakers (filter `speakers.status = active` for recurring slots)
   - Member-graph signals: `member_interests.intent = willing_to_speak` + `member_skills` matching the theme
   - Sponsor recommendations (per ADR-0033 sponsor PII boundary, sponsors propose speakers; the operator decides who to invite)
   - Cold outreach to known regional voices (LinkedIn / X / referrals from past speakers)
3. **Send the cold-invite email** (template below). Russian or English per the speaker's preference signal.
4. **Hold a 20-min intro call** with accepted candidates. Discuss: talk shape, audience, sponsor relationship if relevant (per ADR-0033, sponsor never sees member roster; do not promise sponsor access in invitations).
5. **Confirm acceptance** by: creating their `speakers` row (or updating to status=active) + the `event_speakers` row with status=accepted. The F-S1.1b speaker_added flow fires the public event-page update + the announce-to-registered-attendees flow.
6. **Send the speaker brief packet** (template below) ≥ 3 weeks before. Includes: venue + AV, audience size, time allocation (talk + Q&A), what the recap will publish (recording? slides? quotes?), the speaker-card design assets they should review (per ADR-0025 Tier 2 brand assets in Directus).
7. **T-7 day refresh:** check in with each speaker. Brief reminder, ask if they need help (e.g., a co-presenter introducing them).
8. **T-2 day final reminder + logistics.** Address + door time + your phone number + the venue's wifi creds. If they're flying in, confirm pickup.
9. **Day of:** see `event-production-day-of.md` §"speaker handling".

## Templates

**Cold invite (English):**

```
Subject: Speaking slot — AI Qadam {city} on {date}

Hi {first name},

I'm {your name} with AI Qadam, the AI engineering community across
Central Asia. We're hosting {event title} on {date} at {venue} for
~{capacity_band} {city} engineers, and your work on {specific topic
you've seen them publish / build} would land well with this crowd.

The slot is {talk length} + ~10 min Q&A. We pay {nothing today;
honorarium model is on the gap list G-1 per ADR-0022}. What we offer:
a sharp, technical audience that asks real questions; a clean recap
(slides + recording archived) that you can share; an introduction to
the wider regional community.

Would you be open to a 20-min intro call this week? I'm flexible
on time.

Best,
{your name}
{phone / Telegram handle}
```

**Russian version** lives at TBD `voice-guide-ru.md` (per ADR-0029); the community editor pool reviews each instance before send.

**Brief packet (sent post-acceptance):**

```
Subject: {event title} speaker brief — logistics + audience

Hi {first name},

Quick brief for {date}:

  - Venue: {venue name, address}
  - Door open: {time}; your slot: {time}–{time}
  - Format: {talk length} talk + {q&a length} Q&A
  - Audience: ~{capacity_band} attendees, mix of {seniority breakdown
    from cohort}; mostly {industry breakdown}
  - AV: {projector spec / mic type / hdmi vs USB-C / your slides format}
  - Recording: {yes/no}; we publish a recap blog post within 7 days
    with a 2–3 quote-card from your talk (you'll review before publish)
  - Sponsor context: {if a sponsor is funding this event, neutral
    mention here — do NOT commit on access to attendee data}

Your speaker card draft is at {link to Directus marketing_assets
preview}. Let me know if you want the headline / company / photo
adjusted.

Tashkent contact for the venue / day-of: {operator's phone / Telegram}.

Anything blocking? I'd rather hear now than the day before.

{operator's name}
```

## Anti-patterns

- ❌ **Promising what we can't deliver.** "Hundreds of attendees" / "you'll meet investors" / "we'll get you press". Stick to what the audience IS (sharp engineers) + what the platform DOES (clean recap).
- ❌ **Letting sponsors pick the speaker.** Sponsors recommend, the operator decides. Per ADR-0033 sponsor PII boundary, sponsors don't have access to control speaker selection — the community owns the bar.
- ❌ **Hype-y outreach emails.** Voice rules from UX guidelines §1 apply: warm, specific, no "amazing/awesome" filler.
- ❌ **Skipping the intro call.** Cheaper to discover misfit talks in a 20-min call than to live-stream-fix a bad fit on event day.
- ❌ **Brief packet skipped or sent < 1 week ahead.** Speakers underprepared in CA scene; they need a week minimum.

## Country variants

| Country | Notes |
|---|---|
| UZ | Russian + English both common; Uzbek is rare for technical talks (most speakers default-fluent Russian). Confirm preference in intro call. |
| KZ | Russian dominant; English fine for international-leaning crowds (Astana / Almaty tech scene). |
| TJ | Tajik + Russian; engineer audience also Russian-fluent. English niche only. |

## Done criteria

- [ ] Each event has 1–3 confirmed speakers with `event_speakers.status = accepted`
- [ ] Each speaker received the brief packet ≥ 3 weeks before event
- [ ] Each speaker's `speakers.headline` + `speakers.bio_md` + `speakers.photo` populated (used by F-S5.4 social cards)
- [ ] Sponsor-recommended speakers were evaluated; selection decision was operator-owned
- [ ] T-7 + T-2 check-ins done

## Related

- F-S1.1b speaker_added flow — auto-fires on `event_speakers.status: accepted → confirmed`
- F-S5.4 social cards — pulls from `speakers.*` for the speaker spotlight image
- [ADR-0033](../adr/0033-community-member-graph.md) — sponsor PII boundary (don't let sponsors control speaker selection)
- [ADR-0029](../adr/0029-russian-voice-owner.md) + G-3 — Russian voice ownership for templates
- [`docs/ux-and-content-guidelines.md`](../ux-and-content-guidelines.md) §1 — voice rules
