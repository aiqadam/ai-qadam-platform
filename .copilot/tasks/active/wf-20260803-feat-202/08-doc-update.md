# Doc Update: FR-EVT-007 Phase 1 — Data Model

**Workflow:** wf-20260803-feat-202  
**Agent:** DocWriter  
**Date:** 2026-08-03  
**Requirement:** [FR-EVT-007](../../../docs/03-requirements/FR-EVT-007.md)  
**Code Summary:** [03-code-summary.md](03-code-summary.md)  
**Test Results:** [07-test-results.md](07-test-results.md)

---

## Documents Updated

| Document | Section | Change Description |
|----------|---------|-------------------|
| [requirements-registry.md](../../../docs/03-requirements/requirements-registry.md) | FR implementation order table, row #50 | Status changed from "Planned" to "In Progress" (Phase 1 complete, Phase 2+ pending) |
| [FR-EVT-007.md](../../../docs/03-requirements/FR-EVT-007.md) | YAML frontmatter | `status: Planned` → `status: In Progress` |
| [workspace-state.md](../../../.copilot/context/workspace-state.md) | Top entry | Added FR-EVT-007 Phase 1 completion summary with workflow link, GitHub issue link, implementation details, and phase status |

### Rationale for "In Progress" Status

FR-EVT-007 is split into 3 phases:
- **Phase 1 (this PR):** Directus schema only — topics collection, event_topics M2M junction, member_interests.topic FK (nullable). ✅ Complete.
- **Phase 2 (next PR):** Run backfill script, update API/Bot code to read/write `topic` FK, verify zero NULL values.
- **Phase 3 (final PR):** Drop `member_interests.topic_tag` column, make `topic` NOT NULL, complete API/Bot/Web integration.

"Shipped" status is reserved for fully-complete requirements. Since only Phase 1 is complete and the feature is not yet usable (no API endpoints, no Bot commands, no Web UI), "In Progress" is the correct status.

---

## Documents Not Updated

| Document | Reason |
|----------|--------|
| [architecture.md](../../../docs/04-development/architecture/architecture.md) | Architecture.md focuses on module boundaries, stack, and high-level system shape. It does not enumerate individual Directus collections. The new `topics` and `event_topics` collections are part of the existing Directus schema and fit within the documented data ownership model ("Directus CMS — NestJS reads via Directus API"). No update needed. |
| ADR (new) | **Considered but deferred to Phase 3.** The phased migration strategy and application-layer unique constraint approach are significant architectural decisions, but: (1) The strategy is thoroughly documented in [03-code-summary.md](03-code-summary.md) §Key Design Decisions; (2) This is only Phase 1 of 3 — better to write the ADR when the full pattern is complete and we have concrete evidence from all 3 phases; (3) If the pattern proves valuable for other multi-phase migrations, an ADR can be written retrospectively (ADRs are append-only, retroactive ADRs are allowed per architecture.md §Architecture Decision Records). |
| [standards.md](../../../docs/04-development/standards.md) | No new coding conventions introduced. The idempotent `seed_topic()` pattern in bootstrap.sh follows existing `seed_country()` / `seed_type()` conventions (GET-before-POST check). No change needed. |
| [security.md](../../../docs/04-development/security/security.md) | No new security rules or patterns. Multi-tenancy scoping via `topics.country` FK follows existing architecture (documented in architecture.md §Multi-tenancy implementation). SecurityReviewer verified tenant isolation in [04-security-review.md](04-security-review.md). No change needed. |
| Module READMEs | No API module changes in Phase 1. Schema-only changes in Directus don't affect existing module boundaries. Directus collection documentation lives in Directus Admin UI (auto-generated schema docs), not in repo READMEs. |

---

## ADR Consideration Details

### Candidate ADR Topics from Phase 1

1. **Phased migration strategy** — Split FR-EVT-007 into 3 PRs (schema → backfill → cleanup) rather than one monolithic change
2. **Nullable FK for gradual migration** — `member_interests.topic` is nullable in Phase 1, allows existing `topic_tag` column to remain until Phase 3
3. **Application-layer unique constraint** — `(slug, country)` uniqueness enforced via GET-before-POST check in bootstrap.sh + API validation in Phase 2, not via Postgres UNIQUE index

### Why Deferred

- **Pattern is incomplete:** Phase 1 creates the nullable FK and keeps `topic_tag`; Phase 2 runs the backfill; Phase 3 drops `topic_tag` and makes `topic` NOT NULL. The full pattern isn't visible until Phase 3 completes.
- **Already well-documented:** [03-code-summary.md](03-code-summary.md) §Key Design Decisions has 6 sections covering rationale, alternatives considered, and compliance checks. An ADR would duplicate this without adding new insight at this stage.
- **Retroactive ADR is acceptable:** Per architecture.md, "ADRs are append-only. Superseded ADRs are marked as such, not deleted." Retroactive ADRs documenting patterns proven over multiple PRs are allowed. If Phase 2/3 surface additional insights or if this pattern becomes a template for other multi-phase migrations, an ADR can be written then.

### Suggested ADR Title (if written in Phase 3)

> **ADR-00XX: Phased schema migration strategy with nullable FK transition period**
>
> **Context:** Complex schema changes that affect existing data and multiple modules (API, Bot, Web) are risky to ship as one monolithic PR. Breaking changes to API surfaces require coordination with dependent services.
>
> **Decision:** For migrations affecting populated tables with foreign-key relationships:
> 1. Phase 1: Add new nullable FK column alongside old column (no breaking change)
> 2. Phase 2: Backfill new FK, update API/Bot code to prefer new FK over old column, verify zero NULL values
> 3. Phase 3: Drop old column, make new FK NOT NULL, complete API/Bot/Web integration
>
> **Consequences:** Lower risk, easier rollback, but requires 3 PRs instead of 1. Acceptable tradeoff for production-deployed systems.

---

## Related Documentation References

The following workflow artifacts contain detailed context for FR-EVT-007 Phase 1:

- **[01-requirement-validation.md](01-requirement-validation.md)** — Validated requirement text, checked against existing architecture
- **[02-impact-analysis.md](02-impact-analysis.md)** — Impact on 2 Directus collections, 3 API modules, coordination requirements
- **[05-migration-plan.md](05-migration-plan.md)** — Full schema DDL, seeding strategy, backfill script plan
- **[03-code-summary.md](03-code-summary.md)** — 6 key design decisions, architecture rule compliance checks, known limitations
- **[04-security-review.md](04-security-review.md)** — 4 invariants verified, tenant isolation confirmed, no secrets in diff
- **[06-test-strategy.md](06-test-strategy.md)** — Test rubric score 5, 3 test levels, AC coverage split across phases
- **[06-test-design.md](06-test-design.md)** — 27 test cases: automated schema checks, manual UI verification, backfill test plan
- **[07-test-results.md](07-test-results.md)** — 24/27 tests executed, 24/24 passed, Windows curl compatibility finding

---

## Gate Result

```yaml
status: passed
agent: doc-writer
timestamp: "2026-08-03T00:00:00Z"
attempt: 2
summary: "Requirements registry + FR-EVT-007.md + workspace-state.md updated to 'In Progress' status; architecture.md unchanged (collections not enumerated); ADR deferred to Phase 3 (pattern incomplete, already well-documented in code summary)"
output_file: ".copilot/tasks/active/wf-20260803-feat-202/08-doc-update.md"
```

### Gate Pass Criteria Met

✅ **All required documentation updated correctly** — Requirements registry, FR-EVT-007.md, and workspace-state.md status reflect Phase 1 completion and ongoing Phase 2/3 work  
✅ **No duplication** — No redundant information added; ADR deferred to avoid duplicating code-summary content  
✅ **No unaffected content altered** — architecture.md left unchanged (high-level, doesn't enumerate collections); standards.md unchanged (no new patterns); security.md unchanged (existing tenant-isolation rules apply)

---

## Retry History

**Attempt 1 (failed):** QualityGate Check 6 (Context-Update Check) failed — workspace-state.md was not modified. Requirements-registry.md and FR-EVT-007.md were updated correctly, but workspace-state.md entry was missed.

**Attempt 2 (this attempt):** Added workspace-state.md entry following the established pattern provided in 09-quality-gate.md Finding 1. Entry includes workflow link, GitHub issue link, implementation details (topics collection, event_topics M2M junction, member_interests.topic nullable FK, 8 starter topics per country), phase status, and test results summary (168 lines added, 24/24 tests passed).  
✅ **Rationale documented** — Justification provided for every "not updated" decision in §Documents Not Updated table above

---

## Next Steps (Phase 2)

When Phase 2 (backfill + API/Bot integration) is implemented in a future workflow:

1. **Run backfill script** — Execute `infrastructure/directus/backfill-member-interests-topic.sh`, verify orphaned count = 0
2. **Update API endpoints** — 3 endpoints in `apps/api/src/modules/users/` (or equivalent) to read/write `member_interests.topic` FK instead of `topic_tag`
3. **Update Bot commands** — `/interests` command in `apps/bot/src/handlers/` to use new API shape
4. **Verify zero NULL values** — Confirm all `member_interests.topic` rows are populated before Phase 3
5. **Update this doc** — When Phase 2 PR merges, update requirements-registry.md again (keep "In Progress" until Phase 3)
6. **Consider ADR** — If Phase 2 surfaces new insights about the phased-migration pattern, draft ADR-00XX per §ADR Consideration Details above
