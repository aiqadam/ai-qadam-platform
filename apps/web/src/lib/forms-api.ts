// Server-side fetch helpers for the operator-built forms-builder.
// Wire shape mirrors apps/api/src/modules/telegram/telegram-forms.service.ts
// — keep these in sync (any field-type rename ripples through both layers).

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'scale'
  | 'select_one'
  | 'select_many'
  | 'yes_no';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormFieldScale {
  min: number;
  max: number;
  min_label?: string;
  max_label?: string;
}

export interface FormField {
  type: FormFieldType;
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  scale?: FormFieldScale;
  options?: FormFieldOption[];
}

export interface FormSchema {
  fields: FormField[];
}

export interface FormSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country: string;
  allow_anonymous: boolean;
  schema: FormSchema;
}

const { INTERNAL_API_URL = 'http://localhost:3000' } = process.env;

export async function fetchForm(req: Request, slug: string): Promise<FormSummary | null> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(`${INTERNAL_API_URL}/v1/telegram/forms/${encodeURIComponent(slug)}`, {
      headers: host ? { host } : {},
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[forms-api] /forms/${slug} failed: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as FormSummary;
  } catch (err) {
    console.error(`[forms-api] /forms/${slug} threw:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Variant for the event-attached post-event survey. Returns the form
// when one is attached, null when the event has no in-house survey (the
// page falls back to checking events.feedback_survey_url externally).
export async function fetchEventSurvey(
  req: Request,
  eventSlugOrId: string,
): Promise<FormSummary | null> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/v1/telegram/events/${encodeURIComponent(eventSlugOrId)}/survey`,
      { headers: host ? { host } : {} },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`[forms-api] /events/${eventSlugOrId}/survey failed: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as FormSummary;
  } catch (err) {
    console.error(
      `[forms-api] /events/${eventSlugOrId}/survey threw:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
