import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { emailField } from '../../lib/email-schema';
import { LeadsService } from './leads.service';

// F-S1.6 — anonymous lead-capture endpoints.
//
// NO @UseGuards(AuthGuard) on POST /v1/leads — visitor is by
// definition not signed in. Spam protection is layered:
//   - Honeypot field (hidden in form; if filled = bot → silent 202)
//   - Email format validation
//   - Future: IP rate-limit guard (Phase ζ when we have BullMQ)
//
// The internal /convert endpoint is NOT exposed here — auth.controller's
// OIDC callback calls LeadsService.convertLeadToMember directly via DI.

const createSchema = z.object({
  email: emailField(200),
  city: z.string().trim().max(80).optional(),
  interestTopics: z.array(z.string().max(40)).max(20).optional(),
  sourceUrl: z.string().max(500).optional(),
  honeypot: z.string().optional(), // must be empty
  // UTM params — captured on the form via window.location.search; the
  // form stuffs them into acquisitionSource.first_touch
  acquisitionSource: z.record(z.string(), z.unknown()).optional(),
});

@Controller('v1/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() body: unknown): Promise<{ accepted: true }> {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // Honeypot: silently drop (return 202 like normal so bots can't
    // distinguish blocked from accepted).
    if (parsed.data.honeypot && parsed.data.honeypot.length > 0) {
      return { accepted: true };
    }

    await this.leads.create({
      email: parsed.data.email,
      ...(parsed.data.city ? { city: parsed.data.city } : {}),
      ...(parsed.data.interestTopics ? { interestTopics: parsed.data.interestTopics } : {}),
      ...(parsed.data.sourceUrl ? { sourceUrl: parsed.data.sourceUrl } : {}),
      ...(parsed.data.acquisitionSource
        ? { acquisitionSource: parsed.data.acquisitionSource }
        : {}),
    });

    return { accepted: true };
  }

  @Get('verify')
  async verify(
    @Query('token') token: string | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const webBase = env.WEB_BASE_URL.replace(/\/$/, '');
    if (!token) {
      res.redirect(`${webBase}/leads/verify-failed`);
      return;
    }
    const result = await this.leads.verify(token);
    if (!result) {
      res.redirect(`${webBase}/leads/verify-failed`);
      return;
    }
    res.redirect(`${webBase}/leads/verified`);
  }
}
