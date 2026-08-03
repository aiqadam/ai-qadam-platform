import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthentikClient } from '../admin-invites/authentik.client';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';

// FR-AUTH-007 — read and manage OAuth/identity providers linked to a
// member's account. Three categories of linked method:
//   - email: Authentik `has_usable_password` (display-only, never unlink)
//   - google/github: Authentik user_source_connections, filtered by slug
//   - telegram: directus_users.telegram_user_id / telegram_username

export type LinkedProvider = 'email' | 'google' | 'github' | 'telegram';

export interface LinkedAccountEntry {
  provider: LinkedProvider;
  // Whether this provider is currently linked.
  linked: boolean;
  // Human-readable identifier: email address, @handle, @telegram_username.
  // null when not linked or not applicable (email handle is passed separately
  // from the JWT claims in the controller).
  handle: string | null;
  // false when this is the last remaining sign-in method, or always false
  // for 'email' (Authentik has no REST API to remove a local credential).
  canUnlink: boolean;
}

// Kept as a named constant so the same string appears in both unlink paths
// (last-method guard AND the email hard-stop) without risk of drift.
const LAST_METHOD_MESSAGE = 'You must keep at least one sign-in method.';

// Source slugs for the two social providers. Authentik slug naming is
// provisioned by scripts/provision-authentik-oauth-sources.sh — these are
// the stable slugs we check against, not user-visible labels.
const GOOGLE_SOURCE_SLUG_FRAGMENT = 'google';
const GITHUB_SOURCE_SLUG_FRAGMENT = 'github';

@Injectable()
export class LinkedAccountsService {
  constructor(
    private readonly authentik: AuthentikClient,
    private readonly directus: DirectusClient,
    private readonly bridge: DirectusUsersBridgeService,
  ) {}

  // Returns the four provider rows for the caller's account. All lookups
  // run in parallel to minimize latency. IDOR protection: authentikPk is
  // resolved server-side from the caller's JWT claims (email), never
  // from user input.
  async getLinkedAccounts(
    userId: string,
    userEmail: string,
  ): Promise<LinkedAccountEntry[]> {
    const authentikUser = await this.authentik.getUserByEmail(userEmail);
    if (!authentikUser) {
      throw new NotFoundException('authentik user not found');
    }
    const authentikPk = authentikUser.pk;

    const [detail, connections, directusId] = await Promise.all([
      this.authentik.getUserDetail(authentikPk),
      this.authentik.getUserSourceConnections(authentikPk),
      this.bridge.resolveDirectusId(userId),
    ]);

    const googleConn = connections.find((c) => c.source.slug.includes(GOOGLE_SOURCE_SLUG_FRAGMENT));
    const githubConn = connections.find((c) => c.source.slug.includes(GITHUB_SOURCE_SLUG_FRAGMENT));

    let telegramLinked = false;
    let telegramUsername: string | null = null;

    if (directusId) {
      const tgRow = await this.directus.get<{
        data: { telegram_user_id: string | null; telegram_username: string | null };
      }>(`/users/${encodeURIComponent(directusId)}?fields=telegram_user_id,telegram_username`);
      telegramLinked = tgRow.data.telegram_user_id != null;
      telegramUsername = tgRow.data.telegram_username ?? null;
    }

    const totalLinked =
      (detail.has_usable_password ? 1 : 0) +
      (googleConn !== undefined ? 1 : 0) +
      (githubConn !== undefined ? 1 : 0) +
      (telegramLinked ? 1 : 0);

    return [
      {
        provider: 'email',
        linked: detail.has_usable_password,
        handle: detail.has_usable_password ? userEmail : null,
        canUnlink: false, // email unlink is not exposed via Authentik REST
      },
      {
        provider: 'google',
        linked: googleConn !== undefined,
        handle: null,
        canUnlink: googleConn !== undefined && totalLinked > 1,
      },
      {
        provider: 'github',
        linked: githubConn !== undefined,
        handle: null,
        canUnlink: githubConn !== undefined && totalLinked > 1,
      },
      {
        provider: 'telegram',
        linked: telegramLinked,
        handle: telegramUsername !== null ? `@${telegramUsername}` : null,
        canUnlink: telegramLinked && totalLinked > 1,
      },
    ];
  }

  // Unlinks the given provider from the caller's account. Throws
  // ConflictException (HTTP 409) when the provider is 'email' or when
  // the provider is the last remaining sign-in method.
  //
  // IDOR protection: the connection pk is resolved server-side via
  // getUserSourceConnections() — never read from the request body.
  async unlinkProvider(userId: string, userEmail: string, provider: LinkedProvider): Promise<void> {
    if (provider === 'email') {
      throw new ConflictException(LAST_METHOD_MESSAGE);
    }

    const authentikUser = await this.authentik.getUserByEmail(userEmail);
    if (!authentikUser) {
      throw new NotFoundException('authentik user not found');
    }
    const authentikPk = authentikUser.pk;

    const [detail, connections, directusId] = await Promise.all([
      this.authentik.getUserDetail(authentikPk),
      this.authentik.getUserSourceConnections(authentikPk),
      this.bridge.resolveDirectusId(userId),
    ]);

    let telegramLinked = false;
    if (directusId) {
      const tgRow = await this.directus.get<{ data: { telegram_user_id: string | null } }>(
        `/users/${encodeURIComponent(directusId)}?fields=telegram_user_id`,
      );
      telegramLinked = tgRow.data.telegram_user_id != null;
    }

    const totalLinked =
      (detail.has_usable_password ? 1 : 0) +
      connections.length +
      (telegramLinked ? 1 : 0);

    if (totalLinked <= 1) {
      throw new ConflictException(LAST_METHOD_MESSAGE);
    }

    if (provider === 'google' || provider === 'github') {
      const slugFragment =
        provider === 'google' ? GOOGLE_SOURCE_SLUG_FRAGMENT : GITHUB_SOURCE_SLUG_FRAGMENT;
      const conn = connections.find((c) => c.source.slug.includes(slugFragment));
      if (!conn) return; // already unlinked — idempotent
      await this.authentik.deleteUserSourceConnection(conn.pk);
      return;
    }

    // provider === 'telegram'
    if (!directusId) return; // no Directus row = already unlinked
    await this.directus.patch(`/users/${encodeURIComponent(directusId)}`, {
      telegram_user_id: null,
      telegram_username: null,
      telegram_linked_at: null,
    });
  }
}
