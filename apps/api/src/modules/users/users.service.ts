import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { DirectusClient } from '../directus/directus.client';
import { type User, users } from './schema';

interface UpsertInput {
  authentikSubject: string;
  email: string;
  displayName?: string;
}

interface PublicProfile {
  user: User;
  attendedCount: number;
  registeredCount: number;
  totalPoints: number;
}

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
      return { user, attendedCount: 0, registeredCount: 0, totalPoints: 0 };
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

      const [attendedRes, registeredRes, ptsRes] = await Promise.all([
        this.directus.get<{ data: Array<{ count: { id: string } }> }>(
          `/items/registrations?${regsParams('attended')}`,
        ),
        this.directus.get<{ data: Array<{ count: { id: string } }> }>(
          `/items/registrations?${regsParams('registered')}`,
        ),
        this.directus.get<{ data: Array<{ sum: { points: string | null } }> }>(
          `/items/point_awards?${ptsParams.toString()}`,
        ),
      ]);

      return {
        user,
        attendedCount: Number(attendedRes.data[0]?.count?.id ?? 0),
        registeredCount: Number(registeredRes.data[0]?.count?.id ?? 0),
        totalPoints: Number(ptsRes.data[0]?.sum?.points ?? 0),
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      this.logger.warn(`[users] getPublicProfile aggregates failed for ${handle}: ${reason}`);
      return { user, attendedCount: 0, registeredCount: 0, totalPoints: 0 };
    }
  }
}
