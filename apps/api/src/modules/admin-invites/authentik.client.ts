import * as http from 'node:http';
import * as https from 'node:https';
import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

// F-S2.7 (ADR-0035): thin wrapper over Authentik's admin REST API for
// operator-management flows. Read-only on /api/v3/core/groups (resolve
// slug → pk before assignment) and write on /api/v3/core/users (create
// placeholder, set password on consume, disable on revoke).
//
// Scope of this module: the operations the invite-flow + onboarding
// consumer needs in PR-3 + PR-4. Surface stays minimal — methods get
// added per consumer in their own PRs, not preemptively.
//
// All methods throw AuthentikError on non-2xx. Caller decides whether
// to retry or surface as 5xx; for invite flows we currently surface as
// a generic 502 (Authentik is a hard dependency, not a soft one).

// Shared across the module: SuperAdminGuard (route-level authorization
// check) and AdminBootstrapService (FR-ADM-010 zero-admin bootstrap) both
// need the exact Authentik group name that carries platform-admin rights.
// Previously duplicated as a private constant in super-admin.guard.ts —
// extracted here so there is exactly one source of truth, and so
// FR-ADM-011 (ongoing super-admin cap enforcement) has a natural shared
// home to import from too. Must match the group provisioned by
// scripts/provision-authentik-rbac-groups.sh.
export const SUPER_ADMIN_GROUP = 'aiqadam-super-admin';

// ADR-0021 §2: "Limited to <= 3 humans." FR-ADM-010's bootstrap check
// (>=1 member => already bootstrapped) and FR-ADM-011's ongoing grant-time
// cap (block a grant that would push count > 3) are two different
// comparisons against the SAME underlying number — the live
// aiqadam-super-admin membership count. This constant plus
// getSuperAdminCount() below are that single source of truth so the two
// call sites can never disagree on what "the cap" means.
export const MAX_SUPER_ADMINS = 3;

export class AuthentikError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    public readonly body: string,
  ) {
    super(`Authentik ${status} ${path}: ${body.slice(0, 200)}`);
    this.name = 'AuthentikError';
  }
}

export interface AuthentikUser {
  pk: number;
  username: string;
  email: string;
  name: string;
  is_active: boolean;
  uid: string;
  groups: string[];
  // Authentik returns groups_obj alongside groups (UUIDs) by default. The
  // _obj suffix carries the resolved name + pk; callers check membership
  // by group name against this field.
  groups_obj: Array<{ pk: string; name: string; is_superuser?: boolean }>;
  attributes: Record<string, unknown>;
}

export interface AuthentikGroup {
  pk: string;
  name: string;
  is_superuser: boolean;
  users: number[];
}

export interface CreateUserInput {
  email: string;
  username: string;
  name: string;
  attributes?: Record<string, unknown>;
}

// F-S4.1-b — Authentik 2023.10+ object form for OAuth2 provider redirect URIs.
export interface AuthentikRedirectUri {
  matching_mode: 'strict' | 'regex';
  url: string;
}

export interface AuthentikOauthProvider {
  pk: number;
  name: string;
  redirect_uris: AuthentikRedirectUri[];
}

@Injectable()
export class AuthentikClient {
  private readonly logger = new Logger(AuthentikClient.name);
  private readonly base = env.AUTHENTIK_ADMIN_URL.replace(/\/$/, '');
  private readonly token = env.AUTHENTIK_ADMIN_TOKEN ?? '';

  // PR-3 callers check this before invoking admin-only methods.
  isConfigured(): boolean {
    return this.token.length >= 20;
  }

  // Pre-create the invitee row. Authentik does NOT require a password
  // at create time when path=users/ and password is omitted — the user
  // is created in usable_password=false mode. Set the password on
  // consume via setPassword().
  async createUser(input: CreateUserInput): Promise<AuthentikUser> {
    return this.request<AuthentikUser>('POST', '/api/v3/core/users/', {
      username: input.username,
      email: input.email,
      name: input.name,
      is_active: true,
      attributes: input.attributes ?? {},
    });
  }

  async setPassword(userPk: number, password: string): Promise<void> {
    // Authentik's password endpoint returns 204; the wrapper handles it.
    await this.request<unknown>('POST', `/api/v3/core/users/${userPk}/set_password/`, { password });
  }

  // Lookup the calling user by their email. The OIDC `sub` claim is
  // Authentik's `hashed_user_id` by default (not the uid attribute, not
  // the integer pk) and there's no admin-API filter for the hash — so
  // we route via email. Email is on every OIDC token (required scope)
  // and is the only identifier guaranteed to be a one-to-one round-trip
  // with the Authentik user row.
  async getUserByEmail(email: string): Promise<AuthentikUser | null> {
    const qs = new URLSearchParams({ email });
    const res = await this.request<{ results: AuthentikUser[] }>(
      'GET',
      `/api/v3/core/users/?${qs.toString()}`,
    );
    return res.results[0] ?? null;
  }

  // Lookup by integer pk — used by the RBAC sync webhook (F-S2.2-b)
  // which receives the pk in the Authentik notification payload. The
  // detail endpoint returns groups_obj with resolved names.
  async getUserById(pk: number): Promise<AuthentikUser | null> {
    try {
      return await this.request<AuthentikUser>('GET', `/api/v3/core/users/${pk}/`);
    } catch (err) {
      if (err instanceof AuthentikError && err.status === 404) return null;
      throw err;
    }
  }

  // List active users — used by the F-S2.2-f nightly poll. At our scale
  // (≤100 operators in the foreseeable future) one page is enough; we
  // hardcode page_size=500. When the operator count exceeds that, add
  // pagination via the `next` URL Authentik returns in pagination meta.
  async listActiveUsers(): Promise<AuthentikUser[]> {
    const qs = new URLSearchParams({ is_active: 'true', page_size: '500' });
    const res = await this.request<{ results: AuthentikUser[] }>(
      'GET',
      `/api/v3/core/users/?${qs.toString()}`,
    );
    return res.results;
  }

  // Resolve a list of group names (e.g. "aiqadam-super-admin") to their
  // pk UUIDs. Authentik's user-update endpoint takes pks, not slugs.
  async resolveGroupNames(names: string[]): Promise<AuthentikGroup[]> {
    if (names.length === 0) return [];
    // /api/v3/core/groups/?name__in= isn't supported in all versions;
    // /api/v3/core/groups/?name=<exact> is. Issue one request per name —
    // group count is small (single digits) so the latency is fine.
    const results = await Promise.all(
      names.map((name) =>
        this.request<{ results: AuthentikGroup[] }>(
          'GET',
          `/api/v3/core/groups/?name=${encodeURIComponent(name)}`,
        ),
      ),
    );
    const found: AuthentikGroup[] = [];
    for (let i = 0; i < names.length; i++) {
      const match = results[i]?.results[0];
      if (match) found.push(match);
    }
    return found;
  }

  // FR-ADM-011 / FR-ADM-010 shared primitive: the live count of
  // aiqadam-super-admin members. FR-ADM-010's bootstrap compares this to
  // 0, FR-ADM-011's grant-time cap compares it to MAX_SUPER_ADMINS — both
  // read through this one method so "how many super-admins exist" is
  // never computed two different ways.
  async getSuperAdminCount(): Promise<number> {
    const groups = await this.resolveGroupNames([SUPER_ADMIN_GROUP]);
    return groups[0]?.users.length ?? 0;
  }

  // Assign groups to a user by their pk. The update REPLACES the user's
  // groups list — callers wanting additive semantics must fetch the
  // current groups first and merge.
  async setUserGroups(userPk: number, groupPks: string[]): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      groups: groupPks,
    });
  }

  // FR-ADM-010 AC-3: mark a user as requiring a password change on next login
  // via the user-attributes flag that our ExpressionPolicy checks.
  // ensureForcePasswordChangeFlow() must have been called first to wire the
  // Authentik flow; this method only sets the per-user flag.
  async setBootstrapPasswordChangeAttribute(userPk: number): Promise<void> {
    const current = await this.request<AuthentikUser>('GET', `/api/v3/core/users/${userPk}/`);
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      attributes: { ...current.attributes, ak_login_password_change_required: true },
    });
  }

  // FR-ADM-010 AC-3: provision the Authentik flow infrastructure needed to show
  // a forced-password-change screen during the first login of the bootstrap
  // admin. Idempotent — safe to call on every bootstrap.
  //
  // Mechanism (confirmed in Authentik 2024.12.3):
  //   1. Two ExpressionPolicies: "check" (reads the attribute) and "clear"
  //      (reads + removes the attribute, then passes).
  //   2. Two FlowStageBindings added to default-authentication-flow at order
  //      25 and 26 (between the password stage at 20 and MFA at 30), using
  //      the existing default-password-change-prompt (PromptStage) and
  //      default-password-change-write (UserWriteStage) stages.
  //   3. PolicyBindings wiring each expression policy to its stage binding.
  //   With Authentik's default FlowStageBinding settings
  //   (evaluate_on_plan=false, re_evaluate_policies=true), the policies are
  //   re-evaluated after each stage — so after the identification stage sets
  //   pending_user, the expression policy can read the attribute and decide
  //   whether to show the change form.
  async ensureForcePasswordChangeFlow(): Promise<void> {
    const CHECK_EXPR =
      'pending_user = request.context.get("pending_user")\n' +
      'if not pending_user:\n    return False\n' +
      'return bool(pending_user.attributes.get("ak_login_password_change_required", False))';
    const CLEAR_EXPR =
      'pending_user = request.context.get("pending_user")\n' +
      'if not pending_user or not pending_user.attributes.get("ak_login_password_change_required", False):\n    return False\n' +
      'pending_user.attributes.pop("ak_login_password_change_required", None)\n' +
      'pending_user.save()\n' +
      'return True';

    const [checkPk, clearPk] = await Promise.all([
      this.getOrCreateExpressionPolicy('aiqadam-boot-pwd-change-check', CHECK_EXPR),
      this.getOrCreateExpressionPolicy('aiqadam-boot-pwd-change-clear', CLEAR_EXPR),
    ]);

    const flowPk = await this.getFlowBySlug('default-authentication-flow');
    const [promptStagePk, writeStagePk] = await Promise.all([
      this.getStageByName('/api/v3/stages/prompt/stages/', 'default-password-change-prompt'),
      this.getStageByName('/api/v3/stages/user_write/', 'default-password-change-write'),
    ]);

    const [promptBindingPk, writeBindingPk] = await Promise.all([
      this.getOrCreateFlowStageBinding(flowPk, promptStagePk, 25),
      this.getOrCreateFlowStageBinding(flowPk, writeStagePk, 26),
    ]);

    await Promise.all([
      this.ensureFlowPolicyBinding(promptBindingPk, checkPk),
      this.ensureFlowPolicyBinding(writeBindingPk, clearPk),
    ]);
  }

  private async getOrCreateExpressionPolicy(name: string, expression: string): Promise<string> {
    const existing = await this.request<{ results: Array<{ pk: string }> }>(
      'GET',
      `/api/v3/policies/expression/?name=${encodeURIComponent(name)}`,
    );
    if (existing.results[0]) return existing.results[0].pk;
    const created = await this.request<{ pk: string }>('POST', '/api/v3/policies/expression/', {
      name,
      expression,
    });
    return created.pk;
  }

  private async getFlowBySlug(slug: string): Promise<string> {
    const res = await this.request<{ results: Array<{ pk: string }> }>(
      'GET',
      `/api/v3/flows/instances/?slug=${encodeURIComponent(slug)}`,
    );
    const flow = res.results[0];
    if (!flow) throw new Error(`Authentik flow not found: ${slug}`);
    return flow.pk;
  }

  private async getStageByName(endpoint: string, name: string): Promise<string> {
    const res = await this.request<{ results: Array<{ pk: string }> }>(
      'GET',
      `${endpoint}?name=${encodeURIComponent(name)}`,
    );
    const stage = res.results[0];
    if (!stage) throw new Error(`Authentik stage not found at ${endpoint}: ${name}`);
    return stage.pk;
  }

  private async getOrCreateFlowStageBinding(
    flowPk: string,
    stagePk: string,
    order: number,
  ): Promise<string> {
    const existing = await this.request<{
      results: Array<{ pk: string; policybindingmodel_ptr_id: string }>;
    }>('GET', `/api/v3/flows/bindings/?target=${flowPk}&stage=${stagePk}`);
    if (existing.results[0]) return existing.results[0].policybindingmodel_ptr_id;
    const created = await this.request<{ pk: string; policybindingmodel_ptr_id: string }>(
      'POST',
      '/api/v3/flows/bindings/',
      { target: flowPk, stage: stagePk, order },
    );
    return created.policybindingmodel_ptr_id;
  }

  private async ensureFlowPolicyBinding(bindingPbmId: string, policyPk: string): Promise<void> {
    const existing = await this.request<{ results: Array<{ policy: string | null }> }>(
      'GET',
      `/api/v3/policies/bindings/?target=${bindingPbmId}`,
    );
    const alreadyBound = existing.results.some((b) => b.policy === policyPk);
    if (alreadyBound) return;
    await this.request<unknown>('POST', '/api/v3/policies/bindings/', {
      target: bindingPbmId,
      policy: policyPk,
      order: 0,
    });
  }

  // Overwrite the user's attributes JSON. Callers should usually
  // merge-and-pass to avoid wiping unrelated keys — Authentik treats
  // the value as a literal replacement of the attributes object.
  async patchAttributes(userPk: number, attributes: Record<string, unknown>): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      attributes,
    });
  }

  async disableUser(userPk: number): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      is_active: false,
    });
  }

  // FR-AUTH-006 — replace a user's email-of-record. Same
  // `PATCH /api/v3/core/users/{pk}/` partial-update pattern as
  // setUserGroups/disableUser/patchAttributes above. Used by the temp-
  // account upgrade flow to move a Telegram-only user's email from the
  // synthetic `tg<id>@telegram.local` placeholder to the real address
  // the member supplied — BEFORE calling sendMagicLinkEmail, not after
  // verification. This ordering is load-bearing, not stylistic: Authentik's
  // `recovery_email` action (confirmed by live-reading
  // /authentik/core/api/users.py inside the running container, Authentik
  // 2024.12.3) always emails `for_user.email` — the CURRENT on-file
  // address at call time — with no target-email override parameter of any
  // kind. See upgrade.service.ts's module doc comment for the full
  // mechanism and 02-impact-analysis.md's Finding #0 for the source trace.
  //
  // Callers MUST re-check email availability (getUserByEmail) immediately
  // before calling this — Authentik's own User.email field is NOT unique
  // at the data layer (also confirmed via the live container check), so
  // this PATCH can silently create a duplicate email across two Authentik
  // users if the caller's own collision check is stale or skipped.
  async setUserEmail(userPk: number, email: string): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      email,
    });
  }

  // ─── F-S4.1-b — OAuth2 / OIDC provider ops ───────────────────────────
  //
  // Country-provisioning needs to add a new redirect URI to the OIDC
  // provider that handles aiqadam.org sign-in. Two methods:
  //   * getOauthProviderByName — lookup by exact name (Authentik admin
  //     UI Name field). Returns pk + redirect_uris.
  //   * setOauthProviderRedirectUris — replace the redirect_uris array.
  //     Caller is responsible for merge/dedupe — we keep that logic at
  //     one layer (the provisioning step) so it stays testable.
  //
  // Authentik 2023.10+ uses the object form for redirect_uris:
  //   [{ "matching_mode": "strict", "url": "https://..." }]
  // We code against the modern shape only. If a future bump changes it,
  // swap here in one place.

  async getOauthProviderByName(name: string): Promise<AuthentikOauthProvider | null> {
    const qs = new URLSearchParams({ name });
    const res = await this.request<{ results: AuthentikOauthProvider[] }>(
      'GET',
      `/api/v3/providers/oauth2/?${qs.toString()}`,
    );
    return res.results[0] ?? null;
  }

  async setOauthProviderRedirectUris(
    pk: number,
    redirectUris: AuthentikRedirectUri[],
  ): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/providers/oauth2/${pk}/`, {
      redirect_uris: redirectUris,
    });
  }

  // FR-AUTH-002 — look up a user by their Telegram user ID stored in
  // Authentik's `attributes.telegram_id`. Authentik's users list endpoint
  // supports attribute filtering via the `attributes` query parameter
  // (JSON string). Returns the first match or null if none exists.
  async getUserByTelegramId(telegramId: string): Promise<AuthentikUser | null> {
    const qs = new URLSearchParams({
      attributes: JSON.stringify({ telegram_id: telegramId }),
    });
    const res = await this.request<{ results: AuthentikUser[] }>(
      'GET',
      `/api/v3/core/users/?${qs.toString()}`,
    );
    return res.results[0] ?? null;
  }

  // FR-AUTH-002 — mint a one-time Authentik recovery link for the given
  // user PK. Authentik's recovery endpoint (POST /api/v3/core/users/{pk}/recovery/)
  // returns `{ link: string }` — a short-TTL, one-use URL the browser
  // visits to establish an authenticated OIDC session without a
  // password.
  //
  // ISS-USR-REDIRECT-002: this previously read `res.recovery_link`,
  // which does not exist on Authentik's actual response — confirmed
  // live via direct curl/fetch against the real API, which returns
  // `{"link": "..."}`. The old code always returned `undefined`, so
  // every caller (registration.service.ts's welcome email,
  // telegram-auth.service.ts's sign-in redirect) silently broke.
  async createRecoveryLink(userPk: number): Promise<string> {
    const res = await this.request<{ link: string }>(
      'POST',
      `/api/v3/core/users/${userPk}/recovery/`,
    );
    return res.link;
  }

  // FR-AUTH-004 — trigger Authentik's native send for an ARBITRARY Email
  // stage (unlike createRecoveryLink above, which is hardcoded to
  // whatever flow the request's resolved Brand.flow_recovery points at).
  // POST /api/v3/core/users/{id}/recovery_email/?email_stage=<uuid>
  // returns 204 No Content — Authentik sends the email itself, natively,
  // server-side. No link/token ever appears in this method's return value
  // or anywhere in our process, which is what makes the magic-link
  // request endpoint's anti-enumeration response shape ({ ok: true },
  // always) trivially safe: there is no secret value here to accidentally
  // leak. emailStageUuid is always sourced from our own env config
  // (AUTHENTIK_MAGIC_LINK_EMAIL_STAGE_UUID), never user input, so there is
  // no injection risk — encodeURIComponent is used anyway for consistency
  // with this file's query-building style elsewhere.
  //
  // CORRECTION (Step 8 retry, see
  // .copilot/tasks/active/wf-20260801-feat-179/07-test-results.md's
  // CRITICAL FINDING): a live send-and-read-the-real-email test proved the
  // ORIGINAL understanding of this endpoint wrong — `email_stage` only
  // selects the sent email's subject/template, never the link's target
  // flow. The link is always minted by Authentik's `_create_recovery_link()`,
  // which is unconditionally `request.brand.flow_recovery` — and Authentik
  // resolves `request.brand` per-request from the `Host` header
  // (authentik/brands/middleware.py + authentik/brands/utils.py's
  // get_brand_for_request(), matching every Brand.domain via `iendswith`,
  // falling back to the row with default=true). Confirmed by reading
  // Authentik's own server source inside the running container, not
  // inferred from the OpenAPI schema alone.
  //
  // The fix: a second, purpose-built Brand (provisioned by
  // scripts/provision-authentik-magic-link-flow.sh, `default: false`, its
  // own `flow_recovery` bound to magic-link-login) is reached ONLY when
  // this request's Host header matches that Brand's `domain` — so this
  // method sends the request with `Host: <brandDomain>` to route the link
  // into the correct flow, while the platform's real Host
  // (auth.aiqadam.org / localhost:9000) keeps resolving to the default
  // Brand for every other Authentik interaction, including the existing
  // password-reset flow (default Brand's flow_recovery is untouched).
  // brandDomain is always sourced from our own env config
  // (AUTHENTIK_MAGIC_LINK_BRAND_DOMAIN), never user input.
  //
  // Implementation note: `Host` is a "forbidden request header" under the
  // WHATWG Fetch spec — confirmed live (a small standalone repro against a
  // local http.Server) that Node's global `fetch` (undici) silently
  // OVERWRITES any `Host` header passed via `init.headers` with the actual
  // connection target, no error, no warning. this.request()'s fetch-based
  // implementation is therefore unusable for this one call. Node's
  // low-level http/https modules do NOT apply that restriction (also
  // confirmed live) and are already a zero-dependency part of the
  // runtime, so this method uses httpRequestWithHostOverride() instead of
  // this.request() — the only caller of that helper in this file.
  async sendMagicLinkEmail(
    userPk: number,
    emailStageUuid: string,
    brandDomain: string,
  ): Promise<void> {
    const path = `/api/v3/core/users/${userPk}/recovery_email/?email_stage=${encodeURIComponent(emailStageUuid)}`;
    await this.httpRequestWithHostOverride('POST', path, brandDomain);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Authentik ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
      throw new AuthentikError(res.status, path, text);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  // See sendMagicLinkEmail's doc comment for why this exists instead of
  // routing through request(): Node's global fetch (undici) cannot send a
  // custom Host header, but node:http/node:https can. This connects to
  // the SAME network destination as every other call in this file
  // (this.base, i.e. AUTHENTIK_ADMIN_URL) — only the Host header sent to
  // that destination differs, which is exactly what Authentik's
  // get_brand_for_request() keys its Brand resolution on. No request
  // body is sent (recovery_email takes everything via the query param,
  // same as the fetch-based sendMagicLinkEmail this replaces).
  private async httpRequestWithHostOverride(
    method: string,
    path: string,
    hostOverride: string,
  ): Promise<void> {
    const target = new URL(`${this.base}${path.startsWith('/') ? path : `/${path}`}`);
    const transport = target.protocol === 'https:' ? https : http;
    return new Promise<void>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: target.hostname,
          port: target.port || (target.protocol === 'https:' ? 443 : 80),
          path: `${target.pathname}${target.search}`,
          method,
          headers: {
            Host: hostOverride,
            Authorization: `Bearer ${this.token}`,
            accept: 'application/json',
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              const text = Buffer.concat(chunks).toString('utf8');
              this.logger.warn(`Authentik ${method} ${path} -> ${status}: ${text.slice(0, 200)}`);
              reject(new AuthentikError(status, path, text));
              return;
            }
            resolve();
          });
        },
      );
      req.on('error', (err) => {
        this.logger.warn(`Authentik ${method} ${path} -> network error: ${String(err)}`);
        reject(err);
      });
      req.end();
    });
  }
}
