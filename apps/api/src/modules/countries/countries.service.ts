import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// F-S4.5 — country profiles (locale / currency / holidays / channel pref).
//
// Reads are open to any signed-in operator (no secrets here). Writes
// require super_admin (countries are tenant config). Validation lives
// here, not just in the schema — Zod gives us clean 422 errors to the
// cabinet's PATCH form.

const LOCALE_VALUES = ['en', 'ru', 'kk', 'uz-Latn', 'uz-Cyrl', 'tg'] as const;
const CURRENCY_VALUES = ['USD', 'UZS', 'KZT', 'KGS', 'TJS', 'EUR'] as const;
const CHANNEL_VALUES = ['email', 'telegram'] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

const publicHolidaySchema = z.object({
  date: isoDate,
  label: z.string().min(1).max(120),
});

export const countryProfilePatchSchema = z
  .object({
    default_locale: z.enum(LOCALE_VALUES).optional(),
    currency_code: z.enum(CURRENCY_VALUES).optional(),
    public_holidays: z.array(publicHolidaySchema).max(100).optional(),
    default_reminder_channel: z.enum(CHANNEL_VALUES).optional(),
    tz: z.string().min(3).max(50).optional(),
    name: z.string().min(1).max(100).optional(),
    name_ru: z.string().max(100).nullable().optional(),
  })
  .strict();

export type CountryProfilePatch = z.infer<typeof countryProfilePatchSchema>;

export interface PublicHoliday {
  date: string;
  label: string;
}

export interface CountryRow {
  code: string;
  name: string;
  name_ru: string | null;
  tz: string;
  is_active: boolean;
  default_locale: string;
  currency_code: string;
  public_holidays: PublicHoliday[] | null;
  default_reminder_channel: string;
}

const COUNTRY_FIELDS =
  'code,name,name_ru,tz,is_active,default_locale,currency_code,public_holidays,default_reminder_channel';

@Injectable()
export class CountriesService {
  private readonly logger = new Logger(CountriesService.name);

  constructor(private readonly directus: DirectusClient) {}

  async list(): Promise<CountryRow[]> {
    const res = await this.directus.get<{ data: CountryRow[] }>(
      `/items/countries?fields=${COUNTRY_FIELDS}&sort=code&limit=200`,
    );
    return res.data.map(normalizeRow);
  }

  async get(code: string): Promise<CountryRow> {
    const normalized = normalizeCode(code);
    const res = await this.directus
      .get<{ data: CountryRow }>(
        `/items/countries/${encodeURIComponent(normalized)}?fields=${COUNTRY_FIELDS}`,
      )
      .catch((err) => {
        if (err instanceof DirectusError && err.status === 404) return null;
        throw err;
      });
    if (!res?.data) throw new NotFoundException(`country ${normalized} not found`);
    return normalizeRow(res.data);
  }

  async patch(code: string, patch: CountryProfilePatch): Promise<CountryRow> {
    const normalized = normalizeCode(code);
    // Empty patch is a 400 — operator would expect feedback, not a silent
    // no-op that returns the unchanged row.
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('patch is empty');
    }
    // Ensure the country exists first; Directus would silently 204 a
    // PATCH on a non-existent row.
    await this.get(normalized);
    await this.directus.patch(`/items/countries/${encodeURIComponent(normalized)}`, patch);
    this.logger.log(`country ${normalized} profile patched fields=${Object.keys(patch).join(',')}`);
    return this.get(normalized);
  }
}

function normalizeCode(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(trimmed)) {
    throw new BadRequestException('country code must be 2 lowercase letters');
  }
  return trimmed;
}

function normalizeRow(row: CountryRow): CountryRow {
  // public_holidays comes back as either an array or null. Normalise to
  // [] so the cabinet doesn't need to branch.
  return { ...row, public_holidays: row.public_holidays ?? [] };
}
