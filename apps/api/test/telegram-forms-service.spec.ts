// Forms-builder PR-B — unit tests for TelegramFormsService.
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DirectusClient } from '../src/modules/directus/directus.client';
import {
  type FormSchema,
  TelegramFormsService,
  validateSubmissionPayload,
} from '../src/modules/telegram/telegram-forms.service';

function fakeDirectus(opts: {
  get?: ReturnType<typeof vi.fn>;
  post?: ReturnType<typeof vi.fn>;
}): DirectusClient {
  return {
    get: opts.get ?? vi.fn(),
    post: opts.post ?? vi.fn(),
  } as unknown as DirectusClient;
}

// Operator-defined form schema fixture — exercises all 6 field types.
const FORM_SCHEMA: FormSchema = {
  fields: [
    { type: 'scale', key: 'nps', label: 'NPS', required: true, scale: { min: 0, max: 10 } },
    { type: 'long_text', key: 'best', label: 'What worked?', required: false },
    { type: 'short_text', key: 'name', label: 'Name', required: false },
    {
      type: 'select_one',
      key: 'channel',
      label: 'Channel',
      required: false,
      options: [
        { value: 'friend', label: 'Friend' },
        { value: 'social', label: 'Social' },
      ],
    },
    {
      type: 'select_many',
      key: 'topics',
      label: 'Topics',
      required: false,
      options: [
        { value: 'ml', label: 'ML' },
        { value: 'infra', label: 'Infra' },
        { value: 'product', label: 'Product' },
      ],
    },
    { type: 'yes_no', key: 'would_attend_again', label: 'Again?', required: false },
  ],
};

const FORM_ROW = {
  id: 'frm-1',
  slug: 'post-event-nps',
  title: 'Post-Event Feedback',
  description: null,
  country: 'uz',
  status: 'published',
  schema: FORM_SCHEMA,
  allow_anonymous: true,
};

// ─── validateSubmissionPayload ────────────────────────────────────────────────

describe('validateSubmissionPayload', () => {
  it('accepts a fully-populated valid payload', () => {
    expect(() =>
      validateSubmissionPayload(FORM_SCHEMA, {
        nps: 9,
        best: 'great vibes',
        name: 'Viktor',
        channel: 'friend',
        topics: ['ml', 'infra'],
        would_attend_again: true,
      }),
    ).not.toThrow();
  });

  it('rejects non-object payloads (array / null / scalar)', () => {
    expect(() => validateSubmissionPayload(FORM_SCHEMA, [])).toThrow(BadRequestException);
    expect(() => validateSubmissionPayload(FORM_SCHEMA, null)).toThrow(BadRequestException);
    expect(() => validateSubmissionPayload(FORM_SCHEMA, 'string')).toThrow(BadRequestException);
  });

  it('enforces required fields (missing nps fails)', () => {
    try {
      validateSubmissionPayload(FORM_SCHEMA, { best: 'cool' });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const resp = (e as BadRequestException).getResponse() as { error: string; field: string };
      expect(resp.error).toBe('field_required');
      expect(resp.field).toBe('nps');
    }
  });

  it('treats empty string as missing for optional fields', () => {
    expect(() => validateSubmissionPayload(FORM_SCHEMA, { nps: 5, best: '' })).not.toThrow();
  });

  it('rejects scale value outside min/max', () => {
    try {
      validateSubmissionPayload(FORM_SCHEMA, { nps: 11 });
      throw new Error('expected throw');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as {
        error: string;
        field: string;
        min: number;
        max: number;
      };
      expect(resp.error).toBe('field_out_of_range');
      expect(resp.field).toBe('nps');
      expect(resp.max).toBe(10);
    }
  });

  it('rejects scale value of wrong type', () => {
    expect(() => validateSubmissionPayload(FORM_SCHEMA, { nps: 'high' })).toThrow(
      BadRequestException,
    );
    expect(() => validateSubmissionPayload(FORM_SCHEMA, { nps: 5.5 })).toThrow(BadRequestException);
  });

  it('rejects long_text over 2000 chars', () => {
    const big = 'x'.repeat(2001);
    try {
      validateSubmissionPayload(FORM_SCHEMA, { nps: 5, best: big });
      throw new Error('expected throw');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { error: string; max: number };
      expect(resp.error).toBe('field_too_long');
      expect(resp.max).toBe(2000);
    }
  });

  it('rejects short_text over 200 chars', () => {
    expect(() => validateSubmissionPayload(FORM_SCHEMA, { nps: 5, name: 'x'.repeat(201) })).toThrow(
      BadRequestException,
    );
  });

  it('rejects select_one value not in options', () => {
    try {
      validateSubmissionPayload(FORM_SCHEMA, { nps: 5, channel: 'mars' });
      throw new Error('expected throw');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { error: string; received: string };
      expect(resp.error).toBe('field_unknown_option');
      expect(resp.received).toBe('mars');
    }
  });

  it('rejects select_many with an unknown option', () => {
    expect(() =>
      validateSubmissionPayload(FORM_SCHEMA, { nps: 5, topics: ['ml', 'mars'] }),
    ).toThrow(BadRequestException);
  });

  it('rejects select_many with non-array value', () => {
    expect(() => validateSubmissionPayload(FORM_SCHEMA, { nps: 5, topics: 'ml' })).toThrow(
      BadRequestException,
    );
  });

  it('rejects yes_no with non-boolean', () => {
    expect(() =>
      validateSubmissionPayload(FORM_SCHEMA, { nps: 5, would_attend_again: 'yes' }),
    ).toThrow(BadRequestException);
  });

  it('silently drops unknown keys (no error)', () => {
    expect(() =>
      validateSubmissionPayload(FORM_SCHEMA, {
        nps: 5,
        unknown_field: 'ignored',
      }),
    ).not.toThrow();
  });
});

// ─── TelegramFormsService.getFormBySlug ─────────────────────────────────────

describe('TelegramFormsService.getFormBySlug', () => {
  it('returns published form by slug', async () => {
    const get = vi.fn().mockResolvedValue({ data: [FORM_ROW] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    const out = await svc.getFormBySlug('post-event-nps');
    expect(out.slug).toBe('post-event-nps');
    expect(out.schema.fields).toHaveLength(6);
    expect(out.allow_anonymous).toBe(true);
  });

  it('404s when slug not found', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    await expect(svc.getFormBySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters to status=published in the slug query (drafts 404 to outsiders)', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    await expect(svc.getFormBySlug('draft-form')).rejects.toBeInstanceOf(NotFoundException);
    expect(get.mock.calls[0]?.[0]).toContain('filter[status][_eq]=published');
  });

  it('rejects forms with malformed operator-defined schema as 400', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ ...FORM_ROW, schema: { fields: [{ type: 'unknown_type' }] } }],
    });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    await expect(svc.getFormBySlug('bad-schema')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── TelegramFormsService.getEventSurvey ────────────────────────────────────

describe('TelegramFormsService.getEventSurvey', () => {
  const FORM_UUID = '11111111-1111-1111-1111-111111111111';
  const EVENT_WITH_SURVEY = {
    id: 'evt-1',
    slug: 'ai-meetup',
    status: 'published',
    visibility_scope: 'public',
    // Must be a real UUID — findFormById short-circuits on non-uuid input.
    post_event_survey_form: FORM_UUID,
  };
  const EVENT_NO_SURVEY = { ...EVENT_WITH_SURVEY, post_event_survey_form: null };

  it('returns the attached form for an event with a survey', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [EVENT_WITH_SURVEY] })
      .mockResolvedValueOnce({ data: FORM_ROW });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    const out = await svc.getEventSurvey('ai-meetup');
    expect(out.id).toBe('frm-1');
  });

  it('404s with event_not_found when slug misses', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    try {
      await svc.getEventSurvey('missing');
      throw new Error('expected throw');
    } catch (e) {
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('event_not_found');
    }
  });

  it('404s with event_survey_not_attached when post_event_survey_form is null', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [EVENT_NO_SURVEY] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    try {
      await svc.getEventSurvey('ai-meetup');
      throw new Error('expected throw');
    } catch (e) {
      const resp = (e as NotFoundException).getResponse() as { error: string };
      expect(resp.error).toBe('event_survey_not_attached');
    }
  });

  it('404s when the form FK points to a deleted form', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [EVENT_WITH_SURVEY] })
      .mockResolvedValueOnce({ data: null });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    await expect(svc.getEventSurvey('ai-meetup')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ─── TelegramFormsService.submitForm ────────────────────────────────────────

describe('TelegramFormsService.submitForm', () => {
  const SUBMISSION_OK = {
    data: { id: 'sub-1', date_created: '2026-05-24T15:00:00.000Z' },
  };

  it('persists an anonymous submission with member + tg_user_id nulled', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [FORM_ROW] });
    const post = vi.fn().mockResolvedValueOnce(SUBMISSION_OK);
    const svc = new TelegramFormsService(fakeDirectus({ get, post }));

    await svc.submitForm('post-event-nps', {
      is_anonymous: true,
      telegram_user_id: 52128246n, // even when caller sends it, we MUST null
      payload: { nps: 9 },
    });

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      form: 'frm-1',
      is_anonymous: true,
      member: null,
      telegram_user_id: null,
      payload: { nps: 9 },
    });
  });

  it('persists an attributed submission with resolved member id', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [FORM_ROW] }) // form lookup
      .mockResolvedValueOnce({ data: [{ id: 'mem-1' }] }); // member lookup
    const post = vi.fn().mockResolvedValueOnce(SUBMISSION_OK);
    const svc = new TelegramFormsService(fakeDirectus({ get, post }));

    await svc.submitForm('post-event-nps', {
      is_anonymous: false,
      telegram_user_id: 52128246n,
      payload: { nps: 9 },
    });

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      is_anonymous: false,
      member: 'mem-1',
      telegram_user_id: '52128246',
    });
  });

  it('persists attributed submission with member=null when tg_user_id unresolved', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [FORM_ROW] })
      .mockResolvedValueOnce({ data: [] }); // unlinked tg user
    const post = vi.fn().mockResolvedValueOnce(SUBMISSION_OK);
    const svc = new TelegramFormsService(fakeDirectus({ get, post }));

    await svc.submitForm('post-event-nps', {
      is_anonymous: false,
      telegram_user_id: 99999999n,
      payload: { nps: 5 },
    });

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      member: null,
      telegram_user_id: '99999999',
    });
  });

  it('rejects anonymous when forms.allow_anonymous=false (403)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [{ ...FORM_ROW, allow_anonymous: false }] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    try {
      await svc.submitForm('post-event-nps', {
        is_anonymous: true,
        payload: { nps: 9 },
      });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const resp = (e as ForbiddenException).getResponse() as { error: string };
      expect(resp.error).toBe('anonymous_not_allowed');
    }
  });

  it('rejects attributed submission with no telegram_user_id (400)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [FORM_ROW] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    try {
      await svc.submitForm('post-event-nps', {
        is_anonymous: false,
        payload: { nps: 9 },
      });
      throw new Error('expected throw');
    } catch (e) {
      const resp = (e as BadRequestException).getResponse() as { error: string };
      expect(resp.error).toBe('attribution_required');
    }
  });

  it('rejects submission with invalid payload (proxies validateSubmissionPayload error)', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [FORM_ROW] });
    const post = vi.fn();
    const svc = new TelegramFormsService(fakeDirectus({ get, post }));
    await expect(
      svc.submitForm('post-event-nps', {
        is_anonymous: true,
        payload: { nps: 99 }, // out of range
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(post).not.toHaveBeenCalled();
  });

  it('404s when submitting to a missing form', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [] });
    const svc = new TelegramFormsService(fakeDirectus({ get }));
    await expect(
      svc.submitForm('missing', { is_anonymous: true, payload: { nps: 9 } }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns submission_id + submitted_at', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [FORM_ROW] });
    const post = vi.fn().mockResolvedValueOnce(SUBMISSION_OK);
    const svc = new TelegramFormsService(fakeDirectus({ get, post }));

    const out = await svc.submitForm('post-event-nps', {
      is_anonymous: true,
      payload: { nps: 9 },
    });

    expect(out).toEqual({
      submission_id: 'sub-1',
      submitted_at: '2026-05-24T15:00:00.000Z',
    });
  });

  it('passes event_id through to the persisted row when provided', async () => {
    const get = vi.fn().mockResolvedValueOnce({ data: [FORM_ROW] });
    const post = vi.fn().mockResolvedValueOnce(SUBMISSION_OK);
    const svc = new TelegramFormsService(fakeDirectus({ get, post }));

    await svc.submitForm('post-event-nps', {
      is_anonymous: true,
      payload: { nps: 9 },
      event_id: '11111111-1111-1111-1111-111111111111',
    });

    expect(post.mock.calls[0]?.[1]).toMatchObject({
      event: '11111111-1111-1111-1111-111111111111',
    });
  });
});
