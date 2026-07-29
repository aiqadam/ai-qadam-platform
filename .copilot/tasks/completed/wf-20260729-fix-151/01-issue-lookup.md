# Step 1 — Issue Lookup: ISS-WEB-NEXT-SSR-JSDOM-001

## Source

Already registered locally (not GitHub-sourced) — discovered by
`wf-20260729-feat-150` during FR-ADM-011's Step 13 UAT pre-flight, then
confirmed live on QA by the user (`https://qa.aiqadam.org/workspace/admin/users`
→ 500) in this session. `.copilot/issues/ISS-WEB-NEXT-SSR-JSDOM-001.md`
and its `registry.md` row already exist on `main` (merged via PR #115,
PR #116).

## Similar issues search

Searched `registry.md` for `jsdom`, `undici`, `dompurify`, `SSR 500` —
no prior occurrence. This is a new, distinct issue, not a duplicate.

## Root cause (confirmed this session, before Step 2)

`apps/web-next/package.json` depends on `isomorphic-dompurify@^2.21.0`
(used only by `AnnounceComposer.tsx`), which depends on `jsdom`.
`jsdom@28.1.0`'s own `package.json` declares `"undici": "^7.21.0"` — but
the repo's root `package.json` `pnpm.overrides` forces
`"undici": ">=7.28.0"` (added in commit `6ff557f`, 2026-06-24, as part of
clearing 7 high-severity CVEs for `ISS-CI-001`). Because the override
uses an open-ended `>=` range, pnpm resolved it to the newest matching
version at lockfile-generation time: `undici@8.8.0` — crossing a **major
version boundary** past what jsdom actually supports. `undici@8.x`
restructured its internal file layout; `jsdom`'s
`lib/jsdom/browser/resources/jsdom-dispatcher.js` requires
`undici/lib/handler/wrap-handler.js`, which existed under `undici@7.x`
but was removed/renamed in `8.x` (confirmed: `undici@8.8.0`'s
`lib/handler/` directory has 6 files, none named `wrap-handler.js`).

Because Astro bundles all SSR routes into one server build, this one
`require()` failure in `AnnounceComposer.tsx`'s dependency chain crashes
every `/workspace/*` route's render, not just the announce composer's
own page.

## Business-Process field

Set to `—` for this issue-resolution workflow's own linkage. The fix
itself is a `pnpm.overrides` pin correction (dependency-graph level, not
a product-surface change) — it doesn't belong to one specific BP-UAT
process. However, because the *symptom* affects the entire
`/workspace/*` surface, Step 8's live verification will curl multiple
representative workspace routes (not just one BP-UAT's happy path) to
confirm the fix's blast radius matches the bug's blast radius. This is
a deliberate scope decision, not an oversight — see Step 2 for the full
reasoning.

## Gate Result

gate_result:
  status: passed
  summary: "Issue already registered (ISS-WEB-NEXT-SSR-JSDOM-001), no duplicate found, root cause fully identified before Step 2: pnpm.overrides undici >=7.28.0 (open-ended) resolved past jsdom's supported ^7.21.0 range into a breaking undici 8.x major, crashing jsdom's require() of an internal file path that moved between majors."
  findings:
    - "Root cause pinpointed via jsdom's own package.json undici dependency declaration (^7.21.0) vs. the actually-resolved undici@8.8.0 from the open-ended root override."
