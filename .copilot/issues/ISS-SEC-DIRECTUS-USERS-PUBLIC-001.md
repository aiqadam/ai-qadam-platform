# ISS-SEC-DIRECTUS-USERS-PUBLIC-001 — Unauthenticated requests could read every member's full Directus profile row (PII leak)

| Field | Value |
|---|---|
| ID | ISS-SEC-DIRECTUS-USERS-PUBLIC-001 |
| Severity | critical |
| Module | infrastructure/directus-bootstrap, security |
| Status | resolved |
| Reported | 2026-07-28 |
| Resolved | 2026-07-28 |
| Workflow | wf-20260728-fix-144 |
| Reporter | Orchestrator (discovered while security-reviewing the ISS-USR-PROFILE-002 fix) |
| Business-Process | — (infra/security, not a single business process) |

## Symptom

Discovered while empirically verifying a `directus_permissions` filter for
an unrelated fix (ISS-USR-PROFILE-002). A cross-user permission test
(policy-holder A reading policy-holder B's `directus_users` row, expected
to fail) unexpectedly succeeded. Isolating the cause: it succeeded even
with **zero policies attached at all** — i.e. a fully anonymous,
unauthenticated request:

```
curl http://localhost:8200/users/{any-user-id}
→ 200 { full row: id, email, first_name, last_name, bio_md,
        telegram_user_id, is_student, ...every field... }

curl http://localhost:8200/users?limit=3&fields=id,email
→ 200 [ lists arbitrary users, including admin@example.com ]
```

**No authentication, no token, no session — a plain anonymous HTTP
request could enumerate and read every member's (and the admin
account's) full Directus profile.**

## Root cause (confirmed live, 2026-07-28)

Directus's built-in **Public** role's policy (fixed name
`$t:public_label` — Directus's own untranslated i18n key for this
built-in policy, shipped with every Directus installation; the id itself
is instance-specific, generated at first boot, NOT a constant) had an
unrestricted `directus_users` read permission:

```json
{"policy": "<public-policy-id>", "collection": "directus_users",
 "action": "read", "permissions": null, "fields": ["*"]}
```

`permissions: null` = no row filter (every row matches). `fields: ["*"]`
= every field, including PII (`email`, `bio_md`, `telegram_user_id`,
`industry_tags`, etc.).

**Origin not conclusively determined.** Searched `infrastructure/directus/bootstrap.sh`
for any code path that creates a `directus_users` read grant on the
Public policy — none exists. Every other Public-policy grant in the
script (`events`, `speakers`, `event_photos`, `event_materials`,
`event_questions`, `event_sponsors`, `event_speakers` — all legitimately
public content) goes through the guarded `POLICY_PUBLIC_PROD` pattern
(`if curl ... policies/${POLICY_PUBLIC_PROD} ...; then ... fi`), which
this `directus_users` grant did not. Most likely explanation: a manual
change via the Directus Admin App at some point, not committed to
source — but this is inference, not confirmed via any audit log
(`directus_activity` was not checked for this row's creation event; a
future investigation could check `directus_revisions`/`directus_activity`
for the permission's `date_created` and `user_created` if a definitive
origin is needed).

## Impact

- **Every member's PII was readable by anyone**, unauthenticated, on
  local — and per user instruction (2026-07-28, same standing guidance as
  ISS-USR-PROFILE-002: "On prod all has to be the same, maybe worse"),
  assumed present on QA and production until independently verified
  otherwise.
- Exposed fields include `email`, `bio_md`, `telegram_user_id`,
  `telegram_username`, `industry_tags`, `job_title`, `city`,
  `is_student`, and every other custom `directus_users` field — a
  meaningful PII exposure under most data-protection framings (GDPR-
  adjacent, given `gdpr_deleted_at` exists as a field in this schema,
  implying the platform already treats this data as GDPR-scoped).
- User enumeration was also possible (`GET /users?limit=N` listed emails
  with no auth), which independently aids credential-stuffing / phishing
  targeting even without the per-row PII.

## Resolution

- **Workflow:** wf-20260728-fix-144
- **PR:** <pending>
- **Fix (local, verified):** Added `revoke_public_read()` to
  `infrastructure/directus/bootstrap.sh` — looks up the built-in Public
  policy **by name** (not by hardcoding this instance's specific id,
  since that id is not portable across Directus installs), and deletes
  any `directus_users`/`read` permission row(s) found on it. Idempotent
  (no-op when already absent; safe to re-run). Verified: (1) recreated the
  dangerous permission row manually, (2) ran `bootstrap.sh`, confirmed it
  detected and deleted the row, (3) confirmed anonymous read now returns
  `403 FORBIDDEN`, (4) confirmed `policy.member`'s own-row read (added in
  the same workflow for ISS-USR-PROFILE-002) still works correctly for an
  authenticated member reading their own row, and still correctly denies
  a different authenticated member's row — the cross-user leak this
  discovery started from is now closed for authenticated requests too
  (it was never actually about `policy.member`'s filter, which was
  correct all along; the Public-policy grant was masking that filter's
  correctness by granting broader access underneath it).
- **Verified on QA (2026-07-28, with explicit user authorization):**
  SSH'd to `pro-data-tech-qa` (95.46.211.230), queried QA's Directus
  directly (`aiqadam-qa-directus-1`, port 3119) as admin — **QA's Public
  policy has zero `directus_users` permission rows** (`GET /permissions?
  filter[policy]=<public-id>&filter[collection]=directus_users` →
  `{"data":[]}`), and an anonymous read of `/users` correctly returns
  `403`. QA was never vulnerable to this specific leak — the dangerous
  permission row was local-only, most likely introduced via a manual
  Directus Admin App change on the local dev instance at some point
  (never committed anywhere, never propagated). No fix needed on QA.
- **Production has no live Directus at all.** SSH'd to
  `pro-data-tech-prod` (95.46.211.224) — no `directus` container running;
  `aiqadam-prod-api-1`'s env shows `DIRECTUS_URL=http://127.0.0.1:9998/directus-not-configured/`
  and `DIRECTUS_TOKEN=placeholder-not-configured` (literal placeholders),
  same for `OIDC_ISSUER_URL`. **Confirmed expected by the user** — prod's
  Directus/Authentik integration is deliberately not yet cut over, not a
  gap this issue needs to address. Nothing to fix or verify there for
  this specific finding.
- **Conclusion: this issue is fully resolved.** The leak was local-only,
  now closed and verified via the automated `bootstrap.sh` fix (idempotent
  — safe to re-run, and will correctly no-op on QA/prod given neither
  currently has the dangerous grant / a live Directus at all).
- **Scope note:** other Public-policy grants (`events`, `speakers`,
  `event_photos`, `event_materials`, `event_questions`, `event_sponsors`,
  `event_speakers`) were reviewed and are believed intentional (public
  event content), going through the codebase's existing guarded
  `POLICY_PUBLIC_PROD` pattern. `event_questions` carries a `user` FK
  that might warrant a closer look (does public read of "all fields"
  leak the asking member's identity on a public event Q&A?) — flagged as
  a follow-up worth a dedicated small audit, not fixed in this issue
  (out of scope: this issue is about the confirmed `directus_users`
  finding, not a full permission audit of every public collection).
- **Honesty disclosure (AGENTS.md §6.1):** the "resolved" status above
  applies ONLY to local. Marking this issue's `Status` field precisely as
  "resolved (local) — prod/QA verification still required" rather than a
  bare "resolved" specifically so a future read of `registry.md` doesn't
  mistake this for a fully-closed production incident.
