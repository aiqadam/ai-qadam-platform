import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  EventQuestionsService,
  QuestionEventNotFoundError,
  QuestionInvalidError,
} from './event-questions.service';

// F-WebU12 — write side of per-event Q&A. Reads are anonymous against
// Directus via the Public policy; only POST goes through here.

const CreateQuestionSchema = z.object({
  questionText: z.string().trim().min(1).max(2000),
  parentQuestionId: z.string().uuid().optional(),
});

interface CreateQuestionResponse {
  id: string;
  eventId: string;
  parentQuestionId: string | null;
  questionText: string;
  createdAt: string;
}

@Controller('v1/events')
@UseGuards(AuthGuard)
export class EventQuestionsController {
  constructor(private readonly service: EventQuestionsService) {}

  @Post(':id/questions')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('id', new ParseUUIDPipe()) eventId: string,
    @Body() raw: unknown,
    @Req() req: Request,
  ): Promise<CreateQuestionResponse> {
    if (!req.user) {
      throw new UnauthorizedException();
    }
    const parsed = CreateQuestionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    try {
      const created = await this.service.create({
        eventId,
        userId: req.user.sub,
        questionText: parsed.data.questionText,
        ...(parsed.data.parentQuestionId ? { parentQuestionId: parsed.data.parentQuestionId } : {}),
      });
      return created;
    } catch (err) {
      if (err instanceof QuestionEventNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof QuestionInvalidError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
