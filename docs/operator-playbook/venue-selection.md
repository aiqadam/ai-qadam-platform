# Operator playbook: Venue selection

**Audience:** country lead booking a venue for an upcoming event.
**When to use:** ~6 weeks before each event (later = severely degrades options in CA capital cities).
**Frequency:** per event.

## Outcome

A venue is **confirmed** — signed agreement (or written confirmation for free spaces), date locked, capacity matches `events.capacity_band`, AV checked, accessible by public transit + parking available, photo permissions granted.

## Inputs

- The event's `event_types.key` (meetup / workshop / hackathon / conference / online / closed / paid / course_session) — drives capacity + format.
- Expected attendance range (drives `events.capacity_band`: micro <10 / small 10-29 / medium 30-79 / large 80-199 / xl 200+).
- Sponsor confirmation status (Platinum/Gold sponsors may offer or fund the venue — see `sponsor-onboarding.md`).
- Budget cap (per ADR-0028 + G-2 gap: zero paid spend Year-1; venues should be free, sponsor-funded, or in-kind).
- Country: Tashkent / Almaty / Dushanbe — different shortlists.

## Steps

1. **Pick the type of space.** Match `event_types.key` to space class:
   - meetup → coworking event hall or sponsor office (free typical)
   - workshop → coworking with desks/tables + good wifi
   - hackathon → 24-48h-accessible space with secured wifi + power
   - conference → dedicated venue with stage + AV
   - course_session → recurring same-room booking
   - closed → office + NDA-friendly setup
2. **Shortlist 3 venues** from the country-variants section below.
3. **Site-visit at least 1** (the most likely; visit the others if #1 falls through). Check: capacity-vs-band match, AV (HDMI + 3.5mm + clip mic + projector or large TV), wifi speed (run `fast.com` during visit; ≥ 30 Mbps both directions), accessibility (step-free entrance + restrooms), photo permissions (some venues require waiver — confirm before assuming).
4. **Confirm date + time.** Negotiate setup buffer (30 min before doors) and breakdown buffer (30 min after end).
5. **Sign / written confirmation.** Free venues: a confirmation email is enough. Paid venues: signed agreement (legal contract per local law).
6. **Update Directus events.location** with the venue name + short address. Update `events.capacity` to the venue's confirmed cap. Set `events.status = published` only after venue is locked.
7. **Add to operator calendar** (Google Calendar / equivalent) with the door open / start / end times + the venue's contact person.

## Templates

**Cold outreach to a new venue (Russian / English, choose per venue):**

```
Subject: AI Qadam — meetup space inquiry for {date}

Hi {venue contact},

I'm {your name} with AI Qadam, the AI engineering community for
Central Asia (https://aiqadam.org). We're looking to host {event
type} on {date} for {expected attendance count} people, and your
space at {venue name} fits what we need.

Specifically we're looking for:
  - {date} from {time} to {time}
  - Setup access from {time}
  - {AV needs: projector / mic / hdmi}
  - {wifi need}

Would you be open to {hosting us / discussing terms}? Happy to come
by for a quick walkthrough.

Best,
{your name}
```

For confirmed-sponsor-funded venues, the sponsor handles their own venue procurement; you just confirm the address + AV stack in the same way as a self-procured venue.

## Anti-patterns

- ❌ **Booking < 4 weeks out.** Best venues in Tashkent + Almaty go fast. Hackathon venues need 6+ weeks.
- ❌ **Skipping the site visit.** Photos lie. Wifi is the #1 thing that's worse than advertised.
- ❌ **Booking based on "the sponsor offered their office" without checking capacity.** Sponsor offices often max out at meetup capacity; if you have 80 RSVPs and a 30-seat office, you'll cap registrations + lose RSVPs.
- ❌ **No photo permission before event day.** Photographer shows up + the venue says no — recap is ruined. Per ADR-0030, photo consent is per-attendee anyway; venue permission is the precondition.
- ❌ **Choosing a venue inaccessible by public transit** in cities where most attendees don't drive (Tashkent, Almaty centers). Conversion drops measurably.

## Country variants

| Country | Default-shortlist venues (fill on first event) | Notes |
|---|---|---|
| UZ (Tashkent) | TBD — country lead seeds with 5–8 known venues | Mirzo Ulugbek / Yashnobod / Yunusobod districts most central |
| KZ (Almaty) | TBD — country lead seeds | Most tech crowd is in Almaty 1–8 microdistricts; Astana is smaller market |
| TJ (Dushanbe) | TBD — country lead seeds | Smaller venue universe; coffeeshop back-rooms can work for small meetups |

The shortlist is the country lead's local knowledge and lives here once a country activates. Empty on day one.

## Done criteria

- [ ] Venue confirmed in writing (signed agreement OR confirmation email)
- [ ] `events.location` updated in Directus
- [ ] `events.capacity` matches venue capacity
- [ ] Site visit completed (or explicitly waived for a known-good venue)
- [ ] AV checked + works for the event format
- [ ] Photo permission obtained from the venue
- [ ] Calendar entry includes door / start / end + venue contact name + phone
- [ ] Backup venue identified in case of last-minute cancellation

## Related

- [`event-production-day-of.md`](./event-production-day-of.md) — the day-of run-of-show that builds on this
- [`sponsor-onboarding.md`](./sponsor-onboarding.md) — sponsor-funded-venue path
- [ADR-0030](../adr/0030-photo-consent.md) — photo-consent rules at the door
- [ADR-0028](../adr/0028-first-paid-spend.md) — zero-paid-spend constraint until G-2 closes
- [`docs/business-process-gaps.md`](../business-process-gaps.md) G-2 — first paid spend
