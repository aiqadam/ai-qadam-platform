# WORKFLOW.md — How we work

Process discipline matters more than tools. This document is the canonical workflow.

---

## Git workflow

### Branching

- **`main`** — always deployable. Protected: no direct pushes, PR required, CI must pass.
- **`feature/<short-name>`** — new features (`feature/event-registration`, `feature/leaderboard`).
- **`fix/<short-name>`** — bug fixes (`fix/qr-token-expiry`).
- **`chore/<short-name>`** — maintenance (`chore/upgrade-drizzle`).
- **`docs/<short-name>`** — documentation-only.
- **`hotfix/<short-name>`** — urgent production fixes, applied to `main` then back-merged.

No long-lived branches except `main`. Feature branches live ≤ 7 days.

### Commits

**Format: Conventional Commits**

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`.

Examples:
```
feat(events): add capacity limit enforcement
fix(auth): handle expired refresh tokens gracefully
docs(architecture): clarify multi-tenant boundaries
test(registrations): cover waitlist promotion path
chore(deps): bump nestjs to 11.0.5
refactor(api): extract pagination logic to shared util
```

**Rules:**
- Subject in **imperative mood, lowercase, no period**, ≤ 72 chars
- Body explains **why**, wraps at 72 chars
- One logical change per commit
- Commit early, commit often — squash on merge if needed

### Pull requests

**Maximum size:** 400 lines changed, 5 files (excluding tests, configs, lockfiles).

If a feature is bigger, split into a sequence of PRs.

**PR description template:**

```markdown
## What
[One paragraph: what does this PR do, in user-visible terms]

## Why
[One paragraph: why is this needed, what problem does it solve]

## How
[Bullet points: 3-5 key implementation decisions]

## Risks
[What could break? Blast radius if it does?]

## Testing
[How was this tested? What's new in test suite?]

## Screenshots / Logs
[If UI or behavior change, evidence]

## Checklist
- [ ] Tests added or updated
- [ ] Docs updated if behavior or API changed
- [ ] No new dependencies (or justified above)
- [ ] Manually tested locally
- [ ] No new ESLint warnings
- [ ] No new TypeScript errors
- [ ] Migration tested both up and down

## Related
[Issue links, ADR links, prior PRs]
```

### PR review process

Even though this project starts with one developer, **every PR is reviewed** before merge — by Viktor reading the diff carefully.

For self-review:
1. Read the diff as if you didn't write it.
2. Check it against PROJECT.md (does this serve the product?).
3. Check it against STANDARDS.md (does it meet code quality bar?).
4. Check it against this WORKFLOW.md (process followed?).
5. Run the app locally, exercise the change.

When external reviewers join:
- Review turnaround target: 24 hours on workdays.
- Reviewers focus on: design, edge cases, security, tests. Style/formatting is automated.
- Approve when satisfied, request changes when not. Don't approve to be polite.

### Merge strategy

- **Squash and merge** for feature/fix PRs. One commit on `main` per PR.
- **Merge commit** for hotfixes (preserve emergency context).
- **Rebase** discouraged — risks losing context.

After merge:
- Branch is auto-deleted.
- Coolify deploys to staging (when staging exists; for now, deploys directly to prod with feature flags).

---

## Development workflow

### Starting work on a feature

1. **Check that the requirement is clear.** If not, write it up first, get user sign-off.
2. **Create an ADR if architecture-level decision is involved.** `docs/adr/0XX-title.md`.
3. **Update local `main` from origin.** Run `git fetch origin && git checkout main && git pull --rebase` to ensure you're branching from the latest.
4. **Create the feature branch** from latest `main`.
5. **Write tests first** when feasible (TDD for business logic; UI can be other order).
5. **Write the smallest possible change** that gets to "works."
6. **Iterate** — make it correct, then make it clean, then optimize if measured.
7. **Open PR early** as draft if you want feedback before "done."
8. **Self-review the diff.** Catch silly mistakes.
9. **Mark PR ready** when checklist passes.

### Pairing with Claude Code

When Viktor pairs with Claude Code on a task:

1. **State the goal in plain language** ("I want to add waitlist support to events").
2. **Let Claude Code propose a plan** (per CLAUDE.md rule 3).
3. **Approve or adjust the plan** before coding starts.
4. **Watch the implementation** — interrupt if it's going wrong.
5. **Review the diff** before commit.
6. **Test locally** before push.

Don't let Claude Code commit and push without your review. The `--dangerously-skip-permissions` flag exists for a reason, but use it deliberately.

---

## Testing workflow

### Before pushing

- [ ] All tests pass locally: `pnpm test`
- [ ] Linter is clean: `pnpm lint`
- [ ] Type-check passes: `pnpm typecheck`
- [ ] Format is applied: `pnpm format`
- [ ] Manual smoke test of the changed feature

### CI pipeline

On every push to a PR branch:
1. **Install** dependencies (cached via Turborepo)
2. **Lint** all changed packages
3. **Type-check** all changed packages
4. **Unit tests** for all changed packages
5. **Integration tests** for affected modules
6. **E2E tests** for critical paths (smoke set)
7. **Build** check (does it compile/bundle?)
8. **Bundle size** check (no regression beyond budgets)
9. **Security audit** (`npm audit`, `pnpm audit`)

A PR can merge only if all checks pass.

On merge to `main`:
1. All of the above
2. **Full E2E test suite**
3. **Deploy to production** via Coolify webhook (once staging environment exists, deploy there first, run smoke tests, then prod)

---

## Release workflow

### Versioning

Semantic versioning for `packages/*`. The apps (`apps/web`, `apps/api`) don't have versions — they're deployed continuously.

### Release notes

Every Friday, a `CHANGELOG.md` entry summarizes the week's changes:

```markdown
## Week of 2026-05-12 to 2026-05-16

### Added
- Event capacity enforcement with waitlist
- Telegram bot can now show user's registered events

### Changed
- Event registration confirmation email redesigned

### Fixed
- QR token expiry was 24h, should be 7 days
```

This is generated semi-automatically from conventional commit history, edited for narrative.

### Deploys

- **Production deploys happen automatically** on merge to `main`, via Coolify.
- **Rollback** is one-click in Coolify (redeploys previous image).
- **Feature flags** for risky changes — ship behind flag, enable for a subset, ramp up.
- **Database migrations run before app deploy.** Migrations must be backward-compatible for one deploy cycle (the app version both before and after must work with the migrated schema).

### Deploy windows

- **Avoid Fridays after 16:00.**
- **Avoid before community events** (24 hours quiet zone before a meetup).
- **Avoid weekends** unless it's a hotfix.

---

## Incident response

### Severity levels

- **SEV-1 (critical):** site down, data loss, security breach.
- **SEV-2 (high):** major feature broken, many users affected.
- **SEV-3 (medium):** minor feature broken, workaround exists.
- **SEV-4 (low):** cosmetic, infrequent.

### Response

**SEV-1:**
1. Acknowledge in Telegram (`#aiqadam-ops` channel if it exists) within 15 min.
2. Triage: what's broken, blast radius, ETA.
3. **Stop other work.** Fix or rollback.
4. Communicate to affected users when known.
5. Post-mortem within 48 hours.

**SEV-2:** acknowledge within 1 hour, fix within 24 hours.

**SEV-3 / SEV-4:** triage into backlog with priority.

### Post-mortem template

```markdown
# Incident: <title>

**Date:** YYYY-MM-DD  
**Severity:** SEV-N  
**Duration:** Start → End (X hours)  
**Author:** Viktor

## Summary
[One paragraph: what happened from the user's perspective]

## Timeline
- HH:MM — [event]
- HH:MM — [event]
- ...

## Root cause
[What actually caused it, technically]

## Resolution
[What fixed it]

## What went well
[Things to keep doing]

## What went poorly
[Things to improve]

## Action items
- [ ] Specific fix #1 (owner, due date)
- [ ] Specific fix #2 ...
```

**Blameless culture.** The post-mortem is about systems, not people. Even if you (Viktor) were the only person involved, you write about "we" — the system, the process, the decisions.

---

## Daily / weekly rhythm

### Daily (when actively building)

- **Morning:** review yesterday's work, plan today's PR(s). 15 min.
- **Build:** focused work in 90-min blocks, breaks between.
- **End of day:** push WIP to branch, open draft PR. Don't leave work uncommitted overnight.

### Weekly

- **Monday:** review backlog, decide week's focus. 30 min.
- **Friday:** write changelog entry, plan next week. 30 min.
- **Monthly:** review ADRs, retire obsolete ones, write new ones for emergent patterns.

---

## Tools we use

### Required

- **Cursor / VS Code** as editor (any with Claude Code support is fine)
- **pnpm** for package management
- **Turborepo** for monorepo orchestration
- **Docker** for local services
- **GitHub** for source hosting and CI
- **Coolify** for deployment

### Optional but recommended

- **lazygit** or magit for git CLI productivity
- **httpie** or **bruno** for API testing
- **pgcli** for Postgres CLI
- **k9s** if/when we add Kubernetes (not now)

---

## What we don't do

- **No Slack/Telegram-only decisions.** If it's important, it's in a doc, ADR, or PR.
- **No "I'll fix it later."** Either it's a bug filed in tracker, or it's fine now.
- **No "let's just deploy and see."** Test locally, test in CI, then deploy.
- **No code review skipping.** Even your own code. Even when you're tired.
- **No deploy-and-disappear.** When you deploy, you watch metrics for 30 minutes.
