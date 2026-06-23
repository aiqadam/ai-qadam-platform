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
  handle: string | null;
  totalPoints: number;
}

// F-WebU16 — time-window filter on point_awards. `all` keeps the
// original lifetime aggregate; `year` and `quarter` constrain by
// date_created so the leaderboard surfaces recent activity for new
// members (and prevents the same handful of veterans from dominating
// forever).
export type LeaderboardWindow = 'all' | 'year' | 'quarter';

function windowFilterValue(window: LeaderboardWindow): string | null {
  if (window === 'all') return null;
  const now = new Date();
  if (window === 'year') {
    const d = new Date(now);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.toISOString();
  }
  // quarter: trailing 90 days
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 90);
  return d.toISOString();
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
  //
  // F-S5.6 — `appear_on_public_leaderboard` is an opt-out on directus_users
  // (default ON). The relational filter `_neq:false` includes users where
  // the column is true OR null (legacy rows that haven't been backfilled),
  // and excludes users who explicitly opted out. Per F-S5.6 spec the rank
  // arithmetic stays "stable" — we drop opted-out users from the rendered
  // list, not the underlying sort, so ranks 1, 2, 4 remain as such when
  // rank 3 opted out. (limit may yield fewer rows than requested if many
  // users opt out; acceptable for v1.)
  async leaderboard(input: {
    countryCode: string;
    limit: number;
    window?: LeaderboardWindow;
  }): Promise<LeaderboardEntry[]> {
    if (input.limit <= 0 || input.limit > 100) {
      throw new Error('limit must be between 1 and 100');
    }
    const params = new URLSearchParams({
      'filter[country][_eq]': input.countryCode,
      'filter[user][appear_on_public_leaderboard][_neq]': 'false',
      'aggregate[sum]': 'points',
      groupBy: 'user',
      sort: '-sum.points',
      limit: String(input.limit),
    });
    const windowSince = windowFilterValue(input.window ?? 'all');
    if (windowSince) {
      params.set('filter[date_created][_gte]', windowSince);
    }
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
        handle: users.handle,
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
        handle: profile.handle,
        totalPoints: Number(row.sum.points),
      });
    }
    return entries;
  }

  // FR-MIG-020 — award first-join points to `userId`. Writes one row to
  // directus point_awards. Idempotent: checks for an existing award row
  // with key='first_join' before inserting. Returns silently if already
  // awarded (caller does not need to distinguish).
  async awardFirstJoinPoints(userId: string): Promise<void> {
    const KEY = 'first_join';
    const POINTS = 10;

    // Check idempotency — skip if already awarded.
    const filter = encodeURIComponent(JSON.stringify({ user: { _eq: userId }, key: { _eq: KEY } }));
    const existing = await this.directus.get<{ data: { id: string }[] }>(
      `/items/point_awards?filter=${filter}&fields=id&limit=1`,
    );
    if (existing.data.length > 0) {
      this.logger.debug(`first-join points already awarded to user=${userId}`);
      return;
    }

    await this.directus.post('/items/point_awards', {
      user: userId,
      points: POINTS,
      key: KEY,
    });
    this.logger.log(`first-join points awarded to user=${userId} (${POINTS} pts)`);
  }
}
