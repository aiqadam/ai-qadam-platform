import {
  Controller,
  DefaultValuePipe,
  Get,
  NotFoundException,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { type LeaderboardWindow, PointsDirectusService } from './points-directus.service';

interface LeaderboardResponse {
  countryCode: string;
  window: LeaderboardWindow;
  entries: Array<{
    rank: number;
    userId: string;
    email: string;
    displayName: string | null;
    handle: string | null;
    totalPoints: number;
  }>;
}

const VALID_WINDOWS: ReadonlySet<LeaderboardWindow> = new Set(['all', 'year', 'quarter']);

@Controller('v1/leaderboard')
export class PointsController {
  constructor(private readonly points: PointsDirectusService) {}

  @Get()
  async leaderboard(
    @Req() req: Request,
    @Query('limit', new DefaultValuePipe(20), new ParseIntPipe({ optional: true }))
    limit: number,
    @Query('window') window?: string,
  ): Promise<LeaderboardResponse> {
    if (!req.tenant) throw new NotFoundException('tenant not resolved');
    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    const safeWindow: LeaderboardWindow = VALID_WINDOWS.has(window as LeaderboardWindow)
      ? (window as LeaderboardWindow)
      : 'all';
    const entries = await this.points.leaderboard({
      countryCode: req.tenant.code,
      limit: clampedLimit,
      window: safeWindow,
    });
    return {
      countryCode: req.tenant.code,
      window: safeWindow,
      entries: entries.map((e, i) => ({
        rank: i + 1,
        userId: e.userId,
        email: e.email,
        displayName: e.displayName,
        handle: e.handle,
        totalPoints: e.totalPoints,
      })),
    };
  }
}
