import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { track } from '../../lib/ops-events';
import { DirectusClient, DirectusError } from '../directus/directus.client';

// aiqadam — in-house forms-builder. PR-B (API) of the foundation set
// spec'd in PR-A (#356 schema).
//
// Reads operator-built form templates from Directus `forms` collection
// and persists responses to `form_submissions`. Public-facing — no
// service token required on read or submit (matches the event-browse
// posture; anyone with the slug can render + submit).
//
// Validation is two-layer:
//   1. The operator-defined `forms.schema` jsonb is itself validated
//      against `FORM_SCHEMA_ZOD` on read — a malformed cabinet edit
//      surfaces as a 500 with a clear log instead of nondeterministic
//      runtime behavior downstream.
//   2. The submitted payload is validated against the operator's schema
//      field-by-field (validateSubmissionPayload).
//
// Privacy contract:
//   - `is_anonymous=true` → member + telegram_user_id NULLed on persist,
//     regardless of what the caller sent (defense-in-depth so a buggy
//     client can't accidentally leak attribution).
//   - `is_anonymous=true` + `forms.allow_anonymous=false` → 403; operator
//     has explicitly disabled anonymity for this form.
//   - `is_anonymous=false` requires either telegram_user_id (bot path)
//     or member_id (web path with Authentik session — PR-C wires this).
//     v1 supports only the tg path; web-anonymous-only until PR-C.
//
// ADR-0037 layer triage:
//   - Customer (public form render + submit)
//   - Operational (writes to operator-curated Directus collections)
//   - Engineering: none

// ─── Field-type contract (must match bootstrap.sh note + builder UI) ────────

export const FIELD_TYPES = [
  'short_text',
  'long_text',
  'scale',
  'select_one',
  'select_many',
  'yes_no',
  'speaker_rating',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 2000;
export const SELECT_MANY_MAX = 50; // sanity cap on multi-select length
export const SPEAKER_RATING_MAX = 50; // sanity cap on per-speaker entries (never seen >20 in practice)

// Zod shape for one field. Discriminated on `type` so per-type
// constraints (scale's min/max, select options) are statically narrowed
// in `validateSubmissionPayload`.
const fieldOptionSchema = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
});

const fieldSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('short_text'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
  }),
  z.object({
    type: z.literal('long_text'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
  }),
  z.object({
    type: z.literal('scale'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    scale: z.object({
      min: z.number().int(),
      max: z.number().int(),
      min_label: z.string().max(80).optional(),
      max_label: z.string().max(80).optional(),
    }),
  }),
  z.object({
    type: z.literal('select_one'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    options: z.array(fieldOptionSchema).min(2).max(50),
  }),
  z.object({
    type: z.literal('select_many'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    options: z.array(fieldOptionSchema).min(2).max(50),
  }),
  z.object({
    type: z.literal('yes_no'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
  }),
  // D8 — per-speaker rating. At render time, expands to N scale rows
  // (one per confirmed event_speaker, sourced from eventContext on the
  // /events/{slug}/survey route). The form schema only carries
  // configuration; the dynamic expansion lives in the renderer.
  z.object({
    type: z.literal('speaker_rating'),
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(200),
    required: z.boolean().default(false),
    scale: z.object({
      min: z.number().int(),
      max: z.number().int(),
      min_label: z.string().max(80).optional(),
      max_label: z.string().max(80).optional(),
    }),
  }),
]);

export const FORM_SCHEMA_ZOD = z.object({
  fields: z.array(fieldSchema).max(100),
});
export type FormField = z.infer<typeof fieldSchema>;
export type FormSchema = z.infer<typeof FORM_SCHEMA_ZOD>;

// ─── Wire shapes ─────────────────────────────────────────────────────────────

export interface FormSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  allow_anonymous: boolean;
  schema: FormSchema;
}

export interface FormSubmissionInput {
  is_anonymous: boolean;
  telegram_user_id?: bigint | null | undefined;
  payload: Record<string, unknown>;
  source?: 'web' | 'bot' | 'email' | undefined;
  language?: string | undefined;
  event_id?: string | undefined;
}

export interface FormSubmissionResult {
  submission_id: string;
  submitted_at: string;
}

// ─── Internal Directus shapes ────────────────────────────────────────────────

interface FormRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  status: string;
  schema: unknown; // narrowed via FORM_SCHEMA_ZOD on read
  allow_anonymous: boolean;
}

interface EventWithSurveyRow {
  id: string;
  slug: string | null;
  status: string;
  visibility_scope: string | null;
  post_event_survey_form: string | null;
}

interface MemberLookupRow {
  id: string;
}

@Injectable()
export class TelegramFormsService {
  private readonly logger = new Logger(TelegramFormsService.name);

  constructor(private readonly directus: DirectusClient) {}

  // ─── Reads ─────────────────────────────────────────────────────────────────

  async getFormBySlug(slug: string): Promise<FormSummary> {
    const row = await this.findPublishedFormBySlug(slug);
    if (!row) {
      throw new NotFoundException({ error: 'form_not_found' });
    }
    return rowToFormSummary(row, this.logger);
  }

  // GET /events/{slug}/survey — convenience for the bot's post-event
  // flow. 404 when the event has no in-house survey attached (operator
  // may still have a `feedback_survey_url` external URL — bot decides
  // which to honor, in-house wins when both set per the precedence
  // documented in #356).
  async getEventSurvey(eventSlugOrId: string): Promise<FormSummary> {
    const event = await this.findPublishedEvent(eventSlugOrId);
    if (!event) {
      throw new NotFoundException({ error: 'event_not_found' });
    }
    if (!event.post_event_survey_form) {
      throw new NotFoundException({ error: 'event_survey_not_attached' });
    }
    const form = await this.findFormById(event.post_event_survey_form);
    if (!form) {
      // Operator deleted the form after attaching it. Surface as
      // not-found rather than 500 — same UX as no-form-attached.
      throw new NotFoundException({ error: 'event_survey_not_attached' });
    }
    return rowToFormSummary(form, this.logger);
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async submitForm(slug: string, input: FormSubmissionInput): Promise<FormSubmissionResult> {
    const form = await this.findPublishedFormBySlug(slug);
    if (!form) {
      throw new NotFoundException({ error: 'form_not_found' });
    }
    this.assertSubmissionAllowed(form, input);

    // Validate operator-defined schema + validate submitted payload.
    const parsedSchema = FORM_SCHEMA_ZOD.safeParse(form.schema);
    if (!parsedSchema.success) {
      this.logger.error(
        `Form ${form.id} (slug=${form.slug}) has invalid schema: ${parsedSchema.error.message}`,
      );
      throw new BadRequestException({ error: 'form_schema_invalid' });
    }
    validateSubmissionPayload(parsedSchema.data, input.payload);

    // Resolve member only for attributed submissions. Use the canonical
    // user.telegram_user_id column (per #332 fix) — denormalized
    // snapshots drift after silent linking.
    const member =
      input.is_anonymous || input.telegram_user_id == null
        ? null
        : await this.findMemberByTgUserId(input.telegram_user_id);

    const created = await this.directus.post<{
      data: { id: string; date_created: string };
    }>('/items/form_submissions', buildSubmissionRow(form.id, input, member?.id ?? null));

    // PR-D10 — fire-and-forget Plausible event so operators see
    // submission volume + per-form + per-event + per-source breakdown
    // on analytics.aiqadam.org without needing to open the cabinet.
    // ops-events.track() is bounded + never throws (per its own contract).
    void track('forms.submission_created', {
      form_slug: form.slug,
      form_country: form.country,
      source: input.source ?? 'web',
      is_anonymous: input.is_anonymous ? 'true' : 'false',
      ...(input.event_id ? { event_id: input.event_id } : {}),
    });

    return {
      submission_id: created.data.id,
      submitted_at: created.data.date_created,
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  // Two preflight checks extracted from submitForm so the orchestration
  // method stays under the cognitive-complexity budget. Throws on failure.
  private assertSubmissionAllowed(form: FormRow, input: FormSubmissionInput): void {
    if (input.is_anonymous && !form.allow_anonymous) {
      throw new ForbiddenException({ error: 'anonymous_not_allowed' });
    }
    if (!input.is_anonymous && input.telegram_user_id == null) {
      throw new BadRequestException({ error: 'attribution_required' });
    }
  }

  private async findPublishedFormBySlug(slug: string): Promise<FormRow | null> {
    const query = [
      `filter[slug][_eq]=${encodeURIComponent(slug)}`,
      'filter[status][_eq]=published',
      'fields=id,slug,title,description,country,status,schema,allow_anonymous',
      'limit=1',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: FormRow[] }>(`/items/forms?${query}`);
      return res.data[0] ?? null;
    } catch (err) {
      if (err instanceof DirectusError && err.status === 404) return null;
      throw err;
    }
  }

  private async findFormById(id: string): Promise<FormRow | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    const query = 'fields=id,slug,title,description,country,status,schema,allow_anonymous';
    try {
      const res = await this.directus.get<{ data: FormRow }>(
        `/items/forms/${encodeURIComponent(id)}?${query}`,
      );
      // We don't filter status here — if the operator attached a form
      // then archived it, the event survey should still resolve (the
      // caller already passed the survey-link). Drafts are not normally
      // attachable from the cabinet, but the service stays permissive.
      return res.data ?? null;
    } catch (err) {
      if (err instanceof DirectusError && err.status === 404) return null;
      throw err;
    }
  }

  private async findPublishedEvent(slugOrId: string): Promise<EventWithSurveyRow | null> {
    const fields = 'fields=id,slug,status,visibility_scope,post_event_survey_form';
    const guards = 'filter[status][_eq]=published&filter[visibility_scope][_eq]=public';
    const encoded = encodeURIComponent(slugOrId);

    const bySlug = await this.directus.get<{ data: EventWithSurveyRow[] }>(
      `/items/events?${guards}&filter[slug][_eq]=${encoded}&${fields}&limit=1`,
    );
    if (bySlug.data[0]) return bySlug.data[0];

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId)) {
      return null;
    }
    const byId = await this.directus.get<{ data: EventWithSurveyRow[] }>(
      `/items/events?${guards}&filter[id][_eq]=${encoded}&${fields}&limit=1`,
    );
    return byId.data[0] ?? null;
  }

  private async findMemberByTgUserId(tgUserId: bigint): Promise<MemberLookupRow | null> {
    const query = [
      `filter[telegram_user_id][_eq]=${encodeURIComponent(tgUserId.toString())}`,
      'fields=id',
      'limit=1',
    ].join('&');
    try {
      const res = await this.directus.get<{ data: MemberLookupRow[] }>(`/users?${query}`);
      return res.data[0] ?? null;
    } catch (err) {
      this.logger.warn(
        `Member lookup failed for tg=${tgUserId}: ${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      return null;
    }
  }
}

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

// Defense-in-depth: when `is_anonymous=true`, member + telegram_user_id
// are nulled regardless of what the client sent. Extracted from
// submitForm so the orchestration method stays under the
// cognitive-complexity budget AND the privacy contract is testable
// without touching Directus.
export function buildSubmissionRow(
  formId: string,
  input: FormSubmissionInput,
  resolvedMemberId: string | null,
): Record<string, unknown> {
  const persistedMember = input.is_anonymous ? null : resolvedMemberId;
  const persistedTgUserId = input.is_anonymous
    ? null
    : (input.telegram_user_id?.toString() ?? null);
  return {
    form: formId,
    event: input.event_id ?? null,
    is_anonymous: input.is_anonymous,
    member: persistedMember,
    telegram_user_id: persistedTgUserId,
    payload: input.payload,
    source: input.source ?? 'web',
    language: input.language ?? null,
  };
}

export function rowToFormSummary(row: FormRow, logger?: Logger): FormSummary {
  const parsed = FORM_SCHEMA_ZOD.safeParse(row.schema);
  if (!parsed.success) {
    logger?.error(`Form ${row.id} (slug=${row.slug}) has invalid schema: ${parsed.error.message}`);
    throw new BadRequestException({ error: 'form_schema_invalid' });
  }
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    country: row.country,
    allow_anonymous: row.allow_anonymous,
    schema: parsed.data,
  };
}

// Validates `payload` against the operator's `schema`. Throws
// BadRequestException with `{ error, field?, reason? }` on the first
// failure (UX preference: surface one error at a time so the bot can
// re-prompt; multi-error aggregation can come later if needed).
export function validateSubmissionPayload(schema: FormSchema, payload: unknown): void {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new BadRequestException({ error: 'payload_must_be_object' });
  }
  const p = payload as Record<string, unknown>;

  for (const field of schema.fields) {
    const value = p[field.key];
    const isMissing = value == null || value === '';

    if (isMissing) {
      if (field.required) {
        throw new BadRequestException({
          error: 'field_required',
          field: field.key,
        });
      }
      continue;
    }
    validateFieldValue(field, value);
  }

  // Unknown keys are silently dropped at persist time (we only write
  // what's in `payload`, and the Directus jsonb column accepts it); we
  // don't reject them so the bot doesn't have to track schema drift.
}

function validateFieldValue(field: FormField, value: unknown): void {
  switch (field.type) {
    case 'short_text':
      assertStringMax(field.key, value, SHORT_TEXT_MAX);
      return;
    case 'long_text':
      assertStringMax(field.key, value, LONG_TEXT_MAX);
      return;
    case 'scale':
      assertScale(field.key, value, field.scale.min, field.scale.max);
      return;
    case 'select_one':
      assertSelectOne(field.key, value, field.options);
      return;
    case 'select_many':
      assertSelectMany(field.key, value, field.options);
      return;
    case 'yes_no':
      if (typeof value !== 'boolean') {
        throw new BadRequestException({
          error: 'field_wrong_type',
          field: field.key,
          reason: 'expected boolean',
        });
      }
      return;
    case 'speaker_rating':
      assertSpeakerRating(field.key, value, field.scale.min, field.scale.max);
      return;
  }
}

function assertStringMax(key: string, value: unknown, max: number): void {
  if (typeof value !== 'string') {
    throw new BadRequestException({
      error: 'field_wrong_type',
      field: key,
      reason: 'expected string',
    });
  }
  if (value.length > max) {
    throw new BadRequestException({
      error: 'field_too_long',
      field: key,
      max,
    });
  }
}

function assertScale(key: string, value: unknown, min: number, max: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new BadRequestException({
      error: 'field_wrong_type',
      field: key,
      reason: 'expected integer',
    });
  }
  if (value < min || value > max) {
    throw new BadRequestException({
      error: 'field_out_of_range',
      field: key,
      min,
      max,
    });
  }
}

function assertSelectOne(key: string, value: unknown, options: Array<{ value: string }>): void {
  if (typeof value !== 'string') {
    throw new BadRequestException({
      error: 'field_wrong_type',
      field: key,
      reason: 'expected string (one of options)',
    });
  }
  if (!options.some((o) => o.value === value)) {
    throw new BadRequestException({
      error: 'field_unknown_option',
      field: key,
      received: value,
    });
  }
}

function assertSelectMany(key: string, value: unknown, options: Array<{ value: string }>): void {
  if (!Array.isArray(value)) {
    throw new BadRequestException({
      error: 'field_wrong_type',
      field: key,
      reason: 'expected array',
    });
  }
  if (value.length > SELECT_MANY_MAX) {
    throw new BadRequestException({
      error: 'field_too_many_values',
      field: key,
      max: SELECT_MANY_MAX,
    });
  }
  const allowed = new Set(options.map((o) => o.value));
  for (const v of value) {
    if (typeof v !== 'string' || !allowed.has(v)) {
      throw new BadRequestException({
        error: 'field_unknown_option',
        field: key,
        received: v,
      });
    }
  }
}

function assertSpeakerRating(key: string, value: unknown, min: number, max: number): void {
  // Payload shape: { <speaker_key>: <rating> } — keys are speaker ids
  // (or names; we do not enforce). Each value must be an integer in
  // [min, max] same as a scale field. Cap to SPEAKER_RATING_MAX entries
  // so a malicious submission cannot inflate the jsonb.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BadRequestException({
      error: 'field_wrong_type',
      field: key,
      reason: 'expected object of {speaker_id: rating}',
    });
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > SPEAKER_RATING_MAX) {
    throw new BadRequestException({
      error: 'field_too_many_values',
      field: key,
      max: SPEAKER_RATING_MAX,
    });
  }
  for (const [k, v] of entries) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      throw new BadRequestException({
        error: 'field_out_of_range',
        field: key,
        speaker: k,
        min,
        max,
      });
    }
  }
}
