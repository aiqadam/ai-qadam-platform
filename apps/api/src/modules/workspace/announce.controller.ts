import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { type AnnouncePreview, type AnnounceSent, AnnounceService } from './announce.service';

// F-S3.3 — operator announcement endpoints.
//
// POST /v1/workspace/announce/preview — compute estimatedRecipients
// + render the preview (no side effects)
// POST /v1/workspace/announce — actually dispatch via Interactions

const previewSchema = z.object({
  cohortId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});

const sendSchema = z.object({
  cohortId: z.string().uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  consentBasis: z.enum(['explicit_opt_in', 'operational_contract']),
});

@Controller('v1/workspace/announce')
@UseGuards(AuthGuard)
export class AnnounceController {
  constructor(private readonly announce: AnnounceService) {}

  @Post('preview')
  async preview(@Req() req: Request, @Body() body: unknown): Promise<AnnouncePreview> {
    requireUser(req);
    const parsed = previewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.announce.preview(parsed.data.cohortId, parsed.data.subject, parsed.data.body);
  }

  @Post()
  async send(@Req() req: Request, @Body() body: unknown): Promise<AnnounceSent> {
    const userId = requireUser(req);
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.announce.send(parsed.data, userId);
  }
}

function requireUser(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
