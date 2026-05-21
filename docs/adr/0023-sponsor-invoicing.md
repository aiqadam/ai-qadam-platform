# ADR-0023: Sponsor invoicing — billing flow, currency, and tax handling

## Status
Accepted (Phase 1 only), 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../decision-batch-process.md), constrained by a zero-recurring-spend filter: **Phase 1 (manual + Directus status) is Accepted; Phase 2 (Stripe) and Phase 3 (local-portal integration) remain Proposed and revisit when their stated triggers fire.** The cabinet UX (Sprint 3.5 partner cabinet) reads `sponsor_contributions.status` regardless of which phase is live, so this scope cut doesn't block downstream work.

## Context

Sponsor revenue is named in [`marketing-and-pr-playbook.md` §3.5](../marketing-and-pr-playbook.md#35-sponsorship-tiers) as Bronze/Silver/Gold/Platinum. ADR-0033 reframes sponsors as `companies WHERE is_sponsor=true` with the cabinet at F-S3.5 the operator surface. What is NOT yet decided: how the sponsor pays.

[`community-platform-roadmap.md` §10](../community-platform-roadmap.md) lists "invoicing decision" as a Sprint-3.2-blocking gate. ADR-0022 (country-lead compensation) presumes a revenue stream exists; this ADR defines how it actually flows.

Constraints:

- Sponsors are mostly Central Asia regional companies (tech firms, banks, telecoms in UZ/KZ/TJ initially) plus a small number of international (Yandex, regional offices of global firms).
- Each tenant country has its own VAT / tax / invoicing rules. UZ requires e-invoicing through the state portal for B2B above certain thresholds; KZ has e-faktura; TJ is loosest.
- We are not VC-funded; no expensive billing platform (Stripe Billing, Chargebee, etc.) is justified at <50 sponsors/year.
- Sponsor count today: zero. Year-1 target: 5–10. Year-2 target: 15–25.
- Per ADR-0032, no separate auth island for an invoicing tool. Whatever we pick either embeds in the partner cabinet or operators run it manually outside the platform.

## Options

### Option A — Manual invoices, no in-cabinet payment
Operator (country lead or COO) drafts an invoice in Google Docs/Sheets, sends as PDF via email; sponsor pays via local bank transfer or international wire. Receipt recorded manually in Directus.

- **Pros:** zero tooling cost; handles all currency + VAT + state portal requirements via local accountant; flexible.
- **Cons:** operator labor; no in-cabinet payment status (sponsor cabinet shows "invoice sent" / "paid" from manual flag); no automatic dunning.

### Option B — Stripe Invoicing
Stripe Invoicing (the free-to-send-paid-on-payment tier) issues invoices, accepts card payment, exposes API for status. Sponsor pays via card or ACH; we receive USD into a Stripe account; we send local-currency to country bank monthly.

- **Pros:** automatic invoice status; sponsor cabinet shows real "paid" state via Stripe webhook; reduced operator labor; international sponsors prefer cards.
- **Cons:** Stripe fees (~2.9% + $0.30 per card transaction; ACH 0.8%); not all regional sponsors will pay by card; converting USD→local currency adds another cut (~1.5% Wise) and currency risk; Stripe doesn't issue UZ/KZ-state-compliant tax invoices.

### Option C — Country-local invoicing software
Per-country invoicing via local-compliant tool: e.g., didox.uz for UZ, e-faktura for KZ. We integrate via their APIs (or operate manually).

- **Pros:** automatic state-portal compliance; sponsors get invoices in their local format; trusted by their accounting.
- **Cons:** per-country integration cost; no consolidated view; per-country Authentik auth island if we expose an admin UI (ADR-0032 violation).

### Option D — Hybrid: manual now, in-cabinet status via Directus, integrate Stripe + local later
Phase 1 (now → ~10 sponsors): Option A (manual). Operator generates invoice externally, marks `sponsor_contributions` row in Directus with `status=invoiced | paid | overdue`; partner cabinet (F-S3.5) reads status. Phase 2 (10–25 sponsors): add Stripe Invoicing for international + card-paying regional sponsors; keep manual path for state-portal sponsors. Phase 3 (25+): per-country local-compliant integration where the volume justifies the integration cost.

- **Pros:** no upfront tooling commitment; partner cabinet UX is the same across all phases (it reads `sponsor_contributions.status` regardless of source); integrations land when there's evidence they're worth it.
- **Cons:** Phase 1 is operator-labor-intensive; we accept that for now.

## Recommendation

**Option D (hybrid; manual + Directus status now)** with these specifics:

- **Schema** (Sprint 3.5 follow-up): add `sponsor_contributions` collection — fields: `sponsor_id` (FK companies), `event_id` (FK events, nullable for tier-not-event-specific), `tier`, `amount`, `currency`, `invoice_number`, `invoice_issued_at`, `paid_at`, `payment_method`, `status` enum (draft / invoiced / paid / overdue / written_off), `notes`. Partner cabinet reads this; no Stripe integration in Phase 1.
- **Invoice template:** Google Doc template Viktor maintains; one per country (UZ, KZ, TJ) with local VAT + bank details. PDF exported manually.
- **Local accountant per country** (separate budget line; ADR-0022 references this). The accountant ensures invoices meet local portal compliance + handles tax filing.
- **Bank account per currency:** USD operating account (Wise) for international sponsors + Stripe transitional Phase-2 inflow; UZS / KZT / TJS accounts in-country for regional sponsors; cross-currency conversion via Wise.
- **Trigger to advance to Phase 2:** sustained sponsor count ≥ 8 active simultaneously OR ≥ 5 international sponsors paying by card. Reviewed at quarterly board meeting.
- **Trigger to advance to Phase 3:** sustained per-country sponsor count ≥ 5 active simultaneously in a single country; that country gets a local-invoicing integration prioritized.

## Consequences

- Sprint 3.5 (partner cabinet) unblocks once this is Accepted — cabinet reads `sponsor_contributions.status`; no Stripe wiring needed for v1.
- Operator labor at Year-1 scale: ~30 min per invoice × ~10 invoices/year = ~5 hours/year. Acceptable.
- Year-2 Stripe integration is a future cabinet PR (separate ADR if material rework needed).
- Tax compliance is contractor-managed per country; we pay accountant fees as ops expense.
- Sponsor-facing UX in cabinet stays consistent across phases (status badges, not payment buttons in Phase 1).

## References

- [ADR-0022 — Country-lead compensation](./0022-country-lead-compensation.md) (Proposed) — references sponsor revenue
- [ADR-0024 — Future revenue phasing](./0024-future-revenue-phasing.md) (Proposed) — paid premium / hackathon-entry / mentorship revenue handles separately
- [ADR-0033 — Community member graph](./0033-community-member-graph.md) — `companies WHERE is_sponsor=true` data model
- [`marketing-and-pr-playbook.md` §3.5](../marketing-and-pr-playbook.md#35-sponsorship-tiers) — tier amounts
- [`community-platform-roadmap.md` §7 Sprint 3.5](../community-platform-roadmap.md) — partner cabinet feature
- [`community-platform-roadmap.md` §10](../community-platform-roadmap.md) — "invoicing decision" gate
