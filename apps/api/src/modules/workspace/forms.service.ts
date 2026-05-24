import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DirectusClient } from '../directus/directus.client';

// Forms-builder PR-D — operator-facing CRUD on the `forms` Directus
// collection (PR-A schema). Public reads + submission handling live in
// the bot's TelegramFormsService (PR-B); this service is the operator
// side: list / create / update / archive form templates.
//
// Schema validation: we re-validate the operator-submitted form schema
// against the same shape used by TelegramFormsService (FORM_SCHEMA_ZOD).
// This means a misshapen builder POST surfaces as a 400 at write time,
// not as runtime errors at render time.
//
// ADR-0037 layer triage:
//   - Operational (operator cabinet writes)
//   - No customer / engineering touch

// ─── Schema (mirrors apps/api/src/modules/telegram/telegram-forms.service.ts) ─

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
]);

export const FORM_SCHEMA_ZOD = z.object({
  fields: z.array(fieldSchema).max(100),
});

// Body shapes — accepted by controller, re-validated here.

export const createFormSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/, 'lowercase + dashes'),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  country: z.string().regex(/^[a-z]{2}$/, 'ISO-3166-1 alpha-2 lowercase'),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  allow_anonymous: z.boolean().default(true),
  schema: FORM_SCHEMA_ZOD,
});
export type CreateFormInput = z.infer<typeof createFormSchema>;

export const patchFormSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  allow_anonymous: z.boolean().optional(),
  schema: FORM_SCHEMA_ZOD.optional(),
});
export type PatchFormInput = z.infer<typeof patchFormSchema>;

// Wire shape returned to the cabinet UI.

export interface FormRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  status: 'draft' | 'published' | 'archived';
  allow_anonymous: boolean;
  schema: unknown;
  created_by: string | null;
  date_created: string;
  date_updated: string | null;
  submission_count: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class WorkspaceFormsService {
  private readonly logger = new Logger(WorkspaceFormsService.name);

  constructor(private readonly directus: DirectusClient) {}

  // List all forms operator can see. Country scoping rides on the
  // existing RBAC; the operator's role-policy filters the Directus
  // query when their token comes through. v1 returns everything the
  // bridge token sees — production tightens via per-operator policies.
  async list(): Promise<FormRow[]> {
    const res = await this.directus.get<{ data: Omit<FormRow, 'submission_count'>[] }>(
      '/items/forms?sort=-date_created&limit=200&fields=id,slug,title,description,country,status,allow_anonymous,schema,created_by,date_created,date_updated',
    );
    const counts = await this.fetchCountsForForms(res.data.map((r) => r.id));
    return res.data.map((r) => ({ ...r, submission_count: counts.get(r.id) ?? 0 }));
  }

  async getById(id: string): Promise<FormRow> {
    if (!isUuid(id)) {
      throw new NotFoundException({ error: 'form_not_found' });
    }
    const res = await this.directus.get<{ data: Omit<FormRow, 'submission_count'> }>(
      `/items/forms/${encodeURIComponent(id)}?fields=id,slug,title,description,country,status,allow_anonymous,schema,created_by,date_created,date_updated`,
    );
    if (!res.data) {
      throw new NotFoundException({ error: 'form_not_found' });
    }
    const counts = await this.fetchCountsForForms([res.data.id]);
    return { ...res.data, submission_count: counts.get(res.data.id) ?? 0 };
  }

  async create(input: CreateFormInput, createdByDirectusUserId: string): Promise<FormRow> {
    // Slug uniqueness pre-check — Directus would 400 with a unique-
    // constraint violation anyway, but a clean 409-style response is
    // friendlier than the raw Directus error.
    const dupe = await this.findBySlug(input.slug);
    if (dupe) {
      throw new BadRequestException({ error: 'slug_already_used', slug: input.slug });
    }
    const created = await this.directus.post<{ data: { id: string } }>('/items/forms', {
      slug: input.slug,
      title: input.title,
      description: input.description ?? null,
      country: input.country,
      status: input.status,
      allow_anonymous: input.allow_anonymous,
      schema: input.schema,
      created_by: createdByDirectusUserId,
    });
    return this.getById(created.data.id);
  }

  async update(id: string, input: PatchFormInput): Promise<FormRow> {
    if (!isUuid(id)) {
      throw new NotFoundException({ error: 'form_not_found' });
    }
    if (Object.keys(input).length === 0) {
      return this.getById(id);
    }
    const patchBody: Record<string, unknown> = {};
    if (input.title !== undefined) patchBody.title = input.title;
    if (input.description !== undefined) patchBody.description = input.description;
    if (input.status !== undefined) patchBody.status = input.status;
    if (input.allow_anonymous !== undefined) patchBody.allow_anonymous = input.allow_anonymous;
    if (input.schema !== undefined) patchBody.schema = input.schema;

    await this.directus.patch(`/items/forms/${encodeURIComponent(id)}`, patchBody);
    return this.getById(id);
  }

  // Archive (not hard-delete) — preserves submission rows linked via
  // form_submissions.form FK and keeps the row visible in submissions
  // inbox for historical responses.
  async archive(id: string): Promise<FormRow> {
    return this.update(id, { status: 'archived' });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async findBySlug(slug: string): Promise<{ id: string } | null> {
    const res = await this.directus.get<{ data: Array<{ id: string }> }>(
      `/items/forms?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id&limit=1`,
    );
    return res.data[0] ?? null;
  }

  // Single aggregate query — Directus's groupBy on form gives us a
  // {form: id, count: n}[] in one round-trip. Avoids N+1 across the
  // list response.
  private async fetchCountsForForms(formIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (formIds.length === 0) return out;
    try {
      const ids = formIds.map(encodeURIComponent).join(',');
      const query = [`filter[form][_in]=${ids}`, 'aggregate[count]=id', 'groupBy[]=form'].join('&');
      const res = await this.directus.get<{
        data: Array<{ form: string; count: { id: string | number } }>;
      }>(`/items/form_submissions?${query}`);
      for (const row of res.data) {
        const raw = row.count?.id;
        const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : (raw ?? 0);
        if (Number.isFinite(n)) out.set(row.form, n);
      }
    } catch (err) {
      this.logger.warn(
        `fetchCountsForForms failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    return out;
  }
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
