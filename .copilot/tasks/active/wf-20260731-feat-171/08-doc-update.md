# Documentation Update — FEAT-BOT-1 / FR-BOT-001 (wf-20260731-feat-171)

workflow: wf-20260731-feat-171
agent: DocWriter

---

## Documents Updated

| Document | Section | Change Description |
|---|---|---|
| `docs/03-requirements/FR-BOT-001.md` | YAML frontmatter | `status:` changed `Planned` → `Implemented`. Also added a new `business_process: —` field (was previously absent entirely — RequirementAnalyst's Step 1 pass did not set it). **Reasoning for `—`:** cross-checked `docs/02-business-processes/uat/registry.md` directly (read in full) — zero existing `BP-UAT-NNN` entries reference Telegram, the bot, or any bot-adjacent surface; this FR is the first piece of the bot track to ship any code. The only user-observable behavior this FR ships (`/start` → static welcome message) executes inside a real Telegram client, which this repo's Playwright/browser-based UATRunner tooling cannot drive — confirmed directly in `02-impact-analysis.md`'s E2E section language (paraphrased in the task brief as "Not applicable... a manual/scripted Telegram-bot smoke test against a deployed Coolify instance... at a later workflow step, not TestDesigner's Playwright scope"). Per `.copilot/schemas/protocol.md` §"Business-Process Linkage & Post-Merge UAT", `—` is correct "when genuinely not process-related" and is explicitly not to be forced. This is a deliberate "no BP-UAT exists yet, and the one behavior shipped isn't Playwright-testable anyway" call, not an oversight or a default. Net effect confirmed against `requirement-development.md` Step 13: this correctly skips the mandatory post-merge UAT re-verification step for this workflow (there is nothing in the registry to re-verify), and Step 11.4's GitHub Project sync will go straight to `agent-verified` rather than `implemented`. |
| `docs/03-requirements/requirements-registry.md` | FR implementation order table, row 55 (`FR-BOT-001`) | Status column changed `Planned` → `Shipped`. |

Both edits above are staged on disk together, per the workflow's atomicity rule (Step 9) — they were made as part of this single DocWriter pass so they can be committed as one commit.

## Documents Not Updated

| Document | Considered For | Why Not Updated |
|---|---|---|
| `docs/api/` | New endpoint `POST /v1/internal/telegram/lookup` — check whether a manual OpenAPI supplement needs updating. | Confirmed `docs/api/` contains only a `.gitkeep` placeholder (no manual supplement files exist there at all). Confirmed separately in `architecture.md:207` that "OpenAPI spec auto-generated from NestJS decorators + Zod schemas" is this repo's actual convention — the new `@Post('lookup')` route on `TelegramInternalController` follows that same decorator + Zod pattern (per `03-code-summary.md`'s `lookupUserBodySchema` / class-level `@UseGuards` description), so it is picked up by the existing auto-generation mechanism with no manual doc to hand-maintain. Nothing to change. |
| `docs/04-development/architecture/architecture.md` §"Bot architecture (Python)" (lines 256–282) | Whether the section needs updating now that real code exists in `apps/bot/` for the first time. | Read the full section directly. It already states `apps/bot/` is a git submodule pointing at `aiqadam/aiqadam-telegram-bot`, cites ADR-0034 as the rationale/source of truth, and shows a project layout (`handlers/`, `services/`, `middlewares/`, `keyboards/`, `states/`, `locales/`, `main.py`, `pyproject.toml`, `tests/`) that matches — file-for-directory — what `03b-code-summary-bot.md` reports was actually built (`src/handlers/`, `src/services/`, `src/middlewares/`, `src/keyboards/` (stub), `src/states/` (stub), `src/locales/`, `src/main.py`, `pyproject.toml`, `tests/`). The prose already correctly describes the shipped structure; no drift found. (Note: `01-requirement-validation.md` Completeness Issue #3 flagged a *different*, pre-existing staleness in this same file — an inconsistent "first-class Python package in the monorepo" characterization elsewhere alongside the "What runs on the host" list at line ~304 — but that staleness was already present before this workflow, is explicitly attributed to landing with PR #194 (submodule bootstrap, separate/already-merged), and is not something this FR's shipped scope introduced or is responsible for correcting.) |
| `docs/adr/0034-telegram-bot-and-sender.md` §"Sequenced PR plan" (Phase Bot-A table) | Whether shipping FEAT-BOT-1 corresponds to any listed line item (new-repo PR #2, or aiqadam-repo items A1–A6) that should be marked done. | Read the table in full and grepped the whole ADR file for `lookup` — zero matches. The Phase Bot-A table is scoped specifically to the **account-link (S5.5)** slice: new-repo PR #2 is "wire `/start` deeplinks (checkin/invite)" (a different `/start` behavior — deeplink payload parsing — not the static welcome-message smoke test FR-BOT-001 ships), and aiqadam-repo items A1–A6 are the telegram module skeleton, `link/start`/`link/confirm`, `tg_link_challenges`/DB columns, `/v1/telegram/audit`, the outbox/relay service, and the `TelegramAdapter` — all under the already-built `TelegramController`/`TelegramAuthGuard` surface (`Authorization: Bearer <service-token>`), not the `InternalAuthGuard`/`INTERNAL_API_TOKEN`-guarded `POST /v1/internal/telegram/lookup` this FR actually adds (per `01-requirement-validation.md` Completeness Issue #5, this FR deliberately uses the sibling-to-`upsert-temp-user` guard convention instead). FEAT-BOT-1 is the bot-bootstrap/scaffold-and-lookup slice, not a line item of the account-link PR plan — it doesn't cleanly map onto any row in this table, so nothing was checked off. Judgment call, flagged here per the task's explicit instruction rather than forcing a match. |
| `packages/shared-types/README.md` | New shared-types schema | Impact analysis confirmed no shared-types changes — API (TypeScript/Zod) and bot (Python/pydantic) schemas are maintained independently across the language boundary; no shared mechanism exists to update. Excluded per task instructions. |
| Any `docs/runbooks/*` | New operational scenario | No new operational scenario beyond what ADR-0034 already documents (Coolify deploy model, thin-bot credential boundary, long-polling process). Excluded per task instructions. |
| `docs/adr/*` (new ADR) | New architecture decision | This FR implements already-decided architecture (ADR-0034); no new decision was made during implementation that needs recording. |
| `docs/04-development/security/security.md` | New security rule | SecurityReviewer's pass (`04-security-review.md`) did not identify a new security rule requiring documentation. |

## Gate Result

```yaml
gate: doc-writer
workflow: wf-20260731-feat-171
status: passed
timestamp: 2026-07-31T00:00:00Z
summary: >
  Atomic FR-status flip complete: FR-BOT-001.md status Planned -> Implemented
  and requirements-registry.md row 55 Planned -> Shipped, both edited in this
  pass for a single commit. Added the previously-absent business_process
  frontmatter field to FR-BOT-001.md as an explicit business_process: —,
  reasoned from a direct read of docs/02-business-processes/uat/registry.md
  (zero bot-related BP-UAT entries exist) and the impact analysis's own
  E2E-not-applicable finding (the one user-facing behavior shipped, /start's
  welcome message, executes inside a real Telegram client, outside this
  repo's Playwright-based UATRunner reach) — concur with the Orchestrator's
  supplied reasoning after independently verifying both source documents,
  no disagreement to flag. Confirmed no docs/api/ manual supplement exists
  to update (auto-generated OpenAPI, .gitkeep-only directory, consistent
  with architecture.md:207's documented convention). Confirmed
  architecture.md's "Bot architecture (Python)" section already accurately
  describes the shipped apps/bot/ submodule structure file-for-directory —
  no drift, no update needed. Confirmed FEAT-BOT-1 does not map onto any
  line item in ADR-0034's Sequenced PR plan (Phase Bot-A) table — that table
  is scoped to the account-link/S5.5 slice (link/start, link/confirm, audit,
  outbox, TelegramAdapter, under TelegramAuthGuard), while FEAT-BOT-1 is the
  bot-bootstrap-and-lookup scaffold under a different guard convention
  (InternalAuthGuard) — documented as Not Updated with reasoning rather than
  forcing a checkbox match. No new ADR, no new security rule, no
  shared-types or runbook changes, all consistent with the task's explicit
  do-not-update list.
documents_updated:
  - docs/03-requirements/FR-BOT-001.md
  - docs/03-requirements/requirements-registry.md
documents_not_updated:
  - docs/api/ (auto-generated, no manual supplement exists)
  - docs/04-development/architecture/architecture.md (already accurate, no drift)
  - docs/adr/0034-telegram-bot-and-sender.md (FEAT-BOT-1 doesn't map to Phase Bot-A's PR plan table)
  - packages/shared-types/README.md (no shared-types changes, per task instruction)
  - docs/runbooks/* (no new operational scenario, per task instruction)
  - docs/adr/* new ADR (implementation of already-decided architecture)
  - docs/04-development/security/security.md (no new security rule from SecurityReviewer)
duplication_check: none_found
unaffected_content_altered: false
next_agent: quality-gate
```
