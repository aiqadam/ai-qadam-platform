import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { type LinkConfirmResult, type LinkStartResult, TelegramService } from './telegram.service';

// Sync surface (OpenAPI) for the AI Qadam Telegram bot + notifier per
// ADR-0034. Account-link endpoints land in this PR (A2); audit (A4),
// outbox relay (A5), and adapter (A6) follow.
//
// Two controllers on the same path prefix (A1):
//   - TelegramPublicController: ungated GET /health so the bot can
//     detect the degraded "not configured" state at boot without a
//     token. Response includes `configured: boolean`.
//   - TelegramController: everything else, gated by TelegramAuthGuard.

// ─── DTO schemas ──────────────────────────────────────────────────────────────

// Telegram user IDs are 64-bit signed; over the wire we accept either
// a number (small IDs) or a string of digits (large IDs). The service
// works in bigint.
const tgUserIdSchema = z
  .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
  .transform((v) => BigInt(v));

const linkStartSchema = z.object({
  tg_user_id: tgUserIdSchema,
  email: z.string().email().max(255),
});

const linkConfirmSchema = z.object({
  challenge_id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/, 'must be 6 digits'),
  tg_user_id: tgUserIdSchema,
  tg_username: z.string().min(1).max(64).nullable().optional(),
});

const optOutSchema = z.object({
  member_id: z.string().uuid(),
});

// ─── Public controller (ungated) ──────────────────────────────────────────────

@Controller('v1/telegram')
export class TelegramPublicController {
  // Ungated health probe. The bot hits this at boot to learn whether
  // the platform considers telegram configured.
  @Get('health')
  health(): {
    ok: true;
    module: 'telegram';
    version: 'v1';
    configured: boolean;
  } {
    return {
      ok: true,
      module: 'telegram',
      version: 'v1',
      configured: Boolean(env.TELEGRAM_BOT_SERVICE_TOKEN),
    };
  }
}

// ─── Gated controller ─────────────────────────────────────────────────────────

@Controller('v1/telegram')
@UseGuards(TelegramAuthGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('whoami')
  whoami(): { authenticated: true; module: 'telegram' } {
    return { authenticated: true, module: 'telegram' };
  }

  // POST /v1/telegram/link/start — bot's /link FSM step 1.
  @Post('link/start')
  @HttpCode(HttpStatus.OK)
  async linkStart(@Body() body: unknown): Promise<{
    challenge_id: string;
    sent_to_email_masked: string;
  }> {
    const parsed = linkStartSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const result: LinkStartResult = await this.telegram.startLink(
      parsed.data.tg_user_id,
      parsed.data.email,
    );
    return {
      challenge_id: result.challengeId,
      sent_to_email_masked: result.sentToEmailMasked,
    };
  }

  // POST /v1/telegram/link/confirm — bot's /link FSM step 2.
  @Post('link/confirm')
  @HttpCode(HttpStatus.OK)
  async linkConfirm(@Body() body: unknown): Promise<{
    member_id: string;
    tenant: string;
  }> {
    const parsed = linkConfirmSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const result: LinkConfirmResult = await this.telegram.confirmLink({
      challengeId: parsed.data.challenge_id,
      code: parsed.data.code,
      tgUserId: parsed.data.tg_user_id,
      tgUsername: parsed.data.tg_username ?? null,
    });
    return { member_id: result.memberId, tenant: result.tenant };
  }

  // POST /v1/telegram/opt-out — explicit user opt-out from broadcasts.
  @Post('opt-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  async optOut(@Body() body: unknown): Promise<void> {
    const parsed = optOutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    await this.telegram.optOut(parsed.data.member_id);
  }
}
