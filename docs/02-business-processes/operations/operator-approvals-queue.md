---
type: operator-runbook
---

# Runbook: Operator approval queue (`/workspace/approvals`)

**Audience:** country leads, super-admins, board members.
**Pre-reading:** [ADR-0033](../../adr/0033-community-member-graph.md), [interaction-architecture.md](../../04-development/architecture/interaction-architecture.md).
**Ships:** F-S3.7 cabinet #4 (empty-shell v1).

## What this cabinet is for

The roadmap (§7 Sprint 3.7) names three sources that aggregate into this queue:

| Source | When operator approves | Lands with |
|---|---|---|
| **Sponsor onboarding** | A sponsor submits company info via the public funnel; an operator confirms the entry before it's promoted into `companies` with `is_sponsor=true`. | **F-S3.5** (sponsor cabinet) — adds `companies.onboarding_status` enum + the submission funnel. |
| **Speaker proposal** | A speaker submits an abstract via the public funnel; an operator accepts → event gets the speaker; rejects → polite decline email. | **F-S4.x** (speaker pipeline) — adds `speaker_proposals` collection. |
| **Operator-assisted Interaction** | The dispatcher marks an outbound message as `requires_operator_approval=true`; operator reviews the rendered email + recipient list + clicks Approve to send. | A dispatcher PR that adds the flag + `interactions.status='pending_approval'`. |

**None of these sources exists in the schema today.** v1 ships the cabinet shell + an empty `ApprovalsService.list()` that returns `{ items: [], sources: [...with ready=false] }`. The empty-state UI lists each source + the roadmap note, so an operator who navigates here sees what's coming.

## Wiring a new source

When you ship F-S3.5 / F-S4.x / the dispatcher flag, edit `apps/api/src/modules/workspace/approvals.service.ts`:

```ts
{
  kind: 'sponsor_onboarding',
  ready: true,   // ← flip
  note: '…',
  loader: async () => {
    // Query the source collection, map rows to ApprovalItem[]
    const rows = await this.directus.get(...);
    return rows.map((r) => ({
      id: r.id,
      kind: 'sponsor_onboarding',
      title: r.legal_name,
      submittedAt: r.date_created,
      summary: `${r.tier} sponsor · contact ${r.contact_email}`,
      href: `/workspace/partners/${r.id}`,
    }));
  },
},
```

That's the only change. The cabinet UI consumes the shape unchanged — items populate the queue, the empty-state copy hides itself once `items.length > 0`, and the "Roadmap" footer only lists sources still `ready: false`.

## Approve action

v1 has **no approve endpoint**. The cabinet renders items as plain links to the resource's own cabinet (e.g. sponsor onboarding → `/workspace/partners/[id]` once that ships, where the per-cabinet UI handles approve/reject with the right next-step).

When you wire a source, also wire the per-resource cabinet's approve flow. Keep "approve" co-located with the resource so the operator can see the full submission before deciding.

## Failure modes + recovery

### "Queue is always empty"
Expected today — all sources are `ready: false`. If a source has been wired but the queue is still empty, check:
1. The loader's filter — does the source collection actually have any rows in the pending state right now?
2. The loader returned an error — `ApprovalsService.list()` would propagate it as a 500. Look at the cabinet's error state (not the empty state).

### "Approval items disappear without me approving"
The loader is filter-based, not deletion-based. If a row's pending state flips externally (Directus admin, another operator), it falls out of the loader's filter and the queue updates on the next reload. Auto-refresh is not in v1; operator must reload the page.

### "I approved but the item still shows"
Browser cache or the loader's filter doesn't match the new state. Hard-reload the queue.

## Related

- `apps/api/src/modules/workspace/approvals.service.ts` — source registry + loader skeletons
- `apps/api/src/modules/workspace/approvals.controller.ts` — `GET /v1/workspace/approvals`
- `apps/web/src/components/workspace/ApprovalsQueue.tsx` — cabinet island
- `apps/api/test/approvals-service.spec.ts` — v1 empty-shell tests
- ADR-0033 — operators-never-touch-Directus-admin posture; this cabinet exists to keep approval flow out of Directus


## System requirements

| FR | Capability | Status |
|---|---|---|
| [FR-ADM-004](../../03-requirements/FR-ADM-004.md) | Approvals queue | Shipped |
| [FR-EVT-001](../../03-requirements/FR-EVT-001.md) | Event CRUD | Shipped |
| [FR-SPK-002](../../03-requirements/FR-SPK-002.md) | Speaker management | Shipped |
