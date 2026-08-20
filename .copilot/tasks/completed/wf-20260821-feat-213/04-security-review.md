# Security Review — FR-CMS-008

Reviewed against `git diff` on `feature/cms-008-rules-document-downloads`
(changes are uncommitted in the working tree; `git diff origin/main...HEAD`
shows only the handoff/ID-counter commit, so the code diff was read from the
unstaged working tree via `git diff -- <path>`).

**Retry 1 (this pass):** both prior MAJOR findings were re-verified
empirically against the still-running local Directus 11 — including the
negative cases — rather than accepted on the CodeDeveloper's report. See
`## Retry Verification`.

Findings 1 and 2 in the original pass were also **verified empirically
against a live Directus 11 instance**, not reasoned from documentation. See
"Empirical Verification Method" for the exact commands and the cleanup
performed.

## Code Changes Reviewed

| File | Reviewed |
|---|---|
| `infrastructure/directus/bootstrap.sh` | ✅ `source_file` field, `directus_files` relation, public-read allowlist append, **`PUBLIC_ASSET_FOLDER_ID` + `ensure "folder public-documents"` + folder-scoped `directus_files/read` grant (retry 1)** |
| `infrastructure/directus/seed-content-documents.sh` | ✅ `find_existing_file_id()`, `attach_source_file()`, 5 call sites, **`PUBLIC_ASSET_FOLDER_ID`, `-F folder=` ordering, folder-scoped filename lookup (retry 1)** |
| `apps/web-next/src/lib/cms.ts` | ✅ `sourceFileUrl`, `source_file`, `sourceFileDownloadUrl()`, field constants, **new `publicAssetUrl()` (retry 1)** |
| `apps/web-next/src/pages/rules/[slug].astro` | ✅ conditional wrapper + `<a href download>` |
| `apps/web-next/src/lib/cms-content-pages.test.ts` | ✅ mirror sync, fixtures, **`PUBLIC_DIRECTUS_BASE` mirror (retry 1)** |
| `apps/web-next/src/locales/en.json` / `ru.json` | ✅ `rules.download_source` |

---

## Invariant Check Results

| Invariant | Applicable | Result | Notes |
|---|---|---|---|
| INV-1 Tenant isolation | No | N/A | `content_documents` is global/public content with no `countryCode` scoping. No tenant-scoped table touched. No `bypassTenant()` call. |
| INV-2 Secrets by reference | Yes | **PASS** | `DIRECTUS_TOKEN` is consumed only via `H_AUTH` as a `-H` header. Never echoed, never interpolated into a URL or a log line. No `set -x`/`xtrace`, no `curl -v`. `upload_response` and `row_json` are piped to `jq` and **never** printed — all new `echo` statements emit only a filename, a slug, or an HTTP code from `/tmp/directus-last-code`. Re-grepped after retry 1 across the whole diff for `password\|secret\|api_key\|apikey\|Bearer <literal>\|token=` → zero hits. `PUBLIC_ASSET_FOLDER_ID` is a non-secret structural identifier (see Retry item 4). |
| INV-3 Auth at controller level | No | N/A | No NestJS controller added or modified. `apps/api` is untouched. |
| INV-4 Validation at boundaries | Yes | **PASS** | No new external input is accepted. The only user-controlled value on this path is the route `slug`, already gated by the pre-existing `isValidContentSlug()` (`/^[a-z0-9][a-z0-9-]{0,63}$/`) before the Directus fetch. |
| INV-5 No cross-schema queries | Yes | **PASS** | `content_documents → directus_files` is a relation entirely within the Directus-managed schema. No JOIN across `platform`/`directus`/`authentik`/`twenty`/`listmonk`. No Drizzle migration implicated. |
| INV-6 Rate limiting | No | N/A | No new application endpoint. `/assets/:id` is Directus-managed surface. |
| INV-7 CSRF protection | No | N/A | No browser-initiated state-changing operation. The new link is a `GET` navigation. The seed script's `POST`/`PATCH` are operator-run, token-authenticated, non-browser. |
| INV-8 No `dangerouslySetInnerHTML` | Yes | **PASS** | Zero occurrences in the diff. The page's pre-existing `set:html={bodyHtml}` is untouched and out of scope. The new link renders `{t('rules.download_source')}` as escaped text and `href={doc.sourceFileUrl}`, which Astro escapes. |
| INV-9 No N+1 queries | Yes (advisory) | **PASS** | `attach_source_file` performs a bounded, constant 1–3 HTTP calls per document across exactly 5 documents in an operator-run one-shot script — not a request-path loop. The `sourceFileUrl` derivation is pure string work inside the existing single-row `map`, adding no fetch. |
| INV-10 Drizzle parameterization | No | N/A | No `sql\`\`` tag, no `db.execute()`, no Drizzle code. The shell scripts build JSON via `jq -n --arg`/`--argjson` and pass query filters through `curl --get --data-urlencode`. Retry 1's new permission filter is built by `ensure_perm_for_policy`'s `jq -nc --argjson f` — correctly parameterized. |
| INV-11 HttpOnly tokens (web) | No | N/A | No token handling in the web layer. No `localStorage` in the diff. |

**All 11 invariants pass**, in both the original pass and after retry 1.

---

### BLOCKER Findings

**None.**

---

### MAJOR Findings

**None outstanding.** Both findings below were raised in the original pass
and are **RESOLVED in retry 1** — see `## Retry Verification` for the
independent evidence. The original text is preserved so the record of what
was found, and why, survives.

#### MAJOR-1 (RESOLVED) — `/assets/:id` returned **403 to anonymous users**; the feature was broken-by-default

`infrastructure/directus/bootstrap.sh` (public-grant block)

**The requirement/impact-analysis premise was empirically false.** Both prior
documents asserted:

> "Directus serves `/assets/:id` without requiring `directus_files` item-read
> permission."

Tested directly against a live, **already-bootstrapped** Directus 11 instance
(the `$t:public_label` policy and its 14 public collection grants were
already present from a prior bootstrap run — *not* a blank instance, which
made the result conclusive rather than a fresh-install artifact):

```
POST /files   (admin token, exactly the seed script's flags)  → 200
  filename_download: "SecTest.docx"   folder: null

GET /assets/<id>            (anonymous)  → 403 Forbidden
GET /assets/<id>?download   (anonymous)  → 403 Forbidden
GET /files/<id>             (anonymous)  → 403 Forbidden
```

Directus's own error body named the cause precisely:

```json
{"errors":[{"message":"You don't have permission to access collection
\"directus_files\" or it does not exist. Queried in root.",
"extensions":{"code":"FORBIDDEN"}}]}
```

Root cause: the Public policy granted **14 collections** and `directus_files`
was not among them. `bootstrap.sh` contained **no `directus_files` permission
grant at all** — only 12 `ensure "relation … -> directus_files.id"` blocks,
which create relations, not permissions.

**Not specific to the new uploads.** The cited "existing precedent"
(`partners.logo`, `speakers.photo`, `event_materials.file`,
`marketing_assets.file`) was **unverified, not proven-working** — those
collections are all empty, so no anonymous asset had ever actually been
served by this stack.

**Impact:** the row's `source_file` would be set and the `<a href>` would
render — so the page *looked* correct — but every click yielded a 403 JSON
error blob instead of a download. AC-5/AC-6 failed in production.

**Warning attached to the fix:** with `permissions: {}` (no filter), an
anonymous `GET /files` enumerated the whole file table — every asset in the
instance, including any future private/internal upload. A blanket
`directus_files` read grant would itself have been a security finding, so
the fix had to be **scoped** (dedicated public folder + explicit `fields`
allowlist), not merely added.

**→ RESOLVED. See Retry Verification items 1–3.**

#### MAJOR-2 (RESOLVED) — SSR emitted the internal Docker hostname into the public `href`

`apps/web-next/src/lib/cms.ts:16-31` (`directusBase()`), consumed by
`sourceFileDownloadUrl()`

`directusBase()` is realm-dependent:

```ts
if (typeof window === 'undefined') {
  const { INTERNAL_DIRECTUS_URL } = process.env;
  return INTERNAL_DIRECTUS_URL ?? DEFAULT_INTERNAL_DIRECTUS_URL;  // 'http://directus:8055'
}
return PUBLIC_DIRECTUS_URL;                                        // 'https://cms.aiqadam.org'
```

`/rules/[slug].astro` sets `prerender = false` and calls
`fetchContentDocument()` from frontmatter — i.e. **always server-side**, where
`typeof window === 'undefined'`. So `sourceFileUrl` was built on the internal
branch and the browser would receive:

```html
<a href="http://directus:8055/assets/<uuid>?download" download>
```

`directus:8055` is a Docker-network alias unresolvable from a browser, and
the scheme is plaintext `http://`. The link was dead for every visitor (DNS
failure), and on any network where `directus` happens to resolve it would be
an unauthenticated cleartext fetch — a mixed-content downgrade from the
HTTPS page.

A **latent pre-existing bug** in `assetUrl()` and the inline
`${directusBase()}/assets/...` sites — but those paths are unexercised (all
those collections are empty), so this diff was the first change that would
actually ship a broken asset URL to users.

**→ RESOLVED. See Retry Verification item 4.**

---

### Non-blocking observations (no action required)

- **`?download` cannot be abused — clean.** `fileId` originates solely from
  Directus's own `source_file` column, never from a request parameter. The
  route `slug` — the only user-controlled input — is validated by
  `isValidContentSlug()` *before* the fetch and used only in a
  `filter[slug][_eq]` lookup; it never reaches the asset URL. `?download` is
  a valueless flag with nothing concatenated after it, so there is no
  query-injection surface, and Astro escapes the `href`. No open redirect:
  the URL is built from a compile-time constant base plus a Directus-supplied
  UUID. **Retry 1 note:** `publicAssetUrl()` strengthens this — the base is
  now a module constant with no environment or request influence at all.
- **No path traversal in the upload — clean.** Filenames are five hardcoded
  literals at the call sites, never derived from input.
  `source_path="${SOURCE_DOC_DIR}/${filename}"` is guarded by `[ -f ... ]`,
  and `-F "file=@${source_path}"` streams from disk. Every variable is
  double-quoted; spaces, parentheses, and Cyrillic in the filenames are
  handled safely. `--data-urlencode` is used for the `filename_download`,
  `folder`, and `slug` filter lookups, so no query injection via the filename
  either.
- **`on_delete: SET NULL` is the right choice** — a deleted asset degrades the
  page to label-only (AC-8) rather than breaking `body_md` serving.
- **No write grant was added** for the Public policy on `content_documents`
  or on `directus_files`; both are read-only to anonymous users. Correct —
  re-confirmed in retry 1 (the new grant is `action: read` only).
- **`find_existing_file_id` is `set -e`-safe** — the `|| true` and `2>/dev/null`
  guards mean a Directus outage yields an empty result and a reported skip
  rather than aborting the seed.
- **The `SC2064` `trap ... RETURN` reasoning is sound** — calling
  `attach_source_file` as a sibling of `seed_content_document` genuinely does
  avoid clobbering the enclosing cleanup trap, since bash `RETURN` traps are
  not function-local without `functrace`.
- **Skipping `directus_request_with_retry` for the multipart upload is
  correct** — that helper retries on 429/503, and a retried upload that
  already succeeded server-side would create the duplicate asset AC-4 forbids.

---

## Empirical Verification Method (original pass)

Local Directus was not running, so it was started per `AGENTS.md` §6.1
(production-readiness obligation) rather than deferring the check:

```
docker compose up -d postgres directus     # infrastructure/, port 8200
```

The instance retained prior bootstrap state (the `$t:public_label` policy plus
14 collection grants), which is what makes MAJOR-1 conclusive.

Tests run: admin-token upload via the seed script's exact `curl` flags;
anonymous `GET /assets/:id`, `/assets/:id?download`, and `/files/:id`;
enumeration of Public-policy grants; a trial `directus_files` read grant and
re-test; and an unfiltered-grant exposure check.

**Cleanup performed and verified** — trial permission `DELETE`d (204), test
`.docx` `DELETE`d (204), anonymous `GET` re-confirmed back to 403, file count
back to 0. No repo file, `.env`, or seed data was modified.

---

## Retry Verification

Performed against the same live local Directus 11 (`aiqadam-directus`, port
8200, up 24 min, healthy) that the CodeDeveloper left running. **Every claim
below was reproduced independently by this reviewer** — the CodeDeveloper's
verification table was treated as a hypothesis, not as evidence.

### 0. Pre-flight — was the environment actually restored? (brief item 3)

Checked **before** running anything, so this is the state the CodeDeveloper
left behind, not a post-hoc reconstruction:

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| `GET /files` (admin) | empty | `{"data":[]}` | ✅ |
| `GET /folders` (admin) | empty | `{"data":[]}` | ✅ |
| `GET /permissions?filter[collection][_eq]=directus_files` | none | `{"data":[]}` | ✅ |
| `GET /fields/content_documents` | no `source_file` | `id, slug, status, title, source_document_label, status_label, body_md, display_order, date_created, date_updated` — no `source_file` | ✅ |
| `GET /permissions/147` (`content_documents` public read) `fields` | original 8 | exactly the original 8, `source_file` absent | ✅ |
| `content_documents` row count | 5, unmodified | `5` | ✅ |

**No test artifacts left behind. The restoration claim is accurate.** Nothing
to flag.

### 1. Folder-scoped grant — does it genuinely constrain enumeration? (brief item 1)

I recreated the folder and the grant using the **exact literals from the
edited `bootstrap.sh`** (client-supplied uuid `0f9b1c2d-…`, filter
`{"folder":{"_eq":"<id>"}}`, fields
`["id","filename_download","type","filesize","title","folder"]`), then
uploaded one asset **inside** the folder and two **outside** it, and probed
as an anonymous caller.

| Test (anonymous, no auth header) | Result | Verdict |
|---|---|---|
| `GET /assets/<in-folder>?download` | `HTTP/1.1 200 OK`, `Content-Type: application/vnd.openxmlformats-…wordprocessingml.document`, **`Content-Disposition: attachment; filename="AI Qadam Manifesto.docx"`** | ✅ AC-5 + AC-6 proven |
| `GET /assets/<out-of-folder>` | **`403`** — "You don't have permission to perform \"read\" for collection \"directus_files\"" | ✅ non-public assets stay protected |
| `GET /assets/<out-of-folder>?download` | **`403`** | ✅ the flag is not a bypass |
| `GET /files` | returns **only** the one in-folder row, with exactly the 6 allowlisted fields | ✅ blanket-grant exposure closed |
| `GET /files/<out-of-folder>` | "You don't have permission to access this." | ✅ |
| `GET /folders` | **`403`** — `directus_folders` not granted, so the folder id is not discoverable | ✅ |

**Bypass probes I ran that the CodeDeveloper did not** — the filter is only
worth anything if an attacker cannot widen it from the query string:

| Attack | Result | Verdict |
|---|---|---|
| `GET /files?filter[folder][_null]=true` (ask for root files) | `[]` | ✅ server-side filter is ANDed, not replaced |
| `GET /files?filter[folder][_neq]=<folder>` (invert the scope) | `[]` | ✅ |
| `GET /files?fields=*` (allowlist leak) | returns **only** the 6 allowlisted fields | ✅ |
| `GET /files?fields=storage,filename_disk,uploaded_by,metadata` | `403` naming all four fields as inaccessible | ✅ storage internals not exposed |
| `GET /files?limit=-1&fields=id` | 1 row | ✅ |
| `GET /files?aggregate[count]=id` with **3** files in the instance (1 in-folder, 2 out) | anonymous count = **`1`**, admin count = **`3`** | ✅ **the filter is applied to aggregates too — no count-oracle side channel** |
| Relational traversal `GET /items/content_documents?fields=source_file.filename_disk,source_file.storage` | `403` — "…in collection \"directus_files\"… Queried in \"source_file\"" | ✅ the allowlist holds through the relation, not just at `/files` |
| Relational traversal `GET /items/content_documents?fields=source_file.*` | returns only the 6 allowlisted fields | ✅ |

**Verdict: MAJOR-1's scoping requirement is genuinely satisfied.** The grant
does exactly what I demanded and no more. The `directus_files` read surface
exposed to anonymous users is: six non-sensitive metadata fields on files
that an operator deliberately placed in one named folder. Storage paths,
uploader identity, and EXIF/metadata are all unreachable. This is materially
*narrower* than what the original 403 gap would have required to fix
naively, and I would not have accepted the unfiltered form.

### 2. End-to-end chain — the evidence the original premise lacked

I recreated the full shipping schema (the `source_file` uuid field, the
`SET NULL` relation, the 9-field allowlist) and linked the `manifesto` row:

- Anonymous `GET /items/content_documents?filter[slug][_eq]=manifesto&fields=slug,source_file`
  → `[{"slug":"manifesto","source_file":"00ca7633-…"}]` — the uuid serialises,
  confirming the allowlist append is load-bearing exactly as the inline
  do-not-trim comment warns.
- That uuid, fetched anonymously at `/assets/<uuid>?download` → `200` with
  `Content-Disposition: attachment; filename="AI Qadam Manifesto.docx"`.

**The whole chain is proven, not asserted.** AC-5 and AC-6 hold.

### 3. Two supporting claims I re-tested rather than accepted

- **Multipart part ordering (`-F folder=` before `-F file=`).** Confirmed
  real and non-obvious: uploading with `folder` **after** the file part
  produced `{"folder": null}` — the asset silently lands at the root,
  **outside** the grant, and would 403 for every visitor. The shipping code
  orders it correctly. This is a genuine trap and the inline comment
  documenting it is warranted.
- **`find_existing_file_id()` folder-scoping is a real correctness fix, not
  tidying.** I planted a decoy: two assets both named `Decoy Doc.docx`, one
  outside the folder and one inside. The **shipping** (folder-scoped) query
  returned the in-folder id; the **old unscoped** query returned the
  out-of-folder decoy. Confirmed: without this fix, `attach_source_file`
  could link a row to an asset anonymous visitors 403 on — silently
  reintroducing MAJOR-1 for that document. Good catch by the CodeDeveloper.

### 4. MAJOR-2 — fix correct, and no regression to `assetUrl()`'s callers (brief item 2)

`publicAssetUrl()` returns `${PUBLIC_DIRECTUS_URL}/assets/${fileId}`
unconditionally, where `PUBLIC_DIRECTUS_URL` is a module-level constant
(`'https://cms.aiqadam.org'`) with no `process.env` read and no
`typeof window` branch. `sourceFileDownloadUrl()` now calls it. The dead
hostname and the `http://` mixed-content downgrade are both eliminated by
construction, not by configuration.

**Regression check on `assetUrl()`** — verified mechanically, not by
reading the summary:

- `git diff -U0` on `cms.ts` contains **zero** `-` lines touching
  `assetUrl`, `heroImageUrl`, `fileUrl`, `thumbnailUrl`, or `logoUrl`.
- `assetUrl()`'s body is byte-identical (`grep -c "^-.*assetUrl"` on the
  diff → `0`).
- Its call sites are unchanged: `assetUrl(row.file)` / `assetUrl(row.thumbnail)`
  in `fetchMarketingAssets` (L904-905), plus the four inline
  `${directusBase()}/assets/...` sites at L286 (`hero_image`), L448 and L503
  (`event_materials`), L569 (`sponsors.logo`).

**Zero regression risk** — the change is purely additive: a new function plus
one call-site swap inside the new FR-CMS-008 code path.

*Doc nit (no action):* the code summary and the `publicAssetUrl()` docstring
both say "three existing callers." The accurate count is **two** direct
`assetUrl()` callers plus **four** inline `${directusBase()}/assets/` sites.
Off-by-one in prose only; the code is right and the follow-up scope is
unaffected.

The narrow-scope decision is the correct call. Widening `assetUrl()` would
change SSR fetch and `img src` paths that may legitimately want the internal
base, in a diff whose reviewers are focused on a download link. The residual
latent flaw is documented in Known Limitations with a named follow-up
trigger (before `marketing_assets` / `event_materials` / `event_photos` /
`sponsors.logo` ship real data) — that is the right disposition, and I am
**not** raising it as a finding against this PR since it is pre-existing and
currently unexercised.

The test mirror was updated to `PUBLIC_DIRECTUS_BASE = 'https://cms.aiqadam.test'`
— deliberately a *different* host from the internal base, so a regression back
to `directusBase()` would surface as a changed host in the asserted URLs.
Removing the now-dead `assetUrl()`/`DIRECTUS_BASE` mirror is correct; a stale
unused mirror is what lets drift hide.

### 5. Hardcoded folder UUID — design sanity check (brief item 4)

**Sound. No finding.** Assessed against collision risk, cross-environment
behaviour, and whether the id is secret:

- **Not a secret, and its confidentiality is not load-bearing.** The security
  boundary is the server-side permission filter, not knowledge of the id.
  Verified above: an anonymous caller who *knows* the folder id still cannot
  read anything outside it, cannot widen the filter, and cannot list folders
  (`GET /folders` → 403). Publishing the id in a tracked script therefore
  grants an attacker nothing. This is the same reasoning that makes it fine
  for the 8 RBAC policy UUIDs already hardcoded in this very file
  (`POLICY_RBAC_MEMBER = "400e0021-…"` et al., L2836-2842) — an **established
  repo precedent**, not a novel pattern.
- **Collision risk is nil.** `0f9b1c2d-3e4f-5a6b-8c9d-0e1f2a3b4c5d` is
  RFC 4122-conformant (version nibble `5`, variant nibble `8`), so it lives
  in the standard UUID space and cannot be produced by chance by Directus's
  own random generator. `grep` across the repo confirms it appears in exactly
  three places (both scripts plus the code summary) and collides with nothing.
  A collision would in any case surface as a loud `POST /folders` 4xx at
  bootstrap, not as a silent security failure.
- **Fixed-across-environments is the *safer* property here, not a risk.** It
  is what lets the permission filter reference the folder literally. The
  alternative — a name lookup — introduces a bootstrap ordering dependency
  and a failure mode where the grant references a stale or missing id and
  either 403s everything (fails closed, merely broken) or, if written
  defensively, risks being widened. A per-file `_in` list of uuids is worse
  still: the uuids are generated at upload time, creating a write-back cycle
  between `bootstrap.sh` and the seed script.
- **Client-supplied ids are accepted by Directus** — independently confirmed:
  `POST /folders` with `{"id":"0f9b1c2d-…","name":"public-documents"}` → `200`
  with the id echoed back.
- **Idempotency is correct.** `ensure` checks `GET /folders/<uuid>`, i.e. by
  id — so a re-run is a no-op rather than creating a second
  `public-documents` folder with a fresh id (which *would* be a real problem,
  since the grant points at the literal). Ordering in `bootstrap.sh` is right:
  constant (L5828) → folder (L5831) → grant (L5868).
- **Duplication across the two scripts is acceptable.** Both sites carry a
  keep-in-sync comment, and the seed script's copy is env-overridable
  (`${PUBLIC_ASSET_FOLDER_ID:-…}`). A drift between them fails **closed** —
  the upload lands outside the grant and 403s visibly — rather than opening
  anything up. Shell scripts here have no shared config module, so this is the
  pragmatic option.

### 6. One residual robustness note (advisory, NOT a finding)

`ensure_perm_for_policy` tests existence by **(policy, collection, action)**
only — it does not compare the filter or the `fields` array. So on an
instance that somehow already had a *broader* `directus_files/read` grant for
the Public policy, a re-run would report `✓ exists` and leave the broader
grant in place rather than tightening it to the folder scope.

I am **not** raising this as a finding because: (a) it is the pre-existing
behaviour of a helper used by ~dozens of existing grants in this file, not
introduced by this diff; (b) I verified there is no such pre-existing
`directus_files` grant on any instance (`GET /permissions?filter[collection][_eq]=directus_files`
→ `[]`, and `bootstrap.sh` has never created one); and (c) the only way to
reach the bad state is for an operator to have manually added an unfiltered
grant, which this diff's inline comments explicitly warn against. Worth
knowing if a future change ever needs to *narrow* an existing grant.

### 7. Retry environment cleanup (mine)

Everything I created was removed and the removal verified:

| Action | Result |
|---|---|
| Unlink `manifesto.source_file` | `200` |
| `DELETE /files/<6 test assets>` | all `204` (one transient `000`, retried → `204`) |
| `DELETE /permissions/154` (my trial grant) | `204` |
| `DELETE /folders/0f9b1c2d-…` | `204` |
| Restore `permissions/147` `fields` to the original 8 | `200` |
| `DELETE /relations/content_documents/source_file` | `204` |
| `DELETE /fields/content_documents/source_file` | `204` |
| **Post-check:** files / folders / `directus_files` perms | `[]` / `[]` / `[]` |
| **Post-check:** `content_documents` fields | back to the original 10, no `source_file` |
| **Post-check:** `content_documents` allowlist | back to the original 8 |
| **Post-check:** `content_documents` row count | `5`, unmodified |

No repo file, `.env`, or seed data modified. Containers left running as found;
stop with
`docker compose -f infrastructure/docker-compose.yml stop directus postgres`
if undesired.

### 8. Validation re-run (independent)

| Check | Result |
|---|---|
| `pnpm --filter web-next typecheck` | **0 errors, 0 warnings** (272 files) |
| `pnpm --filter web-next test` | **44 files / 1081 tests passed** |
| `bash -n infrastructure/directus/bootstrap.sh` | OK |
| `bash -n infrastructure/directus/seed-content-documents.sh` | OK |
| Secret scan over the full diff (`password\|secret\|api_key\|apikey\|Bearer <lit>\|token=`) | zero hits |
| `assetUrl()` regression check (`git diff -U0`) | zero `-` lines on any `assetUrl` call site; body byte-identical |

### Retry verdict

| Finding | Status | Evidence |
|---|---|---|
| MAJOR-1 (anonymous `/assets/:id` 403) | **RESOLVED** | Anonymous `200` + `Content-Disposition: attachment` proven live; scoping demanded in the original finding is implemented and survived 8 bypass probes |
| MAJOR-1 scoping (would-be new finding) | **NOT INTRODUCED** | Filter and field allowlist are enforced server-side; enumeration, aggregate counts, `fields=*`, and relational traversal all constrained |
| MAJOR-2 (internal Docker hostname) | **RESOLVED** | `publicAssetUrl()` uses an unconditional module constant; no env/realm branch remains on this path |
| MAJOR-2 regression risk | **NONE** | `assetUrl()` and all its call sites byte-identical in the diff |
| Environment restoration | **VERIFIED CLEAN** | Checked pre-flight, before touching anything |
| Hardcoded folder UUID | **SOUND** | Non-secret by design (boundary is the server-side filter), RFC-conformant, collision-free, established repo precedent, fails closed on drift |
| New findings introduced | **NONE** | All 11 invariants re-checked against the retry diff |

---

## Gate Result

```yaml
gate_result:
  status: passed
  retry: 1
  summary: >
    Both MAJOR findings from the original pass are genuinely resolved, and
    the resolution was re-verified independently against the live local
    Directus 11 rather than accepted from the CodeDeveloper's report.
    MAJOR-1: the folder-scoped directus_files read grant makes anonymous
    GET /assets/<in-folder>?download return 200 with Content-Disposition:
    attachment under the real filename, while out-of-folder assets 403,
    GET /files lists only in-folder rows, and GET /folders is 403. The
    scoping — which I had warned would itself be a security finding if
    done bluntly — survived eight bypass probes I designed myself,
    including filter inversion, fields=*, explicit private-field requests,
    limit=-1, aggregate counts, and relational traversal through
    source_file: none widened the exposure. Anonymous visibility is six
    non-sensitive metadata fields on operator-placed files in one named
    folder; storage paths, uploader identity, and metadata are
    unreachable. MAJOR-2: publicAssetUrl() uses an unconditional module
    constant with no env or realm branch, and assetUrl() plus every one of
    its call sites is byte-identical in the diff — zero regression. The
    environment was verified restored BEFORE I touched anything (0 files,
    0 folders, 0 directus_files grants, no source_file field, allowlist
    back to 8 fields, 5 rows intact), and my own test artifacts were
    removed and re-verified afterwards. All 11 invariants pass. No new
    findings.
  findings:
    - "MAJOR-1 VERIFIED RESOLVED — reproduced live using the exact literals from the edited bootstrap.sh: anonymous GET /assets/<in-folder-id>?download returns HTTP 200 with Content-Disposition: attachment; filename=\"AI Qadam Manifesto.docx\" and the correct docx Content-Type. AC-5 and AC-6 are now demonstrated end-to-end, closing the empirically-false premise the feature was originally built on."
    - "MAJOR-1 scoping VERIFIED SUFFICIENT — the thing I flagged as a would-be new security finding if done bluntly is done correctly. Negative cases all confirmed by me: /assets/<out-of-folder> -> 403, /assets/<out-of-folder>?download -> 403 (the flag is not a bypass), GET /files lists ONLY the in-folder row with exactly the 6 allowlisted fields, GET /files/<out-of-folder> -> permission denied, GET /folders -> 403 so the folder id is not discoverable."
    - "MAJOR-1 bypass probes I designed and ran beyond the CodeDeveloper's table — the filter is only worth anything if an attacker cannot widen it from the query string. filter[folder][_null]=true -> [], filter[folder][_neq]=<folder> -> [] (server-side filter is ANDed, not replaced); fields=* returns only the 6 allowlisted fields; explicit fields=storage,filename_disk,uploaded_by,metadata -> 403 naming all four; limit=-1 -> 1 row. Critically, aggregate[count]=id returns 1 to anonymous while admin sees 3 — the filter applies to aggregates, so there is no count-oracle side channel. Relational traversal is also constrained: fields=source_file.filename_disk,source_file.storage -> 403 'Queried in source_file', and source_file.* returns only the allowlisted 6."
    - "MAJOR-1 net anonymous exposure assessed and accepted: six non-sensitive metadata fields (id, filename_download, type, filesize, title, folder) on files an operator deliberately placed in one named folder. Storage paths, filename_disk, uploaded_by, and metadata/EXIF are all unreachable. Materially narrower than a naive fix; I would not have accepted the unfiltered form."
    - "MAJOR-1 supporting claim re-tested, not accepted: the multipart ordering trap is real. Uploading with -F folder= AFTER the -F file part produced folder:null — the asset silently lands at the root, outside the grant, and would 403 for every visitor. The shipping code orders it correctly and the inline comment is warranted."
    - "MAJOR-1 supporting claim re-tested: find_existing_file_id()'s folder scoping is a genuine correctness fix, not tidying. I planted two assets both named 'Decoy Doc.docx', one in-folder and one out. The shipping folder-scoped query returned the in-folder id; the old unscoped query returned the out-of-folder decoy — which would have linked a row to an asset anonymous visitors 403 on, silently reintroducing MAJOR-1 for that document."
    - "MAJOR-1 end-to-end chain proven with the full shipping schema recreated (source_file uuid field, SET NULL relation, 9-field allowlist): anonymous content_documents read serialises the source_file uuid, and that uuid fetched anonymously at /assets/<uuid>?download returns 200 as an attachment. This also confirms the allowlist append is load-bearing exactly as the inline do-not-trim comment warns."
    - "MAJOR-2 VERIFIED RESOLVED — publicAssetUrl() returns ${PUBLIC_DIRECTUS_URL}/assets/${fileId} where PUBLIC_DIRECTUS_URL is a module-level constant with no process.env read and no typeof-window branch. The dead Docker hostname and the http:// mixed-content downgrade are eliminated by construction, not by configuration."
    - "MAJOR-2 NO REGRESSION to assetUrl()'s callers, verified mechanically rather than from the summary: git diff -U0 on cms.ts contains zero '-' lines touching assetUrl, heroImageUrl, fileUrl, thumbnailUrl, or logoUrl; assetUrl()'s body is byte-identical; its call sites (assetUrl(row.file)/assetUrl(row.thumbnail) in fetchMarketingAssets, plus the inline ${directusBase()}/assets sites for hero_image, event_materials x2, sponsors.logo) are unchanged. The change is purely additive."
    - "MAJOR-2 narrow-scope decision endorsed. Widening assetUrl() would change SSR fetch and img src paths that may legitimately want the internal base, inside a diff whose reviewers are focused on a download link. The residual latent flaw is documented in Known Limitations with a named follow-up trigger (before marketing_assets/event_materials/event_photos/sponsors.logo ship real data) — correct disposition, and I am NOT raising it against this PR since it is pre-existing and currently unexercised."
    - "ENVIRONMENT RESTORATION VERIFIED — checked BEFORE running anything, so this is the state the CodeDeveloper actually left: 0 files, 0 folders, zero directus_files permissions, no source_file field on content_documents (original 10 fields), content_documents public-read allowlist back to its original 8 fields, all 5 rows intact. No test artifacts left behind; nothing to flag."
    - "HARDCODED FOLDER UUID design decision assessed as SOUND — no finding. It is not a secret and its confidentiality is not load-bearing: the boundary is the server-side permission filter, and I confirmed an anonymous caller who knows the id still cannot read outside the folder, widen the filter, or list folders. Same reasoning already licenses the 8 RBAC policy UUIDs hardcoded in this same file (L2836-2842) — established repo precedent. Collision risk nil: 0f9b1c2d-3e4f-5a6b-8c9d-0e1f2a3b4c5d is RFC4122-conformant (version 5, variant 8), appears in exactly 3 places repo-wide, and a collision would surface as a loud POST /folders 4xx at bootstrap, not a silent security failure. Fixed-across-environments is the SAFER property here — it is what lets the filter reference the folder literally, avoiding the bootstrap ordering dependency a name lookup would introduce and the write-back cycle a per-file _in list would need. Directus accepting the client-supplied id confirmed live (POST /folders -> 200). ensure checks GET /folders/<uuid> by id, so a re-run is a no-op rather than creating a second folder with a fresh id (which WOULD break the literal filter). Ordering in bootstrap.sh is correct: constant -> folder -> grant. Duplication across the two scripts fails CLOSED on drift (upload lands outside the grant and 403s visibly) and both sites carry keep-in-sync comments."
    - "ADVISORY, NOT a finding: ensure_perm_for_policy tests existence by (policy, collection, action) only and does not compare filter or fields, so on an instance that already had a BROADER directus_files/read grant for the Public policy, a re-run would report 'exists' and leave it rather than tightening it. Not raised because it is pre-existing helper behaviour used by dozens of existing grants, no such grant exists on any instance (verified: /permissions?filter[collection][_eq]=directus_files -> [] and bootstrap.sh has never created one), and reaching the bad state requires an operator to manually add an unfiltered grant against this diff's explicit inline warnings. Worth knowing if a future change ever needs to NARROW an existing grant."
    - "DOC NIT, no action: the code summary and the publicAssetUrl() docstring both say assetUrl() has 'three existing callers'. The accurate count is two direct assetUrl() callers plus four inline ${directusBase()}/assets sites. Prose only; the code is correct and the follow-up scope is unaffected."
    - "All 11 invariants re-checked against the retry diff and still PASS. INV-2 notable: re-grepped the full diff for password/secret/api_key/apikey/Bearer-literal/token= -> zero hits; PUBLIC_ASSET_FOLDER_ID is a non-secret structural identifier. INV-10: the new permission filter is built by ensure_perm_for_policy's jq -nc --argjson, correctly parameterized. INV-4 strengthened by publicAssetUrl(): the base is now a module constant with no environment or request influence at all."
    - "Independent validation re-run: pnpm --filter web-next typecheck -> 0 errors 0 warnings (272 files); pnpm --filter web-next test -> 44 files / 1081 tests passed; bash -n clean on both shell scripts."
    - "My own retry test artifacts were removed and the removal verified: 6 test files DELETEd (204), trial permission 154 DELETEd, folder DELETEd, allowlist restored to 8 fields, relation and source_file field DELETEd. Post-checks confirm files/folders/directus_files-perms all empty, content_documents back to its original 10 fields and 8-field allowlist, 5 rows intact. No repo file, .env, or seed data modified. Containers left running as found."
    - "PR description obligations carried forward (unchanged, and now MORE important): bootstrap.sh MUST be re-run on every environment before seed-content-documents.sh — it creates the public-documents folder and the directus_files grant, without which every download 403s regardless of the frontend. The seed script itself remains an operator/post-merge action."
    - "Follow-up worth an issue (not blocking this PR): assetUrl() retains the internal-base flaw for its pre-existing callers. Safe today because marketing_assets/event_materials/event_photos/sponsors.logo are all empty; should be fixed before any of them ships real data."
  retriable_by: null
  blocking_acs: []
```
