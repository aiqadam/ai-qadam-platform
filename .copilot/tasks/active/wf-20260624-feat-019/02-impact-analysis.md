## Impact Analysis — FR-MIG-024

**Requirement:** `/workspace/site-settings` — homepage singleton editor  
**Workflow:** wf-20260624-feat-019  
**Analyst:** Orchestrator (ImpactAnalyzer agent unavailable in this session)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Directus schema changes needed for hero_headline/hero_cta_label/hero_cta_url and footer_links | Medium | Low | Schema additions are additive only; no existing data destroyed |
| Homepage Hero block needs to read new fields | Medium | Medium | Hero already reads from SiteSettings via fetchSiteSettings(); add new fields to interface + use them |
| Footer links repeater: complex UI for add/remove/reorder | Medium | Medium | Use existing Form block's textarea-based approach or a simple repeater UI using ActionBar |
| cms.ts needs write helper (updateSiteSettings) | Low | Low | Straightforward PATCH to /items/site_settings endpoint |

---

## Blast Radius

- **Modified:** `apps/web-next/src/lib/cms.ts` (add write helper)
- **Modified:** `apps/web-next/src/blocks/customer/Hero.astro` (read new hero fields)
- **Modified:** `apps/web-next/src/blocks/common/AppFooter.astro` (read footer_links)
- **Modified:** `apps/web-next/src/pages/workspace/site-settings/index.astro` (new page)
- **Modified:** `apps/web-next/blocks.md` (new route entry)
- **Modified:** `docs/03-requirements/FR-MIG-024.md` (status → Implemented)
- **Modified:** `docs/03-requirements/requirements-registry.md` (status → Implemented)
- **Created:** `apps/web-next/src/blocks/workspace/SiteSettingsForm.tsx` (React island)

No changes to public-facing routes, auth system, or database schema beyond Directus item fields.

---

## Files Changed (estimated)

1. `apps/web-next/src/lib/cms.ts` — extend SiteSettings interface + add updateSiteSettings()
2. `apps/web-next/src/blocks/workspace/SiteSettingsForm.tsx` — new, ~200 LOC
3. `apps/web-next/src/pages/workspace/site-settings/index.astro` — new, ~60 LOC
4. `apps/web-next/blocks.md` — add route + block entry
5. `docs/03-requirements/FR-MIG-024.md` — status update
6. `docs/03-requirements/requirements-registry.md` — status update

**Total: 5 files changed + 1 new block file. Well within 5-file / 400-LOC budget.**

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "FR-MIG-024 is low-risk. Directus schema additions are purely additive. All other changes are new files or edits within existing patterns. Blast radius is contained to the site-settings cabinet + homepage consumer blocks."
```
