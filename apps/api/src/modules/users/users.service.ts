import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq, inArray } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { DirectusClient } from '../directus/directus.client';
import { type User, users } from './schema';

interface UpsertInput {
  authentikSubject: string;
  email: string;
  displayName?: string;
}

// F-WebU15 — extras surfaced on /u/[handle] beyond the v1 counts.
// Each is independently nullable so a missing field never blocks the
// page; the renderer hides sections whose source is null.
export interface PublicProfileExtras {
  bioMd: string | null;
  jobTitle: string | null;
  employerName: string | null;
  recentEvents: Array<{
    eventId: string;
    title: string;
    startsAt: string;
    endsAt: string;
  }>;
}

interface PublicProfile {
  user: User;
  attendedCount: number;
  registeredCount: number;
  totalPoints: number;
  extras: PublicProfileExtras;
}

const EMPTY_EXTRAS: PublicProfileExtras = {
  bioMd: null,
  jobTitle: null,
  employerName: null,
  recentEvents: [],
};

// Lowercase alphanumerics + underscore, up to 64 chars. Drop anything else.
function deriveHandle(email: string): string {
  const prefix = email.split('@')[0] ?? '';
  return prefix
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 64);
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly directus: DirectusClient,
  ) {}

  async upsertByAuthentikSubject(input: UpsertInput): Promise<User> {
    if (input.authentikSubject.length === 0) {
      throw new Error('authentikSubject must be non-empty');
    }
    if (!input.email.includes('@')) {
      throw new Error('email must be an email address');
    }

    const now = new Date();
    const insertHandle = deriveHandle(input.email);
    const [row] = await this.db
      .insert(users)
      .values({
        authentikSubject: input.authentikSubject,
        email: input.email,
        displayName: input.displayName ?? null,
        handle: insertHandle.length >= 3 ? insertHandle : null,
      })
      .onConflictDoUpdate({
        target: users.authentikSubject,
        set: {
          email: input.email,
          displayName: input.displayName ?? null,
          lastLoginAt: now,
          updatedAt: now,
        },
      })
      .returning();

    if (!row) {
      throw new Error('users upsert returned no row');
    }
    return row;
  }

  async findByAuthentikSubject(sub: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.authentikSubject, sub))
      .limit(1);
    return row;
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async listAll(): Promise<User[]> {
    return this.db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateRole(input: {
    userId: string;
    role: 'member' | 'organizer' | 'country_admin' | 'super_admin';
  }): Promise<User | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(users.id, input.userId))
      .returning();
    return row;
  }

  // F-S3.10-c bridge: given a batch of directus_user_id values (from a
  // Directus join — e.g. speakers on an event), return the corresponding
  // local handles so the SSR layer can build /u/{handle} links. Returns
  // a map keyed by directus_user_id; users without a handle (or never
  // signed in via OIDC) are simply absent from the map.
  async findHandlesByDirectusIds(directusIds: string[]): Promise<Record<string, string>> {
    if (directusIds.length === 0) return {};
    const rows = await this.db
      .select({ directusUserId: users.directusUserId, handle: users.handle })
      .from(users)
      .where(inArray(users.directusUserId, directusIds));
    const out: Record<string, string> = {};
    for (const row of rows) {
      if (row.directusUserId && row.handle) {
        out[row.directusUserId] = row.handle;
      }
    }
    return out;
  }

  async findByHandle(handle: string): Promise<User | undefined> {
    const normalised = handle.toLowerCase().trim();
    if (!normalised) return undefined;
    const [row] = await this.db.select().from(users).where(eq(users.handle, normalised)).limit(1);
    return row;
  }

  async getPublicProfile(handle: string, countryCode: string): Promise<PublicProfile | undefined> {
    const user = await this.findByHandle(handle);
    if (!user) return undefined;

    // Sprint 4.5/4: aggregates moved to Directus. If the user hasn't yet
    // backfilled their directus_user_id (signed in pre-S4.5/1), counts
    // come back as zero — acceptable degraded state until they next sign in.
    if (!user.directusUserId) {
      return { user, attendedCount: 0, registeredCount: 0, totalPoints: 0, extras: EMPTY_EXTRAS };
    }
    const dxUser = user.directusUserId;

    try {
      const regsParams = (status: 'attended' | 'registered') => {
        const p = new URLSearchParams({
          'aggregate[count]': 'id',
          'filter[user][_eq]': dxUser,
          'filter[status][_eq]': status,
          'filter[event][country][_eq]': countryCode,
        });
        return p.toString();
      };
      const ptsParams = new URLSearchParams({
        'aggregate[sum]': 'points',
        'filter[user][_eq]': dxUser,
        'filter[country][_eq]': countryCode,
      });

      const [attendedRes, registeredRes, ptsRes, extras] = await Promise.all([
        this.directus.get<{ data: Array<{ count: { id: string } }> }>(
          `/items/registrations?${regsParams('attended')}`,
        ),
        this.directus.get<{ data: Array<{ count: { id: string } }> }>(
          `/items/registrations?${regsParams('registered')}`,
        ),
        this.directus.get<{ data: Array<{ sum: { points: string | null } }> }>(
          `/items/point_awards?${ptsParams.toString()}`,
        ),
        this.fetchProfileExtras(dxUser, countryCode),
      ]);

      return {
        user,
        attendedCount: Number(attendedRes.data[0]?.count?.id ?? 0),
        registeredCount: Number(registeredRes.data[0]?.count?.id ?? 0),
        totalPoints: Number(ptsRes.data[0]?.sum?.points ?? 0),
        extras,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[users] getPublicProfile aggregates failed for ${handle}: ${reason}`);
      return { user, attendedCount: 0, registeredCount: 0, totalPoints: 0, extras: EMPTY_EXTRAS };
    }
  }

  // F-WebU15 — one extra round-trip per page load to surface bio + job
  // + employer + recent attended events. Failures degrade silently to
  // EMPTY_EXTRAS so the rest of the profile still renders.
  private async fetchProfileExtras(
    directusUserId: string,
    countryCode: string,
  ): Promise<PublicProfileExtras> {
    try {
      const userParams = new URLSearchParams({
        fields: 'bio_md,job_title,employer.name',
      });
      const regsParams = new URLSearchParams({
        'filter[user][_eq]': directusUserId,
        'filter[status][_eq]': 'attended',
        'filter[event][country][_eq]': countryCode,
        fields: 'event.id,event.title,event.starts_at,event.ends_at',
        sort: '-date_updated',
        limit: '50',
      });
      type DxUser = {
        data: {
          bio_md?: string | null;
          job_title?: string | null;
          employer?: { name?: string | null } | null;
        };
      };
      type DxReg = {
        data: Array<{
          event: { id: string; title: string; starts_at: string; ends_at: string } | null;
        }>;
      };
      const [userRes, regsRes] = await Promise.all([
        this.directus.get<DxUser>(`/users/${directusUserId}?${userParams.toString()}`),
        this.directus.get<DxReg>(`/items/registrations?${regsParams.toString()}`),
      ]);
      const recentEvents = regsRes.data
        .map((row) => row.event)
        .filter((ev): ev is NonNullable<typeof ev> => ev != null)
        .map((ev) => ({
          eventId: ev.id,
          title: ev.title,
          startsAt: ev.starts_at,
          endsAt: ev.ends_at,
        }));
      return {
        bioMd: userRes.data.bio_md?.trim() || null,
        jobTitle: userRes.data.job_title?.trim() || null,
        employerName: userRes.data.employer?.name?.trim() || null,
        recentEvents,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[users] fetchProfileExtras failed for ${directusUserId}: ${reason}`);
      return EMPTY_EXTRAS;
    }
  }
}
