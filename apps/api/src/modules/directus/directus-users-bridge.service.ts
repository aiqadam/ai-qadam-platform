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
//   1. If our row already has directusUserId → no-op (fast path).
//   2. Else GET /users?filter[email][_eq]=<email> — link if found.
//   3. Else POST /users to create with provider=authentik,
//      external_identifier=email, status=active, role=null.
//
// Failure modes log + swallow: a bridge failure must NOT block sign-in.
// The next sign-in retries automatically (column stays null until success).

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
      return row.directusUserId;
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
  // have a `users.id` to pass into `ensureLinked`. Looks up the local
  // row by email (mirroring the inline pattern used by `resolveDirectusId`
  // and `ensureLinked` itself), then delegates to `ensureLinked` so the
  // idempotency + error-swallowing semantics stay identical to the
  // userId-keyed path.
  //
  // Returns null when no local user row exists for the email — this is
  // the caller's signal that a sign-in must happen first (the bridge
  // cannot create a Directus mirror of a row that doesn't exist locally).
  // Returns null on bridge failure too (same swallow semantics as
  // ensureLinked); the controller surfaces that as { directusUserId: null }
  // so the seed can detect + warn rather than hard-fail.
  async ensureLinkedByEmail(input: {
    email: string;
    displayName: string | null;
  }): Promise<string | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (!row) {
      return null;
    }
    return this.ensureLinked({
      userId: row.id,
      email: input.email,
      displayName: input.displayName,
    });
  }
}

export { DirectusError };
