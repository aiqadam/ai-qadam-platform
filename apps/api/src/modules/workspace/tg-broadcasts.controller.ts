import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  type BroadcastDetail,
  type BroadcastStatus,
  type BroadcastSummary,
  TgBroadcastsService,
} from './tg-broadcasts.service';

// #294 PR-a — workspace cabinet read endpoints for tg_broadcasts.
//
// PR-a is read-only. PR-b adds POST/PATCH for the composer; PR-d adds
// the send-now action. Operator-scope filtering by country happens
// here (rather than via Directus permissions) so the same DirectusClient
// can serve both views.

const STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'failed'] as const;

const listQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[a-z]{2}$/, 'country must be ISO-3166-1 alpha-2 lowercase')
    .optional(),
  status: z.enum(STATUSES).optional(),
});

const idParamSchema = z.string().uuid();

@Controller('v1/workspace/tg-broadcasts')
@UseGuards(AuthGuard)
export class TgBroadcastsController {
  constructor(private readonly broadcasts: TgBroadcastsService) {}

  @Get()
  async list(@Query() query: unknown): Promise<{ items: BroadcastSummary[] }> {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.broadcasts.list({
      country: parsed.data.country ?? null,
      status: (parsed.data.status as BroadcastStatus | undefined) ?? null,
    });
  }

  @Get(':id')
  async detail(@Param('id') id: string): Promise<BroadcastDetail> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.broadcasts.get(parsed.data);
  }
}
