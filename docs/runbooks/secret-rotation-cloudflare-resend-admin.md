# Runbook: rotating `CLOUDFLARE_API_TOKEN` + `RESEND_ADMIN_API_KEY`

**Audience:** AI Qadam project lead (Viktor) or whoever holds the 1Password admin vault.
**When to run:** every 12 months, OR immediately on suspected compromise (token shown on screen-share, committed by mistake, posted to a chat, etc.).
**Time:** ~10 minutes per token.

These two secrets were introduced in [F-S2.8](../../apps/api/src/modules/admin-invites/cloudflare-routing.client.ts) (Cloudflare Email Routing + Resend per-operator key automation). They are **distinct from** the platform sending keys:

| Variable | Used for | Distinct from |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | F-S2.8 — creating Email Routing rules at invite-creation time | Cloudflare's general API access (we don't use a global key) |
| `RESEND_ADMIN_API_KEY` | F-S2.8 — creating per-operator sub-keys via `POST /v1/api-keys` | `RESEND_API_KEY` (the platform sending key in `EmailService`) |

## Posture

Both tokens follow the **degraded-mode** convention used elsewhere in this codebase ([env.ts](../../apps/api/src/config/env.ts)): when unset, the corresponding client's `isConfigured()` returns false and `createInvite()` records a `partial_failures` entry instead of crashing. This means **rotation can be done with zero-downtime** by deleting the old env value first, then setting the new one — invites continue to work, they just fall back to manual Cloudflare/Resend setup for the rotation window.

## Cloudflare API Token rotation

### Step 1 — Mint the new token

1. Open https://dash.cloudflare.com/profile/api-tokens.
2. Click **Create Token** → **Custom token**.
3. Configure:
   - **Name:** `aiqadam-email-routing-edit-YYYY-MM-DD` (date stamps the rotation cohort)
   - **Permissions:**
     - **Zone → Email Routing Rules → Edit**
     - **Zone → Email Routing Settings → Read**
   - **Zone Resources:** **Include → Specific zone → aiqadam.org**
   - **Client IP Address Filtering:** leave empty unless tightening (Coolify outbound IP may rotate)
   - **TTL:** **forever** (annual rotation handles freshness)
4. **Continue to summary** → **Create Token**.
5. Copy the displayed token into 1Password as `cloudflare-email-routing-edit` (overwrite the prior entry; keep one historical version in 1Password's history).

### Step 2 — Roll into Coolify

1. Coolify → `aiqadam-api` service → **Environment Variables**.
2. Edit `CLOUDFLARE_API_TOKEN` → paste the new value → **Save**.
3. Click **Redeploy** (or push any commit; Coolify will pick up the new env on next deploy).

### Step 3 — Verify

1. After redeploy finishes, create a throwaway test invite via [/workspace/admin/users/new](../../apps/web/src/pages/workspace/admin/users/new.astro) with a real `@aiqadam.org` address + a destination Gmail you control.
2. Expected success-panel result:
   - Cloudflare rule: ✓ created (`<some-id>`)
   - Resend per-operator key: ✓ created (`rsk_...`)
   - Partial failures: (empty)
3. **If `partial_failures` shows `cloudflare:Cloudflare 401`** → the new token wasn't saved correctly OR was minted with wrong permissions. Re-check Step 1.
4. Revoke the test invite from [/workspace/admin/users](../../apps/web/src/pages/workspace/admin/users/index.astro) (this does NOT delete the CF rule — see "Cleanup" below).

### Step 4 — Revoke the old token

Only after Step 3 succeeds:

1. Cloudflare API tokens page → find the previous `aiqadam-email-routing-edit-*` entry → **Roll** or **Delete**.
2. **Delete** the previous 1Password entry (don't leave it as "active" — it isn't).

## Resend Admin API Key rotation

### Step 1 — Mint the new key

1. https://resend.com/api-keys → **Create API Key**.
2. **Name:** `aiqadam-admin-keymanagement-YYYY-MM-DD`
3. **Permission:** **Full Access** (required — `sending_access` cannot create sub-keys)
4. **Domain:** leave as **All Domains**
5. Click **Add** — the plaintext key is shown ONCE.
6. Copy into 1Password as `resend-admin-key` (overwrite previous entry).

### Step 2 — Roll into Coolify

Same as Cloudflare Step 2, but the env var name is `RESEND_ADMIN_API_KEY`.

### Step 3 — Verify

Same test-invite flow. Expected: `resend_key_id` populated in the success panel, plaintext shown in the "Resend key (shown once)" block.

**If `partial_failures` shows `resend:ResendAdmin 401`** → the new key wasn't saved or doesn't have Full Access. Re-check Step 1.

### Step 4 — Revoke the old key

1. Resend → API Keys → previous `aiqadam-admin-keymanagement-*` row → **Delete**.
2. **Important:** this does NOT revoke the per-operator sub-keys minted under the old admin key. Those are independent sub-resources and stay valid until individually deleted.

## Cleanup considerations (NOT part of rotation, but related)

These are deliberate **known limitations** of F-S2.8 v1, listed here so a future rotator knows what's NOT auto-cleaned:

- **Stale Cloudflare rules**: when an invite is revoked, the CF Email Routing rule is NOT deleted. Visit Cloudflare → aiqadam.org → Email → Routing → Rules to manually delete rules for operators who never consumed their invite.
- **Stale Resend per-operator keys**: same story. Visit Resend → API Keys to delete keys for revoked invites. Their names start with `aiqadam-operator-<email>-<timestamp>` for easy identification.
- A scheduled cleanup job (orphan-resource sweep) is a candidate follow-up if these stack up — track in [docs/business-process-gaps.md](../business-process-gaps.md) when manual cleanup becomes painful (> ~5 per quarter).

## Audit trail

Both rotation operations should be recorded in `audit_events` with type `secret.rotated`. The rotation script ([scripts/log-secret-rotation.sh](../../scripts/log-secret-rotation.sh), if it exists at rotation time) appends an entry; if not, file a quick handwritten audit row via the workspace audit cabinet.

## Related docs

- [F-S2.8 source](../../apps/api/src/modules/admin-invites/cloudflare-routing.client.ts) + [resend admin client](../../apps/api/src/modules/admin-invites/resend-admin.client.ts)
- [ADR-0035 (Admin cabinet + invite link)](../adr/0035-admin-cabinet-and-invite-link-onboarding.md) — the F-S2.7 baseline this extends
- [ADR-0012 (Operator Send-as automation)](../adr/0012-operator-send-as-automation.md) — F-S2.8 is the first slice toward this; full Gmail OAuth lands in F-S2.10
- [docs/runbooks/secret-rotation-pending.md](secret-rotation-pending.md) — for the R5 launch-time rotation pass on the broader secret set
