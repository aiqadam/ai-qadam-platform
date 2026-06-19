# Operator playbook: Community conduct (v0)

**Audience:** country lead, Binali (Founder), Viktor (COO).
**When to use:** when a community-conduct issue surfaces — bad behavior at an event, abusive content in Telegram, sponsor reps overstepping, a member reporting another member.
**Frequency:** rare today; grows with scale. This playbook is the precursor to the full ζ.7 crisis-comms framework.

## Outcome

The incident is **handled within 48 hours**: facts collected; affected parties spoken to; a decision recorded (warning / temporary ban / permanent ban / no-action); communicated where appropriate; logged for trend analysis. The community-conduct trust line is maintained.

## Inputs

- The incident itself: who reported, who's involved, what happened, what evidence
- The platform's code of conduct (TBD — needs writing; placeholder reference at TODO `docs/code-of-conduct.md` per ζ.7 roadmap row)
- Member-graph state: `directus_users` row for each party + their `member_consents`
- Affected event (if applicable) + its `event_followups` row
- Volunteering Board contact (the governance body that adjudicates per project-essentials)

## Steps

### Day 0 (within 24h of report)

1. **Acknowledge the reporter.** Brief, warm, no commitment beyond "we hear you, we're looking into it within 48 hours". Voice rules from UX §1 apply.
2. **Collect facts.** Separate conversations with:
   - The reporter (what they observed, when, where, what they want)
   - The accused party (their side; do not name the reporter unless they consent)
   - Any witnesses (if anyone else was present and willing to comment)
3. **Document privately.** Write a one-page incident note in a private location (Viktor's notes for now; future: a private Directus collection with sponsor-PII-boundary-class permissions). Include: timestamp, parties, facts, evidence references.

### Day 1 (within 48h of report)

4. **Decision.** Operator (the country lead if local; Viktor if cross-country) decides the action. Bias toward proportional + community-trust-preserving:
   - **No action** if the report doesn't substantiate
   - **Verbal warning** (1:1 conversation, recorded as a note)
   - **Temporary cooldown** (mute in Telegram for N days; not invited to next event)
   - **Permanent ban** (remove from groups, deactivate `directus_users.status = banned`, revoke all `member_consents`)
   For permanent bans: escalate to Volunteering Board before executing.
5. **Communicate.** To the affected parties; to the broader community only if a public response is necessary (rare; high bar, per ζ.7 crisis framework when that lands).
6. **Execute.** Per the decision. For Telegram actions: bot v0 doesn't yet do moderation actions; operator uses Telegram's built-in admin tools.
7. **Log.** The incident note's status flips to "closed" with the decision + date + executor.

### Beyond day 2

8. **Pattern detection.** Quarterly: review the incident log for patterns. Three incidents involving the same person → permanent ban without further evaluation. Three incidents at the same event type → format adjustment.

## Templates

**Reporter acknowledgement (English; bilingual RU/EN once `voice-guide-ru.md` lands):**

```
Subject: Following up on your message

Hi {first name},

Thank you for telling us. {Quick reflection of what they reported,
1 sentence}. I'm looking into this and will get back to you with
how we're handling it within 48 hours.

In the meantime, if anything else comes up or if you want to add
context, just reply to this message.

{operator first name}
```

**Verbal warning template (1:1; not written):**

The conversation has three parts:
1. What you observed (specific, no editorializing)
2. Why it matters (community-trust frame, not rules-lawyering)
3. What you expect going forward (specific, behavioral)

Document the conversation in the incident log AFTER it happens.

**Permanent ban announcement** (if a public statement is necessary — rare; default is silent execution):

```
We're updating community membership: {name OR neutral reference}
will no longer be part of AI Qadam events or channels. We don't
share specifics of conduct decisions out of respect for everyone
involved.

If you have questions about how we handle community-conduct issues,
read {link to code-of-conduct doc once it lands}.

— {operator who signed}
```

## Anti-patterns

- ❌ **Naming the reporter to the accused.** Without explicit consent. Confidentiality protects future reporters.
- ❌ **Going public with specifics.** Default silent; the bar for a public statement is high (typically: the incident is already public, or it materially affects member safety).
- ❌ **Permanent ban without Volunteering Board sign-off.** Board exists for the hardest decisions; use it.
- ❌ **Skipping the documentation step.** Pattern detection depends on logs; one incident in isolation looks small, three on the same theme are a problem.
- ❌ **Letting sponsor or speaker status influence the decision.** A high-tier sponsor's rep behaving badly gets handled like any other member's behavior. The community-as-platform thesis depends on the bar being equal.
- ❌ **Outsourcing the decision to "wait until ζ.7 ships".** Trust + safety is needed before ζ.7 lands; this v0 playbook is the bridge.

## Country variants

| Country | Notes |
|---|---|
| UZ | Cultural register: explicit conflict avoidance common; document carefully because "it seemed fine" reports later become formal complaints. |
| KZ | More direct conversation style typical; same playbook structure. |
| TJ | Smaller community + tighter social network; assume any decision will be common knowledge within a week regardless of confidentiality, plan accordingly. |

## Done criteria

- [ ] Reporter acknowledged within 24h
- [ ] Facts collected from all relevant parties
- [ ] Decision made within 48h
- [ ] Incident documented in the log
- [ ] Executed (warning / cooldown / ban) where applicable
- [ ] Permanent bans: Volunteering Board signed off before execution
- [ ] Pattern check: did this fit a recurring pattern in the log?

## Related

- ζ.7 crisis & trust & safety framework — the full version of this playbook; lands per the Phase ζ roadmap
- [`security-incident.md`](../../04-development/security/runbooks/security-incident.md) — when a conduct incident crosses into "security incident"
- [`audit.md`](../../04-development/security/runbooks/audit.md) — for the audit-log of moderation actions
- [ADR-0033](../../adr/0033-community-member-graph.md) — `member_consents.revoked_at` is the mechanism for "ban + revoke all consents" at execution time
- TBD `docs/code-of-conduct.md` — the document this playbook enforces (not yet written)
