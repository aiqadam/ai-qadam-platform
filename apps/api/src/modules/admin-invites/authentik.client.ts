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

  // Lookup the calling user by their OIDC subject. The subject claim
  // from Authentik is the user's `uid` (UUID-shaped) by default — NOT
  // the integer pk. The /api/v3/core/users/?uuid=... filter resolves it.
  async getUserBySubject(subject: string): Promise<AuthentikUser | null> {
    const qs = new URLSearchParams({ uuid: subject });
    const res = await this.request<{ results: AuthentikUser[] }>(
      'GET',
      `/api/v3/core/users/?${qs.toString()}`,
    );
    return res.results[0] ?? null;
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

  async disableUser(userPk: number): Promise<void> {
    await this.request<unknown>('PATCH', `/api/v3/core/users/${userPk}/`, {
      is_active: false,
    });
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
