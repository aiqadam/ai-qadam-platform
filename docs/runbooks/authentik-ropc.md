# Authentik ROPC (Resource Owner Password Credentials)

## Purpose

Our wrapped sign-in calls Authentik's token endpoint with
`grant_type=password`. The browser never sees Authentik's UI — the password
travels API → Authentik → API.

## One-time provider config (already applied in prod)

Authentik OAuth2 provider PK 1 must have an `authentication_flow` bound so
the password stage knows which validator to run.

```bash
AK_TOKEN=$(cat /tmp/aiqadam-secrets-AK_API_TOKEN)
# Find the flow uuid for default-authentication-flow:
curl -sH "Authorization: Bearer $AK_TOKEN" \
  "https://auth.aiqadam.org/api/v3/flows/instances/?slug=default-authentication-flow" \
  | jq '.results[0].pk'

# Bind it to provider PK 1:
curl -sH "Authorization: Bearer $AK_TOKEN" -H "content-type: application/json" \
  -X PATCH "https://auth.aiqadam.org/api/v3/providers/oauth2/1/" \
  --data '{"authentication_flow":"<flow-pk>"}'
```

## Smoke test

```bash
OIDC_ID=$(cat /tmp/aiqadam-secrets-OIDC_CLIENT_ID)
OIDC_SECRET=$(cat /tmp/aiqadam-secrets-OIDC_CLIENT_SECRET)
curl -s -X POST "https://auth.aiqadam.org/application/o/token/" \
  -d "grant_type=password" \
  --data-urlencode "username=<your-akadmin-username>" \
  --data-urlencode "password=<your-real-password>" \
  -d "scope=openid email profile" \
  -d "client_id=$OIDC_ID" \
  -d "client_secret=$OIDC_SECRET" \
  | jq 'del(.access_token, .refresh_token, .id_token) | {has_id_token: has("id_token"), error}'
```

A working response includes `id_token`. A failing response returns
`{"error":"invalid_grant", ...}` — the standard OAuth2 error code; usually
means wrong username/password but can also indicate the
`authentication_flow` isn't bound.

## Resetting a forgotten admin password

```bash
ssh aiqadam-admin@212.20.151.29 'sudo -n docker exec \
  authentik-worker-q13iwnqyhz5ov6oudyfxqjce \
  ak shell -c "from authentik.core.models import User; \
  u=User.objects.get(username=\"akadmin\"); \
  u.set_password(\"<new-pw>\"); u.save()"'
```

(Rotate `AK_PW` in your password manager + on disk afterwards.)
