# Runbook — migrate DMS config from docker volume to host bind-mount

**Status:** PLAN — not yet executed. Requires a controlled window + explicit go-ahead.
**Blast radius:** the entire org's mail (inbound + outbound + webmail + LDAP auth). A mistake here breaks mail for everyone. Treat as high-risk.
**Owner gate:** do not execute without Viktor's explicit approval and a quiet window.

---

## Why this might be wanted

The DMS (`docker-mailserver`) service stores its runtime config in a **named docker volume** (`<stack>_dms-config` → `/tmp/docker-mailserver` in the container). The canonical source of truth for the important parts of that config now lives in git at [`infrastructure/dms/`](../../infrastructure/dms/) (`user-patches.sh`, `apply.sh`, `smoke.sh`). The concern: someone could `docker exec ... vim /tmp/docker-mailserver/user-patches.sh` and silently drift the live config away from git.

## Honest assessment — do we even need this?

**Probably not, and the migration may be more risk than value.** The drift concern is already mitigated:

- `infrastructure/dms/apply.sh` **pushes git → volume** (overwrites the in-volume `user-patches.sh` with the committed one) + reloads postfix + runs the smoke.
- `infrastructure/dms/smoke.sh` runs 18 `postmap` probes that **detect** the LDAP-filter regression class regardless of how the drift happened.

So the existing tooling catches and corrects drift without a bind-mount. A bind-mount only changes *where* the config bytes live (host dir vs named volume) — it does **not** make them git-tracked unless you bind-mount from a host git checkout, which couples the container's lifecycle to a host clone (its own fragility).

**Recommendation:** prefer keeping the named volume + the `apply.sh`/`smoke.sh` discipline. Execute this migration only if there's a concrete reason the named volume is a problem (e.g. backup tooling can't reach it — verify that first; see Step 0). Otherwise, **defer indefinitely** and treat `apply.sh` as the drift-control mechanism.

---

## Pre-flight

- **Coolify write-freeze.** Coolify stores auto-generated Traefik labels as base64 `custom_labels`; a concurrent API write that touches labels/FQDN can wipe routing (caused a prod outage 2026-05-24). Freeze ALL other Coolify writes during this migration. No parallel deploys.
- **Resolve the live container name** (it is not stable):
  ```bash
  ssh aiqadam-prod
  DMS=$(sudo docker ps --format '{{.Names}}' | grep -m1 '^dms-'); echo "$DMS"
  ```
- **Resolve the volume name + host path:**
  ```bash
  sudo docker inspect "$DMS" --format '{{range .Mounts}}{{.Type}} {{.Name}} {{.Source}} -> {{.Destination}}{{println}}{{end}}'
  # note the row for -> /tmp/docker-mailserver  (Type=volume, Source=/var/lib/docker/volumes/<stack>_dms-config/_data)
  ```

## Step 0 — confirm the actual problem first

Before touching anything, confirm the named volume is genuinely a problem:
```bash
# Is dms-config in the restic/F-OPS1 backup set? If yes, "backup can't reach it" is moot.
# Check the restic include paths in the F-OPS1 backrest config.
```
If the volume is backed up and `apply.sh`/`smoke.sh` work, **stop here** — no migration needed.

## Step 1 — back up the volume (mandatory)

```bash
ssh aiqadam-prod
DMS=$(sudo docker ps --format '{{.Names}}' | grep -m1 '^dms-')
VOL=$(sudo docker inspect "$DMS" --format '{{range .Mounts}}{{if eq .Destination "/tmp/docker-mailserver"}}{{.Name}}{{end}}{{end}}')
echo "volume: $VOL"
# tar the volume to a timestamped backup on the host (and ideally off-host)
sudo tar czf "/root/dms-config-backup-$(date +%Y%m%d-%H%M%S).tgz" -C "/var/lib/docker/volumes/$VOL/_data" .
ls -la /root/dms-config-backup-*.tgz
```

## Step 2 — create the host bind path + seed it

```bash
sudo mkdir -p /data/dms-config
sudo cp -a "/var/lib/docker/volumes/$VOL/_data/." /data/dms-config/
sudo chown -R 5000:5000 /data/dms-config   # DMS runs vmail as uid/gid 5000 (per user-patches.sh)
sudo ls -la /data/dms-config   # verify user-patches.sh, postfix-virtual.cf, dovecot.cf, rspamd/, etc. present
```

## Step 3 — point the Coolify service at the bind-mount

⚠️ **Coolify-specific caution.** Coolify stores the service definition in its DB and regenerates compose/labels. Editing a volume mount:
- **Preferred:** Coolify UI → the `aiqadam-mail` service → Storages/Volumes → change the `/tmp/docker-mailserver` mount from the named volume to a **host bind** `/data/dms-config:/tmp/docker-mailserver` → Save (lets Coolify regenerate) → Deploy.
- Do **NOT** hand-edit the on-disk compose if Coolify manages it — Coolify will overwrite on next deploy (same class of issue as the FQDN/label trap). Use the UI so the generator runs.
- If the UI doesn't expose volume-type switching, this migration is **blocked** on Coolify capability — document and abort (revert nothing; the named volume is still in place).

## Step 4 — redeploy + verify (the gate)

```bash
# after redeploy completes:
ssh aiqadam-prod
DMS=$(sudo docker ps --format '{{.Names}}' | grep -m1 '^dms-')
# confirm the mount is now a bind:
sudo docker inspect "$DMS" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}' | grep docker-mailserver
# must show: bind /data/dms-config -> /tmp/docker-mailserver
```
Then from the repo:
```bash
bash infrastructure/dms/smoke.sh          # 18 probes must pass
```
And a live delivery test (send no-reply → a real gmail, confirm `relay=gmail-smtp-in ... status=sent` in `docker logs $DMS`).

**Acceptance:** mount type is `bind`, smoke passes, test mail delivered, webmail loads, an IMAP login succeeds.

## Step 5 — rollback (if any gate fails)

```bash
# Coolify UI: revert the mount back to the named volume -> Save -> Deploy.
# The named volume is untouched by this procedure, so reverting restores the prior state.
# If the volume was somehow modified, restore from Step 1's tarball into the volume's _data.
bash infrastructure/dms/smoke.sh   # confirm green after rollback
```

## Post

- Unfreeze Coolify writes.
- If migration succeeded: the old named volume can be left in place (harmless) or removed after a few days of stable bind-mount operation.
- Update [`infrastructure/dms/README.md`](../../infrastructure/dms/README.md) to note the config now lives at `/data/dms-config` on the host.

## Related
- [`infrastructure/dms/`](../../infrastructure/dms/) — git source of truth + `apply.sh`/`smoke.sh`.
- F-OPS1 snapshot/restore runbook — for the broader backup story.
