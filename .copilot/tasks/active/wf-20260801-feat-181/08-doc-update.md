# 08 — Doc Update: FR-AUTH-006 (Temporary account upgrade)

Agent: DocWriter (Orchestrator-performed, per this workflow's resume instructions)
Workflow: wf-20260801-feat-181
Branch: feature/FR-AUTH-006-temp-account-upgrade

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-AUTH-006.md` | frontmatter `status` | `Planned` → `Implemented`. All 8 ACs checked `[x]` after live verification (see below) — none left unchecked, since the entire mechanism (API surface, `callback()` branch, email replace in both Authentik and Directus, points accrual, leaderboard appearance, profile access, AC-7/AC-8 error paths) is genuinely complete and live-confirmed, and no sub-piece (Twenty CRM sync, bot-side `/upgrade`) is in this FR's own scope — those were correctly resolved to "no code needed"/"future FR-BOT-002 PR 6/6" respectively during RequirementAnalyst's validation, not deferred incomplete work. |
| `docs/03-requirements/FR-AUTH-006.md` | new `### Live verification` subsection under Acceptance criteria | Documents the Orchestrator's live end-to-end verification run (10 fresh temp-user round trips against real local Authentik+Directus+Mailpit+Postgres) and its cleanup, with a pointer to the full transcript. |
| `docs/03-requirements/requirements-registry.md` | row 57 (`FR-AUTH-006`) | Status column `Planned` → `Shipped`. |
| `docs/04-development/architecture/auth-architecture.md` | New `### 6.10 Temporary-account upgrade (FR-AUTH-006)`, inserted after §6.9's own content and before the `## 7. Branding Authentik` divider; one new row in the `## 10. Pointers into the code` table | Documents the upgrade mechanism's shape (email-patched-early per Finding #0, pk-correlation not token-in-`next`, the race-condition reorder fix) at a level matching §6.9's own style — enough for a future engineer to understand the design without re-reading the task directory. Also documents a genuinely new, non-obvious local-dev-testing gotcha discovered only during this workflow's own live verification: Authentik's per-Brand cookie scoping means a naive same-script magic-link-click-then-authorize round trip re-prompts for login locally (different cookie-scope origins for the magic-link Brand vs. the default Brand), with the working fix (rewrite only the authority of the `/authorize` redirect to the magic-link Brand's origin, `--host-resolver-rules` instead of an `/etc/hosts` edit). This is durable operational knowledge for any FUTURE agent needing to live-verify an Authentik-session-dependent flow locally — it was non-obvious and cost real iteration to discover in this session, so it is recorded here rather than left to be rediscovered. |
| `apps/api/src/modules/auth/upgrade-intent.schema.ts` | header comment | Corrected the stale design description flagged by `06-test-strategy.md` (TestStrategist explicitly noted this as a documentation-debt item, not a test target): the comment described the originally-sketched token-round-tripped-through-`next` correlation mechanism, which CodeDeveloper's pass superseded with `authentikUserPk`-based correlation (per `02-impact-analysis.md`'s Finding #0 investigation). The comment now describes the actual shipped mechanism and explicitly documents the correction with a pointer to the workflow's own finding, matching `upgrade.service.ts`'s own module-doc style. |

## Documents Not Updated (considered, no change needed)

| Document | Why not touched |
|---|---|
| `docs/04-development/architecture/architecture.md` | Same precedent as FR-AUTH-004's own doc-update pass: no generic env-var reference table exists there to extend, and no new env var was introduced by this FR (TTL is a code constant, per `03-code-summary.md`'s Key Design Decision #5). |
| `docs/adr/` (new ADR) | Same reasoning as FR-AUTH-004: the design decisions here (email-patch-before-verification, pk-correlation) were forced by Authentik's actual, non-negotiable API behavior (no target-email override, no caller-supplied redirect state) rather than a considered choice among viable alternatives — operational/mechanical knowledge, not an ADR-shaped decision. `auth-architecture.md` is the correct home, per the same reasoning FR-AUTH-004's own doc-update used. |
| `apps/api/.env.example` | No new env var introduced by this FR — confirmed via `03-code-summary.md`'s Key Design Decision #5 (`UPGRADE_INTENT_TTL_MS` is a module-level code constant, not an env var) and independently re-confirmed via `grep` for `UPGRADE` in `.env.example` (zero matches expected, zero found). |
| `docs/api/` (OpenAPI manual supplement) | Same precedent as FR-AUTH-004: `POST /v1/internal/telegram/upgrade-temp` is a standard NestJS-decorated route; no manual OpenAPI supplement exists for any sibling `TelegramInternalController` route either. |
| `docs/04-development/standards.md` | No new coding convention introduced — `03-code-summary.md`'s "Architecture Rule Compliance" section confirms adherence to (not extension of) existing rules (Zod-at-boundary, custom typed errors, Drizzle-only, no cross-schema queries). |
| `docs/04-development/security/security.md` | No new platform-wide security *rule* introduced. The email-collision TOCTOU handling and the `is_temporary`-flip-after-successful-upsert reorder are FR-specific mitigations, documented in `04-security-review.md` and now pointed to from `auth-architecture.md` §6.10, not new baseline rules for the whole platform. |
| `docs/runbooks/` | No new *operational* runbook scenario beyond what `auth-architecture.md` §6.10 now documents inline, matching §6.9's own precedent of inline documentation over a separate runbook file for an auth sub-flow. |
| `packages/shared-types/README.md` | No new shared-types schema introduced — `upgradeTempBodySchema` is defined inline in `upgrade.service.ts`, matching every sibling `TelegramInternalController` route's own convention (confirmed by `02-impact-analysis.md`'s Shared Types section: `packages/shared-types` is an unused placeholder in this codebase). |
| `docs/04-development/design-system/Design system for AI agents/readme.md` block catalogue (`docs/04-development/architecture/blocks.md`) | No new UI block — this FR ships zero `apps/web`/`apps/web-next` changes (confirmed by `02-impact-analysis.md`'s Frontend section: the `next` redirect resolves to the existing `postLoginRedirectUrl` default, not a new page). |
| `docs/02-business-processes/uat/` (any BP file) | No `business_process` link applies — `01-requirement-validation.md`'s Gate Result explicitly states `business_process` is left unset because no existing BP (including BP-UAT-009) fits this FR's actual mechanism (account-state mutation + email replace + points-eligibility unlock, not a sign-in-UI variant). This is RequirementAnalyst's own considered judgment, not an oversight — no BP file to update, and Step 13 (post-merge UAT re-verification) does not apply to this workflow. |

## Gate Result

```yaml
gate_result:
  status: passed
  summary: >
    FR-AUTH-006's status flipped atomically in both required locations
    (FR-AUTH-006.md frontmatter: Planned->Implemented, all 8 ACs checked
    after live verification; requirements-registry.md row 57:
    Planned->Shipped). No sub-piece was silently marked complete: Twenty
    CRM sync was correctly resolved to "no code needed, retired per
    ADR-0033" during RequirementAnalyst's validation (not a deferred
    gap), and the bot-side /upgrade command is explicitly out of this
    FR's scope (future FR-BOT-002 PR 6/6) per the task brief itself --
    both are disclosed in FR-AUTH-006.md's existing text, not hidden.
    upgrade-intent.schema.ts's stale header comment (flagged by
    TestStrategist as a documentation-debt item, not a test target) is
    corrected to describe the shipped authentikUserPk-correlation
    mechanism instead of the superseded token-in-next sketch.
    auth-architecture.md gains a new SS6.10 documenting the upgrade
    mechanism's forced design decisions (email-patched-early,
    pk-correlation, the race-condition reorder) at the same level of
    detail as SS6.9's own precedent, PLUS a genuinely new, non-obvious
    local-dev-testing gotcha this workflow's own live verification
    discovered (Authentik's per-Brand cookie-scope split breaking a
    naive same-script magic-link-click-then-authorize round trip
    locally, with the working fix) -- durable knowledge for any future
    agent needing to live-verify an Authentik-session-dependent flow,
    previously undocumented anywhere in this repo. business_process
    confirmed correctly unset (no BP fits this FR's mechanism, per
    RequirementAnalyst's own explicit judgment) -- Step 13 does not
    apply. No env var, shared-types, OpenAPI-supplement, ADR, or UI
    block-catalogue change needed -- all confirmed and recorded with
    reasoning, not silently skipped.
  findings:
    - "No inconsistencies found between the new auth-architecture.md SS6.10 content and SS6.9 -- SS6.9 (magic-link sign-in) and SS6.10 (temp-account upgrade) cross-reference each other (SS6.10 explicitly reuses SS6.9's Brand/Host-header mechanism rather than re-explaining it) without duplicating content."
    - "upgrade-intent.schema.ts's corrected header comment was independently re-verified against the actual shipped code in upgrade.service.ts (resolvePendingUpgrade/commitUpgrade's real correlation logic) before writing -- the correction describes real, traced behavior, not an assumption."
    - "GitHub project sync (scripts/sync-github-project.sh --ref FR-AUTH-006 --status implemented) to be run at Step 11.5/12.5 per protocol.md's standard trigger points -- not run at this doc-update step per the documented convention (sync happens at PR/merge time, not doc-write time)."
next_agent: QualityGate
```
