# Operator playbook: Event production day-of

**Audience:** country lead + 1–2 day-of helpers.
**When to use:** the day of every event, from setup buffer through breakdown.
**Frequency:** per event.

## Outcome

The event runs from door-open through close without anything material going wrong: attendees check in, speakers present, photos are taken with proper consent, the recap material is captured for the post-event flow.

## Inputs

- Venue confirmed (per `venue-selection.md`)
- Speakers confirmed + briefed (per `speaker-outreach.md`)
- `events.status = published` with venue + capacity + speakers populated
- Registration list pulled from `/workspace/events/[id]` (F-S3.4 event control panel) — once that ships; until then, query Directus `registrations` directly
- Photo-consent wristband stock (per ADR-0030) — green wristbands for opted-in attendees
- Photographer briefed on the consent process (per ADR-0030 photographer-brief language)
- Sponsor representative point-of-contact (if Platinum or Gold sponsor is co-running)

## Steps

### Setup (door open − 30 min)

1. **Arrive 30 min before door open.** Confirm venue setup matches plan; flag any AV issues NOW (test the projector with a slide; mic with a voice check).
2. **Set up check-in.** Print or digital? Recommend digital via the F-S3.4 cabinet's check-in scanner once it ships; until then, a laptop with `/workspace/events/[id]` open + a check-in table.
3. **Wristband station.** Wristbands placed visibly. Photographer at hand for a 60-second brief.
4. **Photographer brief** (per ADR-0030):
   - Green wristband = OK to photograph (head-on shots fine)
   - No wristband = OK to shoot wide / from behind / not at all
   - Always avoid identifiable faces of no-wristband attendees in any frame
   - Hand them the shot list (speakers in action, audience reactions wide, venue establishing shot, sponsor logo placement if any)
5. **Sponsor materials placement.** If a sponsor is funding the event, their materials go in agreed locations per the sponsor agreement (see `sponsor-onboarding.md`). NO sponsor staff at the check-in table (per ADR-0033 — sponsors don't touch attendee data).

### Door open + check-in

6. **Door opens.** Operator at the check-in laptop; helper handing wristbands.
7. **Check-in flow per attendee:**
   - Confirm name against registration list
   - Mark `registrations.status: registered → attended` (the F-S3.4 cabinet button when shipped; until then, Directus admin)
   - Confirm photo consent: did they opt-in at registration? If yes → green wristband; if no → no wristband, smile, move on
   - Welcome line: "Welcome. You're in." (per UX §1.1 voice)
8. **Walk-ups (not pre-registered):**
   - If capacity allows: register them on the spot via the cabinet (or Directus admin), then check in
   - Photo consent is asked verbally; default OFF unless they opt in
9. **Speakers arrive:** show them the green room / quiet area, confirm slide deck loaded, mic check, time slot reminder, confirm photo consent (most speakers opt in; explicit ask anyway)

### Run-of-show

10. **Operator MCs.** Standard sequence (per [marketing playbook §14](../marketing-and-pr-playbook.md)):
    - Welcome (2 min) — community-voice, no hype. Acknowledge sponsors briefly + neutrally
    - Speaker 1 intro + talk + Q&A
    - Break (15 min)
    - Speaker 2 intro + talk + Q&A
    - (More speakers as planned)
    - Open networking + wrap
11. **During each talk:**
    - Photographer follows their brief
    - Operator monitors time + holds the time card (5-min / 2-min / 1-min)
    - Operator captures 3–5 quote candidates from each talk (for the recap quote cards)
12. **Sponsor staff** are attendees, not operators. They mingle; they don't run anything; they don't collect contact info from attendees (per ADR-0033 sponsor PII boundary, sponsor lead-collection is via opt-in registration flag only).

### Wrap (last 30 min)

13. **Last speaker ends.** Operator wraps with: thanks to speakers, thanks to venue, thanks to sponsors (neutral mention), reminder to fill the CSAT link that will arrive by email tonight, next event teaser if one is on the calendar.
14. **Networking + soft close.** Some attendees stay; that's good — these are the most engaged. Note any spontaneous follow-up requests (a candidate said they want to speak next time → add to `member_interests` later).
15. **Breakdown.** Pack AV; return venue to handover state. Confirm photo-consent revocations weren't requested on the spot (rare; if any: note it for the post-event filter step).

## Templates

**MC welcome line (English):**

```
Welcome to AI Qadam {city}, event {N}. We're {expected attendance}
people building AI systems in Central Asia, and tonight we have
{N speakers} talking about {one-sentence theme}. Thanks to {venue}
for hosting, and to {sponsor neutral mention if applicable}. Let's
get started — first up, {speaker 1 name}.
```

**Photo-consent verbal ask (walk-up):**

```
Quick heads-up: we publish event photos in our recap. If you're OK
appearing in those, grab a green wristband at the desk. If not, no
problem — we'll keep cameras off you.
```

## Anti-patterns

- ❌ **Letting the operator skip the wristband distribution to "save 2 min".** A single non-consented photo published in a recap is a real trust hit; the 5-min wristband flow is the cheapest prevention we have until the F-S3.4 cabinet's check-in flow auto-displays the consent state.
- ❌ **Letting sponsor staff collect contacts at check-in.** Hard-no per ADR-0033. Refer them to the opt-in `member_consents.purpose = sponsor_share` flag managed via member self-service.
- ❌ **Live-fixing AV during a talk.** If the projector fails mid-talk, switch to plan B (the speaker continues without slides) rather than 5 minutes of cable wrestling. The talk recap can include the slides as a follow-up.
- ❌ **Skipping the time card.** Speakers ALWAYS go long. Hold the time card visibly + at the right moments.
- ❌ **Skipping the photographer brief.** New photographers don't know our consent model; they default to "shoot whoever's interesting".

## Country variants

| Country | Notes |
|---|---|
| UZ | Russian or English MCing common; check with co-MCs in advance. Tea / water expected. |
| KZ | Russian MC default; English fine for international-leaning audiences. |
| TJ | Tajik + Russian MC; some content blocks may need a Tajik-language welcome. |

## Done criteria

- [ ] Door open + check-in completed without significant lines
- [ ] All `registrations.status` accurately reflects attendance (registered → attended for those who came; no orphan registered rows)
- [ ] Photo wristband flow ran for every checked-in attendee
- [ ] Photographer collected the agreed shot list per the brief
- [ ] All speakers completed their slots without major time overrun (< 5 min over)
- [ ] No sponsor-PII boundary violations (per ADR-0033)
- [ ] Venue returned to handover state
- [ ] Quote-card candidates captured (≥ 2 per speaker)

## Related

- [`venue-selection.md`](venue-selection.md) — what came before
- [`speaker-outreach.md`](speaker-outreach.md) — speakers' prep
- [`post-event-checklist.md`](post-event-checklist.md) — what comes next
- [ADR-0030](../../adr/0030-photo-consent.md) — photo-consent rules at the door
- [ADR-0033](../../adr/0033-community-member-graph.md) — sponsor PII boundary (sponsors don't touch attendee data)
- F-S3.4 event control panel — the cabinet that's the day-of digital surface (once shipped)
