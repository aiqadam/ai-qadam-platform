import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  EVENT_SPEAKER_STATUSES,
  type EventSpeakerStatus,
  type EventSpeakerView,
  EventSpeakersService,
} from './event-speakers.service';

// F-S1.1b — operator CRUD on event_speakers.
// Status flip to 'confirmed' triggers the speaker_added broadcast
// (handled inside EventSpeakersService.patch — best-effort + idempotent).

const createSchema = z.object({
  speakerId: z.string().uuid(),
  talkTitle: z.string().trim().max(200).nullable().optional(),
  talkTopic: z.string().trim().max(2000).nullable().optional(),
  orderIndex: z.number().int().min(0).max(10_000).optional(),
});

const patchSchema = z.object({
  status: z
    .enum([...EVENT_SPEAKER_STATUSES] as [EventSpeakerStatus, ...EventSpeakerStatus[]])
    .optional(),
  talkTitle: z.string().trim().max(200).nullable().optional(),
  talkTopic: z.string().trim().max(2000).nullable().optional(),
  orderIndex: z.number().int().min(0).max(10_000).optional(),
});

@Controller('v1/workspace/events/:eventId/speakers')
@UseGuards(AuthGuard)
export class EventSpeakersController {
  constructor(private readonly service: EventSpeakersService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Param('eventId') eventId: string,
  ): Promise<{ eventSpeakers: EventSpeakerView[] }> {
    if (!req.user) throw new UnauthorizedException('not signed in');
    const eventSpeakers = await this.service.list(eventId);
    return { eventSpeakers };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: Request,
    @Param('eventId') eventId: string,
    @Body() body: unknown,
  ): Promise<{ eventSpeaker: EventSpeakerView }> {
    if (!req.user) throw new UnauthorizedException('not signed in');
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const eventSpeaker = await this.service.create(eventId, parsed.data);
    return { eventSpeaker };
  }

  @Patch(':eventSpeakerId')
  async patch(
    @Req() req: Request,
    @Param('eventSpeakerId') eventSpeakerId: string,
    @Body() body: unknown,
  ): Promise<{ eventSpeaker: EventSpeakerView }> {
    if (!req.user) throw new UnauthorizedException('not signed in');
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const eventSpeaker = await this.service.patch(eventSpeakerId, parsed.data);
    return { eventSpeaker };
  }

  @Delete(':eventSpeakerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() req: Request,
    @Param('eventSpeakerId') eventSpeakerId: string,
  ): Promise<void> {
    if (!req.user) throw new UnauthorizedException('not signed in');
    await this.service.remove(eventSpeakerId);
  }
}
