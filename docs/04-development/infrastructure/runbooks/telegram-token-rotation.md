# Telegram token rotation runbook

This page covers two distinct rotations:

1. **BotFather token** — the secret the bot/notifier present to Telegram.
   Stored encrypted in `tg_config.encrypted_token`. Rotate via the
   workspace cabinet (R3) or the admin API directly.
2. **Encryption key** (`TG_CONFIG_ENCRYPTION_KEY`) — the symmetric key
   used to decrypt the column above. Rotation requires re-encrypting
   every row.

Per [ADR-0034 §Addendum 2026-05-22](../../../adr/0034-telegram-bot-and-sender.md#addendum-2026-05-22-r2-encryption-at-rest-for-tg_config).

## 1. Rotate the BotFather token

**When**: token suspected compromised; periodic hygiene (annually);
ownership change on the Telegram account.

**Steps** (cabinet flow, recommended):

1. Open `/workspace/integrations/telegram` (R3 — shipping after R2).
2. Click **Rotate**.
3. In BotFather, send `/revoke` to your bot. Confirm; BotFather issues
   a new token immediately.
4. Paste the new token into the rotate form. Click **Validate** →
   green tick.
5. Confirm.

Behind the scenes the cabinet calls `POST /v1/telegram/admin/rotate-token`
which re-encrypts the new token into the same `tg_config` row.

**Steps** (API directly, ops break-glass):

```sh
TOKEN_NEW='123456789:AABBCC...'
curl -X POST https://api.aiqadam.org/v1/telegram/admin/rotate-token \
  -H "Authorization: Bearer $SESSION_JWT" \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN_NEW\"}"
```

The session JWT must belong to a `super_admin` user. Forge one from a
known Authentik super-admin session via `/v1/auth/refresh`.

## 2. Rotate the encryption key

**When**: key suspected compromised; quarterly hygiene; key class
upgrade (e.g. AES-256 → ChaCha20-Poly1305 in a future version byte).

⚠️ This procedure decrypts and re-encrypts every `tg_config` row with
the old key, then atomically swaps the env var to the new key. Plan
for a brief outage of the configure/rotate/status endpoints (~seconds)
while it runs.

**Pre-flight**:

```sh
# Generate the new key
NEW_KEY=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
echo "NEW_KEY=$NEW_KEY"  # save to your password manager
```

**Steps** (TODO with R5 — placeholder, do not run unedited):

1. SSH to prod (`ssh aiqadam-prod`).
2. `docker exec -it aiqadam-api sh`
3. Run the (yet-to-be-written) rekey script:
   ```sh
   cd /app && node dist/scripts/rekey-tg-config.js \
     --old-key "$TG_CONFIG_ENCRYPTION_KEY" \
     --new-key "$NEW_KEY"
   ```
4. Set the new key in Coolify env (`TG_CONFIG_ENCRYPTION_KEY`).
5. Redeploy the API resource (the cached key inside `TgConfigService`
   refreshes on first request after restart).
6. Verify `GET /v1/telegram/admin/status` returns 200.

**Failure mode**: if step 3 succeeds but step 4 fails, the rows are
encrypted under the new key but the API still has the old key →
decrypt errors on the affected routes. Roll back: re-encrypt with the
old key (same script, args flipped). The encrypted rows + their
configured_at are unaffected by either rotation.

## See also

- [ADR-0034 §Addendum 2026-05-22](../../../adr/0034-telegram-bot-and-sender.md#addendum-2026-05-22-r2-encryption-at-rest-for-tg_config)
- [Coolify app stacks](coolify-app-stacks.md) — for the pre-deployment migration pattern that runs `0013_tg_config.sql` on deploy.
- The bot repo's [docs/deploy-coolify.md](https://github.com/viktordrukker/aiqadam-telegram-bot/blob/main/docs/deploy-coolify.md) — what env the bot expects to see after a token rotation.
