# Operator Acceptable Use Policy (v0.1 — placeholder)

**Version:** v0.1-placeholder-2026-05-22
**Status:** Placeholder. Drafted by the platform team pending legal review. Replaces nothing — there was no AUP before.
**Applies to:** every operator accepting an invite link to a role with non-member-class access. This is the text shown on `/onboard?token=...` before password set.

This is a working document. It will be revised to v1.0 once reviewed by counsel per [community-platform-roadmap.md §4.3](../community-platform-roadmap.md) and §11 concurrent-work. Until then, this v0.1 establishes the operating norms in plain language.

---

## What you're agreeing to

By setting your password and continuing, you confirm you have read and accept the following while you hold an operator role at AI Qadam.

### 1. Confidentiality of member data

Members trust us with their email, employment, interests, and consent state. As an operator you can see this data because your role requires it — not because it's yours to use.

- **Don't share member data outside of AI Qadam operations.** No forwarding member lists. No exporting to your personal tools. No screenshotting member-graph views into channels (Slack, Telegram) where non-operators can see them.
- **Don't query for people you know.** "Is so-and-so in the directory" is a misuse of the access. If you have a question that benefits a member directly (e.g. helping them register), ask the member first.
- **Member data leaves with the member.** When a member revokes consents or deletes their account, that includes data you may have copied. Delete local copies promptly.

### 2. The sponsor PII boundary

Sponsors **never see raw member rows.** Sponsors get cohort-aggregated views — totals, charts, segments — never identifiable rows. If a sponsor asks for "the list of attendees who fit profile X", the answer is "we'll send you a digest with the aggregates." If a sponsor insists, escalate to a board member; do not export.

This is a hard line. The community-as-platform thesis depends on it.

### 3. Credentials hygiene

- Your AI Qadam account password is yours and only yours. Don't share it. Don't reuse it on other sites.
- Use a password manager. The signup flow does not store your password choice anywhere we can read — only Authentik holds the hash.
- If your account is compromised (lost device, suspected phishing), notify the platform team immediately so we can revoke and re-issue.
- API tokens / service tokens issued to you are equivalent to your password. Treat them the same.

### 4. Conduct + community norms

Your behavior as an operator sets the tone. The [community-conduct playbook](../../02-business-processes/operator-playbook/community-conduct.md) covers how operators handle incidents involving members. As an operator, you are also bound by the same conduct expectations you enforce.

- Treat members, speakers, sponsors, and fellow operators with respect.
- Don't represent personal opinions as platform positions.
- Don't accept gifts or benefits from sponsors / partners that would compromise your role.

### 5. Off-boarding

When you leave the operator role (voluntarily or otherwise):

- Your platform access is revoked through Authentik.
- Local copies of member data on your devices, in your notes, in your synced services — delete them. We trust you to follow through here; we have no way to audit it after access is revoked.
- The platform team disables your account and rotates any service credentials you held.

### 6. What we owe you

This isn't a one-way agreement.

- We give you the access your role needs and no more. If you find you have access you don't need, tell us — we'll narrow it.
- We document what we do with member data. Surprises in either direction are bugs.
- We don't surveil your platform activity beyond what's needed for security + audit (login records, admin actions). Personal usage analytics is not collected on operator accounts.

### 7. Compensation acknowledgement (country-lead role only)

If your role is `country_lead_*`: compensation arrangements are currently TBD per [business-process-gaps.md G-1](../../02-business-processes/business-process-gaps.md). The operating expectation through 2027 is volunteer-class; comp model will be communicated separately if and when it changes. By accepting this invite as a country-lead, you acknowledge that compensation is not contractually established at this time.

*(Country-lead invites are feature-flagged off in v1; this section is here so the AUP text is complete when the flag flips.)*

---

## Changes to this policy

When this AUP is revised, the version string at the top changes (`v0.1-placeholder-...` → `v1.0` → ...). Active operators are asked to re-accept on next login when a material change ships. Cosmetic edits don't trigger re-acceptance.

The version you accepted is stored in `operator_invites.aup_version` on your invite row. You can ask the platform team for a copy of the exact text you accepted.

---

## Out of scope (v0.1)

- Specific data-retention durations per category (member email vs CSAT response vs event photos) — pending data-flow map work in roadmap §11.
- Cross-border data transfer language (Uzbekistan ↔ Kazakhstan ↔ Tajikistan ↔ EU sponsor visitors) — pending legal review.
- Sponsor / partner AUP — sponsors receive a separate, simpler AUP shipped with their cabinet onboarding (not this document).
- Member AUP — members accept the consent toggles at `/me/profile`; they are not "operators" and don't see this document.

---

**Lawyer review TODO:** convert this from operator-readable plain language into something with proper legal weight. Until then, v0.1 establishes the operating norms; the version field provides the audit hook for the eventual upgrade.
