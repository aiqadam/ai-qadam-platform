# ADR-0008: Docker port publishing must bind 127.0.0.1; DOCKER-USER chain enforces lockdown

## Status
Accepted, 2026-05-14

## Context
During Coolify v4 bootstrap on 2026-05-14, the admin UI bound to `0.0.0.0:8000` by default. UFW was configured to allow only `22/80/443`. **Port 8000 was nonetheless publicly reachable from the internet for ~4 minutes** — confirmed via `curl` from outside the VM during incident verification.

Root cause: Docker manipulates iptables directly via `PREROUTING` (NAT) and the `FORWARD → DOCKER` chain. These rules are evaluated **before** UFW's chains. UFW is effectively bypassed for any container with a published port.

This is documented Docker behavior, not a Coolify bug. It applies to any container with `ports: ["<host>:<container>"]` syntax in `docker-compose.yml`, where `<host>` defaults to `0.0.0.0` if no interface prefix is specified.

A second subtlety: the `DOCKER-USER` chain (Docker's official user-customizable chain that IS evaluated before Docker's own rules) sees packets **after** PREROUTING DNAT has rewritten the destination port. So a rule matching `--dport 8000` doesn't fire — by the time the packet reaches `DOCKER-USER`, the destination has been rewritten to the container's internal port (e.g., `8080`).

## Decision
Two-pronged policy for every Docker stack we deploy:

### 1. Compose files bind to `127.0.0.1` by default

Any container port that should not be publicly reachable must use loopback binding:

```yaml
# RIGHT — admin UI not publicly reachable
ports:
  - "127.0.0.1:8000:8080"

# WRONG — publicly reachable through the Docker DNAT bypass
ports:
  - "8000:8080"
```

Public-facing services (Coolify-managed Traefik handling 80/443 termination) are the only legitimate `0.0.0.0` bindings. Application backends (NestJS, Astro, Directus, etc.) are not directly published — they're reached through Traefik via internal Docker networks.

### 2. Defense-in-depth: `DOCKER-USER` DROP rules

For each non-public host port, insert a rule into the `DOCKER-USER` chain that DROPs traffic on the public NIC, using `-m conntrack --ctorigdstport <host-port>`:

```bash
sudo iptables -I DOCKER-USER 1 -i ens3 -p tcp -m conntrack --ctorigdstport 8000 -j DROP
sudo iptables -I DOCKER-USER 1 -i ens3 -p tcp -m conntrack --ctorigdstport 6001 -j DROP
sudo iptables -I DOCKER-USER 1 -i ens3 -p tcp -m conntrack --ctorigdstport 6002 -j DROP
```

The `--ctorigdstport` matcher tracks the **original** destination port (pre-DNAT), so it matches the host port (the one we care about) rather than the rewritten container port.

### 3. Persistence

Persisted via the `iptables-persistent` package (rules saved to `/etc/iptables/rules.v4`, restored at boot):

```bash
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | sudo debconf-set-selections
sudo apt-get install -y -qq iptables-persistent
sudo netfilter-persistent save
```

## Rationale

- **Compose binding alone isn't sufficient defense** if a future Compose file forgets the `127.0.0.1:` prefix. The `DOCKER-USER` rule catches the mistake even when the Compose binding is wrong.
- **`DOCKER-USER` alone isn't sufficient** because adding a new service requires remembering to add the rule. Compose binding is the closer-to-the-developer guarantee.
- **Both layers together** make publicly exposing an internal service require two simultaneous mistakes (wrong Compose binding AND missing iptables rule).
- **`--ctorigdstport`, not `--dport`**, is the matcher that actually works — `--dport` matches post-DNAT (the container port), not the host port we want to protect.

## Consequences

- ✅ Public exposure of admin UIs and internal services is prevented even if a Compose file is wrong.
- ✅ iptables rules survive reboots via `iptables-persistent`.
- ⚠️ Two places to remember when adding a new internal service (Compose file binding + iptables rule). Both are documented in [docs/runbooks/docker-iptables-and-ufw.md](../runbooks/docker-iptables-and-ufw.md).
- ⚠️ Cargo-culting the iptables rule without understanding `--ctorigdstport` can lead to either over-restriction (breaking inter-container traffic) or under-restriction (typo'd port number).
- ⚠️ Public-facing services exposed via Traefik on 80/443 should NOT have `DOCKER-USER` DROP rules added. The runbook covers the distinction.
- 📝 The 2026-05-14 incident (~4 minutes of port-8000 exposure during Coolify install) had no observed exploitation — Coolify's `users` table was empty post-lockdown. Captured for the record in the runbook.

## References
- [Runbook: Docker iptables, UFW, and DOCKER-USER](../runbooks/docker-iptables-and-ufw.md) — the procedural how-to
- [Docker iptables documentation](https://docs.docker.com/network/packet-filtering-firewalls/) — DOCKER-USER chain reference
- [ADR-0007](0007-coolify-orchestration.md) — Coolify orchestration choice
