# ISS-BOT-001-COOLIFY-001 — FR-BOT-001, ADR-0034, and the token-rotation runbook assert a Coolify deploy target that no longer exists

| Field | Value |
|---|---|
| ID | ISS-BOT-001-COOLIFY-001 |
| Severity | minor |
| Module | docs/bot, docs/adr |
| Status | resolved |
| Reported | 2026-07-31 |
| Resolved | 2026-07-31 |
| Workflow | wf-20260731-fix-174 |
| Reporter | User (told the Orchestrator directly, after FR-BOT-001 shipped, that "there will be no Coolify") |
| Related | FR-BOT-001, ADR-0034, ADR-0007, ADR-0040 |
| Business-Process | — |
| GitHub-Issue | — (workflow-tooling/docs only, not user-facing) |

## Symptom

`docs/03-requirements/FR-BOT-001.md` (§3 "Coolify stack", AC "Bot deployed
to Coolify...") and `docs/adr/0034-telegram-bot-and-sender.md` (multiple
sections: Q1's rationale, the component-layout doc tree, the S5.5 exit
gate, the bot-token-leak mitigation, the `tg_config` encryption-key
addendum) all assert the Telegram bot deploys to Coolify. This was
already false project-wide before FR-BOT-001 shipped today:
[ADR-0007](../../docs/adr/0007-coolify-orchestration.md) retired Coolify
as the orchestration layer on 2026-07-23, and
[ADR-0040](../../docs/adr/0040-deployment-target-pro-data-tech.md)
(accepted 2026-07-27) replaced it with plain `docker compose` + Nginx +
GitHub Actions on two pro-data.tech hosts (QA `95.46.211.230` /
`qa.aiqadam.org`, prod `95.46.211.224` / `aiqadam.org`). Neither
ADR-0034 nor FR-BOT-001 was updated when that migration happened — they
were written/drafted 2026-05-21/22, before the 2026-07-23/27 dates.

`docs/04-development/infrastructure/runbooks/telegram-token-rotation.md`
has the same staleness in two spots (line 73's rotation step, line 88's
bot-repo doc-link, which also still carries the pre-migration
`viktordrukker` GitHub namespace instead of `aiqadam`).

This workflow's own artifacts (`wf-20260731-feat-171`'s
`workspace-state.md` entry and `08-doc-update.md`) inherited the same
stale assumption, since FR-BOT-001 and ADR-0034 were the source
documents read at the time — the AC-6/AC-11 deferral note says "pending
a live `aiqadam-bot` Coolify deployment," which needs the same
correction.

## Impact

Documentation-only drift — no code or running infrastructure was ever
actually pointed at Coolify for the bot (nothing has been deployed yet;
this is the bot's first shipped code). But left uncorrected, it would
mislead whoever picks up the deferred AC-6/AC-11 verification, or a
future FR-BOT-002/003 workflow, into designing against infrastructure
that doesn't exist (per ADR-0007) and was explicitly ruled out by the
user for this project's future, too ("there will be no Coolify").
Per an explicit user decision this session, designing the actual bot
compose-service block is out of scope for this fix — only the false
claims are being corrected, not replaced with a full deployment design.

## Acceptance criteria

- [x] AC-1: `docs/adr/0034-telegram-bot-and-sender.md` no longer asserts
      Coolify as the bot's deploy target in any section (Q1 rationale,
      component layout, S5.5 exit gate, token-leak mitigation, `tg_config`
      addendum) — replaced with a reference to ADR-0040's pro-data.tech/
      docker-compose model, without designing the specific compose
      service block (out of scope, deferred).
- [x] AC-2: `docs/03-requirements/FR-BOT-001.md` §3 "Coolify stack" and
      its Coolify-specific acceptance criterion corrected to reference
      the actual deploy target (ADR-0040), without asserting a specific
      undesigned implementation.
- [x] AC-3: `docs/04-development/infrastructure/runbooks/telegram-token-rotation.md`
      lines 73/88 corrected — rotation step references the real deploy
      target, and the bot-repo doc-link uses the `aiqadam` org namespace
      (matching the actual repo location, `aiqadam/aiqadam-telegram-bot`)
      instead of the stale `viktordrukker` one.
- [x] AC-4: `.copilot/context/workspace-state.md`'s FR-BOT-001 AC-6/AC-11
      deferral note (added by `wf-20260731-feat-171`) updated to remove
      the Coolify-specific framing.
- [x] AC-5 (explicitly out of scope, not attempted): designing or adding
      an actual bot/notifier service block to
      `deploy/docker-compose.{qa,prod}.yml`. That is real infrastructure
      design work the user deferred; this issue only removes false
      claims about where the bot deploys, it does not decide where it
      will.

## Resolution

**Workflow:** wf-20260731-fix-174
**Root cause:** ADR-0034 and FR-BOT-001 were drafted 2026-05-21/22,
before Coolify was retired project-wide (ADR-0007, 2026-07-23; ADR-0040,
2026-07-27). Neither document was revisited during that migration —
a gap ADR-0040 itself already flagged at a project-wide scale ("A
2026-07-26 documentation audit found this pattern repeated across 63
files"), which FR-BOT-001/ADR-0034 turned out to also be part of, just
not yet caught since FR-BOT-001 hadn't shipped at audit time.
**Fix:** Replaced every bot-specific Coolify assertion in ADR-0034,
FR-BOT-001, the token-rotation runbook, and this workflow's own
workspace-state.md entry with a reference to ADR-0040's actual
pro-data.tech/docker-compose deploy model — without designing the
specific bot/notifier compose service block, per explicit user scope
decision (AC-5, deferred).
**Not fixed (explicitly out of scope):** the other ~60 files elsewhere
in the repo that also still reference Coolify — ADR-0040 already
documents this as pre-existing, known debt outside this fix's bot-only
scope.
