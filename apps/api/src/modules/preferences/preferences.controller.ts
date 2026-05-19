import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  type ConsentSummary,
  PreferencesService,
  TOPIC_KEYS,
  type TopicKey,
} from './preferences.service';

// Sprint 5.5/6 — REST surface for the /me/preferences UI.
//
// GET   /v1/me/preferences/consents          → all topics + current state
// PATCH /v1/me/preferences/consents          → set one topic's state
//
// Auth: standard AuthGuard (member access token via Bearer header).

const patchSchema = z.object({
  topic: z.enum(TOPIC_KEYS as [TopicKey, ...TopicKey[]]),
  granted: z.boolean(),
});

@Controller('v1/me/preferences')
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get('consents')
  async listConsents(@Req() req: Request): Promise<{ consents: ConsentSummary[] }> {
    const userId = requireUserId(req);
    const consents = await this.preferences.list(userId);
    return { consents };
  }

  @Patch('consents')
  async setConsent(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<{ consent: ConsentSummary }> {
    const userId = requireUserId(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const consent = await this.preferences.set(userId, parsed.data.topic, parsed.data.granted);
    return { consent };
  }
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
