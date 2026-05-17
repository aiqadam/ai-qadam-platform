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
import { PointsDirectusService } from './points-directus.service';

interface LeaderboardResponse {
  countryCode: string;
  entries: Array<{
    rank: number;
    userId: string;
    email: string;
    displayName: string | null;
    totalPoints: number;
  }>;
}

@Controller('v1/leaderboard')
export class PointsController {
  constructor(private readonly points: PointsDirectusService) {}

  @Get()
  async leaderboard(
    @Req() req: Request,
    @Query('limit', new DefaultValuePipe(20), new ParseIntPipe({ optional: true }))
    limit: number,
  ): Promise<LeaderboardResponse> {
    if (!req.tenant) throw new NotFoundException('tenant not resolved');
    const clampedLimit = Math.min(Math.max(limit, 1), 100);
    const entries = await this.points.leaderboard({
      countryCode: req.tenant.code,
      limit: clampedLimit,
    });
    return {
      countryCode: req.tenant.code,
      entries: entries.map((e, i) => ({
        rank: i + 1,
        userId: e.userId,
        email: e.email,
        displayName: e.displayName,
        totalPoints: e.totalPoints,
      })),
    };
  }
}
