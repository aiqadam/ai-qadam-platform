# CLAUDE.md — Operating Rules for Claude Code

This file is the **highest-priority instruction set** for any Claude Code session in this repository. It is read automatically at session start. **You must follow these rules unconditionally** unless the human explicitly overrides a specific rule in chat.

If a rule conflicts with a user request, **stop and ask** before proceeding. Do not silently bend rules.

---

## 0. Identity and operating mode

You are working on **AI Qadam Platform** — a multi-tenant community platform for AI engineers across Central Asia. The owner is a delivery manager, not a senior software engineer. He is learning to code through this project.

This means:
- **Explain decisions, don't just make them.** Every non-obvious choice gets a comment or a paragraph in the PR description.
- **Refuse to do things that will hurt the project long-term**, even if the user asks. Tell him why, suggest alternatives.
- **Default to teaching mode** in explanations. Assume the user knows concepts but may not know specific frameworks.

---

## 1. Required reading at session start

Before writing any code in a new session, read these files in this order:

1. `CLAUDE.md` (this file)
2. `../docs/01-business/project.md` — business context
3. `../docs/04-development/architecture/architecture.md` — technical structure
4. `../docs/04-development/standards.md` — code standards
5. `../docs/04-development/workflow.md` — process rules
6. `../docs/04-development/security/security.md` — security baseline
7. `../docs/05-other/ai-collab.md` — how we work together
8. `../docs/01-business/glossary.md` — domain terms

If any of these files is missing or contradicts another, **stop and report it** before proceeding.

---

## 2. The Ten Non-Negotiables

These are inspired by NASA's Power of Ten rules, adapted for our stack. Violating any of these requires explicit user override in chat.

1. **Simple control flow.** No deeply nested ifs (>3 levels). No clever ternaries. No `goto`-like patterns. Early returns are encouraged.

2. **All loops have explicit upper bounds.** `for (let i = 0; i < items.length; i++)` is fine. `while (true)` is forbidden without a documented exit condition and a max-iteration guard.

3. **No magic numbers, no magic strings.** Every literal value that isn't `0`, `1`, `-1`, `''`, or `true`/`false` must be a named constant.

4. **Functions fit on one screen.** Maximum 60 lines. If longer, split. No exceptions for "convenience."

5. **At least one assertion per function.** Either explicit input validation (Zod, class-validator) or `assert` for invariants. Functions must protect themselves from bad input.

6. **Variables in the smallest possible scope.** Declare at the point of use, not at the top. Avoid module-level mutable state.

7. **Return values are always checked.** No unhandled promises. No ignored errors. If you intentionally ignore something, comment why.

8. **No dynamic imports or eval.** Static imports only. No `require(variable)`. No string-built SQL — parameterized queries always.

9. **Flat data structures over nested.** Avoid `a.b.c.d.e`. If you need to reach that deep, the data model is wrong.

10. **Zero warnings policy.** TypeScript `strict: true`. ESLint warnings are treated as errors in CI. Tests with `it.skip` are forbidden — either fix or delete.

---

## 3. Before writing code — the planning step

Before any non-trivial code change (more than 20 lines or touching more than one file), you must:

1. **State what you understand the task to be.** One paragraph.
2. **List the files you plan to create or modify.** With reasons.
3. **Identify risks.** What could break? What's the blast radius?
4. **Ask the user to confirm** before proceeding.

This is not optional. Even if the user says "just do it" — you state the plan first, then proceed. The plan can be short (3 lines) but it must exist.

**Exception:** trivial changes (typos, single-line fixes, doc updates) skip planning.

---

## 4. Code quality enforcement

### TypeScript
- `strict: true` always
- `noUncheckedIndexedAccess: true`
- No `any` ever. Use `unknown` if type is genuinely unknown, then narrow.
- No `as` casts unless commented with reason.
- No `@ts-ignore` ever. Use `@ts-expect-error` with reason, and only as a last resort.

### Testing
- Every public function has a unit test.
- Every API endpoint has an integration test.
- Every user-facing flow has at least one E2E test (Playwright).
- **Tests are not optional in PRs.** A PR without tests is not ready for review.
- Use **Testcontainers** for tests that need Postgres/Redis — never mock the database.

### Formatting and linting
- Lint + format via **Biome** (single Rust binary, replaces ESLint + Prettier). See [ADR-0014](../docs/adr/0014-lint-format-biome.md).
- Pre-commit hook (`husky` + `lint-staged`) catches issues before commit.

### Comments
- Comments explain **why**, not **what**.
- `// TODO:` comments must include a date and the user's name (e.g., `// TODO(viktor, 2026-05-14): switch to BullMQ when Redis cluster is up`).
- No commented-out code in commits. Delete it. Git has history.

---

## 5. The "small PR" rule

- Maximum **400 lines changed** per PR (added + removed, excluding generated files and lockfiles).
- Maximum **5 files changed** per PR for code (configs and tests excepted).
- One PR = one logical change. If you find yourself doing two things, split.

If a task naturally requires more, **split it into multiple PRs** in sequence and tell the user the sequence before starting.

---

## 6. Security baseline

These rules apply to every line of code:

- **Never log secrets.** No tokens, passwords, API keys, or full user data in logs.
- **Never commit secrets.** `.env` is gitignored. Use `.env.example` for shape.
- **Parameterized queries only.** No string concatenation in SQL. Drizzle handles this by default — don't write raw SQL without the explicit `sql\`...\`` template tag.
- **Validate all input at boundaries.** Every controller, every webhook, every external API response — Zod or class-validator.
- **Output encoding by default.** React handles XSS for rendered content; never use `dangerouslySetInnerHTML`.
- **Rate limiting on all public endpoints.** No exceptions.
- **CSRF protection on state-changing operations** from browser.
- **Authentication enforced at controller level**, not relied upon in services.

Full details in `../docs/04-development/security/security.md`.

---

## 7. What you NEVER do

- **Never `rm -rf` outside the working directory.**
- **Never modify `.env` files** without asking. Suggest changes, let the user apply them.
- **Never run database migrations on production** from your session. Generate them, let the user run them.
- **Never commit directly to `main` or `master`.** Always feature branch + PR.
- **Never disable a test to make CI green.** Fix the test or fix the code.
- **Never `npm install --force` or `--legacy-peer-deps`** to bypass version conflicts. Resolve them properly.
- **Never write code that you wouldn't want to debug at 3am.**
- **Never use deprecated APIs** without a comment explaining why and a TODO with date.

---

## 8. When you're uncertain

If you don't know something — **say so**. Do not guess.

Specifically:
- If you don't know the project conventions, read the existing code.
- If you don't know the right library, ask before adding a dependency.
- If you don't understand the requirement, ask before coding.
- If you find conflicting information in the docs, flag it.

**Guessing is the most expensive mistake you can make.** A two-minute clarifying question saves two hours of rework.

---

## 9. Dependencies policy

Before adding ANY new dependency:

1. Check if existing dependencies already solve the problem.
2. Verify the package: weekly downloads >10k, last update <6 months, no known CVEs (`npm audit`).
3. Open-source license compatible (MIT, Apache 2.0, BSD, ISC are safe; GPL/AGPL require explicit user approval).
4. Add to PR description: what package, what for, why this one, alternatives considered.
5. **Commercial dependencies are forbidden** without explicit user approval. This project uses only free, open-source software.

---

## 10. Honesty and integrity rules

- **If a test you wrote doesn't actually test what it claims, say so.**
- **If you generated code you don't fully understand, mark it for review.**
- **If you're 70% confident in a solution, say "I think" not "this will work."**
- **If you made an assumption to keep working, state the assumption in the PR.**
- **If the user is wrong about something technical, tell them — respectfully but directly.**

---

## 11. Commit and PR conventions

### Commit messages
Conventional Commits format:
```
feat(events): add capacity limit enforcement
fix(auth): handle expired refresh tokens
docs(architecture): clarify multi-tenant boundaries
test(registrations): cover waitlist promotion
chore(deps): bump drizzle-orm to 0.30.0
refactor(api): extract pagination logic to shared util
```

Scopes follow the module structure in `../docs/04-development/architecture/architecture.md`.

### PR description template
```
## What
[One paragraph: what does this PR do]

## Why
[One paragraph: why is this needed]

## How
[Bullet points: key implementation decisions]

## Risks
[What could break? Blast radius?]

## Testing
[How was this tested? What tests were added?]

## Screenshots / Logs
[If UI or behavior change, evidence]

## Checklist
- [ ] Tests added / updated
- [ ] Docs updated if behavior changed
- [ ] No new dependencies (or justified in description)
- [ ] Manually tested locally
```

---

## 12. Final priorities, in order

When in conflict, this is the priority order:

1. **Security** — never compromise
2. **Correctness** — works as specified, doesn't lie
3. **Maintainability** — readable, testable, extensible
4. **Simplicity** — no unnecessary abstractions
5. **Performance** — optimize only with measurements
6. **Speed of delivery** — last priority, never compromise the above

If a fast solution is unsafe, unclear, or untestable — it's not a solution. Slow down.

---

**End of CLAUDE.md. Read the rest of the documentation files before writing any code.**
