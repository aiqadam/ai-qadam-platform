# Runbook: Docker iptables, UFW, and the DOCKER-USER chain

**Audience:** anyone deploying a new Docker service via Coolify or directly on the platform host.
**Pre-reading:** [ADR-0008](../adr/0008-docker-port-publishing-policy.md).

## The problem

Docker manipulates iptables directly via `PREROUTING` (NAT) and `FORWARD → DOCKER` chain rules. **These are evaluated before UFW's chains.** UFW's allow list is effectively bypassed for any container with a published port.

Consequence: a container started with `ports: ["8000:8000"]` on a host with UFW allowing only `22/80/443` is **publicly reachable on port 8000 from the internet**.

We learned this the hard way on 2026-05-14 — Coolify's admin port (8000) was reachable from outside the VM for ~4 minutes after install before we locked it down.

## Our two-pronged defense (per ADR-0008)

### Layer 1 — Compose binding to 127.0.0.1 by default

When publishing a container port that is **not** intended to be public-facing, **always specify the loopback interface explicitly**:

```yaml
# RIGHT — admin UI not publicly reachable
ports:
  - "127.0.0.1:8000:8080"

# WRONG — Docker DNAT bypasses UFW; port 8000 is exposed to the internet
ports:
  - "8000:8080"
```

Public-facing services (Coolify-managed Traefik for HTTPS termination on `80`/`443`) are the only legitimate `0.0.0.0` bindings. Application backends (NestJS, Astro, Directus, etc.) are not directly published — they're reached through Traefik via internal Docker networks.

### Layer 2 — DOCKER-USER chain DROP rules

For each non-public host port that needs hard-stop protection (defense in depth even if a Compose file is wrong):

```bash
# Insert at top of DOCKER-USER chain, scoped to the public NIC
sudo iptables -I DOCKER-USER 1 -i ens3 -p tcp -m conntrack --ctorigdstport <PORT> -j DROP
```

**Critical detail: use `--ctorigdstport`, not `--dport`.** By the time a packet reaches `DOCKER-USER`, PREROUTING DNAT has already rewritten the destination port from the host port to the container's internal port. `--dport` matches the rewritten port (which we don't know reliably and don't want to depend on); `--ctorigdstport` matches the **original** destination port (what the attacker actually hit on our public IP).

### Persisting the rules

```bash
# Install once
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | sudo debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | sudo debconf-set-selections
sudo apt-get install -y iptables-persistent

# Save current rules so they restore at boot
sudo netfilter-persistent save
```

Rules live in `/etc/iptables/rules.v4` (and `.v6`).

## Concrete: adding a new private service

When you add a stack to Coolify (or run `docker compose up` directly) for an internal service:

1. **In the Compose file**, bind the host port to `127.0.0.1`:
   ```yaml
   services:
     internal-thing:
       image: ...
       ports:
         - "127.0.0.1:5432:5432"
   ```
2. **Add a DOCKER-USER DROP rule** for the host port:
   ```bash
   sudo iptables -I DOCKER-USER 1 -i ens3 -p tcp -m conntrack --ctorigdstport 5432 -j DROP
   sudo netfilter-persistent save
   ```
3. **Verify from outside the VM** (e.g., from your local WSL):
   ```bash
   curl -m 5 -o /dev/null -w "%{http_code}\n" http://212.20.151.29:5432/
   # expected: 000 (timeout/refused)
   ```

## Concrete: exposing a service publicly via Traefik

Public services do **not** publish their port directly. Instead:

1. **Compose file**: do not include `ports:` at all (or use `expose:` for documentation). The container is reachable only via Coolify's internal Docker network.
2. **In Coolify UI**: set the service's "Domain" (e.g., `api.aiqadam.org`). Coolify configures Traefik to route `https://api.aiqadam.org` → the container's internal port.
3. **DNS**: ensure the domain resolves to `212.20.151.29` (already covered by `*.aiqadam.org` wildcard).
4. **TLS**: Traefik requests Let's Encrypt HTTP-01 cert automatically. UFW already allows `80/443`; Let's Encrypt is in our CAA list.
5. **No `DOCKER-USER` rule needed** — Traefik on `80`/`443` is the public surface; the container's port stays internal.

## Verifying the lockdown is working

From outside the VM (your local WSL is fine):

```bash
# Ports that should be reachable
curl -m 5 -I http://212.20.151.29:80/      # → 4xx/5xx from Traefik or "no service" — both expected
curl -m 5 -I https://212.20.151.29:443/    # → cert error or 4xx — both expected

# Ports that should NOT be reachable
curl -m 5 -I http://212.20.151.29:8000/    # → timeout (000)
curl -m 5 -I http://212.20.151.29:6001/    # → timeout (000)
curl -m 5 -I http://212.20.151.29:6002/    # → timeout (000)
```

To see DROP counts (incrementing as scanners hit you):

```bash
ssh aiqadam-admin@212.20.151.29 'sudo iptables -L DOCKER-USER -n -v --line-numbers'
```

## Common mistakes

| Mistake | Result | Fix |
|---|---|---|
| `ports: ["5432:5432"]` (no `127.0.0.1:` prefix) | Postgres world-reachable | Add prefix, restart container, verify externally |
| `iptables -I DOCKER-USER -p tcp --dport 8000 -j DROP` | Rule never matches because dport is post-DNAT | Use `--ctorigdstport` instead |
| Forget `sudo netfilter-persistent save` after `iptables -I` | Rule lost on reboot | Save, then `sudo systemctl restart netfilter-persistent` to verify |
| Adding `DOCKER-USER` rule on `lo` interface | Wrong — `lo` is loopback, never sees external traffic | Use `-i ens3` (or whatever the public NIC is named) |
| Putting `DOCKER-USER` DROP on a port that needs container-to-container traffic on a different Docker network | May break inter-container connectivity | Test inter-container connectivity after adding rules |

## The 2026-05-14 incident (for the record)

During Coolify v4 installation:

- UFW was correctly configured (`22/80/443` only).
- Coolify's installer brought up the admin container with `ports: ["0.0.0.0:8000:8080"]`.
- For ~4 minutes, port 8000 was reachable from the public internet — confirmed via `curl` from outside.
- The Coolify `users` table showed 0 rows after lockdown — no exploitation occurred during the window.
- Lockdown applied via the `DOCKER-USER` chain with `--ctorigdstport` matchers.
- First attempt used `--dport` and didn't work — `curl` from outside still returned HTTP 302. Diagnosed and fixed within the same session.
- Made persistent via `iptables-persistent`.
- Re-verified externally (port 8000 → timeout post-fix).

This runbook captures the procedure so the next operator (or future-you) doesn't repeat the incident.
