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

  // Assign groups to a user by their pk. The update REPLACES the user's
  // groups list — callers wanting additive semantics must fetch the
  // current groups first and merge.
  async setUserGroups(userPk: number, groupPks: string[]): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      groups: groupPks,
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
  // returns `{ recovery_link: string }` — a short-TTL, one-use URL the
  // browser visits to establish an authenticated OIDC session without
  // a password.
  async createRecoveryLink(userPk: number): Promise<string> {
    const res = await this.request<{ recovery_link: string }>(
      'POST',
      `/api/v3/core/users/${userPk}/recovery/`,
    );
    return res.recovery_link;
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
}
