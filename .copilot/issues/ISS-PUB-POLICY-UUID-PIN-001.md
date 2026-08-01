# ISS-PUB-POLICY-UUID-PIN-001 — Directus bootstrap.sh uses hardcoded UUID pin for 8 lower public-read blocks that silently skips on envs where the pin doesn't match

| Field | Value |
|---|---|
| ID | ISS-PUB-POLICY-UUID-PIN-001 |
| Severity | minor |
| Module | infrastructure/directus-bootstrap |
| Status | open |
| Reported | 2026-08-01 |
| Resolved | — |
| Workflow | wf-20260801-fix-187-followup-public-policy-uuid-lookup (queued) |
| Reporter | Orchestrator (discovered while live-verifying wf-20260801-fix-187 / ISS-SEC-PUBLIC-UNMANAGED-001) |
| Business-Process | none |

## Symptom

`infrastructure/directus/bootstrap.sh` defines, near line 4293, the constant:

```bash
POLICY_PUBLIC_PROD="87bf5954-616e-40fa-bd61-2587e8c3f49b"
```

and then uses this UUID pin across 8 separate public-read grant blocks
(at lines ~4293, 4364, 4449, 4530, 5122, 5208, 5324, 5425) for the
collections: `event_materials`, `event_photos`, `event_questions`,
`event_sponsors` + `sponsors`, `site_settings`, `press_page`,
`badge_definitions`, `team_members`.

Each block guards itself with:

```bash
if curl -sf -H "${H_AUTH}" "${DIRECTUS_URL}/policies/${POLICY_PUBLIC_PROD}" >/dev/null 2>&1; then
  ...grant...
else
  echo "  ⚠ Public policy ${POLICY_PUBLIC_PROD} not found — skipping..."
fi
```

The Directus built-in Public role's policy has a **fixed name**
(`$t:public_label`) but an **instance-specific id** — generated at
first-boot, not a deterministic constant. On the local env, the actual
Public policy id is `abf8a154-5b1c-4a46-ac9c-7300570f4f17` — NOT
`87bf5954-616e-40fa-bd61-2587e8c3f49b`. Confirmed live 2026-08-01 via
`GET /policies?filter[name][_eq]=$t:public_label&fields=id`.

Consequence: on every Directus env where this UUID pin doesn't match,
all 8 blocks silently skip with a warning. The public reads for those
8 collections fall through to whatever was manually configured (or
nothing, on fresh envs).

## Impact

- Local env (confirmed): no public `event_materials`, `event_photos`,
  `event_questions`, `event_sponsors`, `sponsors`, `site_settings`,
  `press_page`, `badge_definitions`, `team_members` grants are
  applied by `bootstrap.sh`. Whatever the local env exposes is
  whatever was manually configured.
- Fresh Directus env: same — all 8 collections have no public read.
- Hardcoded `87bf5954-...` envs: only those have the 8 grants applied.

This is a class of issue that silently masks public-data exposure on
QA / prod depending on which env they happen to run against — exactly
the failure mode that ISS-SEC-PUBLIC-UNMANAGED-001 (the sister issue
this workflow just resolved) was created to fix. The new
`ISS-SEC-PUBLIC-UNMANAGED-001` block (lines ~2785-2845 in post-PR
state) uses the correct name-lookup pattern (`$t:public_label` →
resolve by filter) — but it can't fix the 8 lower blocks; that's
this issue's job.

## Suggested approach

For each of the 8 affected blocks (event_materials, event_photos,
event_questions, event_sponsors + sponsors, site_settings,
press_page, badge_definitions, team_members):

1. Remove the local `POLICY_PUBLIC_PROD="87bf5954-..."` definition
   from that block (and the one near line 4293 if it isn't used
   elsewhere after migration).
2. Replace the `if curl -sf ... /policies/${POLICY_PUBLIC_PROD}`
   existence guard with the same name-lookup pattern used in the
   ISS-SEC-DIRECTUS-USERS-PUBLIC-001 block (line ~175):
   ```bash
   POLICY_PUBLIC_PROD=$(curl -s -H "${H_AUTH}" \
     "${DIRECTUS_URL}/policies?filter%5Bname%5D%5B_eq%5D=%24t%3Apublic_label&fields=id&limit=1" \
     | jq -r '.data[0].id // empty')
   ```
3. Keep the rest of each block (the jq-built body, the `directus_request_with_retry`
   POST, the "✓ created"/"✓ exists" echo pattern) unchanged.
4. After migration, the constant `POLICY_PUBLIC_PROD` should no longer
   appear anywhere in `bootstrap.sh`.

## Why not done in wf-20260801-fix-187

Out of scope: the ISS-SEC-PUBLIC-UNMANAGED-001 PR was scoped narrowly
to revoke + re-grant the 3 unmanaged Public grants on
events/speakers/event_speakers. The 8 lower blocks are pre-existing
configuration that already silently skipped on this env — they were
not part of the security exposure being fixed. PR Risks documents
this; workflow queued as named follow-up.

## Resolution

- **Workflow:** wf-20260801-fix-187-followup-public-policy-uuid-lookup (queued)
- **PR:** —
- **Status:** open