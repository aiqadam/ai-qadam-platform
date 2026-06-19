# Runbook: Operator cohort builder (`/workspace/members`)

**Audience:** country leads, super-admins, board members.
**Pre-reading:** [ADR-0033](../../adr/0033-community-member-graph.md) (member graph + cabinets); feedback-operators-never-touch-Directus-admin.
**Ships:** F-S3.2 cabinet #1.

## What this cabinet replaces

Before: operator pings Viktor on Telegram → "can you pull a list of CEOs in fintech?" → engineer writes SQL → CSV → manual paste into the dispatcher. Hours-to-days.

After: operator opens `/workspace/members` → filters → live audience preview → saves as named cohort. ~2 minutes. Cohort feeds the dispatcher directly (zero translation hop — same JSON filter shape).

## The 7 filter primitives (MVP)

| Primitive | Example | Notes |
|---|---|---|
| Country | `uz` / `kz` / `tj` / `xx` | Auto-injected per operator's country once S2.2 RBAC sync ships |
| Seniority | `ic` / `senior` / `lead` / `manager` / `director` / `vp` / `c_level` | Per ADR-0033 schema |
| Industry | "fintech" (free-text tag) | Matches `_contains` over the industry tag array |
| Interest | "LLMs" (free-text tag) | Joins via `member_interests.topic_tag` |
| Employer | "Yandex" (current employer name, fuzzy) | Joins via `member_employments` where `is_current=true` |
| Attended at least N events | 2 | Server-side `_count` aggregate on `registrations` |
| Consent purpose | `events` / `marketing` / `research` / `recruiting` / `sponsor_share` / `content` / `paid_premium` | Joins via `member_consents` with `revoked_at IS NULL` |

Combine multiple primitives → ANDed. Search box matches against name/email.

## 5 starter cohorts (build these first per onboarding deck)

Each is a named cohort with the filter shown. Open `/workspace/members`, set the filters, click **Save as cohort**, use the name below.

### 1. UZ Active Last 90d

**Filter:** Country=`uz` AND Attended at least 1 event (in last 90d).  
**Purpose:** Default audience for any UZ announcement. The "regulars".

### 2. Speaker Bench: LLM

**Filter:** Interest=`LLMs` AND consent purpose=`events` (so we can reach them).  
**Purpose:** First call for any LLM-flavored event. Pair with manual outreach.

### 3. Lapsed Regulars

**Filter:** Attended at least 2 events AND no event in 90d.  
**Purpose:** Win-back campaign cohort.

### 4. Sponsor-shareable Fintech UZ

**Filter:** Country=`uz` AND Industry=`fintech` AND Consent purpose=`sponsor_share`.  
**Purpose:** Audience slice that a fintech sponsor can see (aggregated only — see [Sponsor PII boundary](#sponsor-pii-boundary)).

### 5. Hackathon Ready

**Filter:** Interest=`hands-on-builder` AND Consent purpose=`research` (proxy for "willing to be matched").  
**Purpose:** Phase ζ.3 hackathon team formation pool.

## Cohort drift

Cohorts are SAVED QUERIES, not snapshots. The same cohort returns different members tomorrow if:
- New members join + match the filter
- Existing members revoke a consent the filter requires
- Members opt into the directory (`appear_in_directory=true`)

The cabinet shows `member_count_cached` (last snapshot) + a 7-day delta when you open a cohort's detail. If delta > 50% in either direction, investigate (usually an event campaign added new matches, or a consent migration removed some).

## Sponsor PII boundary

Per ADR-0033, **sponsors never reach `/v1/workspace/members` or read raw cohort rows**. They only see aggregated views (via Metabase per S2.4) or audience-scoped announcements (via the dispatcher with `partner_audiences` enforcement).

When a cohort is referenced from a `partner_audiences` row (cohort X → sponsor Y, purpose=`event_invite`), every sponsor-side access is audit-logged via `audit_events` once S2.5 ships.

## Cohort naming guidance

| Bad | Good |
|---|---|
| "cohort1" | "UZ fintech CEOs Q3" |
| "test" | "Lapsed UZ regulars (re-engagement Aug)" |
| "untitled" | "Hackathon ready — Phase ζ.3 pool" |

Format: `{audience description} {scope/date/purpose}`. The cohort list groups alphabetically — naming for findability beats naming for brevity.

## Adding a new filter primitive (engineer task)

If a new primitive is requested:

1. Add the field to the relevant collection in `infrastructure/directus/bootstrap.sh` (if needed).
2. Extend `apps/web/src/components/workspace/MemberDirectory.tsx` → `Filters` type + `buildFilter()` clause + `FilterBar` UI.
3. No API change required — `members.controller.ts` takes the filter object as-is and passes through to Directus.
4. Update the table in this runbook + the 5 starter cohorts if relevant.
5. Ship per the vertical-feature template.

## Querying lead-density-by-city (for country-expansion signal)

This is the marketing dashboard's job (S5.8). For an ad-hoc operator query, build a cohort: `Consent purpose=events AND no event attended yet` (proxy for "lead state"). Save as "UZ Leads {date}", check `member_count_cached`. Repeat per country. Cities with high counts but no events scheduled = country-expansion signal.

## When this runbook needs an update

- New filter primitive ships → add to the 7-primitive table
- ADR-0021 RBAC accepted + S2.2 RBAC sync ships → country auto-injection becomes real (drop the "once S2.2 ships" caveats)
- S2.5 audit module ships → uncomment the audit_events linkage notes
- F-S3.5 sponsor cabinet ships → cross-link the partner_audiences entitlement page
