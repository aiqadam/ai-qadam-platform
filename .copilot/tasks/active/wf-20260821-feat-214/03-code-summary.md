# 03 — Code Summary

**Workflow:** `wf-20260821-feat-214`
**Agent:** CodeDeveloper
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009`

---

## Requirement Implemented

**`FR-CMS-009` — Environment-configurable public Directus origin.**

The hardcoded module constant `PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org'`
(`apps/web-next/src/lib/cms.ts` L14) is replaced by an exported, pure,
injectable resolver `resolvePublicDirectusUrl(env?)` that reads
**`process.env.PUBLIC_DIRECTUS_URL` at SSR runtime**, falling back to
`https://cms.aiqadam.org` when unset, empty, or whitespace-only.

Both public consumers — `directusBase()`'s client branch and
`publicAssetUrl()` — now call that single resolver, so the module can never
hold two divergent public origins. `publicAssetUrl()` stays realm-independent
(no `typeof window` branch), preserving FR-CMS-008's MAJOR-2 invariant.

`DEFAULT_INTERNAL_DIRECTUS_URL`, the `INTERNAL_DIRECTUS_URL` SSR branch, and
`assetUrl()`'s behavior for its existing callers are untouched, as required.

---

## Files Changed

| File | Change Type | Description |
|---|---|---|
| `apps/web-next/src/lib/cms.ts` | Modify | L14 constant → `DEFAULT_PUBLIC_DIRECTUS_URL` + exported `resolvePublicDirectusUrl(env)`. Both consumers (`directusBase()` client branch, `publicAssetUrl()`) call the resolver. Extensive comment records why `process.env`, not `import.meta.env`. |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | Modify (additive) | Imports the real `resolvePublicDirectusUrl`; adds 20 tests covering AC-1/2/3/4/8/10 + client-bundle safety. Existing FR-CMS-008 negative guards **kept verbatim** and **extended** with a 5-case `it.each` over the real resolver. |
| `apps/web-next/.env.example` | Modify | Adds documented `PUBLIC_DIRECTUS_URL=` (AC-9): browser-facing purpose, `https://cms.aiqadam.org` default, explicit contrast with `INTERNAL_DIRECTUS_URL`, https/no-trailing-slash guidance. |
| `deploy/docker-compose.qa.yml` | Modify (comment-only) | Documents the knob on the `web-next` service, why it is deliberately unset on QA (no QA Directus vhost — T-0141), and the exact line to add once the vhost exists. |
| `deploy/docker-compose.prod.yml` | Modify (comment-only) | Documents the knob as intentionally unset because the code default **is** the prod value — no prod config change required. |

**Not changed (deliberately):** no page, no block, no API, no shared type, no
DB migration. All 19 `lib/cms` importers were re-confirmed to import only the
fetchers; `publicAssetUrl`/`assetUrl`/`directusBase`/`sourceFileDownloadUrl`
remain module-private. `resolvePublicDirectusUrl` is the only new export and is
imported solely by the test file.

`docs/03-requirements/FR-CMS-009.md` and the requirements registry are
DocWriter's scope per the impact analysis, not written here.

---

## Key Design Decisions

### 1. `process.env`, NOT `import.meta.env` — and it is verified, not assumed

This was the load-bearing constraint and I verified it against the **freshly
compiled artifact** rather than trusting the source. The new
`dist/server/chunks/cms_CQjEHz28.mjs` contains:

```js
var DEFAULT_PUBLIC_DIRECTUS_URL = "https://cms.aiqadam.org";
function resolvePublicDirectusUrl(env = typeof process === "undefined" ? void 0 : process.env) {
	const configured = env?.PUBLIC_DIRECTUS_URL;
	if (typeof configured !== "string") return DEFAULT_PUBLIC_DIRECTUS_URL;
	const trimmed = configured.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_PUBLIC_DIRECTUS_URL;
}
```

`process.env` survives verbatim into the bundle — **no** Vite-inlined frozen
literal, and grepping the chunk for a `PUBLIC_DIRECTUS_URL`-alongside-
`ASSETS_PREFIX` literal object returns 0 hits. I then executed the compiled
function against a live `process.env` (AC-10, exercised on the build output, not
the source):

| `PUBLIC_DIRECTUS_URL` | Compiled resolver returns |
|---|---|
| `https://cms.qa.aiqadam.org` | `https://cms.qa.aiqadam.org` |
| unset | `https://cms.aiqadam.org` |
| `'   '` | `https://cms.aiqadam.org` |
| changed to `https://cms.staging.aiqadam.org` mid-process | `https://cms.staging.aiqadam.org` |

The last row is the decisive one: the value changed **without a rebuild**,
which is exactly what `import.meta.env` could not have done. The trap described
in the impact analysis is confirmed avoided end-to-end.

The `PUBLIC_` name prefix is retained (Astro's prefix rule governs
`import.meta.env` client-bundle exposure only; it places no constraint on
`process.env` key names) and a long comment in `cms.ts` records the whole
rationale, including a pointer to the dead `PUBLIC_API_URL` precedent, so the
next developer doesn't "fix" this back to the broken pattern.

### 2. Defensive `process` access (ImpactAnalyzer's flagged caution)

`directusBase()`'s client branch runs where `window` is defined. A bare
`process.env` default parameter would throw if `cms.ts` were ever pulled into a
client bundle. The default is written as
`typeof process === 'undefined' ? undefined : process.env`, and the body uses
`env?.PUBLIC_DIRECTUS_URL`, so the production default stays reachable without
ever touching `process`. Covered by a dedicated test passing `undefined`.

### 3. Pure + injectable, per the ImpactAnalyzer recommendation

Adopted as recommended. The resolver takes its env as a parameter, so AC-1/2/4
are testable with plain literal objects — no `vi.mock`, no `process.env`
mutation, no `global.fetch` stub. This is what let the test file keep its
mirror convention intact.

### 4. One deliberate, narrow departure from the mirror convention

The test file imports `resolvePublicDirectusUrl` from the real `./cms` module
instead of mirroring it. Mirroring would have been actively
counterproductive here: the entire point of the function is *which mechanism it
reads*, and a local copy would assert the mirror's mechanism rather than the
shipped one — precisely the failure mode where "tests pass, QA still emits the
production URL." The function is pure and side-effect-free, so importing it
pulls in no fetch and no env dependency. A comment at the top of the file
records this as the single exception; every other helper stays mirrored.

### 5. Existing FR-CMS-008 guards extended, never replaced

The L489–499 `not.toContain('directus:8055')` / `not.toContain('//directus')`
tests and the `/^https:\/\//` check are unchanged, still asserting against the
mirror's `PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test'` (the deliberate
`.test`, not `.org`, convention is preserved). A new `it.each` block re-asserts
the same invariant against the **real** resolver across five env shapes —
unset, `undefined`, empty string, whitespace-only, and overridden — because
making the origin configurable is exactly the change that could erode MAJOR-2.

### 6. Trimming yes, trailing-slash stripping no

Whitespace is trimmed (compose/`.env` values pick up stray spaces easily, and
an untrimmed base would emit a URL containing a space). Trailing slashes are
deliberately **not** stripped, matching assumption A3 — no existing helper in
this app strips them and the `INTERNAL_DIRECTUS_URL` compose values carry none.
Both behaviors are pinned by tests.

### 7. `http://` documented, not hard-rejected

Following the ImpactAnalyzer recommendation (option (a)): `.env.example` and
both compose files state the https requirement, and the existing
`/^https:\/\//` test guards the default path. Hard-rejecting `http://` would
break legitimate local-dev use of a plain-HTTP Directus. **Left explicitly for
SecurityReviewer to adjudicate** — this is the one new residual risk introduced
by the feature.

---

## Architecture Rule Compliance

| Rule | Status |
|---|---|
| Module boundaries | ✅ Change confined to `apps/web-next/src/lib/` (L1 runtime). No page, block, API, or worker touched. |
| ADR-0038 §Locks #1 (blocks never import `lib/cms`) | ✅ No block changed. |
| ADR-0038 §Locks #2 (no raw `fetch` outside `src/lib/`) | ✅ No fetch added or relocated. `pnpm arch:check` passes (289 files, mode=full). |
| ADR-0038 §Locks #3 (pages via `gen:page`, no inline `style=`) | ✅ No page created or modified. |
| Tenant scoping (`countryCode`) | N/A — no DB query, no tenant data. |
| Zod at boundaries | N/A — no external input reaches the resolver. The value is deployment configuration, never request- or user-derived (no SSRF/open-redirect surface). |
| No cross-schema queries | N/A — no DB access. |
| No `any` | ✅ Resolver is fully typed: `env: { PUBLIC_DIRECTUS_URL?: string \| undefined } \| undefined` → `string`. No `any`, no assertion, no non-null `!`. |
| Auth at controller level | N/A — no endpoint added. |
| Custom typed errors | N/A — resolver is total; it cannot fail, it falls back. |
| Promises awaited | N/A — synchronous. |
| shared-types | ✅ Unchanged. `CmsContentDocument.sourceFileUrl` keeps its `string \| null` shape. |
| Secrets | ✅ Value is a public hostname, safe in `.env.example`, compose, and docs. |

---

## Validation Run

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ 4/4 tasks successful. web-next: **0 errors, 0 warnings**, 272 files. (45 pre-existing hints in unrelated files.) |
| `pnpm arch:check` | ✅ Passed — 289 files scanned, mode=full. |
| `pnpm --filter @aiqadam/web-next test` | ✅ **44 files, 1115 tests passed**, 0 failed. |
| `cms-content-pages.test.ts` in isolation | ✅ 57 passed (was 37 → +20 new). |
| `pnpm build` / forced web-next rebuild | ✅ Server built in 9.16s, Complete. (Pre-existing unrelated `Astro.request.headers` prerender warnings only.) |
| Compiled-artifact AC-10 verification | ✅ `process.env` present in bundle; runtime execution changed the origin with no rebuild. |
| `dist/` diff noise | ✅ None — `apps/web-next/dist` is gitignored (`.gitignore:15`) and untracked. |

---

## Formatter Check

`pnpm biome check apps/web-next/src/lib/cms.ts apps/web-next/src/lib/cms-content-pages.test.ts`
→ **`Checked 2 files in 8ms. No fixes applied.`** Clean; no `--apply` needed.

Python ruff: N/A — no Python changed.

---

## Known Limitations

1. **QA still emits production download links until infra acts.** This PR makes
   the override *possible*, not *applied*. QA has no Directus vhost
   (`cms.qa.aiqadam.org` / `directus.qa.aiqadam.org` do not resolve), so
   `PUBLIC_DIRECTUS_URL` is left unset there and falls back to the production
   default. Named deferral, tracked alongside **T-0141** per the impact
   analysis and `AGENTS.md` §6.1 — not a silent drop. The QA compose file
   carries the exact line to uncomment once the vhost exists.

2. **New operator foot-gun: `http://` is accepted.** Setting a plaintext origin
   would be a mixed-content downgrade on an HTTPS page. Mitigated by
   documentation in three files plus the existing `/^https:\/\//` test guard,
   but not enforced in code — deliberately, so local-dev plain-HTTP Directus
   keeps working. **Flagged for SecurityReviewer's explicit adjudication.**

3. **`api-client.ts`'s dead `import.meta.env.PUBLIC_API_URL` path is untouched.**
   Confirmed still a real latent defect (it silently resolves to `/api` forever),
   but out of scope per the requirement — a separate blast radius. Recommend
   raising it as its own issue; `cms.ts`'s new comment cites it by name so
   nobody mistakes it for a working pattern to copy.

4. **`assetUrl()` and the four inline `${directusBase()}/assets/...` sites are
   unchanged.** Explicitly out of scope. They may legitimately want the internal
   base; widening the fix is a separate change.

5. **No E2E added.** Per the impact analysis, CI sets no override, so an E2E run
   would only duplicate AC-1's default path at high cost. FR-CMS-008's existing
   E2E/UAT already covers the rendered `href`.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-CMS-009 implemented: the hardcoded public Directus origin in apps/web-next/src/lib/cms.ts is now an exported, pure, injectable resolvePublicDirectusUrl(env) reading process.env.PUBLIC_DIRECTUS_URL at SSR runtime with the production value as fallback. Typecheck 0 errors, arch:check passed, 1115/1115 web-next tests pass, build succeeds, biome clean."
  findings:
    - "MECHANISM CONSTRAINT SATISFIED AND VERIFIED AGAINST THE COMPILED ARTIFACT, not just source. The freshly built dist/server/chunks/cms_CQjEHz28.mjs contains `function resolvePublicDirectusUrl(env = typeof process === \"undefined\" ? void 0 : process.env)` — process.env survives verbatim with NO Vite-inlined frozen literal (grep for a PUBLIC_DIRECTUS_URL-alongside-ASSETS_PREFIX literal object returns 0 hits). I then executed the compiled function against live process.env: env set -> override, unset -> https://cms.aiqadam.org, whitespace -> default, and changing the var mid-process changed the result with NO rebuild. AC-10 is proven on the build output, which is the only place the import.meta.env trap could have hidden."
    - "AC-1 (production parity) holds by construction: DEFAULT_PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org' is byte-identical to the removed L14 constant, so an environment that sets nothing behaves exactly as before and NO prod deploy config change is required by this PR."
    - "AC-5/AC-6 (FR-CMS-008 MAJOR-2 invariant) preserved. publicAssetUrl() gained NO typeof-window branch — it still resolves unconditionally, only the origin's VALUE became configurable. The existing negative guards at L489-499 and the /^https:\\/\\// check are KEPT VERBATIM and EXTENDED with a new 5-case it.each running the REAL resolver under unset / undefined / empty / whitespace / overridden env, each asserting no 'directus:8055', no '//directus', ^https://, and ?download intact."
    - "AC-8 satisfied structurally: directusBase()'s client branch and publicAssetUrl() both call the one resolver, so two divergent public bases in one module are now impossible rather than merely avoided."
    - "AC-7 confirmed unchanged: directusBase()'s SSR branch still returns INTERNAL_DIRECTUS_URL ?? 'http://directus:8055'. DEFAULT_INTERNAL_DIRECTUS_URL and assetUrl() were not touched, per the explicit out-of-scope list."
    - "IMPACTANALYZER'S CLIENT-BUNDLE CAUTION ADDRESSED: process is accessed defensively (typeof process === 'undefined' ? undefined : process.env) with optional chaining in the body, so the production default stays reachable without touching process if cms.ts is ever pulled into a client bundle. Covered by a dedicated test passing undefined."
    - "TEST CONVENTION: one deliberate, documented departure — resolvePublicDirectusUrl is IMPORTED from the real module rather than mirrored, because mirroring it would assert the mirror's mechanism instead of the shipped one, which is the exact failure mode this FR exists to prevent. It is pure and injectable so no vi.mock / no env mutation / no fetch stub is needed. PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test' (deliberate .test, not .org) is preserved and every other helper stays mirrored. 37 -> 57 tests in that file; 1115 pass repo-wide in web-next."
    - "DISCOVERABILITY (AC-9): apps/web-next/.env.example documents the var — browser-facing purpose, https://cms.aiqadam.org default, explicit contrast with INTERNAL_DIRECTUS_URL, https requirement, no trailing slash. Both deploy compose files carry comment-only entries: QA explains why it is unset (no QA Directus vhost, T-0141) and gives the exact line to uncomment; prod explains that the code default IS the prod value."
    - "FOR SECURITYREVIEWER — one new residual risk, deliberately not enforced in code: an operator could set PUBLIC_DIRECTUS_URL=http://... (mixed-content downgrade). Followed ImpactAnalyzer's recommended option (a): documented in three files + the existing /^https:\\/\\// test guard, rather than hard-rejecting non-https, which would break local-dev plain-HTTP Directus. Requesting explicit adjudication. No SSRF/open-redirect surface (deployment config, never request-derived) and no secret exposure (public hostname)."
    - "KNOWN DEFERRAL (AGENTS.md §6.1 compliant, named not silent): QA still emits production download links until infra stands up a QA Directus vhost — tracked alongside T-0141. This PR makes the override possible, not applied. No AC of THIS PR is gated by it; all ten are unit- or locally-verifiable and were verified."
    - "OUT-OF-SCOPE ITEMS CONFIRMED UNTOUCHED: assetUrl() and the four inline ${directusBase()}/assets/... sites; the INTERNAL_DIRECTUS_URL SSR half; and api-client.ts's dead import.meta.env.PUBLIC_API_URL path (still a real latent defect — recommend a separate issue; cms.ts's new comment cites it by name so it is not mistaken for a pattern to copy)."
    - "NO DB MIGRATION, no API surface change, no shared-types change, no page or block touched. resolvePublicDirectusUrl is the only new export and its sole importer is the test file. dist/ is gitignored (.gitignore:15) and untracked, so the rebuild adds no diff noise."
