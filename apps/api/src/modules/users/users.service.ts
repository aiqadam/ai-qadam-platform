import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { events } from '../events/schema';
import { pointAwards } from '../points/schema';
import { registrations } from '../registrations/schema';
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
  constructor(@Inject(DB) private readonly db: Db) {}

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

    // Three small aggregate queries — tenant-scoped by countryCode so a
    // profile rendered on uz.aiqadam.org only counts UZ activity.
    const [attended] = await this.db
      .select({ n: count() })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(
        and(
          eq(registrations.userId, user.id),
          eq(registrations.status, 'attended'),
          eq(events.countryCode, countryCode),
        ),
      );
    const [registered] = await this.db
      .select({ n: count() })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(
        and(
          eq(registrations.userId, user.id),
          eq(registrations.status, 'registered'),
          eq(events.countryCode, countryCode),
        ),
      );
    const [pts] = await this.db
      .select({ total: sql<number>`coalesce(sum(${pointAwards.points}), 0)::int` })
      .from(pointAwards)
      .where(and(eq(pointAwards.userId, user.id), eq(pointAwards.countryCode, countryCode)));

    return {
      user,
      attendedCount: attended?.n ?? 0,
      registeredCount: registered?.n ?? 0,
      totalPoints: pts?.total ?? 0,
    };
  }
}
