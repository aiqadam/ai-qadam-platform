---
code: FR-ADM-001
name: Operator dashboard and analytics
status: Shipped
module: Admin / Operator (ADM)
phase: Phase 1 (V1) / Rebuild Phase 2 (V2, Shipped)
---

## Description

The operator dashboard at `/workspace/dashboard` gives country leads and organizers a real-time view of their community's health: events, registrations, attendance rates, and CSAT scores. Super Admins can see cross-country aggregates.

## Users

Organizers, Country Admins (country-scoped); Super Admin (cross-country).

## Functional scope

1. **Route** — `/workspace/dashboard` (operator auth required, country-scoped).
2. **Metrics cards** — Per country: total events, total registrations, attended count, attendance rate (%), average CSAT score. Time window selector: 7 / 30 / 90 days.
3. **Cross-country view** — Super Admin sees a table of all countries with the same metrics side-by-side.
4. **API** — `GET /v1/workspace/dashboard/cross-country` — returns metrics per country for the requested window. Country admins receive only their own country; super-admins receive all.
5. **Charts** — (Optional V2 enhancement) Registration trend line per week. Not required for V1.

## Acceptance criteria

- [ ] A country admin sees only their own country's metrics.
- [ ] A super-admin sees metrics for all countries in the cross-country view.
- [ ] Changing the time window from 7 to 30 days updates all metric cards.
- [ ] Metrics are accurate: event count matches published events in the period; registration count matches confirmed + waitlist rows.
- [ ] An unsigned request to the dashboard API returns `401`.

## Notes

- V2 (web-next): shipped in RB-P2 (Rebuild Phase 2, `OperatorDashboard` block).
- `OperatorDashboard` island queries `GET /v1/workspace/dashboard/cross-country`; it does NOT query Directus directly.
