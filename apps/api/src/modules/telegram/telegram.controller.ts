import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { track } from '../../lib/ops-events';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { type CheckinResult, TelegramCheckinService } from './telegram-checkin.service';
import { type EventSummary, TelegramEventsService } from './telegram-events.service';
import { type MeRegistration, TelegramMeService } from './telegram-me.service';
import {
  type ProfileDefaultsResult,
  TelegramProfileDefaultsService,
} from './telegram-profile-defaults.service';
import {
  type RegistrationSchema,
  TelegramRegistrationSchemaService,
} from './telegram-registration-schema.service';
import {
  type MemberLookupResult,
  type RegistrationResult,
  TelegramRegistrationsService,
} from './telegram-registrations.service';
import {
  type LinkConfirmResult,
  type LinkStartResult,
  type MemberByTgResult,
  type RecordSendAuditResult,
  SEND_OUTCOMES,
  TelegramService,
} from './telegram.service';
import { TgConfigService } from './tg-config.service';

// Phase Bot-B PR-1.3b — registration submit body. Bot's pydantic
// RegisterForEventInput pins the field names; rename here breaks
// contract tests in sibling repo.
const registerSchema = z.object({
  event_id: z.string().uuid(),
  telegram_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .transform((v) => BigInt(v)),
  telegram_username: z.string().min(1).max(64).nullable().optional(),
  profile: z.record(z.unknown()),
  consents: z.record(z.boolean()),
});

const emailParamSchema = z.string().email().max(255);

// Phase Bot-B PR-1.2b — schema endpoint path param. Accepts both real
// slugs and uuid fallbacks per the rowToSummary slug-or-id contract.
const slugOrIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_\-]+$/, 'slug must be url-safe alphanumeric');

// Phase Bot-B PR-2 path param — TG user ids are int64; we accept the
// digit-string form and convert via BigInt for the service.
const tgUserIdParamSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'tg_user_id must be a positive integer string')
  .transform((v) => BigInt(v));

// aiqadam#290 — ISO date YYYY-MM-DD. We accept just the date part to
// keep the URL clean; the service expands to ≥ midnight / ≤ end-of-day.
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
// Bool from query strings — `?open_only=true|false|1|0`.
const queryBoolSchema = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

// aiqadam#281 — /me/registrations query param. Same tg_user_id zod shape
// as the other endpoints; required here (no anonymous /me).
const meQuerySchema = z.object({
  tg_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .transform((v) => BigInt(v)),
});

const eventsQuerySchema = z.object({
  // aiqadam#290 — accept full ISO 3166-1 alpha-2 too (was 2-8 before;
  // tightening keeps the existing tenant codes valid + rejects garbage).
  tenant: z
    .string()
    .regex(/^[a-z]{2,8}$/, 'tenant must be 2–8 lowercase letters')
    .optional(),
  country: z
    .string()
    .regex(/^[a-z]{2}$/, 'country must be ISO-3166-1 alpha-2 lowercase')
    .optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  format: z.string().min(1).max(50).optional(),
  open_only: queryBoolSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  // aiqadam#288 — substring search across title/description/short_description.
  // Trimmed by zod; empty / whitespace-only = no-op.
  q: z.string().trim().min(1).max(200).optional(),
  // aiqadam#287 — when provided, each EventSummary is annotated with
  // is_registered + registration_id (when registered). Omit for the
  // anonymous-browse case; the response shape stays unchanged for
  // backward compatibility.
  tg_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .optional()
    .transform((v) => (v == null ? null : BigInt(v))),
});

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

const botTokenQuerySchema = z.object({
  tenant: z
    .string()
    .regex(/^[a-z]{2,8}$/, 'tenant must be 2–8 lowercase letters')
    .optional(),
});

// Contract pinned by the Python bot's BotTokenResponse pydantic model
// (sibling repo: src/aiqadam_telegram_bot/shared/aiqadam_client.py). Do
// not rename fields without coordinating a cross-repo PR — the bot's
// contract regression test asserts these exact names.
interface BotTokenResponse {
  bot_token: string;
  bot_id: string; // bigint → string for JSON safety
  bot_username: string;
}

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

// F-R4 — Plausible relay. Bot fires lifecycle/UX events via this
// endpoint; the API forwards them to Plausible via the shared ops-events
// helper. Names are whitelisted to the `tg.bot.` / `tg.notifier.`
// prefix so a compromised bot can't forge `auth.failed` etc.
//
// Prop values are coerced to strings server-side by ops-events; we accept
// strings + numbers here for ergonomic client code (the bot has typed
// payloads with ints).
const eventSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(
      /^tg\.(bot|notifier)\.[a-z0-9_.]{1,60}$/,
      'name must start with tg.bot. or tg.notifier. + lowercase identifier',
    ),
  props: z.record(z.union([z.string().max(2000), z.number().finite()])).optional(),
});

// ─── Public controller (ungated) ──────────────────────────────────────────────

@Controller('v1/telegram')
export class TelegramPublicController {
  constructor(
    private readonly events: TelegramEventsService,
    private readonly schemas: TelegramRegistrationSchemaService,
  ) {}

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

  // GET /v1/telegram/events?tenant=<code>
  //   Anonymous-browsing surface — UNGATED so the bot's event-first
  //   /start (sibling repo PR #19) can render a list before the user
  //   has linked / registered. Returns the same events the public
  //   web shows: status=published, visibility_scope=public,
  //   starts_at in the future.
  //
  //   Response shape matches the bot's EventSummary pydantic model
  //   (sibling repo src/aiqadam_telegram_bot/shared/aiqadam_client.py).
  //   Do not rename fields without coordinating a cross-repo PR.
  //
  //   200: { items: [{ id, slug, title, starts_at, location, country,
  //                    registration_open }] }
  //   400: bad tenant param
  @Get('events')
  async listEvents(@Query() query: unknown): Promise<{ items: EventSummary[] }> {
    const parsed = eventsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // aiqadam#290 — `country` supersedes `tenant` when both present
    // (per the spec; `tenant` stays for backwards-compatibility with the
    // existing aiqadam#287 contract until we deprecate it).
    const items = await this.events.listOpenEvents({
      tenant: parsed.data.country ?? parsed.data.tenant ?? null,
      tgUserId: parsed.data.tg_user_id,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      format: parsed.data.format ?? null,
      openOnly: parsed.data.open_only ?? false,
      q: parsed.data.q ?? null,
      limit: parsed.data.limit ?? 50,
    });
    return { items };
  }

  // GET /v1/telegram/events/{slug}/registration-schema
  //   Phase Bot-B PR-1.2b. UNGATED — the bot fetches this without a
  //   service token so anonymous users can see the form before signing
  //   in (acquisition-channel rule per feedback memory).
  //
  //   Returns the operator-defined per-event schema (PR-1.2a column)
  //   OR a minimum-viable default (name + email + events consent +
  //   optional newsletter) when null.
  //
  //   Slug param accepts both real slugs (most events post-F-S3.10-a)
  //   and uuid strings (PR-4 EventSummary's slug-fallback).
  //
  //   200: { event, fields[], consents[] }
  //   400: malformed slug param
  //   404 { error: 'event_not_found' }: no event with this slug or id
  @Get('events/:slug/registration-schema')
  async eventRegistrationSchema(@Param('slug') slug: string): Promise<RegistrationSchema> {
    const parsed = slugOrIdSchema.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.schemas.getSchema(parsed.data);
  }
}

// ─── Gated controller ─────────────────────────────────────────────────────────

@Controller('v1/telegram')
@UseGuards(TelegramAuthGuard)
export class TelegramController {
  constructor(
    private readonly telegram: TelegramService,
    private readonly config: TgConfigService,
    private readonly registrations: TelegramRegistrationsService,
    private readonly me: TelegramMeService,
    private readonly profileDefaults: TelegramProfileDefaultsService,
    private readonly checkinService: TelegramCheckinService,
  ) {}

  @Get('whoami')
  whoami(): { authenticated: true; module: 'telegram' } {
    return { authenticated: true, module: 'telegram' };
  }

  // GET /v1/telegram/me/registrations?tg_user_id=<id>
  //   aiqadam#281 Part 1. Powers the bot's /me command — lists the
  //   caller's upcoming + past registrations (future first, closest
  //   starts_at first; then past, most-recent first). Cancelled rows
  //   excluded.
  //
  //   200: { items: [{ registration_id, event, checked_in_at, qr_token,
  //                    web_url }] }
  //   400: bad / missing tg_user_id param
  //   401/503: TelegramAuthGuard
  //
  //   Empty items array is normal — bot renders "No registrations yet"
  //   and offers /events.
  @Get('me/registrations')
  async meRegistrations(@Query() query: unknown): Promise<{ items: MeRegistration[] }> {
    const parsed = meQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const items = await this.me.listMyRegistrations(parsed.data.tg_user_id);
    return { items };
  }

  // POST /v1/telegram/checkin/:token
  //   aiqadam#280. Event-day check-in via QR/deeplink. Idempotent on the
  //   status='attended' transition — replay returns first_checkin=false
  //   with the original timestamp.
  //
  //   200: { member_id, event_id, event_title, checked_in_at, first_checkin }
  //   400: malformed token (zod)
  //   404: { error: 'checkin_token_not_found' }
  //   409: { error: 'event_not_started' } — operator-defined window
  //        (currently 60min before starts_at)
  //   410: { error: 'event_ended' } — past ends_at
  //   401/503: TelegramAuthGuard
  @Post('checkin/:token')
  @HttpCode(HttpStatus.OK)
  async checkinByToken(@Param('token') token: string): Promise<CheckinResult> {
    // Token shape: 1-128 url-safe chars. The existing checkin_code field
    // is a uuid for codes minted via the web (Sprint 1) but we don't
    // enforce uuid here so the bot can mint shorter tokens later.
    const parsed = z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_\-]+$/)
      .safeParse(token);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.checkinService.checkin(parsed.data);
  }

  // GET /v1/telegram/members/by-tg/:id
  //   Phase Bot-B PR-2. Reverse-resolves a Telegram user id to the
  //   linked AI Qadam member. Used by the bot's /stop opt-out flow (so
  //   the bot doesn't need the member's email) and by /start to render
  //   "welcome back, {name}".
  //
  //   200: { member_id, tenant, display_name, telegram_user_id,
  //          telegram_opted_out_at }
  //   400: tg_user_id not a positive integer
  //   404: no member with this tg_user_id (caller decides UX —
  //        unlinked-user path vs. error)
  //   401/503: TelegramAuthGuard (bad service token / not configured)
  @Get('members/by-tg/:id')
  async memberByTg(@Param('id') id: string): Promise<MemberByTgResult> {
    const parsed = tgUserIdParamSchema.safeParse(id);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.telegram.resolveMemberByTgUserId(parsed.data);
  }

  // GET /v1/telegram/members/lookup-by-email/:email
  //   Phase Bot-B PR-1.3b. Silent member match used by the bot's
  //   /register_<slug> FSM before walking the schema fields.
  //
  //   200: { member_id, display_name }
  //   400: email param malformed
  //   404 { error: 'member_not_found' }: bot treats as new-user — proceed
  //        to "new member" treatment in the registration flow
  //   401/503: TelegramAuthGuard
  @Get('members/lookup-by-email/:email')
  async memberLookupByEmail(@Param('email') email: string): Promise<MemberLookupResult> {
    const parsed = emailParamSchema.safeParse(email);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.registrations.lookupByEmail(parsed.data);
  }

  // GET /v1/telegram/members/:memberId/profile-defaults
  //   aiqadam#292. Returns the member's saved profile data so the bot
  //   can pre-fill the registration form for returning members. Keys
  //   align with registration-schema field `key`s so the bot can iterate
  //   the schema and pre-fill any matching keys without per-field logic.
  //
  //   200: { defaults: { name, email, ...custom fields from last registration } }
  //   400: malformed member_id (not a uuid)
  //   404: { error: 'member_not_found' }
  //   401/503: TelegramAuthGuard
  //
  //   Fields without a saved value are OMITTED (not null) — "present +
  //   empty" is intentionally distinct from "never set".
  @Get('members/:memberId/profile-defaults')
  async profileDefaultsForMember(
    @Param('memberId') memberId: string,
  ): Promise<ProfileDefaultsResult> {
    const parsed = z.string().uuid().safeParse(memberId);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.profileDefaults.getDefaults(parsed.data);
  }

  // POST /v1/telegram/registrations
  //   Phase Bot-B PR-1.3b — the activation moment. The bot submits the
  //   completed form here; aiqadam validates against the live schema,
  //   silently matches the email to an existing member OR creates a
  //   new Directus member (Telegram-as-IdP), inserts the registration,
  //   and records consents.
  //
  //   Body shape pinned by bot's pydantic RegisterForEventInput model.
  //
  //   201: { registration_id, member_id, was_new_member, qr_token,
  //          starts_at, title }
  //   400: schema validation failed (field required / wrong type / etc.)
  //        or registration_closed / event_not_published / consent_required
  //   404: event_id does not match any event
  //   409: { error: 'already_registered', registration_id, member_id }
  //        — caller renders "you're already in" rather than retry
  //   401/503: TelegramAuthGuard
  @Post('registrations')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown): Promise<RegistrationResult> {
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.registrations.register({
      event_id: parsed.data.event_id,
      telegram_user_id: parsed.data.telegram_user_id,
      telegram_username: parsed.data.telegram_username ?? null,
      profile: parsed.data.profile,
      consents: parsed.data.consents,
    });
  }

  // GET /v1/telegram/admin/bot-token?tenant=<code>
  //   Service-token-gated (TelegramAuthGuard). The BOT is the caller —
  //   it polls this at boot and after a bot:reload_requested tick to
  //   pick up a freshly-configured or rotated BotFather token without
  //   restarting via Coolify env. Path includes "admin/" because it
  //   shares the configuration namespace with the human-operator admin
  //   endpoints; gate is the m2m service token, not a session.
  //
  //   200: { bot_token, bot_id, bot_username }
  //   404 { error: 'telegram_not_configured' } — bot interprets this
  //        as "no row yet; exit clean, docker will restart, try again".
  //        Use 400/403/422 for other failure modes; 404 is reserved.
  //   401/503: TelegramAuthGuard (bad/missing service token; degraded).
  @Get('admin/bot-token')
  async getBotToken(@Query() query: unknown): Promise<BotTokenResponse> {
    const parsed = botTokenQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const cfg = await this.config.loadWithDecryptedToken(parsed.data.tenant ?? null);
    if (cfg === null) {
      throw new NotFoundException({ error: 'telegram_not_configured' });
    }
    return {
      bot_token: cfg.decryptedToken,
      bot_id: cfg.botId.toString(),
      bot_username: cfg.botUsername,
    };
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
    // F-R4 — first-write only; the helper drops re-deliveries via
    // delivery_key UNIQUE. Counting only inserts keeps the dashboard
    // honest about distinct dispatches vs notifier retries.
    if (result.inserted) {
      void track('tg.send.audited', { outcome: parsed.data.outcome });
    }
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
    void track('tg.member.opted_out', {});
  }

  // F-R4 — Plausible event relay. Bot fires lifecycle/UX events
  // (link-flow funnel, message receipts, opt-out clicks) via this
  // endpoint instead of holding a Plausible API key. Name whitelisted
  // to `tg.bot.*` / `tg.notifier.*` so a compromised bot can't forge
  // signals like `auth.failed`.
  //
  // Path is `admin/event` because it shares the configuration namespace
  // with the other bot-facing admin endpoints (`admin/bot-token`); the
  // bot client's `track_event` calls /v1/telegram/admin/event verbatim
  // (sibling repo PR #10). Gate is the m2m service token, not a session.
  //
  //   200/202: event accepted (Plausible call is fire-and-forget per
  //            the ops-events contract — never throws, never blocks).
  //   400: invalid name or props shape.
  //   401/503: TelegramAuthGuard (bad service token / not configured).
  @Post('admin/event')
  @HttpCode(HttpStatus.ACCEPTED)
  async event(@Body() body: unknown): Promise<{ accepted: true }> {
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    void track(parsed.data.name, parsed.data.props ?? {});
    return { accepted: true };
  }
}
