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
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { EventSpeakersService } from './event-speakers.service';
import {
  type EventDetail,
  type EventFollowup,
  type EventListItem,
  EventsService,
  type FollowupKind,
} from './events.service';

// F-S3.4 — operator event control panel API.
//
// All endpoints AuthGuard-gated. Country scoping waits on ADR-0021 RBAC
// (Sprint 2.2) — every authenticated operator sees every event today.

const FOLLOWUP_KINDS = [
  'retrospective',
  'thank_you_sent',
  'recap_posted',
  'sponsor_report_delivered',
] as const;

const patchEventSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).optional(),
  status: z.enum(['draft', 'published', 'cancelled']).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  location: z.string().trim().max(255).nullable().optional(),
});

const upsertFollowupSchema = z.object({
  body_md: z.string().trim().max(20000).nullable().optional(),
  completed: z.boolean().optional(),
});

@Controller('v1/workspace/events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(
    private readonly events: EventsService,
    // F-S1.1b ext — reused for the operator-driven "Regenerate social
    // card" button. Bumping events.date_updated lives in
    // EventSpeakersService.touchEventForOgRefresh so the
    // speaker-status-change path + the manual button share one
    // implementation.
    private readonly speakers: EventSpeakersService,
  ) {}

  @Get()
  async list(@Req() req: Request): Promise<{ events: EventListItem[] }> {
    requireUser(req);
    const events = await this.events.list();
    return { events };
  }

  @Get(':id')
  async detail(@Req() req: Request, @Param('id') id: string): Promise<{ event: EventDetail }> {
    requireUser(req);
    const event = await this.events.getById(id);
    return { event };
  }

  @Patch(':id')
  async patch(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ event: EventDetail }> {
    requireUser(req);
    const parsed = patchEventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const event = await this.events.patch(id, parsed.data);
    return { event };
  }

  // F-S1.1b ext — operator-driven social-card cache-bust. Bumps
  // events.date_updated; the og-card endpoint's cache-buster query
  // string then changes, every social scraper sees a fresh image on
  // the next preview. Idempotent — repeated calls just rotate the
  // timestamp.
  @Post(':id/regenerate-social-card')
  @HttpCode(HttpStatus.OK)
  async regenerateSocialCard(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ regenerated: true }> {
    requireUser(req);
    await this.speakers.touchEventForOgRefresh(id);
    return { regenerated: true };
  }

  @Put(':id/followups/:kind')
  @HttpCode(HttpStatus.OK)
  async upsertFollowup(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('kind') kind: string,
    @Body() body: unknown,
  ): Promise<{ followup: EventFollowup }> {
    requireUser(req);
    if (!FOLLOWUP_KINDS.includes(kind as FollowupKind)) {
      throw new BadRequestException(`unknown followup kind: ${kind}`);
    }
    const parsed = upsertFollowupSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const followup = await this.events.upsertFollowup(id, kind as FollowupKind, parsed.data);
    return { followup };
  }
}

function requireUser(req: Request): void {
  if (!req.user) throw new UnauthorizedException('not signed in');
}
