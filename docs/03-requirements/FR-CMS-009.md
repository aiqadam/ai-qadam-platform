---
code: FR-CMS-009
name: Environment-configurable public Directus origin
status: Implemented
module: CMS / Content (CMS)
phase: Rebuild Phase 3 (V2)
business_process: —
---

## Description

Extends [`FR-CMS-008`](FR-CMS-008.md). `apps/web-next/src/lib/cms.ts` hardcoded
the public, browser-facing Directus origin as a module constant:

```ts
const PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org';   // L14, pre-change
```

Because that value was the **production** hostname with no environment
override, every non-production deployment emitted browser-facing links pointing
at production. Verified live on QA 2026-08-21: the FR-CMS-008 source-document
download `href` rendered as `https://cms.aiqadam.org/assets/<uuid>?download`
regardless of environment, which made the FR-CMS-008 feature unverifiable on QA
and blocked infra task **T-0141** before it touched anything.

This requirement replaces the constant with an exported, pure, injectable
resolver reading **`process.env.PUBLIC_DIRECTUS_URL` at SSR runtime**, falling
back to `https://cms.aiqadam.org` when unset, empty, or whitespace-only — so
production behaviour is byte-identical and **no production deploy config change
is required by this PR**.

Scoped narrowly to the *public* origin. The server-side internal path
(`DEFAULT_INTERNAL_DIRECTUS_URL` / `INTERNAL_DIRECTUS_URL`) is correct and
load-bearing for SSR fetch performance and is explicitly out of scope, as is
`assetUrl()`'s behaviour for its existing callers.

## Users

Operators / infra (set the knob per environment); Public (receives a download
link that points at the environment's own Directus rather than production).

## Functional scope

1. **`resolvePublicDirectusUrl(env?)`** — new exported function in
   `apps/web-next/src/lib/cms.ts`. Pure, synchronous, total (it cannot throw;
   every input either yields a configured value or falls back). Signature takes
   its environment as an **injectable parameter** defaulting to `process.env`,
   which is what makes it unit-testable without mutating the real environment
   or breaking the test directory's local-mirror convention.
2. **`DEFAULT_PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org'`** — byte-identical
   to the removed L14 constant, so an environment that sets nothing behaves
   exactly as before.
3. **Both public consumers read the one resolver** — `directusBase()`'s client
   branch and `publicAssetUrl()`. Only one resolver and one default constant
   exist in the module, so two divergent public bases are **inexpressible**, not
   merely avoided.
4. **`publicAssetUrl()` stays realm-independent** — no `typeof window` branch
   was added. FR-CMS-008's MAJOR-2 invariant is preserved by construction (see
   the security note below).
5. **Input normalization** — whitespace is trimmed (compose and `.env` values
   pick up stray spaces easily, and an untrimmed base would emit a URL
   containing a space); empty-or-whitespace is treated as unset. Trailing
   slashes are deliberately **not** stripped, matching every other helper in
   this app and the `INTERNAL_DIRECTUS_URL` compose values, which carry none.
6. **Defensive `process` access** — the default parameter is written
   `typeof process === 'undefined' ? undefined : process.env` and the body uses
   `env?.PUBLIC_DIRECTUS_URL`, so the production default stays reachable without
   ever touching `process`. `directusBase()`'s client branch runs where `window`
   is defined; a bare `process.env` access there would throw a `ReferenceError`
   during hydration if `cms.ts` were ever pulled into a client bundle.
7. **Discoverability** — `apps/web-next/.env.example` documents the var
   (browser-facing purpose, the `https://cms.aiqadam.org` default, the explicit
   contrast with `INTERNAL_DIRECTUS_URL`, and the https / no-trailing-slash
   guidance). `deploy/docker-compose.qa.yml` and
   `deploy/docker-compose.prod.yml` carry **comment-only** entries — QA explains
   why it is currently unset and pre-writes the exact line to uncomment; prod
   explains that the code default *is* the prod value.

## Mechanism note — `process.env` vs `import.meta.env` (READ THIS BEFORE COPYING ANY `PUBLIC_*` PATTERN)

**This is the most reusable lesson in this requirement, and it has now been
rediscovered twice. It is recorded here so there is not a third time.**

The naive reading of "match the existing convention" produces
`import.meta.env.PUBLIC_DIRECTUS_URL`, because `apps/web-next/src/lib/api-client.ts`'s
`resolveBase()` appears to establish exactly that pattern:

```ts
const { PUBLIC_API_URL } = import.meta.env;          // api-client.ts, client realm
return typeof PUBLIC_API_URL === 'string' && PUBLIC_API_URL.length > 0
  ? PUBLIC_API_URL : '/api';
```

**That path is dead code. It has never worked and cannot be made to work by
configuration.** Vite replaces `import.meta.env` with a **frozen literal object
captured at `astro build` time**. The compiled proof is in the committed bundle
`apps/web-next/dist/server/chunks/Layout_*.mjs`:

```js
const { PUBLIC_API_URL } = Object.assign({
    "ASSETS_PREFIX": void 0, "BASE_URL": "/", "DEV": false,
    "MODE": "production", "PROD": true,
    "SITE": "https://next.aiqadam.org", "SSR": true
}, {});
```

The literal contains only `ASSETS_PREFIX` / `BASE_URL` / `DEV` / `MODE` / `PROD`
/ `SITE` / `SSR`. There is **no `PUBLIC_API_URL` key**, because
`apps/web-next/Dockerfile` declares no build `ARG` and nothing injects a
`PUBLIC_*` value into the build environment. So the destructure yields
`undefined`, forever, in every container started from that image, and
`resolveBase()` silently falls through to `'/api'` in all environments.

**Consequences, stated plainly:**

- **Anyone copying `import.meta.env.PUBLIC_*` from `api-client.ts` gets a value
  that can never be configured.** The code reviews cleanly, the unit tests can
  even pass (a test that mocks `import.meta.env` asserts the mock, not the
  bundle), and the deployed app keeps emitting the hardcoded default. For this
  FR that failure mode is precisely the bug being fixed — it would have "fixed"
  the bug in review and left QA still emitting production links.
- **`process.env` survives verbatim into the bundle** and is read at call time.
  It is already how every other URL knob in this app is configured
  (`INTERNAL_API_URL`, `INTERNAL_DIRECTUS_URL`, `HOST`, `PORT`,
  `TELEGRAM_BOT_USERNAME`), needs one line in one compose file, and changes with
  a container restart rather than an image rebuild.
- **The `PUBLIC_` *name* prefix is still correct and was kept.** Astro's prefix
  rule governs what `import.meta.env` exposes to *client bundles*; it places no
  constraint whatsoever on `process.env` key names. The prefix continues to
  signal "this origin is emitted into browser-facing HTML" — it is the
  **access mechanism**, not the naming convention, that is rejected.
- **How to check this yourself for any future `PUBLIC_*` var:** grep the built
  chunk in `dist/server/` for the variable name. If it appears destructured out
  of an object literal alongside `ASSETS_PREFIX`, it is build-frozen and
  permanently `undefined`. If `process.env` appears verbatim, it is live.

`api-client.ts`'s dead `PUBLIC_API_URL` path was **not** fixed by this PR — a
distinct blast radius, out of scope, recommended as its own issue. It is not a
security defect (it fails *closed* to the same-origin `/api`), but it is a real
latent defect and, more importantly, an anti-pattern that looks like a working
precedent. `cms.ts`'s new comment block cites it by name so it is not mistaken
for one. This rule is also recorded generally in
[`docs/04-development/standards.md`](../04-development/standards.md) Part VIII
so it is not confined to a CMS requirement doc.

## Security note — `http://` acceptance is an adjudicated, accepted residual risk

`resolvePublicDirectusUrl()` accepts any non-empty string, so an operator can
set `PUBLIC_DIRECTUS_URL=http://…` and every download link on an HTTPS page
becomes a plaintext `href`. This was escalated deliberately by CodeDeveloper and
**ruled on** in security review: **documentation is sufficient; do not add a
code-level `https://` rejection and do not add a `NODE_ENV === 'production'`
warning.** Recorded here so it is not rediscovered later as a novel finding.

Reasons, in descending weight:

1. **Not a mixed-content vulnerability in the browser sense.** Mixed content is
   an enforced browser control for **subresources** (`<img>`, `<script>`,
   `<link>`, `fetch()`). This value's only rendered sink is a **top-level
   navigation** target — `<a href download>` on `rules/[slug].astro`. Browsers
   neither block nor mixed-content-warn on `http://` link navigations from an
   HTTPS page. The asset is public-read and unauthenticated per FR-CMS-008, so
   no cookie, `Authorization` header, or credential rides on that request.
2. **The required threat actor does not exist in our model.** The only principal
   who can set this value is the operator holding shell on the deploy host —
   the same principal already trusted with the Postgres DSN and the Authentik
   secrets in the same compose file.
3. **A `NODE_ENV` branch would be a net regression.** It would make a currently
   pure, total, environment-independent resolver behave differently in prod than
   in test — the exact "tests pass, prod differs" failure class this FR exists
   to eliminate. `NODE_ENV` is also `production` in the QA compose, so the guard
   would not even mean what it implies.
4. **The documentation is verified adequate** at the point of use in three
   files, and the QA compose pre-writes the correct `https://` line to
   uncomment, so the lowest-effort operator path is already the secure one.

**Residual risk: LOW, accepted.** Compensating controls: the default is https
and needs no operator action; three-file documentation at the point of use; the
`/^https:\/\//` assertion in `cms-content-pages.test.ts` now running against the
**real** resolver across five env shapes; and the asset being public and
unauthenticated.

**The verdict flips if either of these becomes true** (stated so the boundary is
not vague):

- `publicAssetUrl()` gains a caller that emits into a **subresource** context —
  `<img src>`, `<link href>`, `fetch()`; **or**
- the Directus asset folder **stops being public-read** and starts requiring a
  credential on that request.

Neither is true today and neither is introduced by this requirement. If either
changes, an `https://` enforcement in the resolver becomes warranted and this
adjudication must be revisited.

## FR-CMS-008 MAJOR-2 invariant — preserved, verified against shipped code

FR-CMS-008's MAJOR-2 finding was resolved with the wording *"eliminated by
construction, not by configuration"*, and this requirement introduces
configuration into that exact function. The distinction holds because **the
"construction" being referred to is the absence of a realm branch**, not the
constancy of the value. The two are orthogonal.

| MAJOR-2 sub-invariant | Preserved | How |
|---|---|---|
| No `typeof window` branch in `publicAssetUrl()` | Yes | Still a null-guard plus one template literal. The resolver's only `typeof` is `typeof process`, which is a **capability** check (does a Node global exist), not a **realm** branch selecting a different origin — both realms receive the same value from the same source. |
| Never emits `directus:8055` / `//directus` | Yes | There is exactly one `INTERNAL_DIRECTUS_URL` read in `cms.ts` and it is inside `directusBase()`'s `if (typeof window === 'undefined')` branch. No path lets the internal host reach `publicAssetUrl()`. |
| Never a bare / relative URL | Yes — **strengthened** | The empty/whitespace→default fallback is the specific control. Without it, `PUBLIC_DIRECTUS_URL=""` would emit a relative `/assets/<uuid>?download` resolving against the *web* origin. A genuine hardening over a naive `??`-only implementation. |

No injection, SSRF, or open-redirect surface: the resolved origin is used only
to build a string emitted into an Astro **attribute expression**
(`href={doc.sourceFileUrl}`, which Astro HTML-escapes — not `set:html`, not
`innerHTML`), and it is never passed to `fetch()`. `get()` fetches via
`directusBase()`, whose SSR branch returns the internal URL. The value is never
request-, user-, header-, cookie-, or DB-derived.

## Acceptance criteria

- [x] **AC-1** — With `PUBLIC_DIRECTUS_URL` unset, the resolved public origin is
      `https://cms.aiqadam.org`, byte-identical to the pre-change constant.
- [x] **AC-2** — With `PUBLIC_DIRECTUS_URL=https://cms.qa.aiqadam.org`, the
      resolved origin is that value verbatim (surrounding whitespace trimmed;
      trailing slash preserved, not stripped).
- [x] **AC-3** — With an override set and a `content_documents` row carrying a
      non-null `source_file`, `sourceFileDownloadUrl()` yields
      `<override-origin>/assets/<uuid>?download` — configured origin, FR-CMS-008
      AC-6's `?download` flag intact.
- [x] **AC-4** — `''` or whitespace-only is treated as unset and falls back to
      the default; never a bare `/assets/<uuid>` or other relative URL.
- [x] **AC-5** — For any value of `PUBLIC_DIRECTUS_URL` including unset, the
      derived URL contains neither `directus:8055` nor `//directus` and is
      absolute. The FR-CMS-008 negative guards are kept verbatim and extended by
      a 5-case `it.each` running the **real** resolver under unset / `undefined`
      / empty / whitespace / overridden.
- [x] **AC-6** — `publicAssetUrl()` remains realm-independent: no `typeof window`
      branch was introduced. *Verified by security review against the shipped
      source* — a source-shape property, not a runtime behaviour (see the
      testing note below).
- [x] **AC-7** — `directusBase()`'s SSR branch still returns
      `INTERNAL_DIRECTUS_URL`, and `http://directus:8055` when unset. *A
      no-change assertion, verified by diff evidence plus `cms.test.ts`'s
      existing internal-base suite still passing unmodified.*
- [x] **AC-8** — `directusBase()`'s client branch and `publicAssetUrl()` reflect
      the same configured origin. Satisfied **structurally** — one resolver, one
      default constant, divergence inexpressible — and pinned by a unit test at
      the resolver level.
- [x] **AC-9** — `apps/web-next/.env.example` documents `PUBLIC_DIRECTUS_URL`
      with its browser-facing purpose, its `https://cms.aiqadam.org` default, and
      its explicit contrast with `INTERNAL_DIRECTUS_URL`. *Verified by
      documentation review.*
- [x] **AC-10** — The mechanism is runtime, not build-time: the compiled
      `dist/server/chunks/cms_*.mjs` reads `process.env` at call time with no
      Vite-inlined frozen literal, and mutating the variable mid-process changed
      the emitted origin with **no rebuild**. Confirmed three times
      independently (CodeDeveloper on the bundle, Orchestrator via `tsx`,
      TestRunner by executing the compiled chunk).

## Operator note — this PR makes the override POSSIBLE, not APPLIED

**Shipping this requirement does not change what any deployed environment
emits.** Both compose entries are comment-only; no live environment key is added
to QA or prod. The change is a genuine no-op for both deployed environments
until an operator acts.

- **Production:** nothing to do. The code default *is* the production value, by
  design (AC-1).
- **QA:** still emits **production** download links. `PUBLIC_DIRECTUS_URL` is
  deliberately left unset there because **QA has no Directus vhost at all** —
  `cms.qa.aiqadam.org` and `directus.qa.aiqadam.org` do not resolve, so there is
  no QA value to point the variable at. Two operator steps are required, in
  order: (1) stand up a QA Directus vhost at a public, browser-resolvable
  `https://` hostname; (2) uncomment the pre-written `PUBLIC_DIRECTUS_URL` line
  on the `web-next` service in `deploy/docker-compose.qa.yml` and set it to that
  hostname, then restart the container — no image rebuild is needed.

This is tracked as a **named deferral** against infra task **T-0141**, which was
itself blocked on exactly this code gap. Behavioural end-to-end verification of
AC-2/AC-3 in a real browser belongs to that follow-up, where a QA Directus will
exist to point at.

## Notes

- **Testing instruments, and the E2E position stated accurately.** Rubric score
  0 → unit tests only, which are both required and sufficient here: the whole
  diff is one total, synchronous, side-effect-free string function plus two call
  sites and three comment/doc files. 20 tests were added
  (`cms-content-pages.test.ts` 37 → 57; 1115 passing repo-wide in `web-next`),
  covering AC-1/2/3/4/5/8/10 at 100% line and 100% branch on the resolver.
  Three ACs are verified by the instrument appropriate to their nature rather
  than by a unit test: **AC-6** by security review of the shipped source (a test
  grepping its own source file is a lint rule in a test costume — unsound in
  both directions, since it would break on a harmless refactor and pass on a
  semantically equivalent branch written differently); **AC-7** by diff evidence
  plus an unchanged, passing suite (a new test for behaviour this PR did not
  touch would be padding and would falsely imply the PR owns it); **AC-9** by
  documentation review.
- **No E2E test — and, correcting the record, there was never one to inherit.**
  Earlier artefacts in this workflow (and, by inheritance, the reasoning
  repeated from FR-CMS-008) stated that *"FR-CMS-008's existing E2E/UAT already
  covers the rendered `href`."* **The UAT half is accurate; the E2E half is
  false.** Re-verified directly at doc time, and the accurate position is
  narrower than either the original claim or its first correction:
  `apps/e2e/tests/smoke-content-pages.spec.ts` **does** exercise `/rules` and
  `/rules/[slug]`, but only for FR-CMS-007 concerns — the 5-document listing,
  terminology, the superseded label, unknown-slug handling, traversal. **No
  spec asserts the download link, `sourceFile`, or the emitted asset origin.**
  So **no Playwright regression guard exists for this requirement's surface**
  and none was inherited from FR-CMS-008. That claim must not be repeated
  downstream. (A grep cited earlier in this workflow searched `apps/e2e/src`,
  a path that does not exist in this repo — the specs live under
  `apps/e2e/tests/`. Its "zero files" result was vacuous; the conclusion above
  is re-derived from the real path.)
  The decision to decline E2E stands on three independently verified grounds
  that do not depend on it: (1) the suite is **prod-targeted**
  (`apps/e2e/playwright.config.ts` defaults `BASE_URL` to
  `https://aiqadam.org`), and a prod-targeted suite structurally cannot verify
  an override because prod is exactly where the override is deliberately unset;
  (2) the suite is **non-CI-gating** — no `test:e2e`/`playwright` step exists in
  `.github/workflows/ci.yml`; (3) making an E2E prove anything would require CI
  to inject `PUBLIC_DIRECTUS_URL` *and* provide a reachable Directus at that
  origin — i.e. pulling the deferred T-0141 QA-vhost infra into this PR through
  the back door. See also FR-CMS-008's own corrected note.
- **The test file's one deliberate convention departure.**
  `cms-content-pages.test.ts` follows this directory's *local re-implementation
  mirror* convention, which exists for one stated reason: the real module reads
  `process.env` and calls global `fetch`, so importing it would force `vi.mock`
  of both. `resolvePublicDirectusUrl` has neither dependency, so the
  convention's precondition is absent — and mirroring would have been *actively
  harmful*, because the entire subject of this FR is **which mechanism the
  function reads**. A local copy would assert the mirror's mechanism and pass
  regardless of what ships: a test that cannot fail for the bug it exists to
  catch. The departure is exactly one import, documented in a comment block at
  the head of the file; every other helper stays mirrored and
  `PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test'` (the deliberate `.test`,
  not `.org`) is preserved so a base regression in the mirrored half stays
  visible.
- **Out of scope, deliberately.** `assetUrl()` and the four inline
  `${directusBase()}/assets/…` sites (they may legitimately want the internal
  base; widening the fix is a separate change, and FR-CMS-008 already flags them
  for a follow-up before any of those collections ships real data); the
  `INTERNAL_DIRECTUS_URL` SSR half; `api-client.ts`'s dead
  `import.meta.env.PUBLIC_API_URL` path; and the QA Directus vhost itself
  (infra, T-0141).
- **No `apps/api` / NestJS surface, no Drizzle migration, no shared-types
  change.** `resolvePublicDirectusUrl` is the only new export and its sole
  importer is the test file. No page and no block was touched — all 19
  `lib/cms` importers take only the fetchers, whose return shape is unchanged.
- No `BP-UAT-*` business process covers these pages — re-checked against
  `docs/02-business-processes/uat/registry.md`'s full script list, all of which
  cover auth, events, registration, admin/ops, points, or referral flows; none
  is a public marketing/content-page surface. `business_process` is left as `—`
  per protocol rather than linking a non-matching script, same as FR-CMS-007 and
  FR-CMS-008.
