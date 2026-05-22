import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CsatService, type CsatSummary } from './csat.service';

// F-S1.2 — public CSAT submission (token-gated, no AuthGuard).
// F-S1.3 — operator surface (AuthGuard) returns per-event CSAT summary.

const submitSchema = z.object({
  token: z.string().min(20).max(2000),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(4000).optional(),
});

@Controller('v1/feedback/csat')
export class CsatPublicController {
  constructor(private readonly csat: CsatService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(@Body() body: unknown): Promise<{ accepted: true }> {
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const result = await this.csat.submit({
      token: parsed.data.token,
      rating: parsed.data.rating,
      ...(parsed.data.comment !== undefined ? { comment: parsed.data.comment } : {}),
    });
    if (result.accepted) return { accepted: true };
    if (result.reason === 'invalid_token' || result.reason === 'delivery_not_found') {
      throw new UnauthorizedException(result.reason);
    }
    if (result.reason === 'already_responded') {
      throw new ConflictException(result.reason);
    }
    throw new BadRequestException(result.reason ?? 'unknown');
  }
}

@Controller('v1/workspace/events')
@UseGuards(AuthGuard)
export class CsatOperatorController {
  constructor(private readonly csat: CsatService) {}

  @Get(':id/csat')
  async summary(@Req() req: Request, @Param('id') id: string): Promise<{ csat: CsatSummary }> {
    if (!req.user) throw new NotFoundException('not signed in');
    const csat = await this.csat.summaryForEvent(id);
    return { csat };
  }
}
