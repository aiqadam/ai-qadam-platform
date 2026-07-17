# Runbook: rolling out apps/web-next on the pro-data.tech QA/prod hosts

**Audience:** whoever has host access to `pro-data-tech-qa` (95.46.211.230) and
`pro-data-tech-prod` (95.46.211.224) — currently the `ai-qadam-infra` operator.
**Pre-reading:** [pro-data-tech-cicd.md](pro-data-tech-cicd.md) — the base
CI/CD pipeline this extends. Read that file's "Ownership boundary" section
first; this runbook follows the same boundary.
**Total time:** ~10 minutes per host, one-time. Zero minutes on every deploy
after that (fully automatic once this runbook's Step 2 has run once per host).

Both hosts were deliberately set up API-only (`ai-qadam-infra` tasks
T-0110/T-0111): `deploy/docker-compose.{qa,prod}.yml` had 2-3 services (api,
oidc-stub, [postgres on prod]) and nginx proxied `/` straight to the API —
which is why `GET https://qa-uz.aiqadam.org/` (and `https://aiqadam.org/`)
returned a bare 404 instead of a front page. This runbook adds `web-next`
(built from `apps/web-next/Dockerfile`, the ADR-0038 target frontend) as a
third compose service on both hosts, and routes `/` to it via nginx.

## Pre-conditions

- [ ] The PR adding `deploy/docker-compose.{qa,prod}.yml` (with the `web-next`
      service), `deploy/nginx/*.conf`, and `.dockerignore` has merged to `main`.
- [ ] **One-time per host, before the FIRST deploy after that PR merges:**
      `deploy/docker-compose.<env>.yml` already exists on the host as an
      **untracked** file (hand-authored during T-0110/T-0111, at the exact
      path this repo now tracks). `git checkout` in `deploy.sh` refuses to
      overwrite an untracked file and aborts — **this actually happened**
      on the first real deploy after `deploy/docker-compose.qa.yml` merged
      (`deploy-qa` run failed with `error: The following untracked working
      tree files would be overwritten by checkout`). Fix, run once per host
      as `tvolodi`:
      ```bash
      mv /opt/apps/aiqadam-<env>/deploy/docker-compose.<env>.yml \
         /opt/apps/aiqadam-<env>/deploy/docker-compose.<env>.yml.pre-repo-tracked.bak
      ```
      No `sudo` needed — the file is owned by `tvolodi`. This does not
      delete anything (`.bak` suffix) and does not require re-triggering
      immediately; the next `deploy-qa`/`deploy-prod` run (or a re-run of
      the failed job) picks up the repo's tracked version cleanly once this
      is done.
- [ ] `deploy/oidc-stub/nginx.conf` and `deploy/oidc-stub/openid-configuration.json`
      exist on the host (hand-authored during T-0110/T-0111 as a
      **directory**, not a single `oidc-stub.conf` file — confirmed via
      `docker inspect <oidc-stub-container> --format '{{json .Mounts}}'`
      on both hosts). Not tracked by this repo; a `git fetch`/`checkout`
      cycle does not remove untracked files, so this should already be
      true — verify anyway before the first deploy on a host.
- [ ] Operator has SSH access to the host as `tvolodi` (not the
      forced-command-restricted `deploy` CI user, which cannot run `nginx`
      or `systemctl` commands, or read/write outside what `deploy.sh` does).
      `tvolodi` is in the `sudo` group; `sudo` is needed for the nginx steps
      below but not for the untracked-file move above.

## Steps

### 1. Confirm `web-next` is up before touching nginx

```bash
ssh tvolodi@<host-ip>
docker compose -p aiqadam-<env> -f /opt/apps/aiqadam-<env>/deploy/docker-compose.<env>.yml ps
```

Expect three `Up` containers: `aiqadam-<env>-oidc-stub-1`,
`aiqadam-<env>-api-1`, `aiqadam-<env>-web-next-1`. If `web-next` is missing
or restarting, stop here — fix that before touching nginx (see "Common
failure modes" below).

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4322/
```

Expect `200`. This confirms `web-next` itself works, independent of nginx
routing (not yet updated at this point).

### 2. Back up the current nginx vhost

QA:

```bash
sudo cp /etc/nginx/sites-available/qa-uz.aiqadam.org \
        /etc/nginx/sites-available/qa-uz.aiqadam.org.pre-web-next.bak
```

Prod:

```bash
sudo cp /etc/nginx/sites-available/aiqadam.org \
        /etc/nginx/sites-available/aiqadam.org.pre-web-next.bak
```

### 3. Copy the new vhost from the checkout

QA:

```bash
sudo cp /opt/apps/aiqadam-qa/deploy/nginx/qa-uz.aiqadam.org.conf \
        /etc/nginx/sites-available/qa-uz.aiqadam.org
```

Prod:

```bash
sudo cp /opt/apps/aiqadam-prod/deploy/nginx/aiqadam.org.conf \
        /etc/nginx/sites-available/aiqadam.org
```

The new vhost routes `/health` and `/v1/*` to the API (unchanged ports —
QA `3113`, prod `3115`) and everything else to `web-next` (port `4322` on
both hosts).

### 4. Test and reload

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` must print `syntax is ok` / `test is successful` before you
reload. If it fails, the live vhost is unaffected (you edited
`sites-available`; `sites-enabled` symlinks to the same path, so the syntax
error would only take effect on reload, which `-t` prevents) — fix the
config and re-run `nginx -t` before reloading.

## Verification

```bash
curl -I https://qa-uz.aiqadam.org/         # expect 200 (was 404)
curl -I https://qa-uz.aiqadam.org/health   # expect 200 (unchanged)
curl -I https://aiqadam.org/               # expect 200 (was 404)
curl -I https://aiqadam.org/health         # expect 200 (unchanged)
curl -I https://penpot.aiqadam.org/        # expect 200 (prod only — unregressed)
```

`ci-cd.yml`'s `deploy-qa`/`deploy-prod` jobs also run a frontend health check
(`GET /` → `200`) alongside the existing `/health` check — once this runbook
has run once per host, every future deploy verifies both automatically with
no further manual steps.

## Rollback

If `web-next` breaks something after Step 4:

```bash
# Revert nginx first — restores "API-only, / returns 404" immediately.
sudo cp /etc/nginx/sites-available/<vhost>.pre-web-next.bak \
        /etc/nginx/sites-available/<vhost>
sudo nginx -t && sudo systemctl reload nginx

# Optionally also stop the web-next container (api is unaffected either way).
docker compose -p aiqadam-<env> -f /opt/apps/aiqadam-<env>/deploy/docker-compose.<env>.yml stop web-next
```

This is fully reversible at any point — `api` is never touched by either
Step 1-4 or this rollback.

## Common failure modes

### `error: The following untracked working tree files would be overwritten by checkout`

**Symptom:** `deploy-qa`/`deploy-prod` job fails at the "Trigger deploy.sh"
step, in ~5-10 seconds (before any Docker build starts). Log shows
`deploy.sh` was invoked, then immediately: `error: The following untracked
working tree files would be overwritten by checkout: deploy/docker-compose.<env>.yml`.

**Root cause:** this is the exact "Pre-conditions" collision above,
encountered for real on the first deploy after `deploy/docker-compose.qa.yml`
merged to `main` — the fix hadn't been applied on the host yet at that
point. `git checkout --detach` in `deploy.sh` refuses to silently clobber
an untracked file sitting at a path the incoming commit wants to place a
tracked file.

**Fix:** run the one-time `mv ... .pre-repo-tracked.bak` command from
"Pre-conditions" above on the affected host, then re-run the failed
GitHub Actions job (or push a new commit / trigger `workflow_dispatch`
again). No data is lost — the host's original hand-authored file is
preserved under the `.bak` name, and the repo's version (which is what
you want running going forward) takes over on the next successful run.

**Prevention for the next tracked-file migration:** if this repo starts
tracking another previously-host-only file, check first via
`ssh tvolodi@<host> "ls -la /opt/apps/aiqadam-<env>/deploy/<path>"` whether
an untracked file already exists at that path, and move it aside as part
of the same rollout — don't wait for `deploy.sh` to hit the wall.

## References

- [`pro-data-tech-cicd.md`](pro-data-tech-cicd.md) — the base CI/CD pipeline
  and host architecture this runbook extends.
- [ADR-0038](../../../adr/0038-web-4-layer-architecture.md) — why
  `apps/web-next` (not `apps/web`) is the target frontend.
- `deploy/docker-compose.qa.yml`, `deploy/docker-compose.prod.yml`,
  `deploy/nginx/qa-uz.aiqadam.org.conf`, `deploy/nginx/aiqadam.org.conf` —
  the actual tracked config this runbook deploys.
