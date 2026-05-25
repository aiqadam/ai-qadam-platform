# `infrastructure/dms` — canonical DMS-mail patches + smoke

DMS (docker-mailserver, deployed as the `aiqadam-mail` Coolify service) ships
LDAP configs hard-coded against the OpenLDAP `mail` attribute. Our Authentik
LDAP outpost uses `mail` for the **recovery / personal** email (e.g.
`*@gmail.com`); the internal `@aiqadam.org` address is carried as the
Authentik `User.attribute` named `mailboxEmail`. Without the patches in this
directory, **outbound mail to any external domain whose name happens to match
any internal user's recovery email silently bounces** (Postfix concludes
"we host that domain", routes to local LMTP, no local mailbox, bounce).

This directory holds:

| File | Purpose |
|---|---|
| `user-patches.sh` | Canonical, git-tracked. Pushed into the DMS container's `/tmp/docker-mailserver/user-patches.sh` by `apply.sh`. DMS auto-executes this script on every container start. |
| `apply.sh` | Push the canonical script + execute + `postfix reload` + run smoke. Idempotent. |
| `smoke.sh` | `postmap -q` probes that fail if external-domain or external-address leaks ever return. Run by `apply.sh` and worth wiring into Gatus (see [Open follow-up](#open-follow-up)). |
| `README.md` | This file. |

## When to run

| Trigger | Command |
|---|---|
| You changed `user-patches.sh` in git | `bash infrastructure/dms/apply.sh` |
| DMS container was destroyed + redeployed by Coolify | `bash infrastructure/dms/apply.sh` (Coolify can preserve the volume, but rerunning is cheap insurance) |
| You suspect a routing regression | `bash infrastructure/dms/smoke.sh` |
| Periodic / scheduled | wire `smoke.sh` into Gatus or a scheduled cron — see [follow-up](#open-follow-up) |

## Why all 3 inetOrgPerson filters, not just domains

The bug pattern is:

> `query_filter = (... mail=*@%s ...)` returns a hit when ANY internal user
> has a `mail` attribute ending in the probed value — including their
> personal recovery email.

This applies to every Postfix LDAP config that filters by
`inetOrgPerson`'s `mail` attribute:

| File | Postfix role | Risk if not patched |
|---|---|---|
| `ldap-domains.cf` | `virtual_mailbox_domains` ("do we host `%s`?") | External domain treated as local → bounce. **This is what bit us 2026-05-25.** |
| `ldap-aliases.cf` | `virtual_alias_maps` ("is `<addr>` a known recipient?") | External recipient address falsely matched as a known alias when it equals some internal user's recovery email. Latent until ldap-domains.cf is wrong too, but defense-in-depth. |
| `ldap-users.cf` | `virtual_mailbox_maps` ("does `<addr>` resolve to a mailbox?") | Same risk as aliases.cf. |

`ldap-groups.cf` filters on `groupOfNames` (not `inetOrgPerson`), which
has no recovery-email attribute, so it stays on `mail` and is **not**
patched.

## How DMS picks up the script

DMS automatically runs `/tmp/docker-mailserver/user-patches.sh` after its
own config generation, on every container start. The path is the volume
mount `dms-config` → `/tmp/docker-mailserver` inside the container.
`apply.sh` writes the canonical script into that volume.

The script must:
- Be idempotent (`sed -i ...` against deterministic source lines).
- Operate against files DMS regenerates on each start (so post-DMS
  patches are needed, not pre-DMS image edits).

## Verifying the live state

```bash
# All four probes should match expectations.
bash infrastructure/dms/smoke.sh

# Or inside the container:
ssh aiqadam-prod
sudo docker exec -it $(sudo docker ps --format '{{.Names}}' | grep ^dms-) bash
postmap -q gmail.com    ldap:/etc/postfix/ldap-domains.cf  # expect empty
postmap -q aiqadam.org  ldap:/etc/postfix/ldap-domains.cf  # expect list
postmap -q viktor.drukker@aiqadam.org ldap:/etc/postfix/ldap-users.cf  # expect non-empty
postmap -q drukker1991@gmail.com       ldap:/etc/postfix/ldap-users.cf  # expect empty
```

## Open follow-up

Add a Gatus heartbeat that periodically sends from `no-reply@aiqadam.org`
to a `+canary` Gmail address and verifies the SMTP relay log line
`relay=gmail-smtp-in.l.google.com[...]`. That catches not just the LDAP
filter class but also future DNS / TLS / IP-reputation regressions in
one cheap probe.

## Related

- `docs/runbooks/operator-email-send-as.md` — operator mailbox operations.
- ADR-0009 — email-stack scope.
- Authentik LDAP outpost: provider `aiqadam-mail-ldap-outpost`,
  Coolify service `aiqadam-authentik-ldap`. The `mailboxEmail` attribute
  is set per-user when the platform provisions the account.
