## Test Strategy — FR-MIG-024

**Workflow:** wf-20260624-feat-019  
**Requirement:** FR-MIG-024 `/workspace/site-settings` — homepage singleton editor  
**Tested files:** `SiteSettingsForm.tsx`, `SiteSettingsForm.test.tsx`, `cms.ts`

---

## Strategy

**Three layers tested:**

1. **Unit tests — Zod schemas** (`SiteSettingsForm.test.tsx`):
   - `heroSchema`: valid input accepted; empty headline rejected; invalid URL rejected
   - `contactSchema`: valid URLs + emails accepted; empty strings accepted for optional; invalid email rejected; invalid URL rejected
   - `footerLinksSchema`: valid `{label, url}` array accepted; label > 100 chars rejected; invalid URL rejected; > 20 items rejected

2. **Unit tests — DOM interactions** (`SiteSettingsForm.test.tsx`):
   - `FooterLinksEditor`: empty state renders; Add button adds row; Remove button removes row; label/URL inputs fire onChange correctly

3. **Unit tests — API mock** (`SiteSettingsForm.test.tsx`):
   - `updateSiteSettings()`: PATCH sent to `/items/site_settings` with correct body and headers; non-2xx response throws

**Not tested here (deferred to later PRs):**
- Full integration of `Hero.astro` consuming the new `heroHeadline`/`heroCtaLabel`/`heroCtaUrl` fields
- Full integration of `AppFooter.astro` consuming `footerLinks`
- Directus schema bootstrap (the new `hero_headline`, `hero_cta_label`, `hero_cta_url`, `footer_links` columns)

---

## Test Execution Plan

1. `pnpm --filter web-next vitest run` — runs all `*.test.tsx` in web-next
2. Expected: all tests pass (13 tests total across the three describe blocks)

---

## Gate Result

```
gate_result:
  status: passed
  summary: "Test strategy covers unit tests for all three Zod schemas, FooterLinksEditor DOM interactions, and updateSiteSettings() API mock. No integration tests needed in-scope — homepage block consumers are deferred to their own FR-MIGs."
```
