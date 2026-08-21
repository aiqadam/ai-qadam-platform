# 04 — Security Review

**Workflow:** `wf-20260821-feat-214`
**Agent:** SecurityReviewer
**Date:** 2026-08-21
**Requirement:** `FR-CMS-009` — Environment-configurable public Directus origin

---

## Code Changes Reviewed

| File | Reviewed | Nature of change |
|---|---|---|
| `apps/web-next/src/lib/cms.ts` | ✅ full diff + surrounding context (L11–90, L905–940, L1160–1215) | `PUBLIC_DIRECTUS_URL` constant → `DEFAULT_PUBLIC_DIRECTUS_URL` + exported pure `resolvePublicDirectusUrl(env)`. Two call sites updated. |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | ✅ full diff | +208 lines, additive. Imports the real resolver; extends FR-CMS-008 negative guards. |
| `apps/web-next/.env.example` | ✅ full file | Documents `PUBLIC_DIRECTUS_URL` (non-secret public hostname). |
| `deploy/docker-compose.qa.yml` | ✅ diff (L259–276) | Comment-only. No live env key added. |
| `deploy/docker-compose.prod.yml` | ✅ diff (L107–118) | Comment-only. No live env key added. |

**Downstream sink also reviewed** (not in the changed set, but it is where the
value lands): `apps/web-next/src/pages/rules/[slug].astro` L74–82 —
`href={doc.sourceFileUrl}`. Reviewed specifically for the injection question
below.

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | No DB query, no tenant-scoped table, no `bypassTenant()`. The change is a string resolver in a frontend lib. |
| INV-2 Secrets by reference | Yes | ✅ Pass | The only new value is a public DNS hostname (`https://cms.aiqadam.org`), already public in HTML today. Grepped the diff for `password`/`secret`/`apiKey`/`token`/`Bearer` — zero hits. Both compose entries are **commented out**, so no new live env key exists in either deploy file, secret or otherwise. `.env.example` carries an empty value, not a placeholder credential. |
| INV-3 Auth at controller level | No | N/A | No NestJS controller added or modified. `apps/api` is untouched — verified: no file under `apps/api/**` in the diff. |
| INV-4 Validation at boundaries | No (see note) | ✅ Pass | No controller, queue consumer, or webhook. The resolver's input is **deployment configuration**, not a request boundary — Zod is not the applicable control. The value can never be request-, user-, or DB-derived: `process.env` is populated once by the operator at container start. Nonetheless the resolver is *total* — it validates type (`typeof === 'string'`), trims, and length-guards, falling back rather than propagating a degenerate value. That is the correct control for this class of input. |
| INV-5 No cross-schema queries | No | N/A | No SQL, no Drizzle, no JOIN. |
| INV-6 Rate limiting | No | N/A | No new public endpoint. The emitted URL points at Directus, whose own asset endpoint is pre-existing and unchanged by this PR. |
| INV-7 CSRF protection | No | N/A | No state-changing operation. The affected surface is a `GET`-only `<a href download>`. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | ✅ Pass | Zero occurrences in the diff. Note the neighbouring `set:html={bodyHtml}` on `[slug].astro:86` is pre-existing FR-CMS-007 code, is fed by `bodyHtml` (not by this resolver), and is **not touched** by this PR — the resolver's value reaches only the `href={...}` attribute expression on L76, which Astro escapes. |
| INV-9 No N+1 queries | No | N/A | Resolver is synchronous, allocation-free beyond one `trim()`, and called once per asset URL derivation. No loop, no I/O. |
| INV-10 Drizzle parameterization | No | N/A | No `` sql`...` `` tag, no `db.execute()`. |
| INV-11 HttpOnly tokens (web) | No | N/A | No token handling. No `localStorage` access added. |

---

## Adjudication: `http://` acceptance (the point CodeDeveloper escalated)

CodeDeveloper explicitly declined to decide this silently and requested a
ruling. **Ruling given below — this is a decision, not a recommendation.**

### The question

`resolvePublicDirectusUrl()` accepts any non-empty string. An operator can set
`PUBLIC_DIRECTUS_URL=http://cms.example.org`, and every source-document
download link on an HTTPS page becomes a plaintext `http://` href — a
mixed-content downgrade. CodeDeveloper documented the https requirement in
three files and relied on the existing `/^https:\/\//` test guard, rather than
rejecting non-https in code, because a hard rejection would break local-dev
plain-HTTP Directus.

### Verdict: **documentation is sufficient. Do NOT add a code-level rejection or a production-conditional warning. `passed` as implemented.**

Four reasons, in descending weight.

**1. It is not a mixed-content vulnerability in the browser sense, because it
is not a subresource.** Mixed content is a real, enforced browser control for
*passive and active subresources* — `<img>`, `<script>`, `<link>`, `fetch()`.
This value's sole rendered sink is a **top-level navigation** target:
`<a href download>` on `[slug].astro:76`. Browsers do not block, and do not
mixed-content-warn on, plain `http://` link navigations from an HTTPS page;
they are ordinary cross-origin navigations. The realistic worst case is a
user-visible "Not secure" indicator on the Directus origin and a plaintext
transfer of an **already-public, unauthenticated asset** (the source-file
folder is public-read per FR-CMS-008 — no cookie, no `Authorization` header,
no credential rides on that request). The confidentiality loss from an
`http://` download of a public regulation PDF is approximately zero; the
integrity risk (an on-path attacker swapping the PDF) is real but is the
same risk the operator accepted by running plaintext Directus at all.

**2. The threat actor required does not exist in our threat model.** The only
principal who can set this value is the operator with shell on the deploy
host — precisely the principal already trusted with `INTERNAL_DIRECTUS_URL`,
the Postgres DSN, and the Authentik secrets in the same compose file. An
attacker who can write `PUBLIC_DIRECTUS_URL` can write `DATABASE_URL`. A
guard here defends against nobody in `security.md`'s threat list (bots, spam,
ATO, insider *mistakes*, supply chain) except #4, insider mistake — and #4 is
exactly what documentation addresses, which is why we document rather than
enforce operator config elsewhere in this repo too.

**3. A `NODE_ENV === 'production'` conditional would make the function
non-total and environment-dependent — a net security regression.** Concretely:
`resolvePublicDirectusUrl()` today is pure, total, and returns the same output
for the same input in every environment. Adding a prod branch means (a) the
resolver's behavior now differs between test and prod, so the unit tests stop
proving prod behavior — the *exact* class of "tests pass, prod differs" defect
this entire FR was created to eliminate (see the `import.meta.env` trap in
01/R3); (b) `NODE_ENV` becomes newly security-load-bearing in a file where it
currently is not, and `NODE_ENV` is set to `production` in the QA compose too,
so "production" here does not mean what the guard would imply; (c) a
silent-fallback-to-default on rejection would be worse than the downgrade —
QA would emit *production* links while the operator believes the override is
live, which is the original FR-CMS-009 bug reintroduced as a security feature.
A `console.warn` avoids (c) but adds a startup-log side effect to a pure
function called per-asset, and warnings in container logs are not read.

**4. The documentation is genuinely adequate, and I verified it rather than
assuming.** The https requirement is stated in three places at the exact point
of use: `.env.example:24–26` ("Use an https:// origin in any environment served
over HTTPS; a plaintext http:// value is a mixed-content downgrade the browser
may block"), `docker-compose.qa.yml:274–275` ("must be a public origin the
browser can resolve — never the INTERNAL_DIRECTUS_URL value above — and
https:// on an HTTPS site"), and `docker-compose.prod.yml:110–114`. The QA file
additionally pre-writes the correct https line to uncomment, so the
lowest-effort path for the operator is already the secure one. That is
defense-by-default-configuration, which is stronger than a warning nobody reads.

**Residual risk accepted: LOW.** Recorded here explicitly so it is not
rediscovered as a novel finding later. The compensating controls are: (a) the
default is https and requires no operator action; (b) three-file documentation
at the point of use; (c) the `/^https:\/\//` assertion in
`cms-content-pages.test.ts` (now running against the **real** resolver across
five env shapes, L529–546) which fails CI if the *default* path ever stops
being https; (d) the asset is public and unauthenticated, so no credential is
exposed by a plaintext fetch.

**What would change this verdict** (stated so the boundary is not vague): if
`publicAssetUrl()` ever gains a caller that emits into a **subresource**
context (`<img src>`, `<link href>`, `fetch()`), or if the Directus asset
folder ever stops being public-read and starts requiring a credential on that
request, the calculus flips and an https enforcement becomes warranted. Neither
is true today and neither is introduced by this PR.

---

## Adjudication: FR-CMS-008 MAJOR-2 invariant preservation

The ImpactAnalyzer correctly flagged that MAJOR-2's resolution was worded
*"eliminated by construction, not by configuration"* and that this FR
introduces configuration into that exact function. I checked the three
sub-invariants against the shipped code, not the summary.

| MAJOR-2 sub-invariant | Preserved? | Evidence |
|---|---|---|
| `publicAssetUrl()` contains no `typeof window` branch | ✅ **Yes** | `cms.ts:931–934` is three lines: null-guard, then `` return `${resolvePublicDirectusUrl()}/assets/${fileId}` ``. No realm branch was added. The resolver itself contains no `typeof window` either — its only `typeof` is `typeof process === 'undefined'` in the default-parameter, which is a *capability* check (does a Node global exist), not a *realm* branch that selects a different origin. Both realms get the same value from the same source. |
| Never emits `directus:8055` / `//directus` | ✅ **Yes** | `DEFAULT_INTERNAL_DIRECTUS_URL` and the `INTERNAL_DIRECTUS_URL` read remain confined to `directusBase()`'s SSR branch (`cms.ts:78–81`). No code path lets the internal value reach `publicAssetUrl()`. Verified there is exactly one `INTERNAL_DIRECTUS_URL` read in the file and it is inside `if (typeof window === 'undefined')`. Newly guarded by the 5-case `it.each` at test L529–546 which asserts `not.toContain('directus:8055')` and `not.toContain('//directus')` against the **real** resolver under unset/undefined/empty/whitespace/overridden. |
| Never a bare/relative URL | ✅ **Yes, and strengthened** | The empty-and-whitespace→default fallback is the specific control. Without it, `PUBLIC_DIRECTUS_URL=""` would yield `` `/assets/<uuid>?download` `` — a relative URL resolving against the *web* origin, which is both a 404 and a confusing failure. Test L622–624 asserts `expect(base).not.toBe('')` explicitly. This is a genuine hardening over a naive `??`-only implementation. |

**The "by construction, not by configuration" wording is upheld.** I read that
resolution text as MAJOR-2 intended it: the *construction* being referred to is
the **absence of a realm branch** — the thing that made it impossible for the
SSR realm to leak the Docker hostname. FR-CMS-009 makes the origin's *value*
configurable while leaving that construction intact. The two are orthogonal,
and the RequirementAnalyst's reading (01, L219–224) is correct. Independently
confirmed against the code rather than accepted from the summary.

---

## Adjudication: injection risk from an env-sourced value in an `href`

Asked explicitly. **Verdict: no injection risk. Two independent controls, plus
a non-existent threat actor.**

1. **No HTML-injection surface.** The value flows
   `resolvePublicDirectusUrl()` → template literal in `publicAssetUrl()` →
   `sourceFileDownloadUrl()` → `CmsContentDocument.sourceFileUrl` →
   `href={doc.sourceFileUrl}` (`[slug].astro:76`). That is an **attribute
   expression**, which Astro HTML-escapes on render — a value containing
   `"` or `>` cannot break out of the attribute. It is not `set:html`, not
   `innerHTML`, not a raw string concatenated into markup. (The `set:html` on
   L86 of the same file is pre-existing, is fed by `bodyHtml`, and this value
   never reaches it.)
2. **A `javascript:` / `data:` href is not reachable by any attacker.** In
   principle `PUBLIC_DIRECTUS_URL=javascript:alert(1)` would yield
   `javascript:alert(1)/assets/<uuid>?download`. But (a) that string is only
   settable by the operator with deploy-host shell — the same principal who
   could simply edit the page template; (b) the value is never derived from a
   request, a query param, a header, a cookie, or a DB row, so no untrusted
   principal can influence it; (c) the trailing `/assets/<uuid>?download` is
   unconditionally appended, so the operator cannot even produce a clean
   scheme payload without it. This is self-XSS-by-own-config, which is not a
   vulnerability class we defend against — it is equivalent to the operator
   deploying malicious code.
3. **No open-redirect or SSRF.** Confirmed independently of the ImpactAnalyzer:
   the resolved origin is used **only** to build a string emitted into HTML. It
   is never passed to `fetch()` — `get()` at `cms.ts:88` uses `directusBase()`,
   whose SSR branch returns the *internal* URL, and the SSR realm is the only
   realm that fetches. So even a hostile value cannot cause the server to make
   an outbound request to an attacker-chosen host. There is no redirect
   handler, no `Location` header, no `next=` parameter anywhere in the change.

---

## Additional observations (non-blocking, no action required)

- **Client-bundle `process` guard is correct and worth keeping.**
  `typeof process === 'undefined' ? undefined : process.env` in the default
  parameter, plus `env?.PUBLIC_DIRECTUS_URL` in the body, means the function
  is total even where `process` does not exist. This is not merely defensive
  tidiness: a `ReferenceError` thrown from a module-level-reachable helper
  during client hydration would be an availability defect. Covered by a test
  (L710–722). Good.
- **`.env.example` contains no secret.** Empty value, public hostname in the
  prose. Correct per INV-2 — and note `.env.example` is tracked, so a real
  value here would be a leak; there isn't one.
- **Both compose additions are comment-only.** No new live environment key
  ships to QA or prod. This means the PR is a genuine no-op for both deployed
  environments until an operator acts, which is the safest possible rollout
  shape for a change to a security-reviewed function.
- **Out-of-scope defect confirmed, not introduced here:**
  `api-client.ts`'s `import.meta.env.PUBLIC_API_URL` remains permanently
  `undefined`. Not a security defect (it fails closed to the same-origin
  `/api`), so it is not a finding of this review — but the recommendation to
  raise it as its own issue stands, and `cms.ts`'s new comment correctly
  labels it as an anti-pattern so it is not copied.

---

### BLOCKER Findings

**None.**

### MAJOR Findings

**None.**

The one candidate MAJOR — the `http://` downgrade — is adjudicated above as
**accepted residual risk (LOW)** with four compensating controls and a stated
condition under which the verdict would flip. It is deliberately not recorded
as a MAJOR because a MAJOR is retriable work for CodeDeveloper, and my ruling
is that the correct implementation is the one already shipped.

---

## Gate Result

gate_result:
  status: passed
  summary: "FR-CMS-009 clears the security gate with no BLOCKER and no MAJOR findings. FR-CMS-008's MAJOR-2 invariant is preserved on all three sub-invariants (verified against shipped code, not the summary), there is no injection/SSRF/open-redirect surface, and the escalated http:// question is adjudicated: documentation is sufficient, do NOT add code-level rejection or a NODE_ENV-conditional warning."
  findings:
    - "HTTP/HTTPS ADJUDICATION (the point CodeDeveloper escalated) — RULING: documentation is SUFFICIENT. Do NOT reject non-https in code and do NOT add a NODE_ENV==='production' warning. Four reasons: (1) the sink is a top-level <a href download> NAVIGATION, not a subresource — browsers do not block or mixed-content-warn on http:// link navigations from HTTPS pages, and the asset is public/unauthenticated per FR-CMS-008 so no credential rides on the request; (2) the only principal who can set this value is the operator who already holds the Postgres DSN and Authentik secrets in the same compose file — a guard defends against nobody in security.md's threat model except insider mistake, which documentation is the right control for; (3) a NODE_ENV branch would make a currently-pure, total, environment-independent resolver behave differently in prod than in test, which is EXACTLY the 'tests pass, prod differs' failure class this FR exists to eliminate, and NODE_ENV is 'production' in the QA compose too so the guard would not even mean what it implies; (4) the docs are verified adequate — .env.example L24-26, docker-compose.qa.yml L274-275, docker-compose.prod.yml L110-114 all state it at the point of use, and QA pre-writes the correct https line to uncomment so the lowest-effort operator path is already the secure one. Residual risk ACCEPTED as LOW."
    - "VERDICT WOULD FLIP IF (boundary stated explicitly so it is not vague): publicAssetUrl() ever gains a caller emitting into a SUBRESOURCE context (<img src>, <link href>, fetch()), OR the Directus asset folder stops being public-read and starts requiring a credential on that request. Neither is true today; neither is introduced by this PR."
    - "FR-CMS-008 MAJOR-2 PRESERVED — verified against shipped code, not the code summary. (a) publicAssetUrl() (cms.ts:931-934) gained NO typeof-window branch; it is still null-guard + one template literal. The resolver's only typeof is 'typeof process' in the default parameter, which is a CAPABILITY check (does a Node global exist), not a REALM branch selecting a different origin — both realms receive the same value from the same source. (b) There is exactly ONE INTERNAL_DIRECTUS_URL read in cms.ts and it is inside directusBase()'s `if (typeof window === 'undefined')` branch, so no path lets the internal host reach publicAssetUrl(). (c) The empty/whitespace fallback is a genuine HARDENING over a naive ??-only implementation: without it PUBLIC_DIRECTUS_URL='' would emit a RELATIVE /assets/<uuid>?download resolving against the web origin. 'By construction, not by configuration' refers to the absence of a realm branch, which is intact — the construction and the value are orthogonal."
    - "NO INJECTION RISK from the env-sourced value reaching an href. The sink is rules/[slug].astro:76 `href={doc.sourceFileUrl}` — an ATTRIBUTE EXPRESSION that Astro HTML-escapes, not set:html and not innerHTML. (The set:html on L86 of the same file is pre-existing FR-CMS-007 code fed by bodyHtml; this value never reaches it.) A javascript:/data: href is theoretically expressible but only by the operator with deploy-host shell — the value is never request-, user-, header-, cookie-, or DB-derived, and the unconditional trailing /assets/<uuid>?download prevents even a clean scheme payload. Self-XSS-by-own-config is not a defended class."
    - "NO SSRF / NO OPEN REDIRECT — confirmed independently, not accepted from the impact analysis. The resolved public origin is used ONLY to build a string emitted into HTML; it is never passed to fetch(). get() (cms.ts:88) uses directusBase(), whose SSR branch returns the INTERNAL url, and SSR is the only fetching realm — so even a hostile value cannot make the server call an attacker-chosen host. No redirect handler, no Location header, no next= parameter in the change."
    - "INV-2 (secrets) PASS: the only new value is a public DNS hostname already visible in HTML today. Diff grepped for password/secret/apiKey/token/Bearer — zero hits. Both compose entries are COMMENTED OUT, so this PR adds no live environment key to QA or prod at all; it is a genuine no-op for both deployed environments until an operator acts, which is the safest possible rollout shape for a change to a previously-hardened function. .env.example carries an empty value, not a placeholder credential."
    - "INV-4 (validation) PASS with a scoping note: no controller/consumer/webhook exists here, and the input is DEPLOYMENT CONFIGURATION, never a request boundary — Zod is not the applicable control. The resolver is nonetheless TOTAL: it type-checks (typeof === 'string'), trims, length-guards, and falls back rather than propagating a degenerate value. That is the correct control for this input class."
    - "INV-8 PASS: zero dangerouslySetInnerHTML in the diff. INV-1/3/5/6/7/9/10/11 all N/A — no DB query, no tenant table, no controller (apps/api entirely untouched — verified no apps/api/** file in the diff), no SQL, no new endpoint, no state-changing op (GET-only <a download>), no loop/IO in the resolver, no token or localStorage handling."
    - "CLIENT-BUNDLE GUARD IS CORRECT AND SHOULD BE KEPT. `typeof process === 'undefined' ? undefined : process.env` plus `env?.PUBLIC_DIRECTUS_URL` makes the function total where process does not exist. Not mere tidiness — a ReferenceError from a module-level-reachable helper during hydration would be an availability defect. Test-covered at cms-content-pages.test.ts L710-722."
    - "OUT-OF-SCOPE, NOT A FINDING OF THIS REVIEW: api-client.ts's import.meta.env.PUBLIC_API_URL remains permanently undefined. It fails CLOSED to the same-origin '/api', so it is not a security defect — but the recommendation to raise it as its own issue stands, and cms.ts's new comment correctly labels it an anti-pattern so it is not copied forward."
