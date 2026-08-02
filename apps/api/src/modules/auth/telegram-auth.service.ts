import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { z } from 'zod';
import { env } from '../../config/env';
import { AuthentikClient } from '../admin-invites/authentik.client';
import { DirectusUsersBridgeService } from '../directus/directus-users-bridge.service';
import { DirectusClient } from '../directus/directus.client';
import { MeProfileService, type MemberInterest } from '../me-profile/me-profile.service';
import { PointsDirectusService, type LeaderboardEntry } from '../points/points-directus.service';
import {
  RegistrationConsentRequiredError,
  RegistrationIneligibleError,
  RegistrationNotFoundError,
  RegistrationsDirectusService,
  type Status as RegistrationStatus,
} from '../registrations/registrations-directus.service';

// FEAT-BOT-2 (FR-BOT-002, PR 1/6) — read-only event browsing for the bot's
// /events and /event <N> commands. Deliberately NOT reusing
// TelegramEventsService (apps/api/src/modules/telegram/) — see
// .copilot/tasks/active/wf-20260731-feat-174/02-impact-analysis.md
// "Reuse vs. duplicate" for the full reasoning: that service isn't
// exported by TelegramModule, and importing TelegramModule into AuthModule
// to reach it would recreate a documented, previously-reverted circular
// dependency (see telegram.module.ts's own comment on PR #187/#202,
// AuthModule -> InteractionsModule -> TelegramModule -> AuthModule). This
// duplicates the small, stable subset of that service's query-building
// logic (published/public/future-dated guard, pagination) rather than
// risk reintroducing that cycle from the other side.

// FR-AUTH-002 — Telegram authentication service.
//
// Two flows:
//   1. Web Login Widget — browser posts signed widget fields; we verify
//      the HMAC, look up or create an Authentik user, mint a recovery
//      link, and hand the URL back to the controller for a 302 redirect.
//
//   2. Bot upsert — the bot (authenticated via InternalAuthGuard) sends a
//      Telegram user's ID/name; we look up or create a temporary Authentik
//      user so the bot can track the member before full registration.
//
// Security references: AGENTS.md §5, security.md, Telegram Login Widget docs.

// ── constants ────────────────────────────────────────────────────────────────

// Maximum age of a Login Widget auth_date before it is rejected (seconds).
// Telegram docs: verify within a reasonable window; 5 minutes is tight but
// correct for server-side verification where the payload is posted immediately.
// The impact-analysis noted 86 400 s (24 h) as an AC target; the prompt
// specifies 300 s. We use 300 s per the explicit implementation instruction.
const AUTH_DATE_MAX_AGE_SECONDS = 300;

// Synthetic email domain for temporary Telegram-only accounts.
const TELEGRAM_EMAIL_DOMAIN = 'telegram.local';

// ── Zod schemas ──────────────────────────────────────────────────────────────

// Numeric string as Telegram sends it (up to 18 digits — bigint-safe as string).
// Exported (FR-AUTH-006) so upgrade.service.ts's upgradeTempBodySchema can
// reuse the exact same telegramId validation instead of redefining it.
export const telegramIdSchema = z.string().regex(/^\d{1,19}$/, 'telegramId must be a numeric string');

// Full Login Widget payload schema. `hash` and `id` are required; other fields
// are optional (Telegram only sends fields the user has set on their account).
export const telegramWidgetPayloadSchema = z.object({
  id: telegramIdSchema,
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().url().optional(),
  auth_date: z.coerce.number().int().positive(),
  hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be 64 lower-case hex chars'),
  email: z.string().email().optional(),
});

export type TelegramWidgetPayload = z.infer<typeof telegramWidgetPayloadSchema>;

// Upsert-temp-user input schema (bot → internal endpoint).
export const upsertTempUserBodySchema = z.object({
  telegramId: telegramIdSchema,
  firstName: z.string().min(1).max(255),
  username: z.string().max(255).optional(),
});

export type UpsertTempUserBody = z.infer<typeof upsertTempUserBodySchema>;

// Lookup input schema (bot → internal endpoint). FEAT-BOT-1 — resolves a
// raw telegram_id to identity + tenant info; read-only, no create/upsert.
export const lookupUserBodySchema = z.object({
  telegramId: telegramIdSchema,
});

export type LookupUserBody = z.infer<typeof lookupUserBodySchema>;

// ── FEAT-BOT-2 (FR-BOT-002 PR 1/6) — events browsing schemas ──────────────

// Country tenant enum — matches the VALID_COUNTRIES precedent duplicated
// across auth.controller.ts's registerSchema, dashboard.controller.ts, and
// audit-events.controller.ts (see registerSchema's own comment above).
const countrySchema = z.enum(['uz', 'kz', 'tj', 'xx']);

const DEFAULT_EVENTS_LIMIT = 5; // FR-BOT-002 Notes: "Paginated if > 5 events"
const MAX_EVENTS_LIMIT = 50; // matches TelegramEventsService's own cap

// GET /v1/internal/telegram/events query schema (bot -> internal endpoint).
export const listTelegramEventsQuerySchema = z.object({
  country: countrySchema,
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(MAX_EVENTS_LIMIT).default(DEFAULT_EVENTS_LIMIT),
});

export type ListTelegramEventsQuery = z.infer<typeof listTelegramEventsQuerySchema>;

// GET /v1/internal/telegram/events/:id path+query schema.
// directusUserId is optional — only used to annotate isRegistered; a
// caller that hasn't resolved an identity yet (e.g. AC-6-style unknown
// user) can omit it and still see event detail (anonymous-browse-safe,
// same posture as TelegramEventsService's own optional tgUserId param).
export const eventDetailParamsSchema = z.object({
  id: z.string().uuid(),
});
export const eventDetailQuerySchema = z.object({
  directusUserId: z.string().uuid().optional(),
});

export type EventDetailParams = z.infer<typeof eventDetailParamsSchema>;
export type EventDetailQuery = z.infer<typeof eventDetailQuerySchema>;

// ── FEAT-BOT-2 (FR-BOT-002 PR 2/6) — register/cancel schemas ──────────────

// POST /v1/internal/telegram/register body. `country` mirrors
// listTelegramEventsQuerySchema's own `country` field — the bot always has
// it on hand from TenantMiddleware, same source as the /events call.
export const telegramRegisterBodySchema = z.object({
  directusUserId: z.string().uuid(),
  eventId: z.string().uuid(),
  country: countrySchema,
});
export type TelegramRegisterBody = z.infer<typeof telegramRegisterBodySchema>;

// DELETE /v1/internal/telegram/register body — same shape, no acceptance
// (cancellation never needs EULA consent).
export const telegramCancelBodySchema = z.object({
  directusUserId: z.string().uuid(),
  eventId: z.string().uuid(),
  country: countrySchema,
});
export type TelegramCancelBody = z.infer<typeof telegramCancelBodySchema>;

export interface TelegramRegisterResult {
  status: RegistrationStatus;
  eventTitle: string;
}

export interface TelegramCancelResult {
  status: 'cancelled' | 'not_registered';
}

// ── FEAT-BOT-2 (FR-BOT-002 PR 3/6) — /me schemas ────────────────────────

// GET /v1/internal/telegram/me query schema. Same two fields the
// register/cancel body schemas already require (directusUserId, country)
// — the bot always has both on hand from user_context/TenantMiddleware by
// the time it can call /me (AuthMiddleware only lets a known user reach a
// handler that needs them).
export const telegramMeQuerySchema = z.object({
  directusUserId: z.string().uuid(),
  country: countrySchema,
});
export type TelegramMeQuery = z.infer<typeof telegramMeQuerySchema>;

export interface TelegramMeRegistrationEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
}

// Mirrors registrations.controller.ts's MineResponse per-row shape
// exactly (id, status, event summary) — no new projection invented, only
// the checkinCode/checkedInAt fields are dropped since /me has no
// scanning-affordance use for them (the bot's /me is a read+cancel
// dashboard, not a check-in surface).
export interface TelegramMeRegistration {
  id: string;
  status: RegistrationStatus;
  event: TelegramMeRegistrationEvent;
}

export interface TelegramMeResult {
  registrations: TelegramMeRegistration[];
  pointsTotal: number;
}

// ── FEAT-BOT-2 (FR-BOT-002 PR 4/6) — /leaderboard schemas ──────────────────

// GET /v1/internal/telegram/leaderboard query schema. Same two fields the
// /me query schema already requires (directusUserId, country) — the caller
// identity is needed to compute isCaller per-row, and country scopes the
// tenant the same way every other bot-facing route does.
export const telegramLeaderboardQuerySchema = z.object({
  directusUserId: z.string().uuid(),
  country: countrySchema,
});
export type TelegramLeaderboardQuery = z.infer<typeof telegramLeaderboardQuerySchema>;

// Top-N size mirrors FR-BOT-002's own AC ("shows top 10 members") — not
// caller-configurable, unlike /events' offset/limit (this command has no
// pagination in scope).
const LEADERBOARD_SIZE = 10;

export interface TelegramLeaderboardEntry {
  // No raw email — see 02-impact-analysis.md's PII risk flag. displayName
  // falls back to a safe placeholder when null (rare — platform.users
  // is seeded with a displayName on every signup path); handle is not
  // returned either, since no AC calls for it and it's PII-adjacent.
  displayName: string;
  points: number;
  // True only for the row matching the caller's OWN platform.users.id.
  // At most one entry has isCaller: true; false (never omitted) on every
  // other row so the bot doesn't need a separate "did we find them" check.
  isCaller: boolean;
}

export interface TelegramLeaderboardResult {
  entries: TelegramLeaderboardEntry[];
}

// ── FEAT-BOT-2 (FR-BOT-002 PR 5/6) — /interests schemas ─────────────────

// Independently-owned duplicate of TelegramEventTopicsService's own
// KNOWN_EVENT_TOPICS slugs (same 7 concepts, so a member's "AI Ethics"
// interest and an event's "AI Ethics" tag mean the same thing) — NOT an
// import. Two independent reasons, both confirmed by reading the actual
// source (01-requirement-validation.md's Architectural Feasibility point
// 3): (1) TelegramEventTopicsService isn't in TelegramModule's own
// `exports` array, so it can't be injected regardless of the
// circular-dependency question below; (2) importing TelegramModule into
// AuthModule to reach it would add a new edge on top of the
// already-documented, previously-reverted AuthModule -> InteractionsModule
// -> TelegramModule -> AuthModule cycle (see telegram.module.ts's own
// header comment) — an unnecessary risk for a small, stable, 7-entry
// static list. Bare slugs only: labels are bot-side (locales/{ru,en}.py),
// matching how every other picker in this bot already works — no
// {slug, label, icon} duplication needed on the API side.
export const INTEREST_TOPICS = [
  'llm',
  'mlops',
  'computer-vision',
  'product',
  'career',
  'ethics',
  'infra',
] as const;
export type InterestTopic = (typeof INTEREST_TOPICS)[number];

// GET /v1/internal/telegram/interests query schema. No `country` — unlike
// every other FEAT-BOT-2 route, interests are not tenant-scoped
// (member_interests has no country_code column; see
// 01-requirement-validation.md's Architectural Feasibility, tenancy note).
export const interestsQuerySchema = z.object({
  directusUserId: z.string().uuid(),
});
export type InterestsQuery = z.infer<typeof interestsQuerySchema>;

// POST /v1/internal/telegram/interests/toggle body schema. `topic` is
// validated against the fixed slug list here — an out-of-list value is a
// 400 before it ever reaches MeProfileService.addInterest, which would
// otherwise accept arbitrary free text into topic_tag (AC-11).
export const toggleInterestBodySchema = z.object({
  directusUserId: z.string().uuid(),
  topic: z.enum(INTEREST_TOPICS),
});
export type ToggleInterestBody = z.infer<typeof toggleInterestBodySchema>;

export interface TelegramInterestsResult {
  selected: string[];
  available: string[];
}

// ── Result shapes ────────────────────────────────────────────────────────

// One row of GET /events. Kept intentionally narrow — only what the bot's
// paginated list rendering needs (title, date, registration count, id for
// the /event <N> follow-up and pagination).
export interface TelegramEventListItem {
  id: string;
  title: string;
  startsAt: string;
  registrationCount: number;
}

export interface TelegramEventListResult {
  items: TelegramEventListItem[];
  offset: number;
  limit: number;
  total: number;
}

// GET /events/:id response. isRegistered is always present (false when no
// directusUserId was supplied or no registration found) so the bot's
// Register/"I'm going" button logic never has to special-case "unknown."
export interface TelegramEventDetailResult {
  id: string;
  title: string;
  startsAt: string;
  venue: string | null;
  description: string;
  capacity: number | null;
  registrationCount: number;
  isRegistered: boolean;
}

// ── Result type ───────────────────────────────────────────────────────────────

export interface UpsertTempUserResult {
  authentikUserId: number;
  directusUserId: null;
  isNew: boolean;
}

export interface LookupUserResult {
  directusUserId: string | null;
  isTemp: boolean;
  country: string | null;
  // FR-BOT-003 — role gate. Derived from authentikUser.groups_obj on every
  // lookup (list endpoint returns groups_obj with names — no extra API call).
  // Null when no Directus user exists yet (temp account with no country row).
  role: 'member' | 'organizer' | 'country_admin' | 'super_admin' | null;
}

// ── FR-BOT-003 operator schemas ───────────────────────────────────────────────

// GET /v1/internal/telegram/attendance/:eventId
export const telegramAttendanceParamsSchema = z.object({
  eventId: z.string().uuid(),
});
export const telegramAttendanceQuerySchema = z.object({
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
});
export type TelegramAttendanceParams = z.infer<typeof telegramAttendanceParamsSchema>;
export type TelegramAttendanceQuery = z.infer<typeof telegramAttendanceQuerySchema>;

export interface TelegramAttendanceResult {
  registered: number;
  attended: number;
  waitlisted: number;
  eventTitle: string;
}

// POST /v1/internal/telegram/operator/checkin
export const operatorCheckinBodySchema = z.object({
  qrCodeData: z.string().min(1).max(500),
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
});
export type OperatorCheckinBody = z.infer<typeof operatorCheckinBodySchema>;

export interface OperatorCheckinResult {
  memberName: string;
  eventTitle: string;
  alreadyCheckedIn: boolean;
}

// GET /v1/internal/telegram/operator/pending-approvals
export const pendingApprovalsQuerySchema = z.object({
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
  directusUserId: z.string().uuid(),
});
export type PendingApprovalsQuery = z.infer<typeof pendingApprovalsQuerySchema>;

export interface PendingApprovalItem {
  registrationId: string;
  memberName: string;
  eventTitle: string;
  eventId: string;
  requestedAt: string;
}

export interface TelegramPendingApprovalsResult {
  items: PendingApprovalItem[];
}

// POST /v1/internal/telegram/operator/approve-registration
// POST /v1/internal/telegram/operator/decline-registration
export const registrationActionBodySchema = z.object({
  registrationId: z.string().uuid(),
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
  directusUserId: z.string().uuid(),
});
export type RegistrationActionBody = z.infer<typeof registrationActionBodySchema>;

export interface RegistrationActionResult {
  ok: true;
  registrationId: string;
}

// POST /v1/internal/telegram/push-announcement
export const pushAnnouncementBodySchema = z.object({
  eventId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
  directusUserId: z.string().uuid(),
});
export type PushAnnouncementBody = z.infer<typeof pushAnnouncementBodySchema>;

export interface TelegramPushAnnouncementResult {
  ok: true;
  recipientCount: number;
}

// GET /v1/internal/telegram/operator/stats
export const operatorStatsQuerySchema = z.object({
  directusUserId: z.string().uuid(),
  country: z.enum(['uz', 'kz', 'tj', 'xx']),
});
export type OperatorStatsQuery = z.infer<typeof operatorStatsQuerySchema>;

export interface TelegramOperatorStatsResult {
  eventsManaged: number;
  registrationsThisPeriod: number;
}

// Minimal shape we read off the Directus /users list — mirrors the
// `?fields=` projection so we never over-fetch PII we don't return.
interface DirectusUserLookupRow {
  id: string;
  country: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TelegramAuthService {
  private readonly logger = new Logger(TelegramAuthService.name);

  constructor(
    private readonly authentik: AuthentikClient,
    private readonly directus: DirectusClient,
    // FEAT-BOT-2 (FR-BOT-002 PR 2/6) — bridge for the reverse
    // directusUserId -> platform users.id lookup, and the registrations
    // service itself, reused directly rather than duplicated (see
    // registrations-directus.service.ts's own header comment).
    // RegistrationsDirectusService comes from RegistrationsModule, which
    // AuthModule imports via forwardRef (see auth.module.ts's comment) —
    // Nest's reflection-based design:paramtypes metadata can't resolve a
    // forwardRef'd provider through the constructor-parameter type alone,
    // so this needs an explicit @Inject(forwardRef(...)) too (confirmed
    // live: omitting this produced `UnknownDependenciesException ...
    // Function at index [3]`, not a module-graph error — the module cycle
    // fix alone is necessary but not sufficient).
    private readonly directusBridge: DirectusUsersBridgeService,
    @Inject(forwardRef(() => RegistrationsDirectusService))
    private readonly registrations: RegistrationsDirectusService,
    // FEAT-BOT-2 (FR-BOT-002 PR 3/6) — no forwardRef needed here: unlike
    // RegistrationsDirectusService, PointsModule does not import
    // AuthModule anywhere in its own graph, so there is no cycle (see
    // auth.module.ts's own comment on this same edge).
    private readonly points: PointsDirectusService,
    // FEAT-BOT-2 (FR-BOT-002 PR 5/6) — MeProfileService comes from
    // MeProfileModule, which AuthModule imports via forwardRef (see
    // auth.module.ts's comment on this edge) — same
    // "Nest's design:paramtypes reflection can't resolve a forwardRef'd
    // provider through the constructor-parameter type alone" gotcha
    // documented above for RegistrationsDirectusService: omitting this
    // explicit @Inject(forwardRef(...)) compiles fine but fails at
    // RUNTIME with UnknownDependenciesException, not at compile/lint time.
    @Inject(forwardRef(() => MeProfileService))
    private readonly meProfile: MeProfileService,
  ) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  // Returns the raw TELEGRAM_BOT_TOKEN or throws 503 if unconfigured.
  private getBotToken(): string {
    const token = env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new ServiceUnavailableException('telegram_not_configured');
    }
    return token;
  }

  // Derives the HMAC signing key: SHA256(BOT_TOKEN) as a Buffer.
  // Per Telegram Login Widget docs: the secret key is NOT the raw token
  // but a SHA-256 hash of it.
  private deriveHmacKey(botToken: string): Buffer {
    return createHash('sha256').update(botToken).digest();
  }

  // Builds the data_check_string: sorted key=value lines (all fields except
  // `hash`), joined by newlines.
  private buildDataCheckString(payload: TelegramWidgetPayload): string {
    const { hash: _omit, ...rest } = payload;
    void _omit; // explicitly unused
    return Object.entries(rest)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('\n');
  }

  // ── public API ────────────────────────────────────────────────────────────

  // Verifies the Telegram Login Widget HMAC-SHA256 hash.
  // Throws UnauthorizedException on:
  //   - Invalid hash
  //   - auth_date older than AUTH_DATE_MAX_AGE_SECONDS
  verifyWidgetHash(payload: TelegramWidgetPayload): void {
    const botToken = this.getBotToken();
    const key = this.deriveHmacKey(botToken);
    const dataCheckString = this.buildDataCheckString(payload);

    const expected = createHmac('sha256', key).update(dataCheckString).digest('hex');

    // Timing-safe comparison — both buffers must be equal length.
    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(payload.hash, 'hex');
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException('telegram_hmac_invalid');
    }

    // Freshness check using server clock — not client-supplied time.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - payload.auth_date > AUTH_DATE_MAX_AGE_SECONDS) {
      throw new UnauthorizedException('telegram_auth_date_expired');
    }
  }

  // Full Login Widget exchange:
  //   1. Verify HMAC + freshness.
  //   2. Look up Authentik user by telegram_id.
  //   3. If not found and email present, try email match + patch telegram_id.
  //   4. If still not found, create new user.
  //   5. Mint Authentik recovery link and return it.
  async exchangeWidgetPayload(payload: TelegramWidgetPayload): Promise<string> {
    this.verifyWidgetHash(payload);

    const telegramId = payload.id;

    let user = await this.authentik.getUserByTelegramId(telegramId);

    if (!user && payload.email) {
      user = await this.authentik.getUserByEmail(payload.email);
      if (user) {
        // Merge telegram_id onto existing email-based account to prevent duplicates.
        const merged = { ...user.attributes, telegram_id: telegramId };
        await this.authentik.patchAttributes(user.pk, merged);
      }
    }

    if (!user) {
      user = await this.createTelegramUser(telegramId, payload.first_name, payload.username);
    }

    return this.authentik.createRecoveryLink(user.pk);
  }

  // Creates a full (non-temporary) Authentik user for a Login Widget sign-in
  // where the user did not previously exist.
  private async createTelegramUser(
    telegramId: string,
    firstName: string | undefined,
    username: string | undefined,
  ) {
    const syntheticEmail = `tg${telegramId}@${TELEGRAM_EMAIL_DOMAIN}`;
    const displayName = firstName ?? `tg${telegramId}`;
    const authentikUsername = username ?? `tg${telegramId}`;

    return this.authentik.createUser({
      email: syntheticEmail,
      username: authentikUsername,
      name: displayName,
      attributes: { telegram_id: telegramId },
    });
  }

  // Idempotent upsert for bot /start provisioning.
  // Looks up by telegram_id; creates with is_temporary=true if not found.
  // Returns authentikUserId + isNew flag. directusUserId is always null here
  // (bot drives country assignment separately after getting this response).
  async upsertTempUser(
    telegramId: string,
    firstName: string,
    username?: string,
  ): Promise<UpsertTempUserResult> {
    // Validate telegramId at service boundary as well (belt-and-suspenders
    // after controller Zod parse).
    telegramIdSchema.parse(telegramId);

    // Presence of bot token is required even for internal endpoint.
    this.getBotToken();

    const existing = await this.authentik.getUserByTelegramId(telegramId);
    if (existing) {
      return { authentikUserId: existing.pk, directusUserId: null, isNew: false };
    }

    const syntheticEmail = `tg${telegramId}@${TELEGRAM_EMAIL_DOMAIN}`;
    const authentikUsername = username ?? `tg${telegramId}`;

    const created = await this.authentik.createUser({
      email: syntheticEmail,
      username: authentikUsername,
      name: firstName,
      attributes: {
        telegram_id: telegramId,
        is_temporary: true,
      },
    });

    return { authentikUserId: created.pk, directusUserId: null, isNew: true };
  }

  // FEAT-BOT-1 — POST /v1/internal/telegram/lookup's service logic.
  // Pure read/compose: resolves a raw telegram_id to
  // { directusUserId, isTemp, country } by
  //   1. looking up the Authentik user by attributes.telegram_id, and
  //   2. reading (never creating) the paired Directus user by email, for
  //      the `country` field.
  //
  // AC-3: no Authentik user at all → NotFoundException (structured body,
  // this repo's convention — see telegram-preferences.service.ts's
  // `{ error: 'member_not_found' }`), so the bot's auth middleware can
  // distinguish "unknown user, prompt /start" from "API down, retry."
  //
  // AC-5 (read-path idempotency): deliberately does NOT call
  // upsertTempUser or any Authentik/Directus write method — unlike its
  // sibling upsert-temp-user, this is a resolve, not an upsert. Do not
  // "fix" upsertTempUser's hardcoded-null directusUserId stub here; that
  // method is intentionally left unchanged (out of scope for this FR).
  async lookupUser(telegramId: string): Promise<LookupUserResult> {
    // Validate at the service boundary too (belt-and-suspenders after the
    // controller's Zod parse), matching upsertTempUser's own pattern.
    lookupUserBodySchema.shape.telegramId.parse(telegramId);

    const authentikUser = await this.authentik.getUserByTelegramId(telegramId);
    if (!authentikUser) {
      throw new NotFoundException({ error: 'telegram_user_not_found' });
    }

    const isTemp = authentikUser.attributes.is_temporary === true;
    const directusRow = await this.findDirectusUserByEmail(authentikUser.email);

    return {
      directusUserId: directusRow?.id ?? null,
      isTemp,
      country: directusRow?.country ?? null,
      role: deriveRoleFromGroups(authentikUser.groups_obj),
    };
  }

  // Read-only Directus lookup by email — deliberately does NOT fall back
  // to creating a row (unlike DirectusUsersBridgeService.findOrCreate /
  // ensureLinkedByEmail, which upsert). Mirrors the `?fields=` projection
  // style used by telegram-preferences.service.ts's findMember and the
  // `filter[email][_eq]` lookup used by directus-users-bridge.service.ts's
  // findOrCreate — same primitive, read-only half only.
  private async findDirectusUserByEmail(email: string): Promise<DirectusUserLookupRow | null> {
    const encodedEmail = encodeURIComponent(email);
    const res = await this.directus.get<{ data: DirectusUserLookupRow[] }>(
      `/users?filter[email][_eq]=${encodedEmail}&fields=id,country&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // ── FEAT-BOT-2 (FR-BOT-002 PR 1/6) — events browsing ──────────────────

  // GET /v1/internal/telegram/events service logic. Published/public/
  // future-dated guard mirrors TelegramEventsService.listOpenEvents's own
  // filter shape (see impact-analysis "Reuse vs. duplicate" for why this
  // is a small deliberate duplication rather than a cross-module import).
  // Offset-based pagination per FR-BOT-002 Notes: "/events uses
  // offset-based pagination." `total` is a second, cheap aggregate query
  // so the bot can compute whether a "Next page ->" button should render.
  async listUpcomingEvents(
    country: string,
    offset: number,
    limit: number,
  ): Promise<TelegramEventListResult> {
    const guard = eventGuardFilter(country);
    const query = [
      guard,
      'fields=id,title,starts_at',
      'sort=starts_at',
      `offset=${offset}`,
      `limit=${limit}`,
    ].join('&');
    const res = await this.directus.get<{ data: TelegramEventRow[] }>(`/items/events?${query}`);
    const total = await this.countUpcomingEvents(country);

    const items = await Promise.all(
      res.data.map(async (row) => ({
        id: row.id,
        title: row.title,
        startsAt: row.starts_at,
        registrationCount: await this.countRegistrations(row.id),
      })),
    );

    return { items, offset, limit, total };
  }

  // GET /v1/internal/telegram/events/:id service logic. 404s (structured
  // body, matching lookupUser's own convention) when the event doesn't
  // exist or isn't published/public — same "don't leak existence by
  // status" posture as TelegramEventsService.getEventDetail.
  async getEventDetail(
    eventId: string,
    directusUserId: string | null,
  ): Promise<TelegramEventDetailResult> {
    const row = await this.findPublishedEvent(eventId);
    if (!row) {
      throw new NotFoundException({ error: 'event_not_found' });
    }

    const [registrationCount, isRegistered] = await Promise.all([
      this.countRegistrations(eventId),
      directusUserId === null ? Promise.resolve(false) : this.isUserRegistered(eventId, directusUserId),
    ]);

    return {
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      venue: row.venue,
      description: row.description,
      capacity: row.capacity,
      registrationCount,
      isRegistered,
    };
  }

  private async findPublishedEvent(eventId: string): Promise<TelegramEventDetailRow | null> {
    const guards = 'filter[status][_eq]=published&filter[visibility_scope][_eq]=public';
    const fields = 'fields=id,title,starts_at,venue,description,capacity';
    const res = await this.directus.get<{ data: TelegramEventDetailRow[] }>(
      `/items/events?${guards}&filter[id][_eq]=${encodeURIComponent(eventId)}&${fields}&limit=1`,
    );
    return res.data[0] ?? null;
  }

  private async countUpcomingEvents(country: string): Promise<number> {
    const query = `${eventGuardFilter(country)}&aggregate[count]=*`;
    const res = await this.directus.get<{ data: Array<{ count: string | number }> }>(
      `/items/events?${query}`,
    );
    return parseDirectusCount(res.data[0]?.count);
  }

  // Excludes cancelled — matches TelegramEventsService.fetchTakenCount's
  // own convention so the bot's counter agrees with the website's.
  private async countRegistrations(eventId: string): Promise<number> {
    const query = [
      `filter[event][_eq]=${encodeURIComponent(eventId)}`,
      'filter[status][_neq]=cancelled',
      'aggregate[count]=*',
    ].join('&');
    const res = await this.directus.get<{ data: Array<{ count: string | number }> }>(
      `/items/registrations?${query}`,
    );
    return parseDirectusCount(res.data[0]?.count);
  }

  // #328-style deep-filter through user.telegram_user_id doesn't apply
  // here — this surface is keyed by directusUserId directly (the bot's
  // AuthMiddleware already resolved it), so we filter registrations.user
  // (a direct Directus users FK) rather than reaching through
  // telegram_user_id like TelegramEventsService does for its
  // tgUserId-keyed callers.
  private async isUserRegistered(eventId: string, directusUserId: string): Promise<boolean> {
    const query = [
      `filter[user][_eq]=${encodeURIComponent(directusUserId)}`,
      `filter[event][_eq]=${encodeURIComponent(eventId)}`,
      'filter[status][_neq]=cancelled',
      'fields=id',
      'limit=1',
    ].join('&');
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/registrations?${query}`,
    );
    return res.data.length > 0;
  }

  // ── FEAT-BOT-2 (FR-BOT-002 PR 2/6) — register / cancel ─────────────────

  // POST /v1/internal/telegram/register service logic. Resolves the given
  // directusUserId to a platform users.id (reverse of every other bridge
  // consumer — see directus-users-bridge.service.ts's own comment on
  // resolveUserIdFromDirectusId), then delegates to
  // RegistrationsDirectusService.register() unchanged — capacity/waitlist
  // assignment happens server-side there (Directus flow), so `status` is
  // passed through faithfully rather than re-derived here. No `acceptance`
  // is passed: this PR does not build a bot-side EULA consent flow (see
  // 01-requirement-validation.md's finding — the web UI itself has none
  // either yet); RegistrationConsentRequiredError is caught and re-thrown
  // as a ConflictException so the bot can show a distinct message instead
  // of a generic error.
  async registerViaTelegram(
    directusUserId: string,
    eventId: string,
    country: string,
  ): Promise<TelegramRegisterResult> {
    const userId = await this.requirePlatformUserId(directusUserId);

    try {
      // Title is fetched AFTER register() succeeds, not before — register()
      // already runs assertEventInTenant (published + tenant-scoped) and
      // throws RegistrationNotFoundError for a bad id, which we map to a
      // clean 404 below. Fetching the title first (an earlier version of
      // this method did) let an unguarded raw GET reach Directus for a
      // nonexistent id, which surfaced as an unhandled 403
      // DirectusError -> 500, not a 404 — caught live in Step 13
      // verification against the real stack (curl with a bogus eventId).
      const row = await this.registrations.register({ userId, eventId, countryCode: country });
      const eventTitle = await this.requireEventTitle(eventId);
      return { status: row.status, eventTitle };
    } catch (err) {
      if (err instanceof RegistrationNotFoundError) {
        throw new NotFoundException({ error: 'event_not_found' });
      }
      if (err instanceof RegistrationConsentRequiredError) {
        throw new ConflictException({ error: 'consent_required' });
      }
      if (err instanceof RegistrationIneligibleError) {
        throw new ConflictException({ error: 'registration_ineligible' });
      }
      throw err;
    }
  }

  // DELETE /v1/internal/telegram/register service logic. `cancel()`
  // returns null (not a throw) when no active registration exists —
  // surfaced here as status: 'not_registered' so the bot can show a
  // one-line "you're not registered" message rather than a generic error.
  // Waitlist promotion on cancel is handled entirely by the existing
  // Directus flow (registrations-directus.service.ts's own doc comment) —
  // this method does not build any promotion logic.
  async cancelViaTelegram(
    directusUserId: string,
    eventId: string,
    country: string,
  ): Promise<TelegramCancelResult> {
    const userId = await this.requirePlatformUserId(directusUserId);

    try {
      const row = await this.registrations.cancel({ userId, eventId, countryCode: country });
      return { status: row === null ? 'not_registered' : 'cancelled' };
    } catch (err) {
      if (err instanceof RegistrationNotFoundError) {
        throw new NotFoundException({ error: 'event_not_found' });
      }
      throw err;
    }
  }

  // GET /v1/internal/telegram/me service logic. Aggregates the caller's
  // active registrations + lifetime points total in one round trip so the
  // bot's /me handler doesn't need two separate API calls. Account type
  // (temp/full) and "linked to web" status are deliberately NOT part of
  // this response — both are already resolved bot-side from
  // user_context.is_temp (attached by the bot's own AuthMiddleware on
  // every update) and a static CTA respectively; see
  // 01-requirement-validation.md findings 4/5 for the full reasoning.
  // Streak is also not part of this response — no streak concept exists
  // anywhere in this codebase (see the same validation file's finding 3);
  // this is a genuine scope gap, not an oversight.
  async getMeSummary(directusUserId: string, country: string): Promise<TelegramMeResult> {
    const userId = await this.requirePlatformUserId(directusUserId);

    const [entries, pointsTotal] = await Promise.all([
      this.registrations.listMine({ userId, countryCode: country }),
      this.points.totalForUser(directusUserId, country),
    ]);

    const registrations: TelegramMeRegistration[] = entries.map((entry) => ({
      id: entry.registration.id,
      status: entry.registration.status,
      event: entry.event,
    }));

    return { registrations, pointsTotal };
  }

  // GET /v1/internal/telegram/leaderboard service logic (FR-BOT-002 PR
  // 4/6). Reuses PointsDirectusService.leaderboard() UNCHANGED — no new
  // points-calculation rule, no new Directus query shape. Temp-user
  // exclusion needs no code here: leaderboard() aggregates
  // directus point_awards rows, and a temp (Authentik-only) user has
  // never earned one, so they structurally never appear in `entries`
  // (confirmed by reading the query in 01-requirement-validation.md's
  // Architectural Feasibility section, and live-verified per this
  // workflow's Step 8 infra pre-flight).
  //
  // isCaller is resolved HERE (API side), not bot-side — the bot never
  // needs to learn another user's platform.users.id to render the
  // highlight; we just tell it which row (if any) is theirs. Unlike
  // getMeSummary's requirePlatformUserId (which 404s the whole request
  // when the bridge can't resolve an identity), an unresolvable caller
  // identity here degrades to "no row highlighted" rather than failing
  // the whole leaderboard — the leaderboard itself is still valid,
  // useful content even if we can't say which row is "you" (e.g. a
  // brand-new bridge race, or a caller who has literally never earned
  // points and so isn't asking "where am I" in the first place).
  async getLeaderboard(directusUserId: string, country: string): Promise<TelegramLeaderboardResult> {
    const [entries, callerUserId] = await Promise.all([
      this.points.leaderboard({ countryCode: country, limit: LEADERBOARD_SIZE }),
      this.directusBridge.resolveUserIdFromDirectusId(directusUserId),
    ]);

    return {
      entries: entries.map((entry: LeaderboardEntry) => ({
        displayName: entry.displayName ?? entry.handle ?? 'Member',
        points: entry.totalPoints,
        isCaller: callerUserId !== null && entry.userId === callerUserId,
      })),
    };
  }

  // Shared by registerViaTelegram/cancelViaTelegram. 404s (matching
  // lookupUser's own "unresolvable identity" convention) when the bridge
  // has no platform user linked to this directusUserId — this should be
  // rare in practice (the bot only ever has a directusUserId because
  // lookupUser resolved one moments earlier) but is not impossible (a
  // directus_users row without a matching platform.users row, e.g. a
  // Directus-only account never bridged).
  private async requirePlatformUserId(directusUserId: string): Promise<string> {
    const userId = await this.directusBridge.resolveUserIdFromDirectusId(directusUserId);
    if (!userId) {
      throw new NotFoundException({ error: 'telegram_user_not_found' });
    }
    return userId;
  }

  // FEAT-BOT-2 (FR-BOT-002 PR 5/6) — mirrors requirePlatformUserId's shape
  // (same 404 convention) but resolves email too, since MeProfileService's
  // every method is keyed on (userId, email), not userId alone.
  private async requirePlatformUserAndEmail(
    directusUserId: string,
  ): Promise<{ userId: string; email: string }> {
    const resolved = await this.directusBridge.resolveUserAndEmailFromDirectusId(directusUserId);
    if (!resolved) {
      throw new NotFoundException({ error: 'telegram_user_not_found' });
    }
    return resolved;
  }

  // GET /v1/internal/telegram/interests service logic (FR-BOT-002 PR
  // 5/6). Reduces MeProfileService.listInterests to the distinct set of
  // topic_tags present (any intent counts as "selected" for toggle-button
  // rendering — see 01-requirement-validation.md point 7), intersected
  // with INTEREST_TOPICS in that constant's own order so `selected` never
  // contains a stray topic_tag the fixed picker doesn't know about
  // (defensive against free-text rows written some other way — the
  // underlying Directus column has no enum constraint even though this
  // route only ever writes from the curated list).
  async getInterests(directusUserId: string): Promise<TelegramInterestsResult> {
    const { userId, email } = await this.requirePlatformUserAndEmail(directusUserId);
    const interests = await this.meProfile.listInterests(userId, email);
    return this.toInterestsResult(interests);
  }

  // POST /v1/internal/telegram/interests/toggle service logic (FR-BOT-002
  // PR 5/6). MeProfileService has no native "toggle" — only
  // addInterest/removeInterest — so this composes them:
  //   - topic currently unselected (no row, any intent) -> addInterest
  //     with a hardcoded intent='learn' (see point 7: the bot's one
  //     topic = one row = present/absent model is a documented scope
  //     narrowing versus the web cabinet's per-intent picker).
  //   - topic currently selected -> remove every 'learn'-intent row for
  //     that topic (defensively ALL such rows, not just the first found
  //     by array order — addInterest's own dedup means more than one
  //     shouldn't happen, but this compose path is new code and must not
  //     silently assume that invariant). Non-'learn' rows (e.g. a
  //     'mentor' row created via the web /me/profile cabinet) are never
  //     touched by this path — AC-7's load-bearing correctness guarantee:
  //     a bot tap must never mass-delete cross-surface data under a
  //     different intent.
  // Returns getInterests()'s own shape by calling it again post-toggle —
  // one extra round trip, but a single source of truth for the response
  // shape rather than computing the post-toggle delta locally; correctness
  // over micro-optimization here (AC-7 is the load-bearing test).
  async toggleInterest(directusUserId: string, topic: string): Promise<TelegramInterestsResult> {
    const { userId, email } = await this.requirePlatformUserAndEmail(directusUserId);
    const existing = await this.meProfile.listInterests(userId, email);
    const isSelected = existing.some((i) => i.topic_tag === topic);

    if (isSelected) {
      const learnRows = existing.filter((i) => i.topic_tag === topic && i.intent === 'learn');
      for (const row of learnRows) {
        await this.meProfile.removeInterest(userId, email, row.id);
      }
    } else {
      await this.meProfile.addInterest(userId, email, topic, 'learn');
    }

    return this.getInterests(directusUserId);
  }

  // ── FR-BOT-003 operator methods ───────────────────────────────────────────

  // GET /v1/internal/telegram/attendance/:eventId — live registration counts
  // per status for an event, scoped to the operator's country.
  async getAttendanceCounts(
    eventId: string,
    country: string,
  ): Promise<TelegramAttendanceResult> {
    const eventRow = await this.findPublishedEvent(eventId);
    if (!eventRow) {
      throw new NotFoundException({ error: 'event_not_found' });
    }
    // assertEventInTenant confirms country + published; here we also
    // assert country match so a cross-country operator call is rejected.
    const encodedId = encodeURIComponent(eventId);
    const encodedCountry = encodeURIComponent(country);
    const baseFilter = `filter[event][_eq]=${encodedId}&filter[event][country][_eq]=${encodedCountry}`;

    const [registeredRes, attendedRes, waitlistedRes] = await Promise.all([
      this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/registrations?${baseFilter}&filter[status][_eq]=registered&aggregate[count]=*`,
      ),
      this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/registrations?${baseFilter}&filter[status][_eq]=attended&aggregate[count]=*`,
      ),
      this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/registrations?${baseFilter}&filter[status][_eq]=waitlisted&aggregate[count]=*`,
      ),
    ]);

    return {
      registered: parseDirectusCount(registeredRes.data[0]?.count),
      attended: parseDirectusCount(attendedRes.data[0]?.count),
      waitlisted: parseDirectusCount(waitlistedRes.data[0]?.count),
      eventTitle: eventRow.title,
    };
  }

  // POST /v1/internal/telegram/operator/checkin — decode a QR code data string
  // (bare UUID or URL ending in UUID) and check in the member.
  async operatorCheckin(qrCodeData: string): Promise<OperatorCheckinResult> {
    const token = extractUuidFromQr(qrCodeData);
    if (!token) {
      throw new NotFoundException({ error: 'checkin_token_not_found' });
    }
    // Re-use RegistrationsDirectusService.checkin which handles idempotency,
    // window check, and the status→attended transition.
    const result = await this.registrations.checkin(token);
    // Fetch member name by looking up the registration's user field separately.
    // checkin() only returns RegistrationView which omits userId by design; a
    // second single-row lookup by checkin_code is cheap and avoids widening
    // the RegistrationView interface for a display-only field.
    let memberName = '';
    try {
      const encodedToken = encodeURIComponent(token);
      const regRes = await this.directus.get<{
        data: Array<{ user: { first_name: string | null; last_name: string | null } }>;
      }>(
        `/items/registrations?filter[checkin_code][_eq]=${encodedToken}&fields=user.first_name,user.last_name&limit=1`,
      );
      const u = regRes.data[0]?.user;
      memberName = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
    } catch {
      // Best-effort — member name is display-only; don't fail the check-in.
    }
    return {
      memberName,
      eventTitle: result.event.title,
      alreadyCheckedIn: result.alreadyCheckedIn,
    };
  }

  // GET /v1/internal/telegram/operator/pending-approvals — empty shell.
  // invite_only event type and pending_approval registration status are not
  // yet in the schema (documented scope gap in 01-requirement-validation.md).
  // The infrastructure exists (handler, keyboard, API endpoint) but returns
  // no items until invite_only events are added in a follow-up issue.
  async listPendingApprovals(
    _country: string,
    _directusUserId: string,
  ): Promise<TelegramPendingApprovalsResult> {
    return { items: [] };
  }

  // POST /v1/internal/telegram/operator/approve-registration — shell, same
  // rationale as listPendingApprovals above. Returns ok:true; no-op.
  async approveRegistration(
    registrationId: string,
    _country: string,
    _directusUserId: string,
  ): Promise<RegistrationActionResult> {
    return { ok: true, registrationId };
  }

  // POST /v1/internal/telegram/operator/decline-registration — shell.
  async declineRegistration(
    registrationId: string,
    _country: string,
    _directusUserId: string,
  ): Promise<RegistrationActionResult> {
    return { ok: true, registrationId };
  }

  // POST /v1/internal/telegram/push-announcement — fan out a plain-text
  // message to confirmed registrants for the event in the operator's country.
  // Sends via direct Telegram Bot API calls (fire-and-forget per recipient so
  // the endpoint returns as soon as all sends are enqueued). Capped at 200
  // recipients — large events should use the tg-broadcasts workspace tool.
  async pushAnnouncement(
    eventId: string,
    message: string,
    country: string,
    directusUserId: string,
  ): Promise<TelegramPushAnnouncementResult> {
    const token = this.getBotToken();
    const encodedId = encodeURIComponent(eventId);
    const encodedCountry = encodeURIComponent(country);

    // Guard: operator must be in the same country as the event.
    const eventRes = await this.directus.get<{
      data: { id: string; title: string; country: string } | null;
    }>(`/items/events/${encodedId}?fields=id,title,country&limit=1`);
    const event = eventRes.data;
    if (!event || event.country !== country) {
      throw new NotFoundException({ error: 'event_not_found' });
    }

    // Fetch confirmed registrants in operator's country with telegram_user_id.
    const regRes = await this.directus.get<{
      data: Array<{ user: { id: string; telegram_user_id: string | number | null } | null }>;
    }>(
      `/items/registrations?filter[event][_eq]=${encodedId}&filter[event][country][_eq]=${encodedCountry}&filter[status][_in]=registered,attended&fields=user.id,user.telegram_user_id&limit=200`,
    );

    const tgApiBase = `https://api.telegram.org/bot${token}`;
    let recipientCount = 0;
    const sendPromises: Promise<void>[] = [];

    for (const row of regRes.data) {
      const tgId = row.user?.telegram_user_id;
      if (!tgId) continue;
      if (row.user?.id === directusUserId) continue; // skip operator self-ping
      const chatId = tgId.toString();
      // Fire-and-forget; errors are logged but never bubble up to the caller.
      sendPromises.push(
        fetch(`${tgApiBase}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: message }),
        })
          .then((r) => { void r; })
          .catch((err: unknown) => {
            this.logger.warn(
              `pushAnnouncement send failed chat=${chatId}: ${err instanceof Error ? err.message : 'unknown'}`,
            );
          }),
      );
      recipientCount++;
    }

    // Await all sends before returning so the count is accurate on response.
    await Promise.allSettled(sendPromises);
    return { ok: true, recipientCount };
  }

  // GET /v1/internal/telegram/operator/stats — events managed + registrations
  // in the rolling 30-day period for the operator's country.
  async getOperatorStats(
    _directusUserId: string,
    country: string,
  ): Promise<TelegramOperatorStatsResult> {
    const encodedCountry = encodeURIComponent(country);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [eventsRes, regsRes] = await Promise.all([
      this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/events?filter[country][_eq]=${encodedCountry}&filter[status][_eq]=published&aggregate[count]=*`,
      ),
      this.directus.get<{ data: Array<{ count: string | number }> }>(
        `/items/registrations?filter[event][country][_eq]=${encodedCountry}` +
          `&filter[status][_neq]=cancelled&filter[date_created][_gt]=${encodeURIComponent(thirtyDaysAgo)}&aggregate[count]=*`,
      ),
    ]);

    return {
      eventsManaged: parseDirectusCount(eventsRes.data[0]?.count),
      registrationsThisPeriod: parseDirectusCount(regsRes.data[0]?.count),
    };
  }

  // Shared by getInterests/toggleInterest's return path.
  private toInterestsResult(interests: MemberInterest[]): TelegramInterestsResult {
    const presentTopics = new Set(interests.map((i) => i.topic_tag));
    const selected = INTEREST_TOPICS.filter((topic) => presentTopics.has(topic));
    return { selected, available: [...INTEREST_TOPICS] };
  }

  // Register's confirmation message needs the event title; the events/:id
  // endpoint already fetches title this same way via findPublishedEvent,
  // but register's target event may be full/waitlist-eligible so we can't
  // reuse the published-only guard there — this fetch is guard-free
  // (RegistrationsDirectusService.assertEventInTenant already enforces
  // published + tenant-scoped before the registration insert; this is
  // purely for display copy after that check has already passed).
  private async requireEventTitle(eventId: string): Promise<string> {
    const res = await this.directus.get<{ data: { title: string } | null }>(
      `/items/events/${eventId}?fields=title`,
    );
    return res.data?.title ?? '';
  }
}

// Directus row shapes — narrowed to the fields the two events endpoints
// above actually project (see each query's `fields=` list).
interface TelegramEventRow {
  id: string;
  title: string;
  starts_at: string;
}

interface TelegramEventDetailRow extends TelegramEventRow {
  venue: string | null;
  description: string;
  capacity: number | null;
}

// Shared published/public/future/country-scoped filter string, reused by
// both listUpcomingEvents and countUpcomingEvents so the list and its
// total always agree.
function eventGuardFilter(country: string): string {
  return [
    'filter[status][_eq]=published',
    'filter[visibility_scope][_eq]=public',
    `filter[starts_at][_gt]=${encodeURIComponent(new Date().toISOString())}`,
    `filter[country][_eq]=${encodeURIComponent(country)}`,
  ].join('&');
}

// Directus aggregate[count] responses come back as a numeric string on
// some Postgres configurations — normalise defensively, same pattern as
// TelegramEventsService.fetchTakenCount.
function parseDirectusCount(raw: string | number | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// FR-BOT-003 — derive bot role from Authentik group names.
// Priority: super_admin > country_admin > organizer > member.
// Returns null only when groups_obj is empty/undefined (temp user before
// any group assignment; caller should treat null as 'member').
function deriveRoleFromGroups(
  groups: Array<{ pk: string; name: string; is_superuser?: boolean }> | undefined,
): 'member' | 'organizer' | 'country_admin' | 'super_admin' | null {
  if (!groups || groups.length === 0) return null;
  const names = groups.map((g) => g.name);
  if (names.some((n) => n === 'aiqadam-super-admin')) return 'super_admin';
  if (names.some((n) => n.startsWith('aiqadam-country-lead-'))) return 'country_admin';
  if (names.some((n) => n.startsWith('aiqadam-organizer-'))) return 'organizer';
  return 'member';
}

// FR-BOT-003 — extract a UUID from QR code data. Supports:
//   - Bare UUID: "550e8400-e29b-41d4-a716-446655440000"
//   - URL ending in UUID: "https://aiqadam.org/checkin/550e8400-..."
// Returns null if no valid UUID is found.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function extractUuidFromQr(data: string): string | null {
  const match = UUID_PATTERN.exec(data.trim());
  return match ? match[0].toLowerCase() : null;
}
