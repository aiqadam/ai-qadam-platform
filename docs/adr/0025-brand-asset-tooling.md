# ADR-0025: Brand-asset tooling — where assets live and who edits them

## Status
Accepted, 2026-05-21

> Accepted by Viktor (PM) on 2026-05-21 via the [decision-batch process](../02-business-processes/decision-batch-process.md). Unblocks F-S0.7 (operator playbook) and F-S0.9b (real brand-asset library). Zero new spend — Tier 1 stays in the existing git repo; Tier 2 lives in the already-deployed Directus instance.

## Context

[`marketing-and-pr-playbook.md` §15](../02-business-processes/marketing-and-pr-playbook.md#15-brand-assets--ai-design-pipeline) commits us to: Viktor as human-in-loop reviewer for every AI-generated asset, country leads producing event-specific assets (event photos, social cards), one `marketing_assets` library, and a public `/press` page with downloadable logo pack + bios + fact sheet.

What is **not yet decided** is where the assets physically live, who has write access, and how Viktor's approval gate is enforced. §15.3 explicitly defers this: "Lives in Directus (`marketing_assets` collection) so country leads can self-serve OR in object storage (S3-compatible) with Directus tracking metadata. Decision: Sprint 0.9."

Constraints inherited from the rest of the stack:
- Logos already live in [`apps/web/public/brand/`](../../apps/web/public/brand/) (per playbook §15.2). Removing them breaks the running web app.
- We have Directus deployed with built-in file storage on the host's local disk, backed up by restic to Cloudflare R2 ([ADR-0017](./0017-backup-architecture.md)).
- We have **no** S3-compatible storage stood up for application files. Cloudflare R2 is configured only for backups; reusing it for application files conflates two failure domains.
- We are on a **single-VM Coolify** host (per [community-platform-roadmap §7 Sprint 0.1](../01-business/community-platform-roadmap.md)). Disk is finite (~80 GB) but ample for marketing-asset volumes for years.
- Country leads are **not** given git access (per [ADR-0021 §2](./0021-rbac-manifest.md) — they live in Authentik groups, not GitHub). Whatever host we pick must be reachable through Directus admin UI or workspace UI.
- Notion was raised in the original roadmap (§7 Sprint 0.7) as a possible operator-playbook host. It carries similar properties to Directus for asset management (uploads, comments, gallery view).

This ADR closes the question.

## Decision

**Two-tier scheme** keyed by asset class. The classification is the load-bearing decision; the storage choice follows from it.

### Tier 1 — load-bearing brand assets (logos, favicons, brand mark)

**Stay in git** at [`apps/web/public/brand/`](../../apps/web/public/brand/). Edited only by engineers via PR. Versioned with the codebase. Read directly by the web build.

Scope (exhaustive):
- AI Qadam wordmark (light + dark SVG)
- AI Qadam mark (light + dark SVG)
- Favicon set (16, 32, 180, 192, 512 PNG + ICO)
- Brand color tokens (already in `apps/web/src/styles/`, not duplicated here)

Why: these are referenced by HTML in production. A breakage means the site looks broken. Country-lead self-serve here would mean a country lead can break the global brand by uploading the wrong file — unacceptable trade-off for a no-recurring-change asset class.

### Tier 2 — produced brand assets (social cards, event hero images, photos, video, press-kit PDF)

**Live in Directus `marketing_assets` collection** with files stored in Directus's built-in file storage on the host's local disk. Directus metadata captures category, event linkage, country scope, status (`draft | pending_review | approved | archived`), uploader, and approver. The public `/press` page reads from the same collection filtered to `status=approved AND visibility=public`.

Scope (exhaustive):
- Social card templates + per-event renders (`event-card`, `speaker-spotlight`, `quote-card`, `recap-card`)
- Event photo libraries (one folder/tag per event)
- Speaker spotlight assets
- Sponsor logo placements (sponsor-provided sources + AI-Qadam-composed variants)
- Video files (event recaps, speaker clips)
- Press kit (founder/COO headshots, fact sheet PDF, press-pack ZIP)
- Quarterly digest PDFs (per [playbook §14](../02-business-processes/marketing-and-pr-playbook.md#14-quarterly-sponsor-digest-specification))

Why: country leads can upload event-day photos directly via Directus admin without touching git or talking to engineering. Viktor reviews via a Directus "Pending Review" filter view — his approval consists of flipping `status: pending_review → approved`. The `/press` page automatically updates.

### Approval workflow

The `marketing_assets.status` field enforces Viktor as gatekeeper:

```
draft (uploader)
   │
   │ uploader sets status=pending_review
   ▼
pending_review (Viktor / super_admin only)
   │
   ├─► approved  (visible on /press and to consumers per visibility scope)
   │
   ├─► archived  (retained but hidden; used for superseded assets)
   │
   └─► back to draft (with required comment field)
```

Directus permission policies (per [ADR-0021 §4.1](./0021-rbac-manifest.md)):

| Role | Create asset (draft) | Submit for review | Approve | Read approved | Read all |
|---|---|---|---|---|---|
| `country_lead` (own country) | ✓ | ✓ | ✗ | ✓ | own country only |
| `organizer` (own country) | ✓ | ✓ | ✗ | ✓ | own country only |
| `super_admin` (Viktor) | ✓ | ✓ | ✓ | ✓ | ✓ |
| public web (anonymous) | ✗ | ✗ | ✗ | ✓ (subset: visibility=public) | ✗ |

Approval mutates one field; no separate review queue table needed. The workspace dashboard (Sprint 2.4) surfaces a "Pending review (N)" tile that links to the filtered Directus view.

### Storage backend (mechanics)

Directus file storage stays on the **host local disk** under `/data/coolify/directus/uploads/` (already the deployed configuration). Backed up daily by the existing restic schedule (ADR-0017). No S3-compatible application bucket is provisioned in Phase 1.

**Migration trigger:** when total `marketing_assets` storage exceeds **5 GB**, migrate Directus file storage to Cloudflare R2 (separate bucket from backups: `aiqadam-marketing-assets`). Until then, local disk is simpler and cheaper. The 5 GB number is chosen because (a) it matches Cloudflare R2's free-tier monthly write floor, and (b) at our event cadence (~2 events/month × ~50 photos × 3 MB = ~300 MB/month) we reach 5 GB at ~17 months — plenty of warning to schedule the migration calmly.

### What we are NOT doing

- **No Notion.** Notion was a candidate as a marketing wiki; we keep Notion off the supported-systems list. The operator playbook (S0.7) lives in markdown in this repo or in Directus, not Notion. (Open ADR-0033 if a future case for Notion appears.)
- **No separate file-CDN.** Cloudflare in front of the host already caches public assets; a dedicated CDN bucket is overkill at Phase 1 volume.
- **No "Figma source of truth" for production assets.** Figma is acceptable as a designer's working surface, but the production asset is the file in Directus. Avoids the common drift where Figma says A and the file shipped says B.
- **No asset-versioning beyond Directus's built-in revisions.** Approved assets supersede previous approved assets by replacement; the previous version flips to `status=archived`. Country leads who want true version history use their own working drafts.

## Rationale

### Why a two-tier scheme instead of one host for everything

A single-host approach forces a bad trade-off:

- **All in git** → country leads cannot self-serve (no git access by design per ADR-0021).
- **All in Directus** → load-bearing logos depend on a service uptime that the build cannot afford to depend on. A Directus outage during a `pnpm build` would fail the build. Logos must be reachable at build time, full stop.

The two-tier scheme matches the storage to the constraint:
- Logos = build-time dependency = git.
- Produced assets = runtime dependency + self-serve target audience = Directus.

### Why Directus's built-in file storage instead of standing up MinIO

MinIO would be the "proper" S3-compatible application file store and would let us share a backend between marketing assets, user uploads, and future scopes. But:

- We have no other application-file-storage need today.
- MinIO adds an operational surface (one more service to monitor, back up, secure).
- Directus's built-in storage is already deployed, already backed up by restic, and already integrated with Directus's permission policies.
- The migration to R2 at 5 GB is straightforward (Directus supports R2/S3 backends via env var change + one-time `rclone copy`).

When MinIO or R2 is needed for a second use case, this decision is revisited as part of that ADR, not this one.

### Why Viktor remains the gatekeeper instead of "country leads self-publish"

Playbook §15.1 puts Viktor in the loop for every AI-generated asset because:

- Brand consistency on AI-generated work is genuinely fragile (faces, fonts, tone).
- Country leads have local-cultural judgment but not necessarily brand-consistency-on-AI judgment.
- The cost is low (Viktor reviews ~10 assets/week in steady state).
- The reverse (country leads publish, Viktor cleans up) is much higher cost because users see the bad asset in the meantime.

The approval workflow makes the gate explicit in the data model — not just a social agreement — so the rule is enforced even when Viktor is offline (assets stay in pending_review, do not appear on `/press`).

### Why local disk now, not R2 from day one

Two reasons:

1. **Failure domain separation.** Cloudflare R2 hosts our backups (ADR-0017). If we put marketing-asset application traffic on R2, a Cloudflare incident becomes both a backup-restore and a website-serving incident. The 11-nines durability claim does not protect against availability incidents.
2. **Cost honesty.** R2 is free-tier-comfortable for our volumes, but moving production-serving traffic there carries CORS configuration, signed-URL semantics, and DNS proxy decisions. Until we need R2's properties (egress reduction, geo-distribution), local disk is one less moving part.

The 5 GB trigger flips both of these — at scale, the local-disk constraint dominates the failure-domain concern, and R2's properties become valuable.

## Consequences

- ✅ Country leads can upload event photos / sponsor logos / event-day social cards via Directus admin within minutes of an event ending. No engineer touch.
- ✅ Viktor's brand-consistency gate is enforceable: an unapproved asset is invisible on `/press` and untemplated in cabinets, by data-model constraint.
- ✅ Logos cannot be accidentally broken by a country lead — they are git-tracked and require an engineer PR.
- ✅ One backup pipeline (restic) covers both logos (via repo backups) and produced assets (via Directus file storage backups).
- ✅ Migration to R2 is a planned future event with a clear trigger, not an open question.
- ⚠️ **Two hosts to know about.** Documentation in `docs/runbooks/brand-asset-production.md` (Agent-Marketing, Sprint 0.9) must explain "logos = git, everything else = Directus" plainly.
- ⚠️ **Pending-review queue must not become a stale-review queue.** Workspace dashboard tile (Sprint 2.4) needs an SLA indicator; if Viktor has > 7 days of backlog, flag visibly. Risk noted in [roadmap §6 risk #5](../01-business/community-platform-roadmap.md#6-behavioral-risks--mitigations).
- ⚠️ **No multi-step approval.** A country-lead's photo of a sponsor logo at an event does not get sponsor-approval before publishing on `/press`. If a sponsor objects post-hoc, the asset goes back to `archived`. Acceptable risk at Phase 1 (one-step approval); revisit when we have a sponsor cabinet (Sprint 3.2) able to surface a "report this asset" action.
- 📝 The 5 GB migration trigger should be monitored in observability (Sprint 0.4) — emit a metric `marketing_assets.bytes_total` weekly.
- 📝 Press-kit PDF is generated externally today; future ADR may automate from Directus contents.

## Updates / amendments

- 2026-05-20: Initial draft (Proposed). Awaiting decision-batch review.

## References
- [`docs/01-business/community-platform-roadmap.md` §7 Sprint 0.7 + 0.9 + 0.12](../01-business/community-platform-roadmap.md) — the items this unblocks
- [`docs/02-business-processes/marketing-and-pr-playbook.md` §15](../02-business-processes/marketing-and-pr-playbook.md#15-brand-assets--ai-design-pipeline) — production pipeline + guardrails this ADR makes operable
- [`docs/02-business-processes/decision-batch-process.md`](../02-business-processes/decision-batch-process.md) — how this Proposed status flips to Accepted
- [ADR-0017 — Backup architecture](./0017-backup-architecture.md) — why R2 is a backup target, not an application target (today)
- [ADR-0021 — RBAC manifest](./0021-rbac-manifest.md) — country-lead permission boundaries this approval workflow inherits
