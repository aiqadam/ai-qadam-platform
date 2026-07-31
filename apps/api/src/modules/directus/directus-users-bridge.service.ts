import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { users } from '../users/schema';
import { DirectusClient, DirectusError } from './directus.client';

// Ensures every platform user has a paired directus_users row and that the
// pairing is persisted in platform.users.directus_user_id. Called once per
// OIDC sign-in from auth.service.completeAuthorization, after the local
// upsertFromOIDC. Idempotent: safe to call on every sign-in.
//
// Lookup order (matches our Directus AUTH_AUTHENTIK_IDENTIFIER_KEY=email
// + provider=authentik configuration):
//   1. If our row already has directusUserId → verify it still matches the
//      caller's current email (ISS-BRIDGE-STALE-001); re-resolve on drift,
//      otherwise fast path.
//   2. Else GET /users?filter[email][_eq]=<email> — link if found.
//   3. Else POST /users to create with provider=authentik,
//      external_identifier=email, status=active, role=null.
//
// Failure modes log + swallow: a bridge failure must NOT block sign-in.
// The next sign-in retries automatically (column stays null until success).
//
// ISS-BRIDGE-STALE-001: directus_user_id used to be a write-once cache —
// once set, `ensureLinked`/`resolveDirectusId` returned it unconditionally,
// forever, even after the user's email changed (self-service, admin
// correction, or an Authentik-only migration like ISS-UAT-BRIDGE-002) and
// the cached Directus row became stale. Every downstream consumer of
// resolveDirectusId/ensureLinked (registrations, points, badges, referrals,
// audit-actor resolution, admin-invite attribution, me-profile, RBAC sync)
// silently wrote to the wrong Directus user with no error. The re-check
// below is scoped to `ensureLinked`'s sign-in path only (not
// `resolveDirectusId`'s per-request fast path) so the common, non-drifted
// case stays at zero added Directus calls — mirrors how `maybeBackfill` is
// already scoped to the infrequent `findOrCreate` path, not read-heavy call
// sites.

interface DirectusUserRow {
  id: string;
  email: string;
  external_identifier: string | null;
  provider: string;
}

@Injectable()
export class DirectusUsersBridgeService {
  private readonly logger = new Logger(DirectusUsersBridgeService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly directus: DirectusClient,
  ) {}

  async ensureLinked(input: {
    userId: string;
    email: string;
    displayName: string | null;
  }): Promise<string | null> {
    const [row] = await this.db
      .select({ directusUserId: users.directusUserId })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (row?.directusUserId) {
      return this.reconcileCachedId(input.userId, row.directusUserId, input.email);
    }

    try {
      const directusId = await this.findOrCreate(input.email, input.displayName);
      await this.db
        .update(users)
        .set({ directusUserId: directusId, updatedAt: new Date() })
        .where(eq(users.id, input.userId));
      return directusId;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[directus-bridge] ensureLinked failed for ${input.email}: ${reason}`);
      return null;
    }
  }

  // ISS-BRIDGE-STALE-001 AC-1/AC-2: verify the cached id still belongs to
  // this user's current email before trusting it. A cache-hit is the
  // overwhelmingly common case, so this does exactly one Directus GET (no
  // extra round trips beyond that) and only writes back when something
  // actually drifted. On any Directus error (unreachable, 404 for a
  // deleted row), fall back to the old cached value rather than blocking
  // sign-in — same swallow-and-retry-next-time philosophy as the rest of
  // this service.
  private async reconcileCachedId(
    userId: string,
    cachedDirectusId: string,
    currentEmail: string,
  ): Promise<string> {
    let cachedRow: DirectusUserRow | undefined;
    try {
      const res = await this.directus.get<{ data: DirectusUserRow }>(
        `/users/${cachedDirectusId}?fields=id,email,external_identifier,provider`,
      );
      cachedRow = res.data;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `[directus-bridge] reconcile lookup failed for cached id ${cachedDirectusId}, keeping cached value: ${reason}`,
      );
      return cachedDirectusId;
    }

    if (cachedRow.email === currentEmail) {
      return cachedDirectusId;
    }

    this.logger.warn(
      `[directus-bridge] cached directus_user_id ${cachedDirectusId} (email ${cachedRow.email}) no longer matches current email ${currentEmail} — re-resolving`,
    );

    try {
      const resolvedId = await this.findOrCreate(currentEmail, null);
      await this.db
        .update(users)
        .set({ directusUserId: resolvedId, updatedAt: new Date() })
        .where(eq(users.id, userId));
      this.logger.warn(
        `[directus-bridge] repointed directus_user_id for user ${userId}: ${cachedDirectusId} -> ${resolvedId} (email drift)`,
      );
      return resolvedId;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `[directus-bridge] re-resolution failed for ${currentEmail}, keeping stale cached value: ${reason}`,
      );
      return cachedDirectusId;
    }
  }

  private async findOrCreate(email: string, displayName: string | null): Promise<string> {
    const encodedEmail = encodeURIComponent(email);
    const lookup = await this.directus.get<{ data: DirectusUserRow[] }>(
      `/users?filter[email][_eq]=${encodedEmail}&fields=id,email,external_identifier,provider&limit=1`,
    );
    const existing = lookup.data[0];
    if (existing) {
      await this.maybeBackfill(existing, email);
      return existing.id;
    }

    const created = await this.directus.post<{ data: DirectusUserRow }>('/users', {
      email,
      first_name: displayName ?? null,
      provider: 'authentik',
      external_identifier: email,
      status: 'active',
    });
    return created.data.id;
  }

  private async maybeBackfill(existing: DirectusUserRow, email: string): Promise<void> {
    const shapeOk = existing.provider === 'authentik' && existing.external_identifier === email;
    if (shapeOk) return;
    try {
      await this.directus.patch(`/users/${existing.id}`, {
        provider: 'authentik',
        external_identifier: email,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[directus-bridge] backfill patch failed for ${email}: ${reason}`);
    }
  }

  // Convenience for callers (registrations proxy) that already know a
  // user.id and just need the directus_user_id, with one fallback retry.
  async resolveDirectusId(userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({
        directusUserId: users.directusUserId,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) return null;
    if (row.directusUserId) return row.directusUserId;
    return this.ensureLinked({
      userId,
      email: row.email,
      displayName: row.displayName,
    });
  }

  // Email-keyed variant for callers (UAT seed scripts, future admin
  // invitation flows) that only know the user's email at call time —
  // i.e. they have not yet signed in via OIDC and we therefore do not
  // have a `users.id` to pass into `ensureLinked`. Tries the local-row
  // path first; if a `platform.users` row exists, delegates to
  // `ensureLinked` so the idempotency + link-back-write semantics stay
  // identical to the userId-keyed path. If no local row exists (the
  // seed / admin-invite case), calls the private `findOrCreate`
  // directly — the Directus mirror can be created from just an email
  // + displayName, and the link-back write into `platform.users` is
  // simply skipped because there is no row to update. Directus errors
  // on the no-local-row path are logged with `warn` and swallowed,
  // matching the swallow semantics of `ensureLinked`. The controller
  // surfaces either return value as `{ directusUserId: string | null }`
  // so the seed can treat `null` as a soft warning rather than a hard
  // failure.
  async ensureLinkedByEmail(input: {
    email: string;
    displayName: string | null;
  }): Promise<string | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (row) {
      return this.ensureLinked({
        userId: row.id,
        email: input.email,
        displayName: input.displayName,
      });
    }
    try {
      return await this.findOrCreate(input.email, input.displayName);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(
        `[directus-bridge] ensureLinkedByEmail fallback failed for ${input.email}: ${reason}`,
      );
      return null;
    }
  }
}

export { DirectusError };
