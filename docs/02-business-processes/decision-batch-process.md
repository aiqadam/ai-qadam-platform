# Decision-batch process — weekly ADR review cadence

> **Status:** authoritative as of 2026-05-20.
> **Audience:** the PM (Viktor), agents drafting ADRs, anyone touching `docs/adr/`.
> **Companions:** [agent-prompts.md §0.1](../05-other/agent-prompts.md#01-canonical-documents--read-at-every-iteration), [community-platform-roadmap.md §7 Sprint 0.12](../01-business/community-platform-roadmap.md), [ADR-0001](../adr/0001-docs-live-in-claude-folder.md).

---

## 1. The one-paragraph version

Agents draft Architecture Decision Records (ADRs) in **Proposed** status as soon as they hit a question that does not have one right answer. Every Monday at 09:00 Tashkent time the PM reviews the open Proposed queue in one ~1-hour batch, marks each ADR **Accepted** / **Rejected** / **Revise**, and replies in the ADR's PR thread with the verdict. Agents check ADR status at the top of each loop iteration; downstream work blocked on a Proposed ADR skips until the ADR is Accepted.

The point: **close ~9 open decisions per hour of PM time** instead of stalling 7 parallel streams while the PM thinks one decision at a time.

---

## 2. Why this exists

We have ~19 open decisions ([community-platform-roadmap.md §10](../01-business/community-platform-roadmap.md#10-open-decisions-blocking-issues)) and 7 parallel agents shipping in [3 lanes](../01-business/community-platform-roadmap.md#25-execution-model--three-lanes). If every agent blocks on a synchronous Slack thread with the PM for each decision:

- The PM context-switches all day.
- Agents idle while waiting.
- Decisions get answered without comparable options on the table — whichever agent shouted first wins.

Batching solves all three. The PM sees 7–9 decisions in one sitting, each with options + recommendation + tradeoffs already framed. The agents are not blocking, they just skip the dependent item and pick the next one.

---

## 3. The lifecycle of one decision

```
┌──────────────┐
│ open question│
│ (agent hits  │
│  a fork)     │
└──────┬───────┘
       │
       │ Agent-Docs (or the originating agent
       │ tagging Agent-Docs) drafts an ADR
       ▼
┌──────────────┐
│  Proposed    │  Status set to "Proposed, <date>".
│              │  PR opened against main.
│              │  Auto-merge enabled — the ADR file
│              │  lands in main even at Proposed status;
│              │  downstream agents read the document,
│              │  see the status, and SKIP dependent
│              │  items until status flips.
└──────┬───────┘
       │
       │ Monday 09:00 Tashkent — PM batch review (~1 hour).
       │ PM reads the ADR, picks one of:
       │
       ├──────────────────┬──────────────────┬─────────────────┐
       ▼                  ▼                  ▼                 ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Accepted    │  │  Rejected    │  │  Revise      │  │  Deferred    │
│              │  │              │  │              │  │              │
│  PM edits    │  │  PM edits    │  │  PM leaves   │  │  PM edits    │
│  status to   │  │  status to   │  │  inline      │  │  status to   │
│  "Accepted,  │  │  "Rejected,  │  │  comments on │  │  "Deferred,  │
│  <date>".    │  │  <date>".    │  │  the doc;    │  │  <date>,     │
│  Comments    │  │  Comments    │  │  status      │  │  re-open by  │
│  any rider   │  │  why + the   │  │  stays       │  │  <trigger>". │
│  conditions. │  │  alternative │  │  Proposed.   │  │  Out of      │
│              │  │  to take.    │  │  Originating │  │  weekly      │
│              │  │              │  │  agent       │  │  queue until │
│              │  │              │  │  redrafts.   │  │  trigger.    │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │                 │
       │                 │                 │                 │
       ▼                 ▼                 ▼                 ▼
  Downstream         Originating         Originating       Pulled out
  agents read        agent re-opens      agent edits       of weekly
  the new status     the dependent       per comments      review until
  on next loop       item with the       in a new PR;      a re-open
  iteration and      alternative or      back to           trigger fires.
  proceed.           closes scope.       Proposed.
```

The PR for the ADR is **squash-merged to main as Proposed**. The status flip from Proposed → Accepted / Rejected / Revise / Deferred is a **separate small PR** (one-line status edit + amendment entry under "Updates / amendments"). That keeps the merged-Proposed step audit-traceable.

---

## 4. Who writes ADRs

**Default writer: Agent-Docs.** Agent-Docs owns `docs/adr/*.md` per [agent-prompts.md §1](../05-other/agent-prompts.md#1-the-7-streams).

When a non-Docs agent hits a question:

1. The agent opens a GitHub issue titled `[ADR-needed] <one-line>` tagging `@Agent-Docs` (a label, in practice the issue title triggers a GitHub Action that pings the human Agent-Docs operator slot — until that action lands, a manual `gh issue create` works).
2. Agent-Docs picks up the issue on its next loop iteration, drafts the ADR with options + recommendation + tradeoffs, and opens a PR.
3. The originating agent **skips** the dependent item this loop and picks the next eligible one.
4. After the ADR is Accepted, the originating agent picks the deferred item on a subsequent loop iteration.

If the question is **inside Agent-Docs scope** to begin with (RBAC manifest, cabinet routing, PII map, AUP, trust/safety policy), Agent-Docs writes it directly without an issue handoff.

---

## 5. The PM weekly batch — what it looks like

Every **Monday 09:00 Tashkent time**, the PM blocks ~1 hour on the calendar (recurring) and:

1. Opens [`docs/adr/`](../adr) on GitHub.
2. Sorts by "Status: Proposed". Reads each.
3. For each, comments on the merged-Proposed commit (or the originating PR if still open) with one of:
   - `ADR-XXXX = Accept (option B). Reason: <one line>.`
   - `ADR-XXXX = Accept (option B). Conditions: <list>.`
   - `ADR-XXXX = Reject. Take <option A> instead. Reason: <one line>.`
   - `ADR-XXXX = Revise. Inline comments above on §<n>.`
   - `ADR-XXXX = Defer. Re-open when <trigger>.`
4. The PM does **not** edit the ADR file directly during the review. Status flips and revisions are agent work (Agent-Docs opens the status-flip PR within 24 h of the review).

**Cadence:** weekly. If the open queue is empty, the PM cancels that week's slot. If the queue is > 12, an ad-hoc Wednesday slot is scheduled.

**Throughput target:** ~9 decisions per hour. Drawn from Sprint 0.12's stated goal of "first batch closes 9 of 19 open decisions in week 1 with ~1 hour PM time" — calibrated against early batches.

---

## 6. ADR template (canonical)

```markdown
# ADR-NNNN: <one-line decision>

## Status
Proposed, <YYYY-MM-DD>

## Context
What forced the decision. Cite the requirement (SECURITY.md §X, roadmap §Y, etc.).
Cite the prior state (existing code, prior ADRs) honestly.

## Decision
The thing we are deciding to do. Subsections per axis if needed.

## Rationale
Why this option over the obvious alternatives. Show the alternatives that were
considered, named, and rejected — future-us will reach for them otherwise.

## Consequences
- ✅ benefits we get
- ⚠️ trade-offs we accept
- 📝 follow-ups owed (with owner + rough timing)

## Updates / amendments
- <YYYY-MM-DD>: Initial draft (Proposed).
- <YYYY-MM-DD>: PM batch review — Accepted.

## References
- Roadmap §X
- SECURITY.md §Y
- Prior ADRs (XYZ)
```

The format mirrors [ADR-0017](../adr/0017-backup-architecture.md) (currently the most recent fully-shipped ADR) so reviewers see a consistent shape.

---

## 7. Status semantics — strict definitions

| Status | What it means | What downstream agents do |
|---|---|---|
| **Proposed** | Drafted, merged to main as a Proposed-status file. PM has not reviewed. | Read the document. **Do not act on it.** Skip dependent items. |
| **Accepted** | PM reviewed and approved. The ADR is now load-bearing. | Implement against it. Cite it in downstream PRs. |
| **Rejected** | PM reviewed and chose another option. The ADR's options/tradeoffs remain in the file as historical record; status line says "Rejected, <date>, took <alternative>". | Take the noted alternative. The originating agent does not re-implement against the rejected option. |
| **Revise** | PM wants changes; the proposal is close but not right. Status remains "Proposed (revising)" until a new draft. | Skip dependent items. Agent-Docs ships a revised draft. |
| **Deferred** | Decision is out of weekly queue until a trigger fires (e.g., "Re-open when Discourse is provisioned"). | Skip dependent items. Originating agent picks scope that does not depend on the decision. |
| **Superseded** | A later ADR replaces this one. Header line points to the successor. | Read the successor instead. |

**Never silent.** A merged ADR always carries a current status line. An agent that cannot find a status line treats the document as Proposed (default deny).

---

## 8. How agents check status

At the top of each loop iteration, the agent (after reading the canonical docs) runs the equivalent of:

```bash
grep -E "^Status$" -A1 docs/adr/*.md | grep -E "Accepted|Rejected"
```

…or in practice, reads the relevant ADR (named by sprint dependency) and inspects its `## Status` block. If the status is **not** Accepted and the work depends on it, the agent skips the dependent item and picks the next eligible one. The skip is logged inline in the loop status; no further action.

**Agent-Docs is the exception:** Agent-Docs may continue to draft *additional* ADRs while earlier ones are still Proposed. ADR drafts do not block other ADR drafts. Only **non-Docs work** blocks on ADR acceptance.

---

## 9. The first batch — Sprint 0.12 queue

The roadmap [§7 Sprint 0.12](../01-business/community-platform-roadmap.md) bundles a known-fixed set of nine ADRs for the first weekly batch:

| ADR | Topic | Why now |
|---|---|---|
| 0022 | Country-lead compensation model | Blocks Sprint 4.3 country-lead runbook + AUP. |
| 0023 | Sponsor invoicing | Blocks Sprint 3.2 sponsor cabinet (cabinet shows invoices). |
| 0024 | Future revenue phasing (when does the platform charge anything) | Strategic — informs sponsor pricing tiers in marketing playbook §3.5. |
| 0025 | Brand-asset tooling — where assets live (Directus / Notion / git) | Blocks Agent-Marketing Sprint 0.7 operator playbook (asset format depends on host). |
| 0026 | Telegram channel structure (one global / per-country / per-topic) | Blocks Sprint 5.5 bot v0 announcement targeting. |
| 0027 | Twitter / X presence (run vs not, who owns voice) | Marketing playbook §13 founder-led growth decision. |
| 0028 | First paid spend trigger (when do we start spending on ads) | Marketing playbook §4.3. |
| 0029 | RU voice owner (who voices the Russian copy variants) | Marketing playbook §13 + ux-and-content-guidelines.md §3 i18n notes. |
| 0030 | Photo consent (event-day photo handling) | Trust/safety + GDPR; gates Sprint 0.9 brand-asset library photo uploads. |

ADR-0031 (cabinet routing) lives in Sprint 3.1, not in this batch — by the time Sprint 3 starts, the cabinet sub-architecture warrants its own attention.

**Order Agent-Docs ships drafts in:** roughly the order above. Each ADR is its own PR (per [CLAUDE.md §5 small-PR rule](../../.claude/CLAUDE.md)). Drafts are Proposed; the first PM batch review (Monday 2026-05-25) flips them.

---

## 10. Failure modes + recoveries

| Failure | What happens | Recovery |
|---|---|---|
| PM misses a Monday slot | Queue grows. Two-week-old Proposed ADRs block more downstream work. | Agent-Docs surfaces "queue > 12, oldest > 2 weeks" in a status comment; PM schedules ad-hoc Wednesday. |
| Agent acts on a Proposed ADR | Downstream PR may need rewrite if PM rejects the proposal. | Code-review catches it: any PR citing an ADR must verify the ADR is Accepted (CI grep, future enforcement). For now, manual reviewer check. |
| PM says "I want to think about this for a week" | Status stays Proposed, agents keep skipping. | Acceptable for ≤ 2 weeks; beyond that the PM marks the ADR Deferred with a trigger. |
| Two ADRs conflict | Whichever lands Accepted first wins; the other is rewritten or rejected. | Agent-Docs flags conflicts at draft time in the §10 "Open sub-decisions" block of either ADR. |
| ADR contradicts an Accepted older ADR | New ADR is rejected unless it explicitly **supersedes** the old one. | The new ADR's status line says "Supersedes ADR-XYZ"; old ADR gets a Superseded status update PR. |

---

## 11. Why not async chat decisions

We considered: PM answers each question in chat as it arrives. We rejected that because:

- No options framing → PM is asked "what should we do?" rather than "pick between A and B with these tradeoffs".
- No durable record → future-us cannot reconstruct why we chose A.
- No batch focus → PM context-switches all day, gives weak answers, regrets later.

ADRs are durable, framed, and reviewable as a batch. The cost (one PM hour per week) is much less than the cost of unmade or undocumented decisions.

---

## 12. References

- [`docs/05-other/agent-prompts.md` §0.1, §2](../05-other/agent-prompts.md) — the canonical docs every agent reads, the cross-stream gates that hinge on ADR Acceptance.
- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 0.12, §10](../01-business/community-platform-roadmap.md) — the spec for this process and the queue of open decisions.
- [`.claude/CLAUDE.md` §11](../../.claude/CLAUDE.md) — commit + PR conventions.
- [ADR-0001](../adr/0001-docs-live-in-claude-folder.md), [ADR-0014](../adr/0014-lint-format-biome.md), [ADR-0017](../adr/0017-backup-architecture.md) — format reference.
- [ADR-0021](../adr/0021-rbac-manifest.md) — the first ADR this process governs.
