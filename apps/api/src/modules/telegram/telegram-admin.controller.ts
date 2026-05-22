import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { SuperAdminGuard } from '../admin-invites/super-admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { type StatusResponse, TelegramAdminService } from './telegram-admin.service';
import { type PublicConfig, TgConfigService } from './tg-config.service';

// R2 (ADR-0034) — operator-facing admin surface for configuring the
// Telegram integration. Composed with AuthGuard + SuperAdminGuard so
// it requires both a valid session token AND live `aiqadam-super-admin`
// Authentik group membership (per ADR-0035 §"No role caching in JWT").
// The cabinet UI in R3 will call these endpoints from the operator's
// browser session.
//
// Three endpoints:
//   - POST /configure     — upsert (initial setup OR re-configure)
//   - POST /rotate-token  — replace token on an existing row (404 if absent)
//   - GET  /status        — aggregated health snapshot for the status panel

const configureSchema = z.object({
  // The BotFather token. Allowed shape is validated at the service
  // layer (isBotFatherTokenShape + getMe) — here we just bound the
  // length to refuse obviously-wrong input (e.g. someone pastes a JSON
  // body or a multi-line text block).
  token: z.string().min(40).max(80),
  // Optional tenant code. ADR-0034 §Q4: one bot per platform → tenant
  // omitted → global default row. The form is here for the day we
  // revisit per-tenant bots without a schema change.
  tenant: z
    .string()
    .regex(/^[a-z]{2,8}$/, 'tenant must be 2–8 lowercase letters')
    .optional(),
});

const rotateSchema = configureSchema;

const tenantQuerySchema = z.object({
  tenant: z
    .string()
    .regex(/^[a-z]{2,8}$/, 'tenant must be 2–8 lowercase letters')
    .optional(),
});

interface ConfigureResponse {
  bot_id: string; // bigint → string for JSON safety
  bot_username: string;
  configured_at: string; // ISO-8601
  tenant: string | null;
}

function shapeConfigResponse(c: PublicConfig): ConfigureResponse {
  return {
    bot_id: c.botId.toString(),
    bot_username: c.botUsername,
    configured_at: c.configuredAt.toISOString(),
    tenant: c.tenant,
  };
}

@Controller('v1/telegram/admin')
@UseGuards(AuthGuard, SuperAdminGuard)
export class TelegramAdminController {
  constructor(
    private readonly config: TgConfigService,
    private readonly admin: TelegramAdminService,
  ) {}

  // POST /v1/telegram/admin/configure
  //   body: { token: string, tenant?: string }
  //   200:  { bot_id, bot_username, configured_at, tenant }
  //   400:  invalid token format / Telegram getMe rejected
  //   401/403: not signed in / not super_admin
  //   503:  TG_CONFIG_ENCRYPTION_KEY not set
  //
  // Idempotent on (tenant): re-POSTing replaces the existing row and
  // bumps configured_at. The previous token's encrypted blob is
  // overwritten (no historical retention — operators rotate via the
  // separate /rotate-token endpoint which records intent).
  @Post('configure')
  @HttpCode(HttpStatus.OK)
  async configure(@Req() req: Request, @Body() body: unknown): Promise<ConfigureResponse> {
    if (!req.user?.sub) {
      // SuperAdminGuard runs after AuthGuard, so req.user must be set
      // here — defensive narrowing to satisfy strict null checks +
      // surface the right status if guard order ever drifts.
      throw new UnauthorizedException('not signed in');
    }
    const parsed = configureSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const result = await this.config.configure({
      tenant: parsed.data.tenant ?? null,
      botToken: parsed.data.token,
      configuredBy: req.user.sub,
    });
    return shapeConfigResponse(result);
  }

  // POST /v1/telegram/admin/rotate-token
  //   Same body as /configure, but requires an existing tg_config row
  //   for the target tenant. Distinct endpoint so the cabinet UI
  //   surfaces a confirm modal (vs. silently first-time-setup) and so
  //   future ops/audit code can distinguish initial vs. rotation
  //   intent without inspecting the DB.
  //
  //   404 telegram_not_configured if no row exists for the tenant.
  @Post('rotate-token')
  @HttpCode(HttpStatus.OK)
  async rotateToken(@Req() req: Request, @Body() body: unknown): Promise<ConfigureResponse> {
    if (!req.user?.sub) {
      throw new UnauthorizedException('not signed in');
    }
    const parsed = rotateSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const tenant = parsed.data.tenant ?? null;
    const existing = await this.config.load(tenant);
    if (existing === null) {
      throw new NotFoundException({ error: 'telegram_not_configured' });
    }
    const result = await this.config.configure({
      tenant,
      botToken: parsed.data.token,
      configuredBy: req.user.sub,
    });
    return shapeConfigResponse(result);
  }

  // GET /v1/telegram/admin/status?tenant=<code>
  //   Aggregated health snapshot for the cabinet's status panel.
  //   Shape is StatusResponse — see telegram-admin.service.ts for the
  //   per-field semantics.
  @Get('status')
  async status(@Query() query: unknown): Promise<StatusResponse> {
    const parsed = tenantQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.admin.buildStatus(parsed.data.tenant ?? null);
  }
}
