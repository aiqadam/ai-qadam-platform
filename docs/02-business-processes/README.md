# Layer 2 - Business processes

How the organization and community operate day to day. Operator playbooks, marketing and decision processes, and the operational runbooks operators follow to run events, leads, and member flows.

## Documents

- [Business-process gaps](business-process-gaps.md)
- [Decision-batch process — weekly ADR review cadence](decision-batch-process.md)
- [AI Qadam — marketing & PR playbook](marketing-and-pr-playbook.md)
- [Marketing UTM scheme — the canonical attribution standard](marketing-utm-scheme.md)

## Operator playbook

- [Operator playbook: Brand asset production](operator-playbook/brand-asset-production.md)
- [Operator playbook: Community conduct (v0)](operator-playbook/community-conduct.md)
- [Operator playbook: Country launch](operator-playbook/country-launch.md)
- [Operator playbook: CSAT collection](operator-playbook/csat-collection.md)
- [Operator playbook: Event production day-of](operator-playbook/event-production-day-of.md)
- [Operator playbook: Post-event checklist](operator-playbook/post-event-checklist.md)
- [Operator playbook: Speaker outreach + briefing](operator-playbook/speaker-outreach.md)
- [Operator playbook: Sponsor onboarding](operator-playbook/sponsor-onboarding.md)
- [Operator playbook: Venue selection](operator-playbook/venue-selection.md)

## Operational runbooks

- [Runbook: Country-lead activation](operations/country-lead-activation.md)
- [Runbook: Event CSAT — capture + operator surface](operations/event-csat.md)
- [Runbook: Pre-event member-to-member matching (T-7)](operations/event-member-matches.md)
- [Runbook: Pre-event reminder cron (`reminder_72h` + `reminder_3h`)](operations/event-pre-event-reminders.md)
- [Runbook: Event publication broadcast (`event_announce`)](operations/event-publication-broadcast.md)
- [Runbook: Speaker pipeline + post-event cron](operations/event-speaker-pipeline.md)
- [Lead nurture (F-S1.6)](operations/lead-nurture.md)
- [Runbook — Member graph foundation (F-S3.0)](operations/member-graph-foundation.md)
- [Runbook: Member self-service profile (`/me/profile`)](operations/member-profile.md)
- [Runbook: Member referral codes (`/me/referrals`)](operations/member-referrals.md)
- [Runbook: Operator announce composer (`/workspace/announce`)](operations/operator-announce-composer.md)
- [Runbook: Operator approval queue (`/workspace/approvals`)](operations/operator-approvals-queue.md)
- [Runbook: Operator cohort builder (`/workspace/members`)](operations/operator-cohort-builder.md)
- [Runbook: Operator event control panel (`/workspace/events`)](operations/operator-event-control.md)
- ~~Runbook: Setting up Send-as for Gmail~~ — [archived](operations/archive/operator-email-send-as.md), superseded by docker-mailserver auto-provisioning (F-S2.12)

## UAT scripts

Machine-executable test scripts for the `uat-verification` agentic workflow.
Run by the UATRunner agent against a live local stack; triaged by the
BusinessAnalyst agent.

- [UAT registry](uat/registry.md) — index of all scripts + last-run status
- [UAT script template](uat/BP-UAT-template.md) — template for new scripts

## Related decisions (ADRs)

ADRs live in the chronological log at [`docs/adr/`](../adr/). Those most relevant here:

- [0012-operator-send-as-automation](../adr/0012-operator-send-as-automation.md) - Operator Send-as automation
- [0036-sponsor-digest-rollups](../adr/0036-sponsor-di