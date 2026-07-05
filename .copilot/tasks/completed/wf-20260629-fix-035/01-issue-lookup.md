# Step 1: Issue Lookup — wf-20260629-fix-035

## Issue: ISS-UAT-013-3

**Found in registry:** yes — `ISS-UAT-013-3.md` already registered.

**Summary:** `apps/web-next/src/pages/index.astro` renders only `<Hero>`. There is no `LeadCaptureForm` block, no `email_input`, no honeypot, no submit button. This was a deliberate Phase 1.1 scope cut: the form block exists at `apps/web-next/src/blocks/customer/` but is not wired into `index.astro`. It blocks the `apps/web` → `apps/web-next` cutover.

**No similar pre-existing issue found.** This is the authoritative record.

**`issue_ref` set in handoff.yaml:** `ISS-UAT-013-3`

---

## gate_result

```yaml
gate_result:
  status: passed
  step: 1
  attempt: 1
  timestamp: "2026-06-29T00:01:00Z"
  summary: "ISS-UAT-013-3 confirmed in registry; unique issue, no duplicate."
  output_file: ".copilot/tasks/active/wf-20260629-fix-035/01-issue-lookup.md"
```
