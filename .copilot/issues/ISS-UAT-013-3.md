# ISS-UAT-013-3 — apps/web-next homepage renders only `<Hero>`; no lead capture form

| Field | Value |
|---|---|
| ID | ISS-UAT-013-3 |
| Severity | bug |
| Module | web-next / customer |
| Status | open |
| Reported | 2026-06-23 (downstream concern first raised in Step 1, BusinessAnalyst script validation) |
| Re-registered | 2026-06-28 (BP-UAT-013 triage — see Workflow) |
| Reporter | BusinessAnalyst (wf-20260628-uat-030) |
| Workflow | wf-20260628-uat-030 |

## Symptom

`apps/web-next/src/pages/index.astro` renders only the `<Hero>` block — there is no `LeadCaptureForm` block, no `email_input` field, no honeypot field, no submit button. The customer-facing homepage has no way for an anonymous visitor to submit a lead.

Confirmed by grep search:

```
$ rg -i 'LeadCapture|lead_capture|email_input|honeypot' apps/web-next/src/
(no matches)
```

Source of `apps/web-next/src/pages/index.astro` (Phase 1.1 customer-facing homepage rewrite, ADR-0038):

```astro
---
import { PageHead } from '../blocks/common';
import { Hero } from '../blocks/customer';
import Layout from '../layouts/Layout.astro';
import { fetchSiteSettings } from '../lib/cms';
const settings = await fetchSiteSettings();
const stats = [ … ];
---

<Layout title="AI Qadam" description={settings.defaultDescription}>
  <PageHead slot="head" title="AI Qadam" description={settings.defaultDescription} />
  <main>
    <Hero description={settings.defaultDescription} stats={stats} … />
  </main>
</Layout>
```

For comparison, `apps/web/src/pages/index.astro` (legacy Astro app, the one UAT currently targets on :4321) **does** import and render `LeadCaptureForm` — that is why BP-UAT-013 passed Steps 001 / 004 at the UI layer despite the api being down.

## Impact

- **Blocks the `apps/web` → `apps/web-next` cutover.** Until the lead capture form is ported to web-next, the new frontend cannot replace the legacy one for the public homepage — anyone navigating to `/` on web-next cannot submit a lead, which is BP-UAT-013 AC-1.
- **Does NOT block BP-UAT-013 itself.** BP-UAT-013 runs against `http://localhost:4321` (apps/web, which has the form). The product gap is re-registered here as a separate concern.

## Root cause

Phase 1.1 of the web-next migration (per the `@generated-from` marker dated 2026-05-26) shipped the homepage composition with only the `<Hero>` block. The `<LeadCaptureForm>` block exists in `apps/web-next/src/blocks/customer/` (the import path resolves) but is not yet wired into `index.astro`. Likely a deliberate scope cut to keep the Phase 1.1 PR under the 400-LOC small-PR cap; not a regression from working code.

## Proposed resolution

Create a follow-up web-next feature workflow that:

1. Adds `LeadCaptureForm` to the `<main>` of `apps/web-next/src/pages/index.astro`, mirroring the legacy `apps/web/src/pages/index.astro` composition.
2. Verifies the form posts to the same `/api/v1/leads` endpoint (proxied through `apps/web-next/astro.config.mjs`).
3. Re-runs BP-UAT-013 against web-next's preview environment (port 4322) and adds a new UAT script — or extends BP-UAT-013 — to cover both surfaces.
4. Updates the cutover runbook (`docs/04-development/infrastructure/runbooks/web-next-cutover.md` or equivalent) so this gate is explicit.

Until this lands, the apps/web → apps/web-next cutover must NOT mark the homepage as cutover-complete.

## Out of scope

- The 11 other pages in `apps/web-next/src/pages/` that may have similar parity gaps. Out of scope until an audit (not yet scheduled) lists them.
- The product decision to keep web and web-next separate at all (the cutover itself). Owned by the Orchestrator and the user.

## References

- `apps/web-next/src/pages/index.astro`
- `apps/web/src/pages/index.astro` — legacy, has the form
- `docs/03-requirements/FR-USR-001.md` — source requirement (AC-1 lead capture)
- `.copilot/tasks/active/wf-20260628-uat-030/01-uat-script-validation.md` — first flagged
- `.copilot/tasks/active/wf-20260628-uat-030/02-preflight.md` — re-flagged