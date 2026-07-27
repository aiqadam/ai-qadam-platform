# Step 1: Issue Lookup — wf-20260727-fix-137

**Source:** GitHub issue [#79](https://github.com/aiqadam/ai-qadam-platform/issues/79)
("Problems with registration of a new user"), reported by tvolodi.

**Local tracking file created:** `.copilot/issues/ISS-AUTH-OIDC-EMAIL-001.md`

**Back-reference comment posted:** https://github.com/aiqadam/ai-qadam-platform/issues/79#issuecomment-5091312396

## Registry search

Searched `.copilot/issues/registry.md` for prior occurrences by keyword
(`oidc`, `email claim`, `authentik`, `callback`, `401`). No exact match.
Related-but-distinct precedents found:

- `ISS-AUTH-AKSTAGE-EMAIL-MISSING` — closed as wrong diagnosis; was about a
  missing Authentik *email-sending* flow stage (password recovery), not
  the *id_token email claim*. Different bug, similar name — noted in the
  new issue file to avoid future confusion.
- `ISS-USR-REG-002` / `ISS-USR-REG-003` — prior registration-flow bugs
  (500 on `/v1/auth/register`, dropped form fields). Both resolved.
  Established the precedent that live QA verification is blocked by
  `wf-20260723-fix-128-deploy-qa-permission-fix` (still queued, confirmed
  via `.copilot/context/workspace-state.md` as of this workflow's start).

## Scope clarification (resolved with user in chat before proceeding)

The raw issue actually reports two independent observations:

1. **Blocking defect:** OIDC callback 401s with "oidc id_token missing
   email claim" — every sign-in fails.
2. **UX observation (not a defect):** the Authentik-generated username
   (`user2.kz.cedc40`) looks confusing. Traced to
   `registration.service.ts::deriveUsername()` — a deliberate
   collision-avoidance random suffix, working as designed.

User decision (chat, 2026-07-27): fix #1 in this workflow; file #2 as a
separate GitHub issue rather than bundling both into one PR (small-PR
rule, AGENTS.md §4 — two unrelated root causes in unrelated modules).
Filed as GitHub issue [#80](https://github.com/aiqadam/ai-qadam-platform/issues/80).

## Business-Process linkage

Set `Business-Process: BP-UAT-009` (Auth sign-in and sign-out) — the
failure is in the OIDC callback that completes sign-in.
`docs/02-business-processes/uat/registry.md` confirms BP-UAT-009 is the
process covering this surface; no dedicated BP-UAT script exists for
self-registration specifically.

## handoff.yaml fields set

- `issue_ref: ISS-AUTH-OIDC-EMAIL-001`
- `github_issue_url`: https://github.com/aiqadam/ai-qadam-platform/issues/79
- `business_process: ["BP-UAT-009"]`

## gate_result

```yaml
status: passed
step: 1
timestamp: "2026-07-27T00:00:00Z"
summary: >-
  Issue intake complete. Local ISS-AUTH-OIDC-EMAIL-001 created, GitHub
  back-reference posted, scope split confirmed with user (username UX
  spun out to GitHub issue #80), Business-Process set to BP-UAT-009.
```
