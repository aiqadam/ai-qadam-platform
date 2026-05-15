import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { users } from '../users/schema';
import { POINTS_FOR_EVENT_ATTENDED, pointAwards } from './schema';

export interface LeaderboardEntry {
  userId: string;
  email: string;
  displayName: string | null;
  totalPoints: number;
}

@Injectable()
export class PointsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // Award the standard amount for attending an event. Idempotent via the
  // (user_id, source, source_ref) unique constraint — calling twice for the
  // same registration silently no-ops.
  async awardForAttended(input: {
    userId: string;
    registrationId: string;
    countryCode: string;
  }): Promise<void> {
    await this.db
      .insert(pointAwards)
      .values({
        userId: input.userId,
        countryCode: input.countryCode,
        source: 'event_attended',
        sourceRef: input.registrationId,
        points: POINTS_FOR_EVENT_ATTENDED,
      })
      .onConflictDoNothing({
        target: [pointAwards.userId, pointAwards.source, pointAwards.sourceRef],
      });
  }

  // Top N users in this tenant by total points awarded. Joins the users
  // table for email + displayName so the controller doesn't have to.
  async leaderboard(input: { countryCode: string; limit: number }): Promise<LeaderboardEntry[]> {
    if (input.limit <= 0 || input.limit > 100) {
      throw new Error('limit must be between 1 and 100');
    }
    const rows = await this.db
      .select({
        userId: pointAwards.userId,
        email: users.email,
        displayName: users.displayName,
        totalPoints: sql<number>`sum(${pointAwards.points})::int`,
      })
      .from(pointAwards)
      .innerJoin(users, eq(users.id, pointAwards.userId))
      .where(eq(pointAwards.countryCode, input.countryCode))
      .groupBy(pointAwards.userId, users.email, users.displayName)
      .orderBy(desc(sql`sum(${pointAwards.points})`))
      .limit(input.limit);

    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      displayName: r.displayName,
      totalPoints: r.totalPoints,
    }));
  }
}
