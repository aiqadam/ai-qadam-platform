import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { events } from '../events/schema';
import { pointAwards } from '../points/schema';
import { registrations } from '../registrations/schema';
import { users } from '../users/schema';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface TopMember {
  userId: string;
  displayName: string | null;
  email: string;
  totalPoints: number;
}

interface DashboardStats {
  upcomingEvents: number;
  registrationsThisWeek: number;
  pointsThisWeek: number;
  topMembers: TopMember[];
}

@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async dashboard(countryCode: string): Promise<DashboardStats> {
    const since = new Date(Date.now() - SEVEN_DAYS_MS);
    const now = new Date();

    const [upcoming] = await this.db
      .select({ n: count() })
      .from(events)
      .where(and(eq(events.countryCode, countryCode), gte(events.startsAt, now)));

    // Registrations created in the last 7 days, joined to events so we can
    // tenant-scope by event.countryCode.
    const [regs] = await this.db
      .select({ n: count() })
      .from(registrations)
      .innerJoin(events, eq(events.id, registrations.eventId))
      .where(and(eq(events.countryCode, countryCode), gte(registrations.createdAt, since)));

    const [pts] = await this.db
      .select({ total: sql<number>`coalesce(sum(${pointAwards.points}), 0)::int` })
      .from(pointAwards)
      .where(and(eq(pointAwards.countryCode, countryCode), gte(pointAwards.createdAt, since)));

    const top = await this.db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        totalPoints: sql<number>`coalesce(sum(${pointAwards.points}), 0)::int`,
      })
      .from(pointAwards)
      .innerJoin(users, eq(users.id, pointAwards.userId))
      .where(eq(pointAwards.countryCode, countryCode))
      .groupBy(users.id, users.displayName, users.email)
      .orderBy(desc(sql<number>`coalesce(sum(${pointAwards.points}), 0)`))
      .limit(5);

    return {
      upcomingEvents: upcoming?.n ?? 0,
      registrationsThisWeek: regs?.n ?? 0,
      pointsThisWeek: pts?.total ?? 0,
      topMembers: top.map((t) => ({
        userId: t.userId,
        displayName: t.displayName,
        email: t.email,
        totalPoints: t.totalPoints,
      })),
    };
  }
}
