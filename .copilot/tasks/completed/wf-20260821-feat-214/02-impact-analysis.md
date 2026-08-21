# 02 — Impact Analysis

**Workflow:** `wf-20260821-feat-214`
**Agent:** ImpactAnalyzer
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009`

---

## Validated Requirement

**`FR-CMS-009` — Environment-configurable public Directus origin**

Replace the hardcoded module constant
`PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org'` in
`apps/web-next/src/lib/cms.ts` (L14) with a resolver reading
**`process.env.PUBLIC_DIRECTUS_URL` at SSR runtime**, defaulting to
`https://cms.aiqadam.org` when unset / empty / whitespace-only. Both consumers
(`directusBase()`'s client branch L30, `publicAssetUrl()` L873–876) read the
same resolved value. `publicAssetUrl()` stays **realm-independent** (no
`typeof window` branch), preserving FR-CMS-008's MAJOR-2 invariant.

Out of scope: `DEFAULT_INTERNAL_DIRECTUS_URL` / `INTERNAL_DIRECTUS_URL`;
`assetUrl()`'s behavior; the QA Directus vhost (infra, T-0141);
`api-client.ts`'s dead `import.meta.env.PUBLIC_API_URL` path.

**Mechanism confirmed by ImpactAnalyzer (independent re-verification):**
`process.env`, not `import.meta.env`. Re-checked against the committed build
artifact `apps/web-next/dist/server/chunks/Layout_BbgZAM2b.mjs` L702–710, where
Vite has already inlined `import.meta.env` into a frozen literal
(`{ASSETS_PREFIX, BASE_URL, DEV, MODE, PROD, SITE, SSR}`) that contains **no**
`PUBLIC_API_URL` key. Any `import.meta.env.PUBLIC_DIRECTUS_URL` would compile to
the same permanently-`undefined` destructure and the bug would survive the fix.

---

## Affected Layers

### API (NestJS) — **NOT AFFECTED**

| Module | Change |
|---|---|
| — | None. No `apps/api/src/modules/**` file is touched. |

The public Directus origin is consumed only by the Astro frontend when building
browser-facing `href`s. `apps/api` has its own independent Directus
configuration and is not in the call path.

### DB Changes Required — **NO** (verified)

- No Drizzle schema change. `apps/api/drizzle/` contains no new migration and
  none is needed — the change is a string-resolution refactor with zero
  persistence surface.
- No Directus collection/field change. `content_documents.source_file` already
  exists (added by FR-CMS-008; `infrastructure/directus/bootstrap.sh` has 8
  `source_file` references, all pre-existing). This FR changes only the
  **origin** prefixed onto the already-stored file uuid.
- **DBMigrationAuthor is NOT required. Step may be skipped.**

### Shared Types — **NOT AFFECTED**

No new Zod schema or TS type in `packages/shared-types/`. `CmsContentDocument`
keeps its existing `sourceFileUrl: string | null` shape; only the value's
origin substring changes.

### Frontend (`apps/web-next`) — **AFFECTED (sole code surface)**

| File | Change | Notes |
|---|---|---|
| `apps/web-next/src/lib/cms.ts` | **Modify** | L14 constant → runtime resolver. L30 (`directusBase()` client branch) and L875 (`publicAssetUrl()`) call the resolver. **Recommended:** extract an exported pure helper `resolvePublicDirectusUrl(env = process.env)` so the value is testable without env mutation (see Test Scope). |
| `apps/web-next/.env.example` | **Modify** | Add `PUBLIC_DIRECTUS_URL=` with a comment: browser-facing public origin, defaults to `https://cms.aiqadam.org`, distinct from `INTERNAL_DIRECTUS_URL`. Currently contains only `TELEGRAM_BOT_USERNAME` (AC-9). |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | **Modify (additive)** | See Test Scope — the existing FR-CMS-008 assertions do **not** break; new coverage is added. |
| `deploy/docker-compose.qa.yml` | **Modify (recommended)** | Add a commented `PUBLIC_DIRECTUS_URL` to the `web-next` service `environment:` block (L242–261) documenting the knob and why it is currently unset on QA (no QA Directus vhost yet — T-0141). |
| `deploy/docker-compose.prod.yml` | **Optional** | May stay unset — the default *is* the prod value, and "no prod config change required" is an explicit requirement. A comment-only reference is the safe choice. |
| `docs/03-requirements/FR-CMS-009.md` | **Create** | New FR doc (DocWriter). |
| `docs/03-requirements/requirements-registry.md` | **Modify** | Add `009` to the CMS row (L32) and a new row `71 | FR-CMS-009 | ... | CMS-008` in the FR implementation-order table (currently ends at row 70). |

**Pages / blocks: zero changes.** 19 importers of `lib/cms` were enumerated;
none imports `publicAssetUrl`, `assetUrl`, `directusBase`, or
`sourceFileDownloadUrl` — all four are module-private. `rules.astro:17` and
`rules/[slug].astro:22` import only `fetchContentDocuments` /
`fetchContentDocument`, whose return shape is unchanged. **Blast radius is one
module-internal string.**

### Bot (`apps/bot`) — **NOT AFFECTED**

No aiogram handler or keyboard consumes this value.

### Workers (`apps/workers`) — **NOT AFFECTED**

No BullMQ queue or processor consumes this value.

### `apps/web` (v1) — **NOT AFFECTED**

v1 has its own `PUBLIC_API_URL` in `apps/web/.env.example:5` and its own
`CMS_URL` convention (`docs/03-requirements/web-v1-feature-surface.md:203`).
Explicitly untouched — v1 is in cutover freeze per ADR-0038.

---

## API Surface Changes

| Endpoint | Method | Change | Breaking? |
|---|---|---|---|
| — | — | **None.** No REST endpoint added, removed, or modified. | No |

The only externally-observable change is the **origin substring** of the
`href` in the `/rules/[slug]` source-document download link, and only when the
new env var is explicitly set. With it unset, output is byte-identical to
today's — the "production behavior unchanged, no prod deploy config change"
requirement holds by construction.

---

## Cross-Module Calls

| Caller | Called | Via |
|---|---|---|
| `apps/web-next` `/rules/[slug]` (SSR) | Directus `/assets/<uuid>?download` | Browser-side `href` emitted into HTML — **not** a server-to-server call. Origin is exactly what this FR makes configurable. |
| `apps/web-next` `lib/cms.ts` `get()` (SSR) | Directus REST | `INTERNAL_DIRECTUS_URL` — **unchanged by this FR**, listed only to confirm the two paths stay separate. |

No new cross-module service call. No tenant-scoped data. No new auth or
permission requirement — the Directus source-file folder is already
public-read per FR-CMS-008.

---

## Risk Flags

### Security Review Required — **YES (targeted, low severity)**

Not because the change is dangerous, but because it **re-touches code that a
prior security review specifically hardened**. `wf-20260821-feat-213`'s
MAJOR-2 finding was resolved with the wording *"eliminated by construction, not
by configuration"* — and this FR introduces configuration into that exact
function. SecurityReviewer must confirm the distinction holds:

| Invariant (FR-CMS-008 MAJOR-2) | Preserved? | How |
|---|---|---|
| No `typeof window` branch in `publicAssetUrl()` | Must remain true | Resolver is realm-independent; reading `process.env` does not add a realm branch. |
| Never emits `directus:8055` / `//directus` | Must remain true | Default is the https public origin; internal path untouched. Guarded by existing negative assertions (test L489–499). |
| Never a plaintext `http://` mixed-content downgrade of an HTTPS page | **New residual risk** | An operator *could* now set `PUBLIC_DIRECTUS_URL=http://...`. |

**Residual risks to adjudicate:**

1. **`http://` misconfiguration (LOW).** A new operator-controlled foot-gun.
   Mitigation options: (a) document the https requirement in `.env.example` and
   the FR doc; (b) reject non-`https://` values and fall back to the default.
   ImpactAnalyzer recommends **(a) + an existing-test guard**: the current test
   `expect(url).toMatch(/^https:\/\//)` (L501–510) already encodes the intent,
   and hard-rejecting `http://` would break local-dev use of a plain-HTTP
   Directus. SecurityReviewer to make the call.
2. **Open-redirect / SSRF — NOT APPLICABLE.** The value is deployment
   configuration, never user- or request-derived. No untrusted input reaches
   the resolver.
3. **Secret exposure — NONE.** A public hostname. Safe in `.env.example`,
   compose, docs, and client HTML.
4. **`process.env` read on the client branch (LOW, needs care).**
   `directusBase()`'s client branch (L30) runs where `window` is defined. If the
   resolver is written naively as a bare `process.env.X` access and the module
   is ever imported into a client bundle, `process` may be undefined at runtime.
   Today no client importer exists (all 19 importers are frontmatter/SSR, and
   the two `.tsx` importers pull only types plus `updateSiteSettings`), so this
   is latent rather than live — but the resolver should still guard
   (`typeof process !== 'undefined'`) or the default must be reachable without
   touching `process`. **Flag for CodeDeveloper.**

### Architecture Rule Risks — **NONE**

| Rule | Status |
|---|---|
| ADR-0038 §Locks #1 (blocks never import `lib/cms`) | ✅ No block changed. Two existing `.tsx` block importers are pre-existing and untouched. |
| ADR-0038 §Locks #2 (no raw `fetch` outside `src/lib/`) | ✅ No fetch added or relocated. |
| ADR-0038 §Locks #3 (pages via `pnpm gen:page`, no inline `style=`) | ✅ No page created or modified. |
| Module boundaries | ✅ Change confined to `apps/web-next/src/lib/` (L1 runtime). |
| No cross-schema queries | ✅ N/A. |
| Single monorepo / no stack deviation | ✅ Uses `process.env`, already the app's dominant config mechanism. |

**No `failed-escalate` condition present.**

### Regression Risk — **LOW, with one named trap**

> **The single highest-value warning for CodeDeveloper:** the "obvious"
> implementation — `import.meta.env.PUBLIC_DIRECTUS_URL`, matching
> `api-client.ts`'s `resolveBase()` — is **wrong and would silently no-op**.
> Vite inlines `import.meta.env` into a frozen literal at `astro build` time;
> the compiled proof is in `dist/server/chunks/Layout_BbgZAM2b.mjs` L702–710,
> where `PUBLIC_API_URL` is destructured from an object that does not contain
> it. The code would review cleanly, the unit tests could even pass if they
> mocked `import.meta.env`, and QA would still emit
> `https://cms.aiqadam.org/...`. **Use `process.env`.** AC-10 exists
> specifically to catch this.

---

## Test Scope

### Does any existing test assert the hardcoded production URL? — **NO** (verified)

This was checked explicitly per the task brief. **Findings:**

`apps/web-next/src/lib/cms-content-pages.test.ts` follows this directory's
established **local re-implementation mirror** convention (documented at L11–18
of `cms.test.ts` and L78 of `wf-20260821-feat-213/06-test-design.md`): it does
not import `lib/cms.ts`; it re-declares the logic locally against its own
constant:

```ts
const PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test';   // L237
```

Note `.test`, **not** `.org` — deliberately a different host from both the
production origin and the internal one, precisely so a base regression is
visible. **Consequence: no existing test hardcodes `https://cms.aiqadam.org`,
and none breaks when the constant becomes a resolver.**

The 7 assertions referencing `PUBLIC_DIRECTUS_BASE` (L429, L486, L522, L591,
L626, plus the two negative guards at L497–498) all continue to pass unchanged.

**The FR-CMS-008 negative guard specifically called out in the brief:**

```ts
// L489-499  "never emits the internal docker hostname"
expect(url).not.toContain('directus:8055');
expect(url).not.toContain('//directus');
// L501-510  "emits an https absolute URL, not a plaintext or relative one"
expect(url).toMatch(/^https:\/\//);
```

These are asserted against the mirror's own `.test` constant, so they **do not
need updating** — and they must be **kept**, because they encode the exact
invariant FR-CMS-009 risks eroding (AC-5). They should be *extended*, not
replaced, to also run against a resolver whose env is unset.

**Also checked and clear:**
- `apps/web-next/src/lib/cms.test.ts` L100: `DIRECTUS_BASE = 'http://directus:8055'`
  — that is the **internal** base, which this FR does not touch. No change.
- `apps/web-next/src/lib/cms-landing-page.test.ts` — no public-origin reference.
- Repo-wide: the only `https://cms.aiqadam.org` literals in source are
  `cms.ts:14` and the (regenerable) `dist/` artifact. All other hits are prose
  in `docs/**` describing the production deployment, none of which is an
  assertion.

### Unit (Vitest) — **PRIMARY AND SUFFICIENT**

Target file: `apps/web-next/src/lib/cms-content-pages.test.ts` (extend), or a
narrow companion spec.

| AC | Coverage |
|---|---|
| AC-1 | Env unset → `https://cms.aiqadam.org` (production parity). |
| AC-2 | Env set → that value. |
| AC-3 | End-to-end derivation: `<override>/assets/<uuid>?download`, `?download` intact. |
| AC-4 | `''` / whitespace-only → default (never a relative or base-only URL). |
| AC-5 | Extend the existing negative guards: no `directus:8055`, no `//directus`, absolute URL — under both unset and overridden env. |
| AC-6 | Realm independence: `publicAssetUrl()` returns the public origin under `typeof window === 'undefined'`. |
| AC-7 | `directusBase()` SSR branch still returns `INTERNAL_DIRECTUS_URL`, and `http://directus:8055` when unset. |
| AC-8 | Both consumers agree on one configured origin. |

**Testability blocker → design recommendation.** The mirror convention
forbids `process.env` mocking (`06-test-design.md` L78), yet AC-1/2/4 must vary
the env. Resolve by **exporting a pure, injectable helper** from `cms.ts`:

```ts
export function resolvePublicDirectusUrl(
  env: { PUBLIC_DIRECTUS_URL?: string | undefined } = process.env,
): string { /* trim, length-guard, default */ }
```

Tests then call it directly with a literal object — no env mutation, no
`vi.mock`, mirror convention intact, and the resolver becomes genuinely unit-
testable. **This is a recommendation to TestStrategist/CodeDeveloper, not a
mandate.**

### Integration (Testcontainers) — **NOT REQUIRED**

No DB, no API, no container-backed dependency. Nothing to spin up.

### E2E (Playwright) — **NOT REQUIRED for merge**

The rendered `href` is already covered by FR-CMS-008's E2E/UAT. Re-running it
here would exercise the default path only (CI sets no override), duplicating
AC-1 at far higher cost.

### UAT — **PARTIAL, with a known infra dependency (must not be mis-scoped)**

`handoff.yaml` sets `uat_target: local`. Locally verifiable: set
`PUBLIC_DIRECTUS_URL` in `apps/web-next/.env`, load `/rules/<slug>`, confirm the
download `href` origin changes; unset it, confirm it reverts to
`https://cms.aiqadam.org`. That fully covers AC-1/AC-2/AC-3 behaviorally.

**Full QA end-to-end verification is blocked on infra outside this PR**: QA has
no Directus vhost (`cms.qa.aiqadam.org` / `directus.qa.aiqadam.org` do not
resolve), so there is no QA value to point the var at. Per `AGENTS.md` §6.1 this
must be recorded as a **named deferral with a queued follow-up**, not silently
dropped — the follow-up is the T-0141-adjacent infra task already named in the
handoff. **This PR's own ACs are all locally and unit-verifiable**, so §6.1's
"bring the stack up" obligation does not gate merge here: the missing piece is a
public DNS vhost on a remote host, not a `docker compose up` the Orchestrator
can perform.

---

## Gate Result

gate_result:
  status: passed
  summary: "Impact fully analyzed for FR-CMS-009: a single module-private constant in apps/web-next/src/lib/cms.ts becomes a process.env-backed runtime resolver; no DB migration, no API surface, no shared types, no blocks or pages, and no existing test asserts the hardcoded production URL."
  findings:
    - "AFFECTED FILES (7): apps/web-next/src/lib/cms.ts (modify — L14 constant to resolver, L30 + L875 consumers); apps/web-next/.env.example (add PUBLIC_DIRECTUS_URL, currently only TELEGRAM_BOT_USERNAME); apps/web-next/src/lib/cms-content-pages.test.ts (extend, additive); deploy/docker-compose.qa.yml (documenting env entry on the web-next service, L242-261); deploy/docker-compose.prod.yml (optional/comment-only — default IS the prod value, so no prod config change is required); docs/03-requirements/FR-CMS-009.md (create); docs/03-requirements/requirements-registry.md (CMS row L32 + new implementation-order row 71)."
    - "DB MIGRATION: NOT REQUIRED — verified. apps/api/drizzle/ needs no new migration; content_documents.source_file already exists from FR-CMS-008 (8 references in infrastructure/directus/bootstrap.sh, all pre-existing). Only the origin prefixed onto an already-stored uuid changes. DBMigrationAuthor step may be skipped."
    - "EXISTING TESTS DO NOT BREAK — verified directly. cms-content-pages.test.ts follows the local re-implementation mirror convention and declares its own PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test' at L237 (note .test, NOT .org, deliberately a different host from both production and internal). It never imports lib/cms.ts, so no test hardcodes https://cms.aiqadam.org. All 7 assertions referencing that constant (L429, L486, L522, L591, L626 + the negatives) pass unchanged."
    - "THE FR-CMS-008 NEGATIVE GUARD FLAGGED IN THE BRIEF (L489-499: not.toContain('directus:8055'), not.toContain('//directus'), plus L501-510's /^https:\\/\\// match) needs NO update and MUST BE KEPT — it encodes precisely the invariant FR-CMS-009 risks eroding. It should be EXTENDED to also run with env unset, not replaced. This is AC-5."
    - "cms.test.ts L100's DIRECTUS_BASE = 'http://directus:8055' is the INTERNAL base — explicitly out of scope, no change. cms-landing-page.test.ts has no public-origin reference. Repo-wide, the only https://cms.aiqadam.org source literals are cms.ts:14 and the regenerable dist/ artifact; every other hit is prose in docs/** describing the prod deployment, not an assertion."
    - "ZERO PAGE/BLOCK BLAST RADIUS: all 19 importers of lib/cms were enumerated; none imports publicAssetUrl, assetUrl, directusBase, or sourceFileDownloadUrl (all four are module-private). rules.astro:17 and rules/[slug].astro:22 import only the fetchers, whose return shape is unchanged."
    - "MECHANISM RE-VERIFIED INDEPENDENTLY: process.env.PUBLIC_DIRECTUS_URL (SSR runtime), NOT import.meta.env. dist/server/chunks/Layout_BbgZAM2b.mjs L702-710 shows Vite already inlined import.meta.env into a frozen literal with no PUBLIC_API_URL key, so the existing PUBLIC_ precedent in api-client.ts resolveBase() is permanently undefined at runtime. The 'obvious' pattern-matching implementation would silently no-op: it reviews clean, can pass mocked tests, and still emits the production URL on QA. AC-10 exists to catch this. HIGHEST-VALUE WARNING FOR CODEDEVELOPER."
    - "SECURITY REVIEW REQUIRED (targeted, low severity) — this FR re-touches the exact function wf-20260821-feat-213 hardened, whose MAJOR-2 resolution was worded 'by construction, not by configuration'. SecurityReviewer must confirm realm-independence survives (no typeof-window branch added to publicAssetUrl) and adjudicate ONE new residual risk: an operator could now set an http:// origin, a mixed-content downgrade. Recommend documenting the https requirement + relying on the existing /^https:\\/\\// test rather than hard-rejecting http://, since local dev may legitimately use plain-HTTP Directus. No SSRF/open-redirect surface (value is deployment config, never request-derived) and no secret exposure (public hostname)."
    - "CODEDEVELOPER CAUTION: directusBase()'s client branch (L30) runs where window is defined. A bare process.env.X access there is latent-unsafe if cms.ts is ever pulled into a client bundle (today all 19 importers are SSR/frontmatter, and the 2 .tsx importers take only types + updateSiteSettings, so it is latent not live). Guard with typeof process !== 'undefined' or ensure the default is reachable without touching process."
    - "TEST SCOPE: Unit (Vitest) is primary and sufficient — covers AC-1 through AC-8. Integration/Testcontainers NOT required (no DB, no API, no container dependency). E2E Playwright NOT required for merge (FR-CMS-008 already covers the rendered href; CI sets no override so it would only duplicate AC-1's default path at high cost)."
    - "TESTABILITY BLOCKER + RECOMMENDATION: the mirror convention forbids process.env mocking, but AC-1/2/4/10 must vary env. Recommend CodeDeveloper export a pure injectable resolvePublicDirectusUrl(env = process.env) from cms.ts so tests pass a literal object — no env mutation, no vi.mock, mirror convention intact, resolver genuinely unit-testable."
    - "UAT DEFERRAL (AGENTS.md §6.1 compliant): all ACs are locally verifiable via apps/web-next/.env, so nothing gates merge. Full QA end-to-end remains blocked on QA having no Directus vhost (cms.qa.aiqadam.org / directus.qa.aiqadam.org do not resolve) — record as a NAMED deferral against the T-0141-adjacent infra task, not a silent drop. §6.1's 'bring the stack up' obligation does not apply: the gap is a public DNS vhost on a remote host, not a docker compose up the Orchestrator can perform."
    - "NO ARCHITECTURE RULE VIOLATION: ADR-0038 Locks #1/#2/#3 all clear (no block, no raw fetch, no page touched); change confined to apps/web-next/src/lib/ (L1); no cross-schema query; no stack deviation. No failed-escalate condition present."
