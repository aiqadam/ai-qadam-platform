# Issue Lookup — wf-20260718-fix-122

## Source

GitHub issue [#28](https://github.com/aiqadam/ai-qadam-platform/issues/28) —
"There is no possibility for user to self-register." Reported by `tvolodi`,
2026-07-18.

Not yet mirrored locally prior to this workflow. Mirrored via:

```bash
gh issue view 28 --repo aiqadam/ai-qadam-platform \
  --json number,title,body,url,labels,createdAt,comments
```

Created `.copilot/issues/ISS-USR-REG-001.md` from that data. Chosen ID
`ISS-USR-REG-001` (module-scoped descriptive ID, matching this repo's
established convention — e.g. `ISS-CI-001`, `ISS-UAT-013-1`, not a bare
sequential number). `GitHub-Issue` field set to the issue URL.

## Scope clarification (pre-implementation)

The raw issue has no acceptance criteria — a one-paragraph user story with
two ambiguous terms ("chapter," "subscribed user"). Before creating the
local issue file, three scoping questions were resolved with the reporter
in chat and the resulting decision was posted back to the GitHub issue as a
comment (durable, visible record):
https://github.com/aiqadam/ai-qadam-platform/issues/28#issuecomment-5010918242

1. Chapter = country (reuse existing tenant/country selector, no new entity).
2. "Subscribed user" = full member role (`role: member`, `is_temporary:
   false`) — no new subscription-tier concept.
3. UI = custom AI-Qadam-branded sign-up page (not a bare Authentik redirect).

These three decisions are the effective acceptance criteria for this
workflow and are copied verbatim into `ISS-USR-REG-001.md`'s "Scope
clarification" section for ImpactAnalyzer/CodeDeveloper to work from.

## Registry search for duplicates/related work

Searched `.copilot/issues/registry.md` for "regist", "signup", "sign-up",
"self-register" — no existing issue covers self-registration. No duplicate.

Related-but-distinct requirements identified (all read in full):

| FR | Status | Relationship |
|---|---|---|
| FR-AUTH-001 | Shipped | Email/password sign-in via Authentik's generic form. States "Platform does not host a custom registration form" — this issue supersedes that constraint specifically for self-registration. |
| FR-AUTH-002 | In Progress | Telegram bot auto-provisioning. Different surface (bot, not web); precedent for `country_preference` collection reused here. |
| FR-AUTH-005/006/007 | Planned | Account linking / temp-account upgrade — all assume an account already exists. Not registration. |
| FR-USR-001 | Shipped | `LeadCaptureForm` — email-only homepage capture funnel, auto-converts to member later. Adjacent design language, but a lead never gets a password or country at capture time. Not a duplicate. |

No local issue with the same or overlapping symptom exists. Proceeding as a
new issue, not an occurrence of an existing one.

## Handoff state

- `issue_ref: ISS-USR-REG-001`
- `github_issue_url: https://github.com/aiqadam/ai-qadam-platform/issues/28`
- Both set in `handoff.yaml`.

---

## Gate Result

```yaml
gate_result:
  status: passed
  summary: "GitHub issue #28 mirrored to ISS-USR-REG-001.md with pre-clarified scope (chapter=country, subscribed=member role, custom branded UI). No duplicate found in registry.md; four related-but-distinct FR-AUTH-*/FR-USR-001 requirements identified and distinguished."
  findings:
    - "No existing local issue covers self-registration — confirmed by keyword search across registry.md."
    - "FR-AUTH-001's 'no custom registration form' constraint is explicitly superseded by this issue's scope, not silently contradicted — documented in ISS-USR-REG-001.md's 'Why this is not a duplicate' section."
    - "Scope ambiguity in the raw issue text (chapter, subscribed user) was resolved with the reporter before any code was written and posted back to the GitHub issue as a durable comment."
```
