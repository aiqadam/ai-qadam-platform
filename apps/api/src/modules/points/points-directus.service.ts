import { Inject, Injectable, Logger } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DB, type Db } from '../../db';
import { DirectusClient } from '../directus/directus.client';
import { users } from '../users/schema';

// Sprint 4.5/3: leaderboard reads aggregate from directus.point_awards.
// Identity (email, displayName, platform.users.id) still resolves via
// Drizzle — platform.users stays (auth-linked) per the migration plan,
// and web uses platform.users.id as the "is this me?" key.

export interface LeaderboardEntry {
  userId: string; // platform.users.id, NOT directus_users.id
  email: string;
  displayName: string | null;
  totalPoints: number;
}

interface DirectusAggregateRow {
  user: string; // directus_users.id
  sum: { points: string }; // Directus aggregate returns the sum as a string
}

@Injectable()
export class PointsDirectusService {
  private readonly logger = new Logger(PointsDirectusService.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly directus: DirectusClient,
  ) {}

  // Top N users in this tenant by total points. Two-step:
  //   1) Directus aggregate per directus_user
  //   2) Join with platform.users via directusUserId for display fields
  // Users whose bridge hasn't backfilled yet are silently dropped from the
  // result (they had no Directus link → couldn't have earned Directus
  // points). Same applies to legacy point_awards rows whose user_id no
  // longer exists in platform.users (orphan after the schema drop in
  // S4.5/4 — won't apply once that lands).
  async leaderboard(input: { countryCode: string; limit: number }): Promise<LeaderboardEntry[]> {
    if (input.limit <= 0 || input.limit > 100) {
      throw new Error('limit must be between 1 and 100');
    }
    const params = new URLSearchParams({
      'filter[country][_eq]': input.countryCode,
      'aggregate[sum]': 'points',
      groupBy: 'user',
      sort: '-sum.points',
      limit: String(input.limit),
    });
    const body = await this.directus.get<{ data: DirectusAggregateRow[] }>(
      `/items/point_awards?${params.toString()}`,
    );
    const aggregates = body.data;
    if (aggregates.length === 0) return [];

    const directusUserIds = aggregates.map((row) => row.user);
    const profiles = await this.db
      .select({
        id: users.id,
        directusUserId: users.directusUserId,
        email: users.email,
        displayName: users.displayName,
      })
      .from(users)
      .where(inArray(users.directusUserId, directusUserIds));

    const byDirectusId = new Map(profiles.map((p) => [p.directusUserId ?? '', p]));

    const entries: LeaderboardEntry[] = [];
    for (const row of aggregates) {
      const profile = byDirectusId.get(row.user);
      if (!profile) {
        // Orphan aggregate — user not in our platform.users yet. Skip.
        continue;
      }
      entries.push({
        userId: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        totalPoints: Number(row.sum.points),
      });
    }
    return entries;
  }
}
