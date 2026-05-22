import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CountriesService,
  countryProfilePatchSchema,
} from '../src/modules/countries/countries.service';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import { DirectusError } from '../src/modules/directus/directus.client';

// F-S4.5 — country profile service. Mocks Directus.

type FakeDirectus = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let dx: FakeDirectus;
let svc: CountriesService;

const UZ_ROW = {
  code: 'uz',
  name: 'Uzbekistan',
  name_ru: 'Узбекистан',
  tz: 'Asia/Tashkent',
  is_active: true,
  default_locale: 'uz-Latn',
  currency_code: 'UZS',
  public_holidays: [{ date: '2026-09-01', label: 'Independence Day' }],
  default_reminder_channel: 'telegram',
};

beforeEach(() => {
  dx = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  svc = new CountriesService(dx as unknown as DirectusClient);
});

describe('CountriesService.list', () => {
  it('returns countries with public_holidays normalised to []', async () => {
    dx.get.mockResolvedValueOnce({
      data: [UZ_ROW, { ...UZ_ROW, code: 'kz', public_holidays: null }],
    });
    const result = await svc.list();
    expect(result).toHaveLength(2);
    expect(result[0]?.public_holidays).toHaveLength(1);
    expect(result[1]?.public_holidays).toEqual([]);
  });
});

describe('CountriesService.get', () => {
  it('returns the country row', async () => {
    dx.get.mockResolvedValueOnce({ data: UZ_ROW });
    const result = await svc.get('UZ'); // uppercased — should normalize
    expect(result.code).toBe('uz');
    expect(result.currency_code).toBe('UZS');
    const call = dx.get.mock.calls[0]?.[0] as string;
    expect(call).toContain('/items/countries/uz');
  });

  it('throws NotFoundException on 404', async () => {
    dx.get.mockRejectedValueOnce(new DirectusError(404, '/items/countries/xx', 'not found'));
    await expect(svc.get('xx')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException on invalid code shape', async () => {
    await expect(svc.get('abc')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.get('a1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.get('')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CountriesService.patch', () => {
  it('sends the patch + re-fetches the updated row', async () => {
    dx.get
      .mockResolvedValueOnce({ data: UZ_ROW }) // existence check
      .mockResolvedValueOnce({ data: { ...UZ_ROW, default_locale: 'ru' } }); // re-fetch
    dx.patch.mockResolvedValueOnce({});

    const result = await svc.patch('uz', { default_locale: 'ru' });

    expect(result.default_locale).toBe('ru');
    expect(dx.patch).toHaveBeenCalledWith('/items/countries/uz', { default_locale: 'ru' });
  });

  it('throws BadRequestException on empty patch', async () => {
    await expect(svc.patch('uz', {})).rejects.toBeInstanceOf(BadRequestException);
    expect(dx.patch).not.toHaveBeenCalled();
  });

  it('throws NotFoundException if the country does not exist', async () => {
    dx.get.mockRejectedValueOnce(new DirectusError(404, '/items/countries/xx', 'not found'));
    await expect(svc.patch('zz', { default_locale: 'en' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dx.patch).not.toHaveBeenCalled();
  });
});

describe('countryProfilePatchSchema', () => {
  it('accepts a valid patch', () => {
    const ok = countryProfilePatchSchema.safeParse({
      default_locale: 'ru',
      currency_code: 'KZT',
      default_reminder_channel: 'telegram',
      public_holidays: [{ date: '2026-12-16', label: 'Independence Day' }],
    });
    expect(ok.success).toBe(true);
  });

  it('rejects unknown enum values', () => {
    const bad = countryProfilePatchSchema.safeParse({ default_locale: 'klingon' });
    expect(bad.success).toBe(false);
  });

  it('rejects unknown extra fields (strict)', () => {
    const bad = countryProfilePatchSchema.safeParse({ rogue_field: 'evil' });
    expect(bad.success).toBe(false);
  });

  it('rejects malformed holiday dates', () => {
    const bad = countryProfilePatchSchema.safeParse({
      public_holidays: [{ date: '2026/01/01', label: 'New Year' }],
    });
    expect(bad.success).toBe(false);
  });

  it('caps holiday list at 100 entries', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      date: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
      label: `H${i}`,
    }));
    const bad = countryProfilePatchSchema.safeParse({ public_holidays: tooMany });
    expect(bad.success).toBe(false);
  });
});
