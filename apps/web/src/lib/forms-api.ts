// Server-side fetch helpers for the operator-built forms-builder.
// Wire shape mirrors apps/api/src/modules/telegram/telegram-forms.service.ts
// — keep these in sync (any field-type rename ripples through both layers).

// D8 — `speaker_rating` expands at render time to one scale row per
// confirmed event_speaker (sourced from EventContext on the
// /events/{id}/survey route). When eventContext is absent (standalone
// /forms/{slug} route) or has no speakers, the renderer shows a notice.
export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'scale'
  | 'select_one'
  | 'select_many'
  | 'yes_no'
  | 'speaker_rating';

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

// PR-D9 — minimal event context for the survey route's dynamic
// header + speaker_rating field expansion. Reuses the existing bot
// event-detail endpoint (`/v1/telegram/events/{slug}`) instead of
// anonymous Directus reads, because event_speakers + speakers +
// directus_users do NOT grant public Directus read — only the
// authenticated API container can join across them. The route is
// PUBLIC on the API side (acquisition channel), so no token needed.
export interface SurveyEventContext {
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  speakers: Array<{ name: string | null; talkTitle: string | null }>;
}

interface ApiEventDetail {
  title: string;
  starts_at: string;
  location: string | null;
  speakers?: Array<{ name: string; title: string | null }>;
}

export async function fetchSurveyEventContext(
  req: Request,
  eventSlugOrId: string,
): Promise<SurveyEventContext | null> {
  const host = req.headers.get('host') ?? '';
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/v1/telegram/events/${encodeURIComponent(eventSlugOrId)}`,
      { headers: host ? { host } : {} },
    );
    if (!res.ok) {
      console.error(`[forms-api] /v1/telegram/events/${eventSlugOrId} failed: HTTP ${res.status}`);
      return null;
    }
    const detail = (await res.json()) as ApiEventDetail;
    return {
      title: detail.title,
      startsAt: detail.starts_at,
      endsAt: detail.starts_at, // bot endpoint omits ends_at; survey header only shows starts_at
      location: detail.location,
      speakers: (detail.speakers ?? []).map((s) => ({
        name: s.name,
        talkTitle: s.title,
      })),
    };
  } catch (err) {
    console.error(
      `[forms-api] /v1/telegram/events/${eventSlugOrId} threw:`,
      err instanceof Error ? err.message : err,
    );
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
