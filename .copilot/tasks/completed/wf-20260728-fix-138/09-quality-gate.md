# Quality Gate — wf-20260728-fix-138 (ISS-WEB-NEXT-I18N-001)

**Verdict:** passed

## AC-by-AC disposition

This issue has no formal AC list (GitHub issue #85 was a one-line report).
Scope was established in chat: full i18n port into `apps/web-next`, single
PR per explicit user override of AGENTS.md §4.

| Criterion | Status |
|---|---|
| Ru locale switch changes rendered UI language | verified — live curl against `/`, `/events`, `/leaderboard`, `/global` with `Cookie: aiqadam-locale=ru` shows `<html lang="ru">` + Russian body copy |
| En (default, no cookie) still renders correctly | verified — same live curl, no cookie, `<html lang="en">` + English copy |
| No regressions in existing apps/web-next behaviour | verified — `pnpm typecheck` 0 errors, `pnpm lint` 0 new warnings, `pnpm build` succeeds, `pnpm test` 932/932 passing |
| Regression test proving the original bug | verified — `apps/web-next/src/lib/i18n.test.ts`: `makeT('ru')` returns Russian strings, distinct from English; fails against pre-fix state (module didn't exist) |
| Workspace/admin (operator) pages | out of scope — legacy `apps/web` never translated these either; consistent precedent |

## Notes

- Single-PR scope is a recorded §13 override (see ISS-WEB-NEXT-I18N-001.md
  "Scope clarification" section and this PR's description "Risks" section).
- No DB migrations, no security-sensitive surface touched (pure UI string
  externalization + one new npm dependency, `i18next`, already vetted and
  in use by the sibling `apps/web` app).
- New dependency: `i18next ^24.0.0` added to `apps/web-next/package.json`,
  matching the exact version already used by `apps/web` — no new package
  risk introduced (AGENTS.md §8: existing dependency reused, not a novel one).
