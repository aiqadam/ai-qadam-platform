# Runbooks

Operational procedures for AI Qadam. **A runbook is a living document an on-call human follows when something is happening.** Not architecture. Not a tutorial. Not a wishlist.

If you wrote a procedure that you would not want to follow yourself at 03:00 with a production incident in progress, rewrite it before merging.

---

## When to write a runbook

Write a runbook when **all** of the following are true:

1. The procedure happens (or could happen) repeatedly.
2. Performing it incorrectly causes harm — data loss, downtime, security incident, or wasted operator hours.
3. The procedure depends on knowledge that is **not** trivially derivable from the code (specific commands, service order, recovery sequences, vendor-specific gotchas).
4. There is a non-trivial chance that the person executing it is **not** the person who designed it.

Single-use procedures, things obvious from the source, and notes-to-self do not belong here. Write those in your PR description or in an ADR.

---

## When NOT to write a runbook

- **Architecture / why-we-decided-this.** Use an [ADR](../../../adr) instead.
- **Tutorials / onboarding.** Use `docs/05-other/ai-collab.md` or the operator playbook.
- **One-shot scripts.** Put them in `scripts/` with a comment header.
- **Domain explanation.** Use `docs/01-business/glossary.md` or the relevant doc.

If you are tempted to write a runbook for "how to use feature X", that is a tutorial. The runbook for X exists when X breaks.

---

## Canonical structure

Every runbook in this directory follows the same skeleton. Deviate only when the procedure genuinely does not fit. Stick close to the existing examples — [`coolify-bootstrap.md`](coolify-bootstrap.md) is the longest reference; [`restic-backups.md`](restic-backups.md) is a tight day-to-day reference; [`observability.md`](observability.md) is the most recent.

```markdown
# Runbook: <one-line title>

**Audience:** who reads this and in what situation.
**Pre-reading:** what ADRs or other runbooks they need first.
**Total time:** rough wall-clock for a clean run.

## Pre-conditions
What must be true before starting. Boolean checks — "Authentik reachable",
"backup ran last night", "operator has super_admin role". If any fails,
stop and resolve before continuing.

## Steps
Numbered. Each step is one bounded action that the executor can verify
finished before moving on. Include exact commands (in fenced code blocks)
with copy-pasteable values; mark placeholders as `<NAME>` and explain
where to source them. Include the expected output (or at least its shape)
so the executor knows if something went wrong.

## Verification
End-to-end check that the procedure achieved its goal. Distinct from
per-step checks. Example: "the public site at https://aiqadam.org/health
returns 200 within 30s of running step 7".

## Rollback
If verification fails OR partway through you decide to abort, what is
the reverse procedure? Some procedures have no rollback (e.g., a delete);
say so explicitly — "no rollback after step 5; if you abort earlier the
following commands undo steps 1–4".

## Common failure modes
The bugs we have hit. Each one: the symptom, the root cause, the fix.
Add to this section whenever you debug something at 03:00.

## References
ADRs, related runbooks, source code, vendor docs.
```

**No runbook section is optional.** If a section is genuinely not applicable, write a one-line "Not applicable — <reason>" rather than deleting the heading.

---

## What lives here vs elsewhere

| Domain | Location | Owner |
|---|---|---|
| Infrastructure / CI / deploy / observability / backups / supply chain | `docs/runbooks/` | [Agent-Infra](../../../05-other/agent-prompts.md#agent-infra) |
| Authentication / RBAC / break-glass / audit | `docs/runbooks/` | [Agent-Docs](../../../05-other/agent-prompts.md#-agent-docs) |
| Country-lead activation / RBAC drift | `docs/runbooks/` | [Agent-Docs](../../../05-other/agent-prompts.md#-agent-docs) |
| Brand-asset production / sponsor pipeline / quarterly digests | `docs/runbooks/` | [Agent-Marketing](../../../05-other/agent-prompts.md#-agent-marketing) |
| Trust + safety / moderation / crisis comms | `docs/runbooks/` | [Agent-Docs](../../../05-other/agent-prompts.md#-agent-docs) — ζ.7 |
| Discourse / talk-recordings / hackathon teams | `docs/runbooks/` | Agent-Infra + Agent-API jointly — Phase ζ |
| Operator-playbook-style how-tos (event production, speaker outreach) | `docs/operator-playbook/` (not here) | [Agent-Marketing](../../../05-other/agent-prompts.md#-agent-marketing) |

Why split: runbooks answer "what do I do when this breaks". The operator playbook answers "how do I run an event". Different audience, different read patterns.

---

## Current runbooks

### Infrastructure (Agent-Infra)
- [`coolify-bootstrap.md`](coolify-bootstrap.md) — full Coolify install on a fresh Ubuntu VM (~90 min).
- [`coolify-app-stacks.md`](coolify-app-stacks.md) — deploying app stacks on top of Coolify.
- [`docker-iptables-and-ufw.md`](docker-iptables-and-ufw.md) — networking interaction between Docker and UFW (per ADR-0008).
- [`restic-backups.md`](restic-backups.md) — daily backup operations, restore drill, key rotation (per ADR-0017).
- [`observability.md`](observability.md) — Loki + Uptime Kuma + Plausible custom-event operations (per Sprint 0.4).
- [`supply-chain.md`](../../security/runbooks/supply-chain.md) — pnpm audit + Trivy + Dependabot triage (per Sprint 0.3).

### Authentication + auth-adjacent (mixed ownership)
- [`authentik-local-bootstrap.md`](authentik-local-bootstrap.md) — Authentik provider setup against a local instance.
- [`authentik-ropc.md`](authentik-ropc.md) — retained for the password-reset commands at the bottom; ROPC is no longer used for sign-in (per auth-architecture.md §2).
- [`auth.md`](auth.md) — day-2 auth operations (Authentik upgrade, JWT key rotation, RBAC sync failure, OIDC redirect loop).
- [`security-incident.md`](../../security/runbooks/security-incident.md) — security-incident triage (credential leak, unauthorized access, abuse report, CVE response).
- [`audit.md`](../../security/runbooks/audit.md) — audit-log inspection, member access-log queries, sponsor-PII-boundary checks, quarterly retention sweep.
- [`break-glass.md`](../../security/runbooks/break-glass.md) — break-glass admin path (per F-S0.2): when, why, how, and what to clean up after.
- [`rbac-drift.md`](../../security/runbooks/rbac-drift.md) — investigating + correcting RBAC drift between Authentik / Directus / Plausible (per [ADR-0021 §5](../../../adr/0021-rbac-manifest.md)).

### Member graph + community
- [`member-graph-foundation.md`](../../../02-business-processes/operations/member-graph-foundation.md) — operating + extending the Directus member graph + the sponsor PII boundary (per [ADR-0033](../../../adr/0033-community-member-graph.md)).

### Country onboarding
- [`country-lead-activation.md`](../../../02-business-processes/operations/country-lead-activation.md) — engineer-side activation sequence for a newly-identified country lead (per F-S4.3; gated on ADR-0022 acceptance).

### Email (Agent-Infra / Agent-Marketing crossover)
- [`operator-email-send-as.md`](../../../02-business-processes/operations/operator-email-send-as.md) — operator email "send as" automation (per ADR-0012).

### Planned (not yet written — links go to the issues that track them)

Sprint 0.7 + 3.5 + 0.9 (Agent-Marketing):
- `brand-asset-production.md` — Claude Design + ChatGPT pipeline + approval flow (per [ADR-0025](../../../adr/0025-brand-asset-tooling.md)).
- `sponsor-onboarding.md` — sponsor onboarding through the F-S3.5 partner cabinet (post-ADR-0033; supersedes the original Twenty-pipeline runbook).
- `sponsor-quarterly-digest.md` — generating + sending the quarterly digest (per F-S3.8).

Phase ζ (Agent-Docs):
- `moderation.md` — handling reported content + member bans.
- `crisis-comms.md` — speaker no-show, sponsor pull-out, brand crisis triage.

---

## How a new runbook gets written

1. Take the **canonical structure** above and fill every section.
2. **Pre-flight it** — read every step out loud as if you were the executor. If a step lacks a command, source, expected output, or verification, fix it.
3. **Test it** — run the procedure end-to-end against a non-production target. The whole point of a runbook is that it works on the first try.
4. **Open PR** scoped to the runbook + any code/scripts the runbook depends on. CI lint + link-check + content-quality run.
5. **Common failure modes starts empty** — that is fine. It grows from real incidents.

**Live document.** Whenever you debug a procedure on a live system, the post-incident task is to update the runbook with what you learned. A runbook that stops being updated has stopped being a runbook.

---

## References

- [`docs/05-other/agent-prompts.md` §1](../../../05-other/agent-prompts.md#1-the-7-streams) — file-ownership table that determines who writes which runbook.
- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 0.13](../../../01-business/community-platform-roadmap.md) — the Sprint 0 ask that produced this README and the planned-scaffolds list.
- [`docs/02-business-processes/decision-batch-process.md`](../../../02-business-processes/decision-batch-process.md) — how runbooks that codify a decision relate to ADRs (ADR first, runbook second).
- [`.claude/CLAUDE.md` §5](../../../../.claude/CLAUDE.md) — small-PR rule (≤ 400 lines, ≤ 5 files) applies to runbook PRs too.
