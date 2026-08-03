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
  type ChannelToggles,
  type ConsentSummary,
  PreferencesService,
  TOPIC_KEYS,
  type TopicKey,
} from './preferences.service';

// Sprint 5.5/6 — REST surface for the /me/preferences UI.
//
// GET   /v1/me/preferences/consents          → all topics + current state + channel toggles (FR-NTF-005)
// PATCH /v1/me/preferences/consents          → set topic state OR channel toggles (FR-NTF-005)
//
// Auth: standard AuthGuard (member access token via Bearer header).

const patchSchema = z
  .object({
    topic: z.enum(TOPIC_KEYS as [TopicKey, ...TopicKey[]]).optional(),
    granted: z.boolean().optional(),
    // FR-NTF-005 — channel toggles
    notification_email_enabled: z.boolean().optional(),
    notification_telegram_enabled: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Either (topic + granted) OR (channel toggles), not both
      const hasTopicData = data.topic !== undefined && data.granted !== undefined;
      const hasChannelData =
        data.notification_email_enabled !== undefined ||
        data.notification_telegram_enabled !== undefined;
      return hasTopicData !== hasChannelData; // XOR
    },
    { message: 'Provide either (topic + granted) or channel toggles, not both' },
  );

@Controller('v1/me/preferences')
@UseGuards(AuthGuard)
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get('consents')
  async listConsents(
    @Req() req: Request,
  ): Promise<{ consents: ConsentSummary[]; channels: ChannelToggles }> {
    const userId = requireUserId(req);
    const consents = await this.preferences.list(userId);
    const channels = await this.preferences.getChannelToggles(userId); // FR-NTF-005
    return { consents, channels };
  }

  @Patch('consents')
  async setConsent(
    @Req() req: Request,
    @Body() body: unknown,
  ): Promise<{ consent?: ConsentSummary; channels?: ChannelToggles }> {
    const userId = requireUserId(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // FR-NTF-005 — handle channel toggles OR topic consent
    if (parsed.data.topic !== undefined && parsed.data.granted !== undefined) {
      const consent = await this.preferences.set(userId, parsed.data.topic, parsed.data.granted);
      return { consent };
    }
    // Filter out undefined properties for exactOptionalPropertyTypes compatibility
    const toggles: Partial<ChannelToggles> = {};
    if (parsed.data.notification_email_enabled !== undefined) {
      toggles.notification_email_enabled = parsed.data.notification_email_enabled;
    }
    if (parsed.data.notification_telegram_enabled !== undefined) {
      toggles.notification_telegram_enabled = parsed.data.notification_telegram_enabled;
    }
    const channels = await this.preferences.setChannelToggles(userId, toggles);
    return { channels };
  }
}

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new UnauthorizedException('no claims attached');
  }
  return req.user.sub;
}
