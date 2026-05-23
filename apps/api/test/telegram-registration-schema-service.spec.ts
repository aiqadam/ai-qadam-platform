import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  DEFAULT_REGISTRATION_CONSENTS,
  DEFAULT_REGISTRATION_FIELDS,
  TelegramRegistrationSchemaService,
} from '../src/modules/telegram/telegram-registration-schema.service';

// Phase Bot-B PR-1.2b — schema-driven activation per ADR-0034 acquisition rewrite.
// Contract pinned by sibling repo aiqadam-telegram-bot's
// RegistrationSchema / RegistrationField / RegistrationConsent
// pydantic models. Field renames here require a coordinated cross-repo PR.

function makeService(getMock: ReturnType<typeof vi.fn>): TelegramRegistrationSchemaService {
  const directus = { get: getMock } as unknown as DirectusClient;
  return new TelegramRegistrationSchemaService(directus);
}

const EVENT_ROW = {
  id: '7c5fe53c-07cb-407e-b0c9-adc9ca0997a1',
  slug: 'ai-meetup-2026-06',
  title: 'AI Meetup',
  starts_at: '2026-06-20T03:00:00.000Z',
  location: 'IMPACT.T',
  country: 'uz',
  status: 'published',
  visibility_scope: 'public',
  capacity: 50,
  registration_open: true,
  registration_schema: null,
};

describe('TelegramRegistrationSchemaService.getSchema', () => {
  it('returns the default schema when the event has no stored schema', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [EVENT_ROW] });
    const svc = makeService(getMock);

    const out = await svc.getSchema('ai-meetup-2026-06');

    expect(out.fields).toEqual(DEFAULT_REGISTRATION_FIELDS);
    expect(out.consents).toEqual(DEFAULT_REGISTRATION_CONSENTS);
    expect(out.event.slug).toBe('ai-meetup-2026-06');
    expect(out.event.title).toBe('AI Meetup');
  });

  it('returns the stored schema when registration_schema is populated', async () => {
    const customFields = [
      {
        key: 'company',
        type: 'text',
        label: 'Company',
        required: false,
        hint: null,
        validation: null,
        options: null,
      },
    ];
    const customConsents = [
      { key: 'tos', label: 'I accept the TOS', required: true, url: 'https://aiqadam.org/tos' },
    ];
    const getMock = vi.fn().mockResolvedValue({
      data: [
        {
          ...EVENT_ROW,
          registration_schema: { fields: customFields, consents: customConsents },
        },
      ],
    });
    const svc = makeService(getMock);

    const out = await svc.getSchema('ai-meetup-2026-06');

    expect(out.fields).toEqual(customFields);
    expect(out.consents).toEqual(customConsents);
  });

  it('uses default consents when stored schema has fields but no consents', async () => {
    const customFields = [
      {
        key: 'company',
        type: 'text',
        label: 'Company',
        required: false,
        hint: null,
        validation: null,
        options: null,
      },
    ];
    const getMock = vi.fn().mockResolvedValue({
      data: [{ ...EVENT_ROW, registration_schema: { fields: customFields } }],
    });
    const svc = makeService(getMock);

    const out = await svc.getSchema('ai-meetup-2026-06');

    expect(out.fields).toEqual(customFields);
    expect(out.consents).toEqual(DEFAULT_REGISTRATION_CONSENTS);
  });

  it('falls back to default when stored schema has an empty fields array', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [{ ...EVENT_ROW, registration_schema: { fields: [] } }],
    });
    const svc = makeService(getMock);

    const out = await svc.getSchema('ai-meetup-2026-06');

    expect(out.fields).toEqual(DEFAULT_REGISTRATION_FIELDS);
  });

  it('falls back to event id lookup when slug filter returns empty', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: [] }) // first call: by slug
      .mockResolvedValueOnce({ data: [EVENT_ROW] }); // second call: by id
    const svc = makeService(getMock);

    const out = await svc.getSchema('7c5fe53c-07cb-407e-b0c9-adc9ca0997a1');

    expect(out.event.title).toBe('AI Meetup');
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[1]?.[0]).toContain('filter[id][_eq]=');
  });

  it('does NOT attempt id fallback when input is not a syntactically-valid uuid', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    await expect(svc.getSchema('not-a-real-slug-or-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(getMock).toHaveBeenCalledTimes(1); // slug attempt only
  });

  it('throws NotFoundException with {error:"event_not_found"} body on miss', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [] });
    const svc = makeService(getMock);

    try {
      await svc.getSchema('nonexistent-slug');
      throw new Error('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NotFoundException);
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('event_not_found');
    }
  });

  it('respects registration_open=false from the stored row', async () => {
    const getMock = vi.fn().mockResolvedValue({
      data: [{ ...EVENT_ROW, registration_open: false }],
    });
    const svc = makeService(getMock);

    const out = await svc.getSchema('ai-meetup-2026-06');

    expect(out.event.registration_open).toBe(false);
  });

  it('defaults registration_open to true when the field is missing (pre-PR-1.2a rows)', async () => {
    const { registration_open: _omit, ...rowWithoutField } = EVENT_ROW;
    const getMock = vi.fn().mockResolvedValue({ data: [rowWithoutField] });
    const svc = makeService(getMock);

    const out = await svc.getSchema('ai-meetup-2026-06');

    expect(out.event.registration_open).toBe(true);
  });

  it('selects the new columns in the Directus query', async () => {
    const getMock = vi.fn().mockResolvedValue({ data: [EVENT_ROW] });
    const svc = makeService(getMock);

    await svc.getSchema('ai-meetup-2026-06');

    const call = getMock.mock.calls[0]?.[0] as string;
    expect(call).toContain('registration_open');
    expect(call).toContain('registration_schema');
    expect(call).toContain('online_meeting_url');
  });
});

describe('default registration schema (contract with bot)', () => {
  it('default fields are name + email, both required', () => {
    expect(DEFAULT_REGISTRATION_FIELDS).toHaveLength(2);
    expect(DEFAULT_REGISTRATION_FIELDS[0]?.key).toBe('name');
    expect(DEFAULT_REGISTRATION_FIELDS[1]?.key).toBe('email');
    expect(DEFAULT_REGISTRATION_FIELDS.every((f) => f.required)).toBe(true);
  });

  it('default consents include required events + optional newsletter', () => {
    const events = DEFAULT_REGISTRATION_CONSENTS.find((c) => c.key === 'events');
    const newsletter = DEFAULT_REGISTRATION_CONSENTS.find((c) => c.key === 'newsletter');
    expect(events?.required).toBe(true);
    expect(newsletter?.required).toBe(false);
  });
});
