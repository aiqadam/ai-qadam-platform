import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// aiqadam#289 — bot's settings screen + Accept-Language honoring.
// Reads/writes per-member preferences (language, timezone, notification
// opt-ins). Null values in Directus mean "use the default"; the GET
// resolves them to spec defaults (language=en, timezone=tenant default,
// notification_opt_ins={events:true, newsletter:false, community:true}).
//
// ADR-0037 layer triage:
//   - Customer (bot's /settings UI)
//   - Operational (reads/writes Directus member fields)
//   - No engineering touch
// Cross-layer contract = the response shape pinned by the bot's pydantic
// Preferences model.

// ─── Wire shape (matches bot's pydantic exactly) ─────────────────────────────

export const SUPPORTED_LANGUAGES = ['en', 'ru', 'uz'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const KNOWN_OPT_IN_KEYS = [
  'event_reminders',
  'newsletter',
  'community_announcements',
] as const;
export type OptInKey = (typeof KNOWN_OPT_IN_KEYS)[number];

export type OptInMap = Record<OptInKey, boolean>;

export interface PreferencesResult {
  language: SupportedLanguage;
  timezone: string;
  notification_opt_ins: OptInMap;
}

// `| undefined` on each optional field so the strict-mode
// exactOptionalPropertyTypes lets us pass through zod's parsed body
// (which uses the same shape) without per-key narrowing.
export interface PreferencesPatch {
  language?: SupportedLanguage | undefined;
  timezone?: string | undefined;
  notification_opt_ins?: Record<string, boolean> | undefined;
}

// ─── Defaults (per #289 spec) ────────────────────────────────────────────────

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const DEFAULT_OPT_INS: OptInMap = {
  event_reminders: true,
  newsletter: false,
  community_announcements: true,
};
// Per-tenant fallback if the member's country has no `tz`. Covers our 3
// live tenants + xx. New tenants get their tz from countries.tz at the
// time they're added; this map is just the safety net.
const TENANT_DEFAULT_TZ: Record<string, string> = {
  uz: 'Asia/Tashkent',
  kz: 'Asia/Almaty',
  tj: 'Asia/Dushanbe',
  xx: 'UTC',
};
const ULTIMATE_DEFAULT_TZ = 'UTC';

// ─── Internal Directus shapes ────────────────────────────────────────────────

// Note on `preferred_language` (not `language`): Directus 11 ships
// `directus_users.language` as a SYSTEM field (admin UI locale). Mixing
// the member's bot-language preference into the same column would
// silently flip operator-admin members' admin UI when they edit their
// bot settings. We use a separately-named column so the two concerns
// stay independent. Wire shape (PreferencesResult.language) is unchanged.
interface DirectusMemberRow {
  id: string;
  country: string | null;
  preferred_language: string | null;
  timezone: string | null;
  notification_opt_ins: Partial<Record<string, unknown>> | null;
}

interface DirectusCountryRow {
  code: string;
  tz: string | null;
}

@Injectable()
export class TelegramPreferencesService {
  private readonly logger = new Logger(TelegramPreferencesService.name);
  // Tiny in-memory cache for country.tz lookups — invariant per process
  // lifetime; flushed on restart. Cabinet edits to countries flow on
  // the next API restart, which matches the existing F-S4.5 convention.
  private readonly tzCache = new Map<string, string>();

  constructor(private readonly directus: DirectusClient) {}

  async get(memberId: string): Promise<PreferencesResult> {
    const row = await this.findMember(memberId);
    if (!row) {
      throw new NotFoundException({ error: 'member_not_found' });
    }
    return this.resolveDefaults(row);
  }

  // Partial PATCH — bot sends only the keys it's changing. We merge the
  // request body into the existing row before writing, so an unset opt-in
  // key doesn't get clobbered by a partial notification_opt_ins object.
  async patch(memberId: string, body: PreferencesPatch): Promise<PreferencesResult> {
    this.validatePatchBody(body);

    const row = await this.findMember(memberId);
    if (!row) {
      throw new NotFoundException({ error: 'member_not_found' });
    }

    // Merge opt-ins on top of the existing row so partial bodies preserve
    // unset keys (rather than blanking them).
    const existingOptIns = (row.notification_opt_ins ?? {}) as Partial<OptInMap>;
    const mergedOptIns =
      body.notification_opt_ins === undefined
        ? row.notification_opt_ins
        : { ...existingOptIns, ...body.notification_opt_ins };

    const patchBody: Record<string, unknown> = {};
    // body.language is the WIRE field; writes to the `preferred_language`
    // Directus column (renamed to dodge the system-field collision).
    if (body.language !== undefined) patchBody.preferred_language = body.language;
    if (body.timezone !== undefined) patchBody.timezone = body.timezone;
    if (body.notification_opt_ins !== undefined) patchBody.notification_opt_ins = mergedOptIns;

    if (Object.keys(patchBody).length === 0) {
      return this.resolveDefaults(row);
    }

    await this.directus.patch(`/users/${encodeURIComponent(memberId)}`, patchBody);

    return this.resolveDefaults({
      ...row,
      ...(body.language !== undefined ? { preferred_language: body.language } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      notification_opt_ins:
        body.notification_opt_ins === undefined
          ? row.notification_opt_ins
          : (mergedOptIns as Partial<Record<string, unknown>>),
    });
  }

  private validatePatchBody(body: PreferencesPatch): void {
    if (
      body.language !== undefined &&
      !(SUPPORTED_LANGUAGES as readonly string[]).includes(body.language)
    ) {
      throw new BadRequestException({
        error: 'invalid_language',
        allowed: [...SUPPORTED_LANGUAGES],
      });
    }
    if (body.timezone !== undefined && !isPlausibleIanaTz(body.timezone)) {
      throw new BadRequestException({ error: 'invalid_timezone' });
    }
    if (body.notification_opt_ins !== undefined) {
      for (const k of Object.keys(body.notification_opt_ins)) {
        if (!(KNOWN_OPT_IN_KEYS as readonly string[]).includes(k)) {
          throw new BadRequestException({
            error: 'unknown_opt_in_key',
            key: k,
            allowed: [...KNOWN_OPT_IN_KEYS],
          });
        }
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findMember(memberId: string): Promise<DirectusMemberRow | null> {
    try {
      const res = await this.directus.get<{ data: DirectusMemberRow }>(
        `/users/${encodeURIComponent(memberId)}?fields=id,country,preferred_language,timezone,notification_opt_ins`,
      );
      return res.data;
    } catch (err) {
      if (err instanceof DirectusError && (err.status === 404 || err.status === 403)) {
        return null;
      }
      throw err;
    }
  }

  private async resolveDefaults(row: DirectusMemberRow): Promise<PreferencesResult> {
    return {
      language: this.resolveLanguage(row.preferred_language),
      timezone: await this.resolveTimezone(row.timezone, row.country),
      notification_opt_ins: this.resolveOptIns(row.notification_opt_ins),
    };
  }

  private resolveLanguage(stored: string | null): SupportedLanguage {
    if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as SupportedLanguage;
    }
    return DEFAULT_LANGUAGE;
  }

  private async resolveTimezone(stored: string | null, country: string | null): Promise<string> {
    if (stored && stored.length > 0) return stored;
    if (country) {
      const tz = await this.tzForCountry(country);
      if (tz) return tz;
    }
    return ULTIMATE_DEFAULT_TZ;
  }

  // Resolution order: in-memory cache → live countries.tz lookup →
  // hardcoded tenant fallback. Cabinet-edited tzs win once cache flushes.
  private async tzForCountry(country: string): Promise<string | null> {
    const cached = this.tzCache.get(country);
    if (cached) return cached;
    try {
      const res = await this.directus.get<{ data: DirectusCountryRow }>(
        `/items/countries/${encodeURIComponent(country)}?fields=code,tz`,
      );
      if (res.data?.tz) {
        this.tzCache.set(country, res.data.tz);
        return res.data.tz;
      }
    } catch (err) {
      const reason = err instanceof DirectusError ? `directus_${err.status}` : 'unknown';
      this.logger.warn(`countries.tz lookup failed for ${country}: ${reason}`);
    }
    return TENANT_DEFAULT_TZ[country] ?? null;
  }

  private resolveOptIns(stored: Partial<Record<string, unknown>> | null): OptInMap {
    if (stored == null) return { ...DEFAULT_OPT_INS };
    const out: OptInMap = { ...DEFAULT_OPT_INS };
    for (const key of KNOWN_OPT_IN_KEYS) {
      const v = stored[key];
      if (typeof v === 'boolean') {
        out[key] = v;
      }
    }
    return out;
  }
}

// ─── Pure helper (exported for tests) ────────────────────────────────────────

// Minimal IANA-tz shape check — `Continent/City` or `Continent/City_Name`,
// no fancy validation. Node's Intl.DateTimeFormat would catch real tzs
// but allocating one per request is silly + we just need to reject
// obvious garbage. Operator validates by trying to send a reminder.
export function isPlausibleIanaTz(tz: string): boolean {
  return /^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_\-0-9]+(?:\/[A-Z][A-Za-z_\-0-9]+)?$|^UTC$/.test(tz);
}
