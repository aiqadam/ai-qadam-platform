# 01 — Requirement Validation

**Workflow:** `wf-20260821-feat-214`
**Agent:** RequirementAnalyst
**Date:** 2026-08-21
**Assigned identifier:** `FR-CMS-009`

---

## Raw Input

`apps/web-next/src/lib/cms.ts` hardcodes the public Directus origin as a module
constant:

```ts
const PUBLIC_DIRECTUS_URL = 'https://cms.aiqadam.org';   // L14
```

It has exactly two consumers, both in the same file:

- `directusBase()` returns it on the client branch (L30).
- `publicAssetUrl()` builds browser-facing asset URLs from it (L875) — added by
  FR-CMS-008 for the `/rules/[slug]` source-document download links.

Because the value is hardcoded to the PRODUCTION hostname with no environment
override, any non-production deployment emits browser-facing links pointing at
production. Verified live 2026-08-21 on QA: the rendered download `href` would be
`https://cms.aiqadam.org/assets/<id>?download` regardless of environment, and
there is no QA Directus vhost at all (`cms.qa.aiqadam.org` and
`directus.qa.aiqadam.org` do not resolve; `cms.aiqadam.org` itself currently
returns 523). This makes the FR-CMS-008 feature unverifiable and non-functional
on QA, and blocked infra task T-0141 before it touched anything.

Requested change: make the public Directus origin environment-configurable,
defaulting to the current production value so production behavior is
byte-identical. Update `.env.example` and deploy/docs references. Explicitly
**out of scope**: `DEFAULT_INTERNAL_DIRECTUS_URL` / the server-side
`INTERNAL_DIRECTUS_URL` path (correct and load-bearing for SSR fetch
performance), and `assetUrl()`'s behavior for its existing callers. Also out of
scope (infra, not code): standing up a QA Directus vhost — tracked separately
alongside T-0141.

---

## Analysis

### Research performed (codebase-verified, not assumed)

The handoff explicitly instructed the analyst to verify the env-var mechanism
rather than assume it. Five investigations were run.

#### R1 — Does `apps/web-next` have an existing browser-facing-URL convention?

**Yes, exactly one:** `apps/web-next/src/lib/api-client.ts` → `resolveBase()`
(L54–71). Its shape is a realm branch identical in structure to `cms.ts`'s
`directusBase()`:

```ts
if (typeof window !== 'undefined') {
  const { PUBLIC_API_URL } = import.meta.env;          // client realm
  return typeof PUBLIC_API_URL === 'string' && PUBLIC_API_URL.length > 0
    ? PUBLIC_API_URL : '/api';
}
const { INTERNAL_API_URL = 'http://localhost:3000' } = process.env;  // SSR realm
return INTERNAL_API_URL;
```

`cms.ts:24–29` even cites this file by name as the pattern it mirrors. So there
*is* a precedent, and the naive reading of the requirement ("match the existing
pattern, don't invent one") would produce
`import.meta.env.PUBLIC_DIRECTUS_URL`.

**That naive reading is wrong.** See R3.

#### R2 — Is `PUBLIC_API_URL` actually configured anywhere?

**No.** A repo-wide grep for `PUBLIC_API_URL` outside `apps/web-next/src` and
`dist/` returns exactly one hit: `apps/web/.env.example:5` — that is **v1**
(`apps/web`), a different app. Within `apps/web-next`:

- `apps/web-next/.env.example` contains only `TELEGRAM_BOT_USERNAME`. No
  `PUBLIC_*` var at all.
- `deploy/docker-compose.qa.yml` (web-next service, L234–261) sets only
  `NODE_ENV`, `HOST`, `PORT`, `INTERNAL_API_URL`, `INTERNAL_DIRECTUS_URL`.
- `deploy/docker-compose.prod.yml` (web-next service) sets the same five.
- `apps/web-next/Dockerfile` declares **no `ARG`** and passes no build-time env
  into `pnpm --filter @aiqadam/web-next build` (L32–33).

So `PUBLIC_API_URL` has never been set in any environment. It is a
never-exercised code path that has always silently fallen through to its `/api`
default.

#### R3 — DECISIVE: `import.meta.env.PUBLIC_*` is inlined at build time and is
permanently `undefined` in this app's built server bundle

Inspecting the committed build output `apps/web-next/dist/server/chunks/
Layout_BbgZAM2b.mjs:700–711` — the compiled form of `resolveBase()`:

```js
function resolveBase() {
	if (typeof window !== "undefined") {
		const { PUBLIC_API_URL } = Object.assign({
			"ASSETS_PREFIX": void 0,
			"BASE_URL": "/",
			"DEV": false,
			"MODE": "production",
			"PROD": true,
			"SITE": "https://next.aiqadam.org",
			"SSR": true
		}, {});
		return typeof PUBLIC_API_URL === "string" && PUBLIC_API_URL.length > 0
			? PUBLIC_API_URL : "/api";
	}
	const { INTERNAL_API_URL = "http://localhost:3000" } = process.env;
	return INTERNAL_API_URL;
}
```

Vite has replaced `import.meta.env` with a **frozen literal object** captured at
`astro build` time. `PUBLIC_API_URL` is not a key in it — because it was not set
in the build environment — so the destructure yields `undefined`, forever, in
every container started from that image. By contrast `process.env.INTERNAL_API_URL`
survives verbatim into the bundle and is read at runtime, which is exactly why
the compose files can and do configure it.

This is not a theoretical hazard. It is the observed, compiled behavior of the
one existing precedent.

#### R4 — When is the value needed? (SSR vs browser)

Both consumers are reached, but the load-bearing one is **SSR**:

| Consumer | Realm at call time | Reached today? |
|---|---|---|
| `publicAssetUrl()` (L873–876) | **SSR only.** `/rules.astro:13` and `/rules/[slug].astro:18` both declare `export const prerender = false`, so `typeof window === 'undefined'` at render. Its value is serialized into the HTML `href`. | **Yes** — this is the FR-CMS-008 download link, the actual broken behavior. |
| `directusBase()` client branch (L30) | Browser. | **Not currently.** `cms.ts` is documented as frontmatter-only (L16–22: "Pages should only call these from frontmatter, but the dual-base keeps the module usable from either realm just in case"). No client-side importer exists. |

`publicAssetUrl()` is deliberately realm-*independent* — FR-CMS-008 made it
unconditional precisely so the SSR realm could not leak the internal Docker
hostname into browser HTML (see `cms.ts:854–872` and the MAJOR-2 finding in
`wf-20260821-feat-213/04-security-review.md`). That property must be preserved.

**Consequence:** the value is needed **at SSR runtime**, in the Node process, on
a code path where `import.meta.env` is a build-frozen literal. `import.meta.env.
PUBLIC_DIRECTUS_URL` would therefore be `undefined` at exactly the moment the
`href` is built, and the feature would silently keep emitting the hardcoded
default — i.e. the bug would appear fixed in review and remain broken in
production.

#### R5 — Is the app built once and deployed to many environments?

**No — it is rebuilt per environment, but that does not rescue the build-time
approach.** Both `deploy/docker-compose.qa.yml` (L235–238) and
`deploy/docker-compose.prod.yml` build from `context: ..` /
`dockerfile: apps/web-next/Dockerfile` on the target host, producing
per-environment images (`aiqadam-qa-web-next:latest`,
`aiqadam-prod-web-next:latest`).

So a build-time var is *technically* achievable — but it would require:
`ARG PUBLIC_DIRECTUS_URL` in the Dockerfile → `ENV` in the builder stage →
`build.args` in **both** compose files → and a full image rebuild to change the
value. That is three new files touched, a new Dockerfile ARG convention this
repo has never used, and a knob that cannot be changed by restarting a container.

Meanwhile `process.env` needs **one line in one compose file** and is the
mechanism every other URL in this app already uses (`INTERNAL_API_URL`,
`INTERNAL_DIRECTUS_URL`, `HOST`, `PORT`, `TELEGRAM_BOT_USERNAME`).

#### Conclusion on mechanism

> **Use `process.env.PUBLIC_DIRECTUS_URL`, read at SSR runtime, with
> `'https://cms.aiqadam.org'` as the fallback default.**

The `PUBLIC_` **name** prefix is kept — it correctly signals "this origin is
emitted into browser-facing HTML", matches `PUBLIC_API_URL`'s naming, and is
harmless as a plain `process.env` key (Astro's prefix rule governs what
`import.meta.env` *exposes to client bundles*; it places no constraint on
`process.env` names). The `import.meta.env` **access mechanism** is rejected on
the compiled-bundle evidence in R3.

This is **not** inventing a novel pattern: it is `directusBase()`'s own existing
SSR branch (`const { INTERNAL_DIRECTUS_URL } = process.env`) applied to the
public half, using the same biome-friendly destructuring idiom already in both
files.

> **Note for CodeDeveloper / SecurityReviewer:** the pre-existing
> `import.meta.env.PUBLIC_API_URL` dead path in `api-client.ts` is **out of
> scope** for this PR. It is a real latent defect (R3) but touching it is a
> separate blast radius. Recommend it be raised as its own issue.

### Completeness Issues Found

The raw requirement was **complete on intent** but deliberately deferred the
mechanism decision to this step ("check ... before choosing", "confirm the actual
mechanism ... rather than assuming"). That decision is now made and evidenced
above. Three residual ambiguities were resolved with stated assumptions:

| # | Ambiguity | Resolution (assumption) |
|---|---|---|
| A1 | Exact env var name | `PUBLIC_DIRECTUS_URL` — mirrors the existing constant's name and `PUBLIC_API_URL`'s prefix convention. |
| A2 | Should the client branch of `directusBase()` also become configurable? | **Yes** — both consumers read the same resolved value. Leaving `directusBase()` on a stale constant while `publicAssetUrl()` reads env would create two divergent public origins in one file. Cost is one shared resolver. |
| A3 | Trailing-slash / empty-string handling | Treat empty-or-whitespace as unset (fall back to default), mirroring `resolveBase()`'s `.length > 0` guard. Trailing slashes are **not** stripped — no existing helper does, and `INTERNAL_DIRECTUS_URL` values in compose carry none. |

None of these rise to `needs-clarification`: each has an unambiguous
codebase-precedented answer.

### Conflicts with Existing Features

| Requirement | Relationship | Conflict? |
|---|---|---|
| `FR-CMS-008` | This FR makes CMS-008's `sourceFileDownloadUrl()` origin configurable. CMS-008's security-review invariant — the URL must be an absolute `https://` public origin and must **never** contain the internal Docker host — is **preserved, not weakened**, because the default is unchanged and the resolver is still realm-independent. | **No.** Strict extension. |
| `FR-CMS-007` | Parent of CMS-008; unaffected (the `/about`, `/history`, `/partners` pages have no source-file links). | No. |
| `FR-CMS-001` | Homepage/site-settings fetchers use `directusBase()`'s **SSR** branch, untouched by this change. | No. |
| `INTERNAL_DIRECTUS_URL` contract (compose L253–261, prod L18–21) | Explicitly out of scope; not modified. | No. |

No existing requirement asserts that the public Directus origin must be a
compile-time constant. The one place that *sounds* like it does —
`cms.ts:869–871` ("The public base is unconditional here") — means
**realm-unconditional** (no `typeof window` branch), not **environment-constant**.
Reading a `process.env` fallback keeps it realm-unconditional. Verified against
`wf-20260821-feat-213/04-security-review.md` MAJOR-2, whose resolution text is
about eliminating the *Docker hostname and http:// downgrade* "by construction,
not by configuration" — that construction is the absence of a realm branch, which
this FR does not reintroduce.

### Architectural Feasibility

| Check | Verdict |
|---|---|
| Stack fit | ✅ Astro 5 SSR (`output: 'server'`, `@astrojs/node` standalone). `process.env` is available in the runtime realm by construction. |
| Module boundary (ADR-0038 §Locks #1) | ✅ Change is confined to `apps/web-next/src/lib/` (L1). No block or page is touched; blocks still receive plain data via props. |
| ADR-0038 §Locks #2 ("no raw fetch outside `src/lib/`") | ✅ No fetch added or moved. |
| DB / migration | ✅ None. No Drizzle schema, no Directus collection change. |
| API contract | ✅ None. No endpoint, no DTO, no shared type. |
| Deployment | ✅ Additive `environment:` key in compose. Unset ⇒ production default ⇒ prod deploy needs **no** config change (an explicit requirement). |
| Secrets | ✅ Value is a public hostname, not a secret. Safe in `.env.example`, compose, and docs. |
| Cross-schema query rule | N/A. |

**Feasible with no architectural deviation.**

---

## Formalized Requirement

### `FR-CMS-009` — Environment-configurable public Directus origin

**Module:** CMS / Content (`CMS`)
**Depends on:** `FR-CMS-008` (introduced `publicAssetUrl()`, the primary consumer)
**Extends:** `FR-CMS-007` → `FR-CMS-008` chain
**Status on merge:** Implemented

> The public Directus origin used to build **browser-facing** URLs in
> `apps/web-next/src/lib/cms.ts` SHALL be resolved from the SSR-runtime
> environment variable `PUBLIC_DIRECTUS_URL` (`process.env`), falling back to
> `https://cms.aiqadam.org` when that variable is unset, empty, or
> whitespace-only.
>
> Resolution SHALL remain **realm-independent** for `publicAssetUrl()` — no
> `typeof window` branch — so a value emitted into HTML can never be the
> internal Docker origin nor a plaintext `http://` downgrade of an HTTPS page,
> preserving the `FR-CMS-008` MAJOR-2 invariant.
>
> Both existing consumers — `directusBase()`'s client branch and
> `publicAssetUrl()` — SHALL read the same resolved value.
>
> The server-side internal path (`DEFAULT_INTERNAL_DIRECTUS_URL` /
> `INTERNAL_DIRECTUS_URL`) and `assetUrl()`'s behavior for its existing callers
> SHALL be unchanged.
>
> The knob SHALL be discoverable: documented in `apps/web-next/.env.example` and
> in the QA/prod deploy configuration or its accompanying docs.

**Mechanism (binding — do not substitute `import.meta.env`):**
`process.env.PUBLIC_DIRECTUS_URL`, read at SSR runtime. Rationale in Analysis
R3–R5: `import.meta.env` is inlined by Vite into a frozen literal at `astro build`
time and is provably `undefined` at runtime in this app's committed bundle, while
the sole reaching consumer runs under SSR where `process.env` is live.

**Cross-references:**
- `docs/03-requirements/FR-CMS-008.md` — source-file download link
- `docs/03-requirements/FR-CMS-007.md` — public content pages
- `apps/web-next/src/lib/api-client.ts` — `resolveBase()` (naming precedent; its
  `import.meta.env` mechanism is the anti-pattern, not the model)
- `deploy/docker-compose.qa.yml` L234–261, `deploy/docker-compose.prod.yml`
  (web-next service) — `INTERNAL_DIRECTUS_URL` precedent
- `.copilot/tasks/completed/wf-20260821-feat-213/04-security-review.md` — MAJOR-2

**Explicitly out of scope:**
1. Standing up a QA Directus vhost (infra, tracked alongside T-0141). After this
   PR, QA still needs an operator to expose Directus at a QA hostname and set the
   new var — this PR makes that *possible*, not *done*.
2. `assetUrl()` and the three inline `${directusBase()}/assets/...` sites.
3. The `INTERNAL_DIRECTUS_URL` / SSR-fetch half.
4. Fixing `api-client.ts`'s dead `import.meta.env.PUBLIC_API_URL` path (separate
   issue recommended).

---

## Acceptance Criteria (draft)

For TestDesigner to formalize.

**AC-1 — Default preserves production byte-for-byte**
Given `PUBLIC_DIRECTUS_URL` is unset in the environment,
when the public Directus origin is resolved,
then it equals `https://cms.aiqadam.org` — identical to the pre-change
hardcoded constant.

**AC-2 — Override is honored**
Given `PUBLIC_DIRECTUS_URL` is set to `https://cms.qa.aiqadam.org`,
when the public Directus origin is resolved,
then it equals `https://cms.qa.aiqadam.org`.

**AC-3 — Download href follows the override end-to-end**
Given `PUBLIC_DIRECTUS_URL` is set to a non-default origin and a
`content_documents` row has a non-null `source_file` uuid,
when `sourceFileDownloadUrl()` derives the link,
then the result is `<override-origin>/assets/<uuid>?download` — the configured
origin, the `?download` flag intact (FR-CMS-008 AC-6).

**AC-4 — Empty / whitespace-only is treated as unset**
Given `PUBLIC_DIRECTUS_URL` is `''` (or only whitespace),
when the origin is resolved,
then it falls back to `https://cms.aiqadam.org` — never a bare `/assets/<uuid>`
or a relative URL.

**AC-5 — Internal origin never leaks (FR-CMS-008 MAJOR-2 regression guard)**
Given any value of `PUBLIC_DIRECTUS_URL` including unset, and SSR realm
(`typeof window === 'undefined'`, since both `/rules` pages are
`prerender = false`),
when `publicAssetUrl()` / `sourceFileDownloadUrl()` derive a URL,
then the result contains neither `directus:8055` nor `//directus`, and is an
absolute URL — the existing negative assertions in
`apps/web-next/src/lib/cms-content-pages.test.ts` (L489–499) must still hold.

**AC-6 — Realm independence preserved**
Given the SSR realm,
when `publicAssetUrl()` is called,
then it resolves the public origin, not `INTERNAL_DIRECTUS_URL` — i.e. no
`typeof window` branch was introduced into `publicAssetUrl()`.

**AC-7 — Internal SSR path unchanged**
Given `INTERNAL_DIRECTUS_URL` is set (as in `docker-compose.qa.yml`:
`http://127.0.0.1:3119`),
when `directusBase()` is called under SSR,
then it still returns `INTERNAL_DIRECTUS_URL`, and when unset still returns
`http://directus:8055` — this FR must not alter that branch.

**AC-8 — Both public consumers agree**
Given `PUBLIC_DIRECTUS_URL` is set to a non-default origin,
when `directusBase()` is called in the client realm and `publicAssetUrl()` in
any realm,
then both reflect the same configured origin (no divergent public bases in one
module).

**AC-9 — Knob is discoverable**
Given a developer reads `apps/web-next/.env.example`,
then `PUBLIC_DIRECTUS_URL` is present with a comment stating it is the public,
browser-facing Directus origin, that it defaults to `https://cms.aiqadam.org`
when unset, and that it is distinct from `INTERNAL_DIRECTUS_URL`.

**AC-10 — Mechanism is runtime, not build-time**
Given the built server bundle (`dist/server/`),
when the resolver's compiled form is inspected,
then it reads `process.env` at call time and does **not** rely on a Vite-inlined
`import.meta.env` literal — so changing the var and restarting the container
changes the emitted URLs without a rebuild.

> **Note for TestStrategist:** `apps/web-next/src/lib/cms-content-pages.test.ts`
> follows a deliberate *local re-implementation mirror* convention (no
> `vi.mock`, no `process.env` mock, no `global.fetch` mock — see
> `wf-20260821-feat-213/06-test-design.md` L78). AC-1/2/4/10 need to read real
> env, which the mirror convention cannot express. Choosing between (a)
> extracting a pure, injectable `resolvePublicDirectusUrl(env)` in `cms.ts` and
> testing it directly, or (b) adding a narrow new spec file that departs from the
> mirror convention, is a TestStrategist decision. **(a) is recommended** — it
> keeps the existing mirror file's convention intact and makes the resolver
> testable without env mutation.

---

## Gate Result

gate_result:
  status: passed
  summary: "Requirement formalized as FR-CMS-009; specific, testable, non-conflicting, architecturally feasible, and the env-var mechanism question was resolved against compiled-bundle evidence rather than assumption."
  findings:
    - "Identifier assigned: FR-CMS-009 (module abbrev CMS confirmed in docs/03-requirements/requirements-registry.md L32; FR-CMS-008 is the highest existing, both in the Module Abbrev table and in the FR implementation-order table at row 70). handoff.yaml requirement_ref updated from the FR-CMS-009-placeholder."
    - "MECHANISM DECIDED — process.env.PUBLIC_DIRECTUS_URL (SSR runtime), NOT import.meta.env.PUBLIC_DIRECTUS_URL (build-time). Evidence: apps/web-next/dist/server/chunks/Layout_BbgZAM2b.mjs L702-710 shows Vite already inlined import.meta.env into a frozen literal object with no PUBLIC_API_URL key, so the one existing PUBLIC_ precedent in api-client.ts resolveBase() is permanently undefined at runtime. The naive 'match the existing pattern' reading would have reproduced a proven-broken path."
    - "The PUBLIC_ NAME prefix is retained (matches PUBLIC_API_URL, signals browser-facing) while the import.meta.env ACCESS mechanism is rejected. Astro's PUBLIC_ rule governs client-bundle exposure only and places no constraint on process.env key names."
    - "Timing verified: publicAssetUrl() is reached ONLY under SSR — apps/web-next/src/pages/rules.astro L13 and rules/[slug].astro L18 both declare prerender = false, so typeof window === 'undefined' at render. directusBase()'s client branch has no current importer (cms.ts L16-22 documents the module as frontmatter-only). The load-bearing realm is therefore SSR, where process.env is live and import.meta.env is frozen."
    - "Deployment verified: deploy/docker-compose.qa.yml L234-261 and deploy/docker-compose.prod.yml both build web-next per-environment from apps/web-next/Dockerfile, and set INTERNAL_API_URL / INTERNAL_DIRECTUS_URL as runtime env. apps/web-next/Dockerfile declares NO ARG. A build-time var would need a new ARG+ENV+build.args convention across three files plus an image rebuild per value change; process.env needs one compose line and matches every other URL knob in the app."
    - "No conflict with FR-CMS-008's MAJOR-2 security invariant: 'unconditional' in cms.ts L869-871 means realm-unconditional (no typeof-window branch), not environment-constant. Reading a process.env fallback keeps publicAssetUrl() realm-independent, so the internal-hostname and http:// mixed-content eliminations are preserved by construction. AC-5/AC-6 lock this in."
    - "No DB migration, no API surface change, no shared-types change. Change confined to apps/web-next/src/lib/ (ADR-0038 L1), plus .env.example and deploy/docs."
    - "Three assumptions recorded and resolved from codebase precedent (var name PUBLIC_DIRECTUS_URL; both consumers share one resolver; empty-string treated as unset per resolveBase()'s .length > 0 guard). None require human clarification."
    - "Out-of-scope items restated for downstream agents: QA Directus vhost (infra, T-0141); assetUrl() and the three inline directusBase()/assets sites; the INTERNAL_DIRECTUS_URL SSR half; and api-client.ts's dead import.meta.env.PUBLIC_API_URL path (recommend a separate issue — it is a real latent defect but a distinct blast radius)."
    - "Flagged for TestStrategist: cms-content-pages.test.ts uses a local re-implementation mirror convention that cannot read real env. Recommend extracting a pure resolvePublicDirectusUrl(env) helper in cms.ts so AC-1/2/4/10 are testable without env mutation or breaking the mirror convention."
