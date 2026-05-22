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
import {
  type LinkConfirmResult,
  type LinkStartResult,
  type RecordSendAuditResult,
  SEND_OUTCOMES,
  TelegramService,
} from './telegram.service';

// Sync surface (OpenAPI) for the AI Qadam Telegram bot + notifier per
// ADR-0034. Two controllers on the same path prefix (A1):
//   - TelegramPublicController: ungated GET /health so the bot can
//     detect the degraded "not configured" state at boot without a
//     token. Response includes `configured: boolean`.
//   - TelegramController: everything else, gated by TelegramAuthGuard.

// ─── DTO schemas ──────────────────────────────────────────────────────────────

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

// Audit shape mirrors the notifier's Envelope payload — message_id is
// optional and accepts string-or-number for the bigint round-trip.
const auditSchema = z.object({
  delivery_key: z.string().min(8).max(128),
  envelope_id: z.string().uuid(),
  outcome: z.enum(SEND_OUTCOMES),
  detail: z.string().max(1024).nullable().optional(),
  message_id: z
    .union([z.number().int().finite(), z.string().regex(/^-?\d+$/)])
    .nullable()
    .optional()
    .transform((v) => (v == null ? null : BigInt(v))),
});

// ─── Public controller (ungated) ──────────────────────────────────────────────

@Controller('v1/telegram')
export class TelegramPublicController {
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

  // POST /v1/telegram/audit — notifier writes every send outcome here.
  // Idempotent on delivery_key.
  @Post('audit')
  @HttpCode(HttpStatus.OK)
  async audit(@Body() body: unknown): Promise<{
    accepted: true;
    inserted: boolean;
    existing_outcome: string | null;
  }> {
    const parsed = auditSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const result: RecordSendAuditResult = await this.telegram.recordSendAudit({
      deliveryKey: parsed.data.delivery_key,
      envelopeId: parsed.data.envelope_id,
      outcome: parsed.data.outcome,
      detail: parsed.data.detail ?? null,
      messageId: parsed.data.message_id,
    });
    return {
      accepted: true,
      inserted: result.inserted,
      existing_outcome: result.existingOutcome,
    };
  }

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
