# Runbook: Bootstrapping Coolify on a fresh VM

**Audience:** anyone setting up a new Coolify host (e.g., disaster recovery on a new VM, second region, replacement hardware).
**Pre-reading:** [ADR-0007](../adr/0007-coolify-orchestration.md), [ADR-0008](../adr/0008-docker-port-publishing-policy.md).
**Procedure source:** the actual sequence used on 2026-05-14 to bootstrap `aiqadam-web` (the production-equivalent host).
**Total time:** ~90 minutes hands-on, including verification at each step.

## Prerequisites

- A fresh Ubuntu 24.04 LTS server (8 vCPU / 16+ GiB RAM / 250+ GB SSD recommended; minimum viable is 4 / 8 / 100)
- Public IPv4 address
- DNS record (A) pointing the platform host hostname (e.g., `coolify.aiqadam.org`) to the VM's public IPv4 — wildcard `*.aiqadam.org` covers this
- An admin user (non-root) created during install with `sudo` group membership
- SSH key-based access for that user; password auth disabled OR planned to be disabled in step 4

## Steps

### Step 0 — One-time interactive sudo configuration

The remote agent (Claude Code) cannot interactively type a sudo password over a non-TTY SSH session. Two options:

**Option A: NOPASSWD sudo for the admin user** (this is what we use on `aiqadam-web`):

```bash
# In your interactive SSH session on the VM:
echo "$(whoami) ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/90-aiqadam-admin >/dev/null \
  && sudo chmod 0440 /etc/sudoers.d/90-aiqadam-admin \
  && sudo visudo -c
```

`visudo -c` must report all files parse OK. **Do not log out** until you've confirmed the sudoers files are valid — a broken sudoers file with you logged out turns into a VPS-console rescue.

**Trade-off:** NOPASSWD means anyone with the SSH private key has instant root. Acceptable for a solo-operator project where the key lives only on the operator's workstation; revisit when a second operator joins (then either remove NOPASSWD or limit it to specific commands).

### Step 1 — System upgrade

```bash
ssh <admin>@<host> 'bash -s' <<'EOF'
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
sudo apt-get update -qq
sudo apt-get full-upgrade -y \
  -o Dpkg::Options::="--force-confdef" \
  -o Dpkg::Options::="--force-confold"
sudo apt-get autoremove --purge -y
[ -f /var/run/reboot-required ] && echo "REBOOT NEEDED" || echo "no reboot"
EOF
```

If reboot needed, reboot now and reconnect.

### Step 2 — UFW firewall

```bash
ssh <admin>@<host> 'bash -s' <<'EOF'
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y -qq ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw default deny routed
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp comment 'http'
sudo ufw allow 443/tcp comment 'https'
sudo ufw --force enable
sudo ufw status verbose
EOF
```

**Note:** UFW does NOT block Docker-published ports — see [ADR-0008](../adr/0008-docker-port-publishing-policy.md). UFW is one defense layer; the Docker-specific lockdown happens in step 7.

### Step 3 — fail2ban (with Docker-bridge whitelist)

```bash
ssh <admin>@<host> 'bash -s' <<'EOF'
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y -qq fail2ban

# Whitelist Docker bridge networks BEFORE enabling — otherwise Coolify's container
# (on 10.0.x.x) trips the sshd jail when its localhost-server SSH attempts fail
# during install (see Step 6.5), which compounds into "Connection refused" on
# every later attempt.
sudo tee /etc/fail2ban/jail.d/00-aiqadam-ignoreip.local >/dev/null <<'CONF'
# Ignore Docker bridge networks so Coolify's container retries don't trip the sshd jail
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
CONF

sudo systemctl enable --now fail2ban
sudo fail2ban-client get sshd ignoreip   # should list the Docker subnets
EOF
```

Ubuntu's default config enables the `sshd` jail. The drop-in above prevents Coolify's per-deploy SSH attempts from getting the container IP banned. **Don't skip this** — the failure mode is silent and confusing.

### Step 4 — sshd hardening drop-in

```bash
ssh <admin>@<host> 'bash -s' <<'EOF'
sudo tee /etc/ssh/sshd_config.d/90-aiqadam-hardening.conf >/dev/null <<'CONF'
# AI Qadam Phase 1 hardening — SECURITY.md §Infrastructure hardening
PasswordAuthentication no
# prohibit-password = key-only root SSH allowed; password root SSH always blocked.
# Required for Coolify v4's localhost-server pattern (it SSHes as root@host.docker.internal
# from its container using a key it generated at install). PermitRootLogin no would block
# Coolify entirely. Standard cloud-image posture.
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
PubkeyAuthentication yes
CONF
sudo chmod 0644 /etc/ssh/sshd_config.d/90-aiqadam-hardening.conf
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -E '^(passwordauthentication|permitrootlogin|kbdinteractiveauthentication|pubkeyauthentication)\b'
EOF
```

**After reload, verify a fresh SSH session works** before considering this step done. Open a SECOND terminal and SSH in — if it works, you're safe. If it doesn't, fix via the VPS console (which is your fallback when SSH is broken).

### Step 5 — Disk expansion (if your VPS provider expanded the disk but Linux didn't see it)

Some providers (hyperapp.cloud, AWS) expand the underlying block device but require you to expand the partition + LVM + filesystem inside Linux. Check:

```bash
ssh <admin>@<host> 'lsblk && df -h /'
```

If the disk size in `lsblk` is larger than the LV size in `df -h /`, run:

```bash
ssh <admin>@<host> 'bash -s' <<'EOF'
sudo apt-get install -y -qq cloud-guest-utils  # provides growpart
sudo growpart /dev/sda 3                        # adjust device/partition as needed
sudo pvresize /dev/sda3
sudo lvextend -l +100%FREE /dev/ubuntu-vg/ubuntu-lv  # adjust VG/LV name
sudo resize2fs /dev/mapper/ubuntu--vg-ubuntu--lv     # ext4; xfs uses xfs_growfs
df -h /
EOF
```

**All steps are online** — no reboot, no unmount needed for ext4.

### Step 6 — Coolify install

```bash
ssh <admin>@<host> '
  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash 2>&1 | tail -50
'
```

Takes 5–10 minutes. The installer:

- Installs Docker + Compose if absent
- Pulls Coolify images
- Brings up Coolify stack via Docker Compose
- Creates `/data/coolify/` for state, configs, TLS material
- Reports the admin URL: `http://<host-public-ip>:8000`

**Do NOT visit that URL yet** — see step 7.

### Step 6.5 — Verify Coolify-side SSH to host

Coolify v4.0.0's installer puts the public key into `/root/.ssh/authorized_keys` and stores the matching private key at `/data/coolify/ssh/keys/id.root@host.docker.internal`. Coolify's localhost-server entry SSHes as `root@host.docker.internal:22` from its own container. With Step 4's `PermitRootLogin prohibit-password` and Step 3's fail2ban whitelist for Docker bridges, this should work.

Verify before changing anything else:

```bash
ssh <admin>@<host> '
  sudo docker run --rm --network coolify \
    --add-host=host.docker.internal:host-gateway \
    -v /data/coolify/ssh/keys:/keys:ro \
    alpine sh -c "
      apk add --quiet openssh-client
      ssh -i /keys/id.root@host.docker.internal \
          -o StrictHostKeyChecking=accept-new \
          -o BatchMode=yes \
          -o UserKnownHostsFile=/tmp/known_hosts \
          root@host.docker.internal id
    "
'
```

Expected: `uid=0(root) gid=0(root) groups=0(root)`.

Failure modes:

- `Permission denied (publickey)` → Step 4 used `PermitRootLogin no` instead of `prohibit-password`. Fix the drop-in and `sudo systemctl reload ssh`.
- `Connection refused` → fail2ban banned the container IP. `sudo fail2ban-client set sshd unbanip <container-ip>` and confirm Step 3's whitelist drop-in actually loaded (`sudo fail2ban-client get sshd ignoreip`).
- `host.docker.internal: bad address` → you ran the test on the wrong Docker network or forgot `--add-host=host.docker.internal:host-gateway`.

### Step 7 — IMMEDIATE port lockdown (critical)

Coolify's admin port (8000) and realtime ports (6001, 6002) are world-reachable as soon as the install completes — **and the first user to register at the admin URL becomes the admin**. We must lock down before letting anyone reach those ports.

```bash
ssh <admin>@<host> 'bash -s' <<'EOF'
# DROP external traffic to Coolify admin ports via DOCKER-USER chain
# Use --ctorigdstport (matches pre-DNAT port), not --dport (matches post-DNAT)
for port in 8000 6001 6002; do
  sudo iptables -I DOCKER-USER 1 -i ens3 -p tcp -m conntrack --ctorigdstport $port -j DROP
done
sudo iptables -L DOCKER-USER -n -v --line-numbers

# Persist across reboots
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | sudo debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | sudo debconf-set-selections
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y -qq iptables-persistent
sudo netfilter-persistent save
EOF
```

**Verify from outside the VM** (e.g., your local WSL):

```bash
for port in 8000 6001 6002; do
  curl -m 5 -o /dev/null -w "port $port: %{http_code}\n" "http://<host-public-ip>:${port}/"
done
# expected: all three return 000 (timeout/refused)
```

If any port returns a non-000 code, the lockdown isn't working — see [docker-iptables-and-ufw.md](docker-iptables-and-ufw.md) for diagnostics.

### Step 8 — First admin via SSH tunnel

```bash
# From your local workstation:
ssh -N -L 8000:127.0.0.1:8000 -L 6001:127.0.0.1:6001 -L 6002:127.0.0.1:6002 <admin>@<host>
```

Leave the tunnel open. In your browser, visit `http://localhost:8000` (NOT the public IP):

1. Register the first admin account with a strong, unique password (≥ 20 chars from a password manager).
2. Settings → enable 2FA (TOTP). Save recovery codes to offline storage.
3. Verify in the database that exactly one user exists:
   ```bash
   ssh <admin>@<host> 'sudo docker exec coolify-db psql -U coolify -d coolify \
     -c "SELECT id, email, two_factor_confirmed_at FROM users;"'
   ```
   Expected: 1 row, with your email, `two_factor_confirmed_at` non-null.

### Step 9 — Back up the Coolify .env

`/data/coolify/source/.env` holds Coolify's encryption keys. Lose it = lose access to anything Coolify has stored encrypted (deploy keys, env vars on deployed services).

```bash
# Pull to your local workstation, store in password manager (as a file attachment)
scp <admin>@<host>:/data/coolify/source/.env ./coolify-env-backup-$(date +%Y%m%d).txt
```

### Step 10 — Configure Instance URL (after DNS resolves)

Once `coolify.<your-domain>` resolves to the host's public IP (via wildcard DNS), open Coolify (still through the SSH tunnel) and:

1. Settings → **Instance Settings** → **Instance Domain** = `coolify.<your-domain>`
2. Enable HTTPS toggle.
3. Save. Coolify's Traefik queues a Let's Encrypt HTTP-01 cert request automatically.
4. Wait ~60–90 seconds.
5. Try `https://coolify.<your-domain>` directly — should load with valid TLS.
6. Once confirmed, you can close the SSH tunnel — admin access is now via the proper hostname.

The `DOCKER-USER` DROP rules from step 7 stay in place — Traefik on 80/443 (allowed by UFW) is the new public surface; the underlying admin port (8000) remains internal-only as defense-in-depth.

## What this runbook does NOT cover

- Deploying actual application stacks (Postgres, Authentik, NestJS, etc.) — those will have their own per-stack runbooks
- Restic backup configuration (separate runbook, TBD)
- Observability stack (Grafana / Loki / Prometheus / Uptime Kuma — Phase 1 weeks 8–10)
- Multi-host setup (out of scope for Phase 1; see [ADR-0002](../adr/0002-deployment-target.md))

## Disaster-recovery use

If the original host dies, this runbook is the recovery procedure. Combined with restic-restored Postgres + MinIO + `/data/coolify`, a fresh box can be brought to working state in ~2 hours plus the restic restore time. RTO target per [SECURITY.md §"Recovery time objectives"](../../.claude/SECURITY.md) is 4 hours.
