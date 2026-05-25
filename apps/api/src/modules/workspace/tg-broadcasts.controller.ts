import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import {
  type BroadcastAnalytics,
  TgBroadcastsAnalyticsService,
} from './tg-broadcasts-analytics.service';
import {
  type SendNowResult,
  type SendTestResult,
  TgBroadcastsSenderService,
} from './tg-broadcasts-sender.service';
import {
  type BroadcastDetail,
  type BroadcastStatus,
  type BroadcastSummary,
  TgBroadcastsService,
} from './tg-broadcasts.service';

// #294 PR-a — workspace cabinet read endpoints for tg_broadcasts.
// #294 PR-b — adds POST + PATCH for the composer.
// #294 PR-d — adds POST :id/send-now to enqueue dispatches via the outbox.
//
// Operator-scope filtering by country happens here (rather than via
// Directus permissions) so the same DirectusClient can serve both views.

const STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'] as const;

const listQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[a-z]{2}$/, 'country must be ISO-3166-1 alpha-2 lowercase')
    .optional(),
  status: z.enum(STATUSES).optional(),
});

const idParamSchema = z.string().uuid();

// #294 PR-b — write contracts. Inline-button cap is 8 (Telegram limit);
// service additionally trims malformed rows.
const buttonSchema = z.object({
  label: z.string().min(1).max(64),
  url: z.string().url().max(2048),
});

const recurrenceSchema = z.enum(['none', 'weekly', 'monthly']);

const createSchema = z.object({
  title: z.string().min(1).max(200),
  country: z.string().regex(/^[a-z]{2}$/, 'country must be ISO-3166-1 alpha-2 lowercase'),
  html_body: z.string().min(1).max(4096),
  image_asset: z.string().uuid().nullable().optional(),
  inline_buttons: z.array(buttonSchema).max(8).optional(),
  audience_segment: z.string().uuid().nullable().optional(),
  recurrence: recurrenceSchema.optional(),
});

const updateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    html_body: z.string().min(1).max(4096).optional(),
    image_asset: z.string().uuid().nullable().optional(),
    inline_buttons: z.array(buttonSchema).max(8).optional(),
    audience_segment: z.string().uuid().nullable().optional(),
    status: z.enum(['draft', 'scheduled']).optional(),
    scheduled_at: z.string().datetime().nullable().optional(),
    recurrence: recurrenceSchema.optional(),
  })
  .strict();

@Controller('v1/workspace/tg-broadcasts')
@UseGuards(AuthGuard)
export class TgBroadcastsController {
  constructor(
    private readonly broadcasts: TgBroadcastsService,
    private readonly sender: TgBroadcastsSenderService,
    private readonly analytics: TgBroadcastsAnalyticsService,
    private readonly directusBridge: DirectusUsersBridgeService,
  ) {}

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

  // #294 PR-b — composer create. Always lands as draft; transitions
  // through update.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown): Promise<BroadcastDetail> {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.broadcasts.create({
      title: parsed.data.title,
      country: parsed.data.country,
      html_body: parsed.data.html_body,
      image_asset: parsed.data.image_asset ?? null,
      inline_buttons: parsed.data.inline_buttons ?? [],
      audience_segment: parsed.data.audience_segment ?? null,
      recurrence: parsed.data.recurrence ?? 'none',
    });
  }

  // #294 PR-b — composer update. Partial body; service validates
  // status transitions + scheduled_at futurity.
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<BroadcastDetail> {
    const parsedId = idParamSchema.safeParse(id);
    if (!parsedId.success) {
      throw new BadRequestException(parsedId.error.flatten());
    }
    const parsedBody = updateSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.flatten());
    }
    // exactOptionalPropertyTypes: only forward keys actually present.
    const input: Parameters<TgBroadcastsService['update']>[1] = {};
    const d = parsedBody.data;
    if (d.title !== undefined) input.title = d.title;
    if (d.html_body !== undefined) input.html_body = d.html_body;
    if (d.image_asset !== undefined) input.image_asset = d.image_asset;
    if (d.inline_buttons !== undefined) input.inline_buttons = d.inline_buttons;
    if (d.audience_segment !== undefined) input.audience_segment = d.audience_segment;
    if (d.status !== undefined) input.status = d.status;
    if (d.scheduled_at !== undefined) input.scheduled_at = d.scheduled_at;
    if (d.recurrence !== undefined) input.recurrence = d.recurrence;
    return this.broadcasts.update(parsedId.data, input);
  }

  // #294 PR-d — fire the broadcast NOW. Synchronous status flip to
  // sending; envelope enqueue is per-recipient + still in this request
  // (the notifier consumes async from the outbox). Operator gets
  // back sent_count + skipped_count.
  //
  //   200: { broadcast_id, sent_count, skipped_count, sent_at }
  //   400: { error: 'already_sent' | 'in_progress' | 'previous_send_failed'
  //                 | 'no_audience_segment' | 'empty_body' }
  //   401: AuthGuard
  //   404: { error: 'broadcast_not_found' }
  @Post(':id/send-now')
  @HttpCode(HttpStatus.OK)
  async sendNow(@Param('id') id: string): Promise<SendNowResult> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.sender.sendNow(parsed.data);
  }

  // #391 — send a single test envelope to the operator's own Telegram
  // chat. Doesn't touch the broadcast row. Useful before going live
  // with a real segment to preview formatting + inline buttons in
  // real Telegram.
  //
  //   200: { broadcast_id, sent_to_member_id, sent_to_chat_id, sent_at }
  //   400: { error: 'operator_not_telegram_linked' | 'operator_opted_out'
  //                 | 'empty_body' | 'publish_failed' | 'operator_unresolved' }
  //   401: AuthGuard
  //   404: { error: 'broadcast_not_found' }
  @Post(':id/send-test')
  @HttpCode(HttpStatus.OK)
  async sendTest(@Param('id') id: string, @Req() req: Request): Promise<SendTestResult> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const operatorUserId = req.user?.sub;
    if (!operatorUserId) {
      // Shouldn't happen — AuthGuard set req.user. Defensive.
      throw new BadRequestException({ error: 'operator_unresolved' });
    }
    const directusId = await this.directusBridge.resolveDirectusId(operatorUserId);
    if (!directusId) {
      throw new BadRequestException({ error: 'operator_unresolved' });
    }
    return this.sender.sendTest(parsed.data, directusId);
  }

  // #391 — operator cancels an in-flight send. Flips status to
  // 'cancelled'; the sender polls between recipient pages and bails on
  // the next poll. Already-queued envelopes in Redis streams will
  // still deliver (notifier owns them); cancel only stops the
  // producer from enqueuing more.
  //
  //   200: BroadcastDetail
  //   400: { error: 'not_cancellable', reason }
  //   401: AuthGuard
  //   404: { error: 'broadcast_not_found' }
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string): Promise<BroadcastDetail> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // sent_count snapshot: read current row's sent_count (or 0 if unset)
    // so the cancelled row reflects how many envelopes were enqueued
    // before the operator hit the button.
    const current = await this.broadcasts.get(parsed.data);
    return this.broadcasts.cancel(parsed.data, current.sent_count);
  }

  // #294 PR-e — per-broadcast delivery analytics. Reads tg_send_log
  // for rows with delivery_key prefix `bdc:${id}:`. Counts are
  // best-effort point-in-time (notifier audit lags real delivery by
  // 1–5s; pending=retry rows surface the in-flight state).
  //
  //   200: { broadcast_id, delivered, opted_out, failed, pending, total_audited }
  //   400: { error: 'invalid_id' }
  //   401: AuthGuard
  @Get(':id/analytics')
  async analyticsRead(@Param('id') id: string): Promise<BroadcastAnalytics> {
    const parsed = idParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.analytics.get(parsed.data);
  }
}
