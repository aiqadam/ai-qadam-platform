import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { track } from '../../lib/ops-events';
import { TelegramAuthGuard } from './telegram-auth.guard';
import { type CheckinResult, TelegramCheckinService } from './telegram-checkin.service';
import { type EventTopic, TelegramEventTopicsService } from './telegram-event-topics.service';
import {
  type EventDetail,
  type EventSummary,
  TelegramEventsService,
} from './telegram-events.service';
import {
  FEEDBACK_CATEGORIES,
  type FeedbackResult,
  MAX_MESSAGE_LENGTH,
  TelegramFeedbackService,
} from './telegram-feedback.service';
import {
  type FormSubmissionResult,
  type FormSummary,
  TelegramFormsService,
} from './telegram-forms.service';
import { type MeRegistration, TelegramMeService } from './telegram-me.service';
import {
  type PreferencesResult,
  SUPPORTED_LANGUAGES,
  TelegramPreferencesService,
} from './telegram-preferences.service';
import {
  type ProfileDefaultsResult,
  TelegramProfileDefaultsService,
} from './telegram-profile-defaults.service';
import {
  type RegistrationSchema,
  TelegramRegistrationSchemaService,
} from './telegram-registration-schema.service';
import {
  type CancelResult,
  type MemberLookupResult,
  type RegistrationResult,
  TelegramRegistrationsService,
} from './telegram-registrations.service';
import {
  type SpeakerDetail,
  type SpeakerSummary,
  TelegramSpeakersService,
} from './telegram-speakers.service';
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

// aiqadam#324 — DELETE /registrations/:id body. Same tg_user_id shape
// as the other endpoints; required as the ownership claim.
const cancelRegistrationSchema = z.object({
  telegram_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .transform((v) => BigInt(v)),
});

// aiqadam#308 — POST /invites/redeem body (stub validates shape;
// service swap happens when the referral system lands).
const invitesRedeemSchema = z.object({
  token: z.string().min(1).max(128),
  telegram_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .transform((v) => BigInt(v)),
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

// aiqadam#344 — POST /feedback body. tg_user_id is required; the other
// fields mirror the bot's pydantic FeedbackInput. Service does deeper
// validation (rate-limit + non-empty-after-trim) before persisting.
const feedbackSubmitSchema = z.object({
  tg_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .transform((v) => BigInt(v)),
  tg_username: z.string().min(1).max(64).nullable().optional(),
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  context: z
    .object({
      event_id: z.string().uuid().optional(),
      registration_id: z.string().uuid().optional(),
    })
    .optional(),
  correlation_id: z.string().uuid().optional(),
});

// aiqadam#289 — PATCH /preferences body. All keys optional (partial body).
// Tight zod shapes for client-side errors; service does deeper validation
// against the known opt-in keys + IANA tz shape.
const preferencesPatchSchema = z
  .object({
    language: z.enum(SUPPORTED_LANGUAGES).optional(),
    timezone: z.string().min(1).max(64).optional(),
    notification_opt_ins: z.record(z.boolean()).optional(),
  })
  .strict();

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
  // aiqadam#323 — filter to events tagged with this curated taxonomy
  // slug. Slug shape only (validation against the curated list is
  // intentionally absent — unknown slugs simply return empty, which
  // is the right UX for "no events tagged X yet").
  topic: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'topic must be a lowercase slug')
    .optional(),
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

// aiqadam#291 — list-speakers query. Both filters optional; country
// matches the 2-letter ISO code on `speakers.country`.
const speakersListQuerySchema = z.object({
  country: z
    .string()
    .regex(/^[a-z]{2}$/, 'country must be ISO-3166-1 alpha-2 lowercase')
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

// aiqadam forms — POST /forms/{slug}/submissions body. Wire shape pinned
// by the future cabinet builder + bot UX; rename here ripples.
const formSubmissionSchema = z.object({
  is_anonymous: z.boolean(),
  telegram_user_id: z
    .union([z.number().int().positive().finite(), z.string().regex(/^[1-9]\d*$/)])
    .optional()
    .transform((v) => (v == null ? null : BigInt(v))),
  payload: z.record(z.unknown()),
  source: z.enum(['web', 'bot', 'email']).optional(),
  language: z.string().min(1).max(8).optional(),
  event_id: z.string().uuid().optional(),
});

@Controller('v1/telegram')
export class TelegramPublicController {
  constructor(
    private readonly events: TelegramEventsService,
    private readonly schemas: TelegramRegistrationSchemaService,
    private readonly speakers: TelegramSpeakersService,
    private readonly eventTopics: TelegramEventTopicsService,
    private readonly forms: TelegramFormsService,
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
  async listEvents(
    @Query() query: unknown,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<{ items: EventSummary[] }> {
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
      topic: parsed.data.topic ?? null,
      limit: parsed.data.limit ?? 50,
      // aiqadam#326 PR-b — Accept-Language → locale substitution. The
      // service normalises the header (en|ru|uz | unknown→en); we pass
      // the raw string through and let the service own the policy.
      locale: acceptLanguage ?? null,
    });
    return { items };
  }

  // GET /v1/telegram/event-topics
  //   aiqadam#323. Curated taxonomy used by the bot's topic-picker.
  //   Returns the same list of slugs operators tag events with
  //   (events.topic_tags) — the bot uses this for the chip-picker UI
  //   and the displayed labels.
  //
  //   Unauth (TelegramAuthGuard still applies — same surface as /events).
  //   Future: honors Accept-Language per #318 once shipped.
  @Get('event-topics')
  listEventTopics(@Headers('accept-language') acceptLanguage?: string): { items: EventTopic[] } {
    // aiqadam#326 PR-c — service normalises ('ru,en;q=0.9' → 'ru', etc.)
    return { items: this.eventTopics.list(acceptLanguage ?? null) };
  }

  // GET /v1/telegram/events/{slug}?tg_user_id=<optional>
  //   aiqadam#279. Rich event detail powering the bot's "📖 Details"
  //   inline button. UNGATED for the same reason as the list/schema
  //   endpoints — TG is an ACQUISITION channel; a user must be able to
  //   browse a full event page before /link (Telegram-as-IdP).
  //
  //   Slug-or-id contract matches the other event endpoints. When
  //   tg_user_id is provided, the response is annotated with
  //   is_registered + registration_id (same pattern as listEvents).
  //
  //   200: full EventDetail (see telegram-events.service.ts for shape)
  //   400: malformed slug param
  //   404: { error: 'event_not_found' } — slug doesn't match a
  //        published/public event (draft / cancelled also 404 so we
  //        don't leak operator-internal state)
  @Get('events/:slug')
  async eventDetail(
    @Param('slug') slug: string,
    @Query('tg_user_id') tgUserIdRaw?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<EventDetail> {
    const parsed = slugOrIdSchema.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    let tgUserId: bigint | null = null;
    if (tgUserIdRaw !== undefined && tgUserIdRaw !== '') {
      const parsedTg = tgUserIdParamSchema.safeParse(tgUserIdRaw);
      if (!parsedTg.success) {
        throw new BadRequestException(parsedTg.error.flatten());
      }
      tgUserId = parsedTg.data;
    }
    return this.events.getEventDetail(parsed.data, tgUserId, acceptLanguage ?? null);
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

  // GET /v1/telegram/forms/{slug}
  //   aiqadam forms-builder. Returns a published form template (the
  //   operator-defined schema). UNGATED — public-link or share-by-URL
  //   forms work without auth.
  //
  //   200: FormSummary (see telegram-forms.service.ts)
  //   400: malformed slug
  //   404: { error: 'form_not_found' } — draft / archived forms also 404
  @Get('forms/:slug')
  async getForm(@Param('slug') slug: string): Promise<FormSummary> {
    const parsed = slugOrIdSchema.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.forms.getFormBySlug(parsed.data);
  }

  // GET /v1/telegram/events/{slug}/survey
  //   Convenience for the bot's post-event flow. Returns the form
  //   attached via events.post_event_survey_form. 404s when the event
  //   has no in-house survey attached (bot falls back to
  //   events.feedback_survey_url external URL).
  //
  //   200: FormSummary
  //   400: malformed slug
  //   404: { error: 'event_not_found' | 'event_survey_not_attached' }
  @Get('events/:slug/survey')
  async getEventSurvey(@Param('slug') slug: string): Promise<FormSummary> {
    const parsed = slugOrIdSchema.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.forms.getEventSurvey(parsed.data);
  }

  // POST /v1/telegram/forms/{slug}/submissions
  //   Submit a form. UNGATED — anonymous submissions are first-class.
  //
  //   Body: { is_anonymous, telegram_user_id?, payload, source?,
  //           language?, event_id? }
  //
  //   Privacy contract:
  //   - is_anonymous=true → member + tg_user_id null on persist
  //     regardless of what the client sent (defense-in-depth)
  //   - is_anonymous=false REQUIRES telegram_user_id in v1
  //     (web-attributed flow comes with PR-C + Authentik session)
  //
  //   200: { submission_id, submitted_at }
  //   400: payload validation failure (field_required, field_wrong_type,
  //        field_too_long, field_out_of_range, field_unknown_option,
  //        attribution_required, payload_must_be_object)
  //   403: { error: 'anonymous_not_allowed' } — operator-level toggle
  //   404: { error: 'form_not_found' }
  @Post('forms/:slug/submissions')
  @HttpCode(HttpStatus.OK)
  async submitForm(
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<FormSubmissionResult> {
    const parsedSlug = slugOrIdSchema.safeParse(slug);
    if (!parsedSlug.success) {
      throw new BadRequestException(parsedSlug.error.flatten());
    }
    const parsed = formSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.forms.submitForm(parsedSlug.data, parsed.data);
  }

  // GET /v1/telegram/speakers?country=<code>&limit=<n>
  //   aiqadam#291. Lists active speakers — powers the bot's /speakers
  //   command. UNGATED for the same acquisition-channel rule as events.
  //
  //   200: { items: [{ id, slug, name, title, avatar_url }] }
  //   400: malformed country / limit param
  //
  //   Speakers without a usable display name (placeholder rows with
  //   first/last/email all null) are silently dropped — operators see
  //   them in the cabinet but they don't render in the bot.
  @Get('speakers')
  async listSpeakers(
    @Query() query: unknown,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<{ items: SpeakerSummary[] }> {
    const parsed = speakersListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.speakers.listSpeakers({
      country: parsed.data.country ?? null,
      limit: parsed.data.limit ?? 20,
      // aiqadam#326 PR-c — speakers.translations substitution
      locale: acceptLanguage ?? null,
    });
  }

  // GET /v1/telegram/speakers/{slug}
  //   aiqadam#291. Single speaker detail — bio + social_links + the
  //   speaker's confirmed upcoming sessions. UNGATED.
  //
  //   Slug param accepts both real slugs (post-#318 backfill) and uuid
  //   fallback (existing speakers with slug=NULL).
  //
  //   200: SpeakerDetail (see telegram-speakers.service.ts for shape)
  //   400: malformed slug param
  //   404: { error: 'speaker_not_found' } — also returned for archived /
  //        pending status to avoid leaking operator-internal state
  @Get('speakers/:slug')
  async speakerDetail(
    @Param('slug') slug: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<SpeakerDetail> {
    const parsed = slugOrIdSchema.safeParse(slug);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.speakers.getSpeakerDetail(parsed.data, acceptLanguage ?? null);
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
    private readonly preferences: TelegramPreferencesService,
    private readonly feedback: TelegramFeedbackService,
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

  // GET/PATCH /v1/telegram/members/:memberId/preferences
  //   aiqadam#289. Member's UI prefs (language, timezone, opt-ins) used
  //   by the bot's /settings screen. Null-stored fields resolve to spec
  //   defaults: language="en", timezone=countries.tz for member.country,
  //   notification_opt_ins={events:true, newsletter:false, community:true}.
  //
  //   GET   200 { language, timezone, notification_opt_ins }
  //         400 member_id not a uuid
  //         404 { error: 'member_not_found' }
  //
  //   PATCH (partial body — bot only sends changed keys)
  //         200 { language, timezone, notification_opt_ins }  (full doc)
  //         400 { error: 'invalid_language', allowed: [...] }
  //         400 { error: 'invalid_timezone' }
  //         400 { error: 'unknown_opt_in_key', key, allowed: [...] }
  //         404 { error: 'member_not_found' }
  //   401/503: TelegramAuthGuard
  @Get('members/:memberId/preferences')
  async getPreferences(@Param('memberId') memberId: string): Promise<PreferencesResult> {
    const parsed = z.string().uuid().safeParse(memberId);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.preferences.get(parsed.data);
  }

  @Patch('members/:memberId/preferences')
  @HttpCode(HttpStatus.OK)
  async patchPreferences(
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ): Promise<PreferencesResult> {
    const parsedId = z.string().uuid().safeParse(memberId);
    if (!parsedId.success) {
      throw new BadRequestException(parsedId.error.flatten());
    }
    const parsedBody = preferencesPatchSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException(parsedBody.error.flatten());
    }
    return this.preferences.patch(parsedId.data, parsedBody.data);
  }

  // POST /v1/telegram/feedback
  //   aiqadam#344. Bot user free-form feedback / questions / bug reports.
  //   Persists to the Directus `feedback` collection AND emails the
  //   operator-configured FEEDBACK_RECIPIENT_EMAIL.
  //
  //   Rate-limited per tg_user_id (5/hour) to protect the operator inbox.
  //
  //   200: { feedback_id, submitted_at }
  //   400: { error: 'message_too_long' | 'message_empty' } or zod failure
  //   429: { error: 'rate_limited', limit, window_ms }
  //   401/503: TelegramAuthGuard
  @Post('feedback')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(@Body() body: unknown): Promise<FeedbackResult> {
    const parsed = feedbackSubmitSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.feedback.submit(parsed.data);
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

  // DELETE /v1/telegram/registrations/:registration_id
  //   Body: { telegram_user_id: bigint }
  //   200: { registration_id, event:{id,title}, cancelled_at }
  //   400: { error: 'invalid_body' } — telegram_user_id missing/wrong type
  //   403: { error: 'not_your_registration' }
  //   404: { error: 'registration_not_found' }
  //   409: { error: 'event_started' }
  //   410: { error: 'already_cancelled' }
  //
  // Why body-with-tg_user_id rather than path-param + service-trust:
  // the bot's m2m service token can act on any user's behalf — we
  // need an explicit ownership claim so the bot can't accidentally
  // cancel the wrong row. Contract per aiqadam#324.
  @Delete('registrations/:registrationId')
  @HttpCode(HttpStatus.OK)
  async cancelRegistration(
    @Param('registrationId') registrationId: string,
    @Body() body: unknown,
  ): Promise<CancelResult> {
    const parsed = cancelRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.registrations.cancel(registrationId, parsed.data.telegram_user_id);
  }

  // POST /v1/telegram/invites/redeem
  //
  // aiqadam#308 (part 2). The full referral system (member_invites
  // mint flow + perks taxonomy + admin UI + perk-application logic)
  // is non-trivial and unbuilt. This stub returns a structured 410
  // so the bot can distinguish "feature not yet shipped" from
  // "route missing" (which was the 404 the bot got pre-stub).
  //
  // Contract preserved for the future implementation:
  //   POST /v1/telegram/invites/redeem
  //   Body: { token: string, telegram_user_id: int|string }
  //
  //   410: { error: 'feature_not_enabled', reason: 'referral_system_pending_design' }
  //   (future) 200: { invited_by, perk, redeemer }
  //
  // Bot handler treats 410 as "graceful no-op" — opens the deeplink
  // without applying any perk. See aiqadam-telegram-bot's
  // invite_redeem_handler for the consumer-side shape.
  @Post('invites/redeem')
  @HttpCode(HttpStatus.GONE)
  redeemInviteStub(@Body() body: unknown): never {
    // Validate the body shape so the bot's contract tests pass against
    // the stub. We don't consume the values; the future implementation
    // will swap this body parse for the real one.
    const parsed = invitesRedeemSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    throw new GoneException({
      error: 'feature_not_enabled',
      reason: 'referral_system_pending_design',
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
